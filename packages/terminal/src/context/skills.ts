/**
 * Skills Manager
 *
 * Discovers portable agent skills (`<scope>/.agents/skills/<name>/SKILL.md`) and makes
 * them available to the agent in three ways:
 *
 *   1. A compact index injected in the system prompt (always, ~1 line per skill).
 *   2. Deterministic auto-load of the single best-matching skill for a user request,
 *      so small local models get the skill without having to ask for it.
 *   3. The `skill` tool, which loads any skill on demand (progressive disclosure).
 *
 * Format contract (portable across Claude Code / OpenCode / OpenChamber):
 * frontmatter with `name` and `description`; everything else is the body.
 * An optional `triggers` key narrows auto-load matching; when absent, triggers are
 * derived from the name and description.
 *
 * Invariant: a malformed skill is skipped with a warning and NEVER blocks the others.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/** Max bytes of a SKILL.md we are willing to read at all. */
const MAX_SKILL_BYTES = 32_000;
/** Max chars of skill body injected when auto-loading. */
export const MAX_AUTOLOAD_CHARS = 6_000;
/** Skill name contract, aligned with skills-forge. */
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_NAME_LEN = 64;
const MAX_DESC_LEN = 1024;

/** Words too common to identify a skill; ignored when deriving triggers. */
const STOPWORDS = new Set([
  "use", "when", "using", "used", "the", "and", "for", "with", "that", "this",
  "from", "into", "its", "their", "your", "our", "any", "all", "not", "but",
  "are", "was", "were", "been", "have", "has", "had", "can", "could", "should",
  "would", "will", "may", "might", "must", "wabisabi", "otherwise", "modifying",
  "changing", "adding", "creating", "implementing", "fixing", "refactoring",
  "code", "source", "project", "file", "files", "behavior",
]);

export type SkillScope = "project" | "user";

export interface SkillMeta {
  name: string;
  description: string;
  scope: SkillScope;
  path: string;
  triggers: string[];
}

export interface SkillLoadResult {
  meta: SkillMeta;
  content: string;
  truncated: boolean;
}

