/**
 * Worktree isolation tests.
 *
 * La garantia: un objetivo que escribe NO toca el arbol de trabajo del usuario.
 * Se usan repos git de verdad en directorios temporales; no hace falta modelo.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  ensureWorktree,
  isGitRepo,
  removeWorktree,
  worktreeChanges,
  worktreeNames,
} from "../worktree.js";

let root: string;
let repo: string;
const sesiones: string[] = [];

function git(cmd: string, cwd = repo): string {
  return execSync(`git -c user.email=t@t -c user.name=t ${cmd}`, { cwd }).toString();
}

/** Id unico por test para no chocar con worktrees de otros. */
function nuevaSesion(): string {
  const id = `wt-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sesiones.push(id);
  return id;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wt-"));
  repo = join(root, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, "a.txt"), "contenido original\n");
  git("init -q");
  git("add -A");
  git('commit -qm base');
});

afterEach(async () => {
  for (const id of sesiones.splice(0)) {
    await removeWorktree(repo, id, { force: true }).catch(() => {});
    rmSync(worktreeNames(id).dir, { recursive: true, force: true });
  }
  rmSync(root, { recursive: true, force: true });
});

describe("deteccion de repo", () => {
  test("reconoce un repo git", async () => {
    expect(await isGitRepo(repo)).toBe(true);
  });

  test("un directorio suelto no lo es", async () => {
    const suelto = join(root, "suelto");
    mkdirSync(suelto);
    expect(await isGitRepo(suelto)).toBe(false);
  });
});

describe("sin git no hay aislamiento, asi que se rechaza", () => {
  test("ensureWorktree falla y lo explica", async () => {
    const suelto = join(root, "suelto2");
    mkdirSync(suelto);

    const res = await ensureWorktree(suelto, nuevaSesion());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("repositorio git");
  });

  test("un repo sin commits tampoco sirve de base", async () => {
    const vacio = join(root, "vacio");
    mkdirSync(vacio);
    execSync("git init -q", { cwd: vacio });

    const res = await ensureWorktree(vacio, nuevaSesion());
    expect(res.ok).toBe(false);
  });
});

describe("el trabajo aterriza fuera del arbol del usuario", () => {
  test("crea un worktree en su propio directorio y rama", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    expect(res.path).toBe(worktreeNames(id).dir);
    expect(res.branch).toBe(worktreeNames(id).branch);
    expect(existsSync(join(res.path, "a.txt"))).toBe(true);
  });

  test("escribir en el worktree NO cambia el arbol original", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    writeFileSync(join(res.path, "a.txt"), "modificado por el agente\n");
    writeFileSync(join(res.path, "nuevo.txt"), "fichero nuevo\n");

    expect(readFileSync(join(repo, "a.txt"), "utf-8")).toBe("contenido original\n");
    expect(existsSync(join(repo, "nuevo.txt"))).toBe(false);
    expect(git("status --porcelain").trim()).toBe("");
  });

  test("el trabajo sin commitear del usuario ni se ve ni se toca", async () => {
    // Se ramifica desde HEAD, no desde el arbol sucio: el objetivo parte de un
    // estado conocido y no puede dañar lo que no ve.
    writeFileSync(join(repo, "wip.txt"), "trabajo a medias del usuario\n");

    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    expect(existsSync(join(res.path, "wip.txt"))).toBe(false);
    expect(readFileSync(join(repo, "wip.txt"), "utf-8")).toBe("trabajo a medias del usuario\n");
  });

  test("es idempotente: el segundo tick reutiliza el mismo worktree", async () => {
    const id = nuevaSesion();
    const primero = await ensureWorktree(repo, id);
    if (!primero.ok) throw new Error(primero.error);

    writeFileSync(join(primero.path, "progreso.txt"), "turno 1\n");

    const segundo = await ensureWorktree(repo, id);
    expect(segundo.ok).toBe(true);
    if (!segundo.ok) return;

    expect(segundo.created).toBe(false);
    expect(segundo.path).toBe(primero.path);
    // El progreso del turno anterior sigue ahi.
    expect(existsSync(join(segundo.path, "progreso.txt"))).toBe(true);
  });
});

describe("revision del resultado", () => {
  test("lista los ficheros tocados y produce un diff", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    writeFileSync(join(res.path, "a.txt"), "cambiado\n");
    const ch = await worktreeChanges(res.path);

    expect(ch.clean).toBe(false);
    expect(ch.files.join(" ")).toContain("a.txt");
    expect(ch.diff).toContain("-contenido original");
    expect(ch.diff).toContain("+cambiado");
  });

  test("un fichero NUEVO tambien cuenta como trabajo", async () => {
    // Un diff que ocultara los untracked infra-reportaria el cambio.
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    writeFileSync(join(res.path, "creado.txt"), "nuevo\n");
    const ch = await worktreeChanges(res.path);

    expect(ch.clean).toBe(false);
    expect(ch.files.join(" ")).toContain("creado.txt");
    // Y tiene que salir tambien en el DIFF: `git diff HEAD` a secas lo ocultaria.
    expect(ch.diff).toContain("creado.txt");
    expect(ch.diff).toContain("+nuevo");
  });

  test("un objetivo que no escribio nada sale limpio", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    const ch = await worktreeChanges(res.path);
    expect(ch.clean).toBe(true);
    expect(ch.files).toEqual([]);
  });

  test("el diff se trunca en lugar de devolver algo enorme", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    writeFileSync(join(res.path, "grande.txt"), "linea\n".repeat(5000));
    const ch = await worktreeChanges(res.path, 500);

    expect(ch.diff.length).toBeLessThan(700);
    expect(ch.diff).toContain("[...diff truncado]");
  });
});

describe("limpieza", () => {
  test("removeWorktree lo borra", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    expect((await removeWorktree(repo, id, { force: true })).ok).toBe(true);
    expect(existsSync(res.path)).toBe(false);
  });

  test("borrar algo que no existe no es un error", async () => {
    expect((await removeWorktree(repo, "no-existe-jamas")).ok).toBe(true);
  });

  test("sin force, un worktree con cambios NO se borra a la ligera", async () => {
    const id = nuevaSesion();
    const res = await ensureWorktree(repo, id);
    if (!res.ok) throw new Error(res.error);

    writeFileSync(join(res.path, "a.txt"), "trabajo sin revisar\n");

    // Borrar el trabajo de un objetivo tiene que ser deliberado.
    const sinForce = await removeWorktree(repo, id);
    expect(sinForce.ok).toBe(false);
    expect(existsSync(res.path)).toBe(true);
  });
});
