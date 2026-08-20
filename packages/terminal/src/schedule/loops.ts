/**
 * Loops: tareas programadas como ficheros markdown
 *
 * Un "loop" es un `.md` versionable con frontmatter y un prompt en el cuerpo:
 *
 * ```markdown
 * ---
 * name: repaso-diario
 * schedule: "0 9 * * *"
 * enabled: true
 * ---
 * Revisa los tests que fallan y propon un arreglo.
 * ```
 *
 * Vive en el repo, se revisa en un PR y viaja entre máquinas. Es la pata de
 * *scheduling*: sin ella alguien tiene que fijar cada objetivo a mano.
 *
 * Reglas que evitan sorpresas caras:
 *
 * - **`enabled` es false por defecto.** Clonar un repo no puede poner tareas a
 *   correr en tu máquina sin que las mires.
 * - **La identidad es la RUTA del fichero**, no el nombre: renombrar la tarea no
 *   deja un duplicado huérfano corriendo en paralelo.
 * - **Un fichero malformado NO es un fichero borrado.** Un `.md` a medio editar o
 *   con un merge sucio se ignora con aviso; nunca se interpreta a medias.
 * - **Proyecto tapa a usuario** cuando comparten nombre.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { parseCron } from "./cron.js";

const MAX_LOOP_BYTES = 64_000;
const MAX_NAME_LEN = 80;
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export type LoopScope = "project" | "user";

export interface Loop {
  name: string;
  /** Ruta del fichero: la identidad real de la tarea. */
  path: string;
  scope: LoopScope;
  schedule: string;
  enabled: boolean;
  prompt: string;
  model?: string;
  agent?: string;
  /** Presupuesto de tokens si la tarea corre como objetivo. */
  tokenBudget?: number;
}

export interface LoopProblem {
  path: string;
  reason: string;
}

export interface DiscoverResult {
  loops: Loop[];
  problems: LoopProblem[];
}

export function projectLoopsDir(projectRoot: string): string {
  return join(projectRoot, ".agents", "loops");
}

export function userLoopsDir(): string {
  return join(homedir(), ".agents", "loops");
}

/** Parsea un fichero de loop. Devuelve el motivo cuando no es válido. */
export function parseLoop(
  path: string,
  raw: string,
  scope: LoopScope,
): { loop: Loop } | { error: string } {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return { error: "falta el frontmatter" };

  const name = (parsed.data.name ?? "").trim();
  if (!name) return { error: 'falta "name"' };
  if (name.length > MAX_NAME_LEN || !NAME_RE.test(name)) {
    return { error: `"name" invalido (minusculas y guiones, <= ${MAX_NAME_LEN})` };
  }

  const schedule = (parsed.data.schedule ?? "").trim();
  if (!schedule) return { error: 'falta "schedule"' };
  if (!parseCron(schedule)) {
    return { error: `cron invalido: "${schedule}" (formato: min hora dia mes dia-semana)` };
  }

  const prompt = parsed.body.trim();
  if (!prompt) return { error: "el cuerpo esta vacio: no hay nada que ejecutar" };

  const budgetRaw = (parsed.data.token_budget ?? parsed.data.tokenBudget ?? "").trim();
  let tokenBudget: number | undefined;
  if (budgetRaw) {
    const n = Number(budgetRaw);
    if (!Number.isInteger(n) || n <= 0) return { error: '"token_budget" debe ser un entero positivo' };
    tokenBudget = n;
  }

  return {
    loop: {
      name,
      path,
      scope,
      schedule,
      // Opt-in explícito: cualquier otra cosa que "true" es false.
      enabled: (parsed.data.enabled ?? "").trim().toLowerCase() === "true",
      prompt,
      ...(parsed.data.model ? { model: parsed.data.model.trim() } : {}),
      ...(parsed.data.agent ? { agent: parsed.data.agent.trim() } : {}),
      ...(tokenBudget !== undefined ? { tokenBudget } : {}),
    },
  };
}

function scanDir(dir: string, scope: LoopScope): DiscoverResult {
  const loops: Loop[] = [];
  const problems: LoopProblem[] = [];

  if (!existsSync(dir)) return { loops, problems };

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { loops, problems: [{ path: dir, reason: "no se pudo leer el directorio" }] };
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const path = join(dir, entry);

    try {
      if (statSync(path).size > MAX_LOOP_BYTES) {
        problems.push({ path, reason: `supera ${MAX_LOOP_BYTES} bytes` });
        continue;
      }
      const res = parseLoop(path, readFileSync(path, "utf-8"), scope);
      if ("error" in res) problems.push({ path, reason: res.error });
      else loops.push(res.loop);
    } catch {
      problems.push({ path, reason: "no se pudo leer" });
    }
  }

  return { loops, problems };
}

/**
 * Descubre los loops de proyecto y de usuario.
 * Un fichero roto se reporta como problema y **no impide** que el resto se carguen.
 */
export function discoverLoops(projectRoot: string | null): DiscoverResult {
  const user = scanDir(userLoopsDir(), "user");
  const project = projectRoot
    ? scanDir(projectLoopsDir(projectRoot), "project")
    : { loops: [], problems: [] };

  // Proyecto tapa a usuario por nombre.
  const byName = new Map<string, Loop>();
  for (const l of user.loops) byName.set(l.name, l);
  for (const l of project.loops) byName.set(l.name, l);

  return {
    loops: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    problems: [...user.problems, ...project.problems],
  };
}

/** Los que el planificador debe ejecutar. */
export function enabledLoops(result: DiscoverResult): Loop[] {
  return result.loops.filter((l) => l.enabled);
}