/** Minimal frontmatter reader. Only `key: value` pairs; no YAML dependency. */
function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;

  const header = raw.slice(raw.indexOf("\n") + 1, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const data: Record<string, string> = {};

  for (const line of header.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }

  return { data, body };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .map((t) => t.replace(/^[-._/]+|[-._/]+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Two tokens match when they are equal or one is a prefix of the other with at
 * least 4 shared characters. That covers inflection inside a language
 * (tool/tools, permiso/permisos) without matching unrelated short words.
 * Cross-language synonyms are NOT inferred: declare them in `triggers`.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

function deriveTriggers(name: string, description: string): string[] {
  const tokens = new Set<string>();
  for (const t of tokenize(name)) tokens.add(t);
  for (const t of tokenize(description)) tokens.add(t);
  return [...tokens];
}

export class SkillsManager {
  private skills: Map<string, SkillMeta> = new Map();
  private warnings: string[] = [];
  private scanned = false;

  /**
   * @param projectRoot   project scope root, or null for user-scope only.
   * @param userSkillsDir user-scope directory; injectable so tests stay hermetic
   *                      and never read the real home directory.
   */
  constructor(
    private projectRoot: string | null,
    private userSkillsDir: string = join(homedir(), ".agents", "skills"),
  ) {}

  /** Directories scanned, in precedence order: project shadows user. */
  private scanDirs(): Array<{ dir: string; scope: SkillScope }> {
    const dirs: Array<{ dir: string; scope: SkillScope }> = [];
    if (this.projectRoot) {
      dirs.push({
        dir: join(this.projectRoot, ".agents", "skills"),
        scope: "project",
      });
    }
    dirs.push({ dir: this.userSkillsDir, scope: "user" });
    return dirs;
  }

  /**
   * Discover skills. User scope first so project scope overwrites it on name clash.
   * Never throws: unreadable directories and malformed skills become warnings.
   */
  scan(force = false): void {
    if (this.scanned && !force) return;
    this.skills.clear();
    this.warnings = [];

    for (const { dir, scope } of this.scanDirs().reverse()) {
      if (!existsSync(dir)) continue;

      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        this.warnings.push(`No se pudo leer el directorio de skills: ${dir}`);
        continue;
      }

      for (const entry of entries) {
        const skillPath = join(dir, entry, "SKILL.md");
        try {
          if (!existsSync(skillPath)) continue;
          if (statSync(skillPath).size > MAX_SKILL_BYTES) {
            this.warnings.push(`Skill "${entry}" ignorada: SKILL.md supera ${MAX_SKILL_BYTES} bytes`);
            continue;
          }
          const meta = this.parseSkill(skillPath, scope);
          if (meta) this.skills.set(meta.name, meta);
        } catch {
          this.warnings.push(`Skill "${entry}" ignorada: no se pudo leer ${skillPath}`);
        }
      }
    }

    this.scanned = true;
  }

  private parseSkill(path: string, scope: SkillScope): SkillMeta | null {
    const raw = readFileSync(path, "utf-8");
    const parsed = parseFrontmatter(raw);
    if (!parsed) {
      this.warnings.push(`Skill ignorada: falta el frontmatter en ${path}`);
      return null;
    }

    const name = parsed.data.name?.trim() ?? "";
    const description = parsed.data.description?.trim() ?? "";

    if (!name || !NAME_RE.test(name) || name.length > MAX_NAME_LEN) {
      this.warnings.push(`Skill ignorada: "name" invalido en ${path}`);
      return null;
    }
    if (!description) {
      this.warnings.push(`Skill "${name}" ignorada: falta "description"`);
      return null;
    }

    const explicit = parsed.data.triggers
      ? parsed.data.triggers
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : null;

    return {
      name,
      description: description.slice(0, MAX_DESC_LEN),
      scope,
      path,
      triggers: explicit?.length ? explicit : deriveTriggers(name, description),
    };
  }

  list(): SkillMeta[] {
    this.scan();
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getWarnings(): string[] {
    this.scan();
    return [...this.warnings];
  }

  has(name: string): boolean {
    this.scan();
    return this.skills.has(name);
  }

  /** Full skill content, clamped. Returns null when the skill does not exist. */
  load(name: string, maxChars = MAX_AUTOLOAD_CHARS): SkillLoadResult | null {
    this.scan();
    const meta = this.skills.get(name);
    if (!meta) return null;

    let raw: string;
    try {
      raw = readFileSync(meta.path, "utf-8");
    } catch {
      return null;
    }

    const parsed = parseFrontmatter(raw);
    const body = (parsed?.body ?? raw).trim();
    const truncated = body.length > maxChars;

    return {
      meta,
      content: truncated ? body.slice(0, maxChars) + "\n\n[...skill truncada]" : body,
      truncated,
    };
  }

  /**
   * Compact index for the system prompt. Empty string when there are no skills,
   * so projects without skills pay nothing.
   */
  buildSkillsIndex(): string {
    const skills = this.list();
    if (skills.length === 0) return "";

    const lines = skills.map((s) => {
      const short = s.description.length > 110
        ? s.description.slice(0, 110).trimEnd() + "…"
        : s.description;
      return `- \`${s.name}\` — ${short}`;
    });

    return [
      "\n## Skills disponibles",
      "Procedimientos del proyecto. Carga una entera con la tool `skill` antes de trabajar en su area.",
      ...lines,
    ].join("\n");
  }

  /**
   * Deterministic best match for a user request. Scores by how many distinct
   * triggers appear in the prompt; requires at least 2 so a single generic word
   * cannot drag a whole skill into the context.
   */
  matchBest(prompt: string): SkillMeta | null {
    const skills = this.list();
    if (skills.length === 0) return null;

    const promptTokens = tokenize(prompt);
    if (promptTokens.length === 0) return null;

    let best: SkillMeta | null = null;
    let bestScore = 0;

    for (const skill of skills) {
      const hits = new Set<string>();
      for (const trigger of skill.triggers) {
        for (const token of promptTokens) {
          if (tokensMatch(trigger, token)) {
            hits.add(trigger);
            break;
          }
        }
      }
      if (hits.size > bestScore) {
        bestScore = hits.size;
        best = skill;
      }
    }

    return bestScore >= 2 ? best : null;
  }

  /**
   * Auto-load context for a user request, or "" when nothing matches well enough.
   * Injected as an extra system message, never merged into the user's own text.
   */
  buildAutoLoadContext(prompt: string): string {
    const match = this.matchBest(prompt);
    if (!match) return "";

    const loaded = this.load(match.name);
    if (!loaded) return "";

    return [
      `## Skill activa: ${match.name}`,
      `Cargada automaticamente porque la peticion cae en su area. Es un procedimiento`,
      `obligatorio del proyecto, no una sugerencia.`,
      "",
      loaded.content,
    ].join("\n");
  }
}
