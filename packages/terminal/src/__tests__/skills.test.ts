/**
 * SkillsManager tests
 *
 * Cover the invariants that matter: discovery, malformed skills never blocking
 * valid ones, project shadowing user scope, and auto-load not firing on a single
 * generic word.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SkillsManager } from "../context/skills.js";

let root: string;
let userRoot: string;

/** Hermetic manager: never touches the real ~/.agents/skills. */
function mgr(): SkillsManager {
  return new SkillsManager(root, join(userRoot, ".agents", "skills"));
}

function writeUserSkill(name: string, frontmatter: string): void {
  const dir = join(userRoot, ".agents", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\nCuerpo.\n`, "utf-8");
}

function writeSkill(name: string, frontmatter: string, body = "Cuerpo del procedimiento."): void {
  const dir = join(root, ".agents", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}\n`, "utf-8");
}

beforeEach(() => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  root = join(tmpdir(), `wabisabi-skills-${stamp}`);
  userRoot = join(tmpdir(), `wabisabi-skills-user-${stamp}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(userRoot, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(userRoot, { recursive: true, force: true });
});

describe("SkillsManager — descubrimiento", () => {
  test("encuentra una skill valida y expone name/description", () => {
    writeSkill("tools-contract", "name: tools-contract\ndescription: Use when adding tools and permissions.");
    const skills = mgr().list();

    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("tools-contract");
    expect(skills[0]?.description).toBe("Use when adding tools and permissions.");
    expect(skills[0]?.scope).toBe("project");
  });

  test("sin directorio de skills devuelve lista vacia y un indice vacio", () => {
    const m = mgr();
    expect(m.list()).toHaveLength(0);
    expect(m.buildSkillsIndex()).toBe("");
  });

  test("descubre skills de usuario ademas de las de proyecto", () => {
    writeSkill("de-proyecto", "name: de-proyecto\ndescription: Skill del repo.");
    writeUserSkill("de-usuario", "name: de-usuario\ndescription: Skill global del usuario.");

    const found = mgr().list();
    expect(found.map((s) => s.name).sort()).toEqual(["de-proyecto", "de-usuario"]);
    expect(found.find((s) => s.name === "de-usuario")?.scope).toBe("user");
  });

  test("proyecto tapa a usuario cuando comparten nombre", () => {
    writeUserSkill("misma", "name: misma\ndescription: Version del usuario.");
    writeSkill("misma", "name: misma\ndescription: Version del proyecto.");

    const found = mgr().list();
    expect(found).toHaveLength(1);
    expect(found[0]?.scope).toBe("project");
    expect(found[0]?.description).toBe("Version del proyecto.");
  });

  test("un directorio sin SKILL.md se ignora sin romper", () => {
    mkdirSync(join(root, ".agents", "skills", "vacia"), { recursive: true });
    writeSkill("buena", "name: buena\ndescription: Una skill correcta de routing.");
    expect(mgr().list().map((s) => s.name)).toEqual(["buena"]);
  });
});

describe("SkillsManager — una skill rota no bloquea a las demas", () => {
  test("frontmatter ausente: se ignora y se avisa, el resto sobrevive", () => {
    const dir = join(root, ".agents", "skills", "sin-frontmatter");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "# Solo un titulo\n", "utf-8");
    writeSkill("buena", "name: buena\ndescription: Skill valida de auth.");

    const m = mgr();
    expect(m.list().map((s) => s.name)).toEqual(["buena"]);
    expect(m.getWarnings().join(" ")).toContain("frontmatter");
  });

  test("name invalido (mayusculas) se rechaza", () => {
    writeSkill("mala", "name: MiSkill\ndescription: Nombre invalido.");
    writeSkill("buena", "name: buena\ndescription: Skill valida.");

    const m = mgr();
    expect(m.list().map((s) => s.name)).toEqual(["buena"]);
    expect(m.getWarnings().join(" ")).toContain("name");
  });

  test("description ausente se rechaza", () => {
    writeSkill("sin-desc", "name: sin-desc");
    const m = mgr();
    expect(m.list()).toHaveLength(0);
    expect(m.getWarnings().join(" ")).toContain("description");
  });
});

describe("SkillsManager — carga", () => {
  test("load devuelve el cuerpo sin el frontmatter", () => {
    writeSkill("carga", "name: carga\ndescription: Skill de prueba.", "## Paso 1\nHaz esto.");
    const loaded = mgr().load("carga");

    expect(loaded).not.toBeNull();
    expect(loaded?.content).toContain("## Paso 1");
    expect(loaded?.content).not.toContain("description:");
    expect(loaded?.truncated).toBe(false);
  });

  test("load de una skill inexistente devuelve null", () => {
    writeSkill("existe", "name: existe\ndescription: Skill de prueba.");
    expect(mgr().load("no-existe")).toBeNull();
  });

  test("un cuerpo enorme se trunca y lo senala", () => {
    writeSkill("larga", "name: larga\ndescription: Skill larga.", "x".repeat(5000));
    const loaded = mgr().load("larga", 500);

    expect(loaded?.truncated).toBe(true);
    expect(loaded?.content).toContain("[...skill truncada]");
  });
});

describe("SkillsManager — auto-carga determinista", () => {
  beforeEach(() => {
    writeSkill(
      "provider-routing",
      "name: provider-routing\ndescription: Use when changing provider clients, model routing, fallback or SSE streaming.",
    );
    writeSkill(
      "auth-shared-session",
      "name: auth-shared-session\ndescription: Use when changing authentication, keychain, JWT refresh or the shared session.",
    );
  });

  test("elige la skill del area de la peticion", () => {
    const m = mgr();
    expect(m.matchBest("hay que arreglar el routing del provider y el fallback")?.name)
      .toBe("provider-routing");
    expect(m.matchBest("falla el refresh del JWT en la authentication")?.name)
      .toBe("auth-shared-session");
  });

  test("una sola palabra generica NO dispara la auto-carga", () => {
    expect(mgr().matchBest("cambia el routing")).toBeNull();
  });

  test("una peticion sin relacion no carga nada", () => {
    const m = mgr();
    expect(m.matchBest("escribe un haiku sobre el otono")).toBeNull();
    expect(m.buildAutoLoadContext("escribe un haiku sobre el otono")).toBe("");
  });

  test("el contexto auto-cargado marca la skill como obligatoria", () => {
    const ctx = mgr().buildAutoLoadContext(
      "revisa el routing del provider y el fallback de SSE",
    );
    expect(ctx).toContain("Skill activa: provider-routing");
    expect(ctx).toContain("obligatorio");
  });

  test("tolera la inflexion: un trigger en singular casa con el plural y al reves", () => {
    writeSkill(
      "inflexion",
      "name: inflexion\ndescription: Irrelevante.\ntriggers: herramienta, permiso",
    );
    // "herramientas"/"permisos" en plural deben casar con los triggers en singular.
    expect(mgr().matchBest("anade herramientas y revisa los permisos")?.name).toBe("inflexion");
  });

  test("no infiere sinonimos entre idiomas sin triggers explicitos", () => {
    // Descripcion en ingles, peticion en espanol: sin `triggers` no puede casar.
    writeSkill(
      "solo-ingles",
      "name: solo-ingles\ndescription: Use when changing permission mapping and the registry.",
    );
    expect(mgr().matchBest("cambia el mapeo de permisos y el registro")).toBeNull();
  });

  test("una palabra corta compartida no basta para casar", () => {
    writeSkill("corta", "name: corta\ndescription: Irrelevante.\ntriggers: api, ssh");
    expect(mgr().matchBest("apis y apisonadora")).toBeNull();
  });

  test("triggers explicitos en el frontmatter mandan sobre los derivados", () => {
    writeSkill(
      "explicita",
      "name: explicita\ndescription: Descripcion irrelevante.\ntriggers: mermaid, diagrama",
    );
    const m = mgr();
    expect(m.matchBest("pinta un diagrama mermaid")?.name).toBe("explicita");
    expect(m.matchBest("descripcion irrelevante")).toBeNull();
  });
});

describe("SkillsManager — indice para el system prompt", () => {
  test("lista cada skill en una linea y cabe en pocos chars", () => {
    writeSkill("uno", "name: uno\ndescription: Primera skill de prueba.");
    writeSkill("dos", "name: dos\ndescription: Segunda skill de prueba.");

    const index = mgr().buildSkillsIndex();
    expect(index).toContain("`uno`");
    expect(index).toContain("`dos`");
    expect(index).toContain("Skills disponibles");
    expect(index.length).toBeLessThan(600);
  });
});
