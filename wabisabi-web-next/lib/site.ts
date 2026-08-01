/**
 * URL base del sitio para metadata, robots, sitemap y JSON-LD.
 * Prioridad: NEXT_PUBLIC_SITE_URL > VERCEL_PROJECT_PRODUCTION_URL > placeholder.
 * Así el dominio correcto sale sin configurar nada en un deploy de Vercel.
 */
export const SITE_URL: string = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://wabisabi.example.com";
})();

export const SITE_NAME = "Wabi-Sabi";

/** Descripción factual (answer-first) para máquinas: JSON-LD y llms.txt. */
export const SITE_DESCRIPTION =
  "Wabi-Sabi is a collaborative AI development platform with a unique economic model.";

/** Autor/creador: proyecto PERSONAL, no una empresa (schema.org Person). */
export const CREATOR_NAME = "Arkessiah";
export const CREATOR_URL = "https://github.com/Arkessiah";
