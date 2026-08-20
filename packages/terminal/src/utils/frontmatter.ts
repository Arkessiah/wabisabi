/**
 * Lector mínimo de frontmatter YAML-ish.
 *
 * Solo pares `clave: valor`; sin listas anidadas ni tipos. Deliberado: los
 * ficheros que lo usan (skills, loops) tienen frontmatter plano, y una
 * dependencia de YAML es superficie de suministro por algo que cabe aquí.
 *
 * Vive en `utils/` porque lo comparten `context/skills.ts` y `schedule/loops.ts`;
 * dos copias del mismo parser divergen en cuanto una arregla un caso raro.
 */

export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

export function parseFrontmatter(raw: string): Frontmatter | null {
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
