import { SITE_URL } from "@/lib/site";

// robots.txt generado en build. Vía route handler (no `app/robots.ts` tipado)
// porque necesitamos la directiva `Content-Signal` de contentsignals.org.
export const dynamic = "force-static";

// POLÍTICA DE EQUIPO (regla #29): citable por motores de respuesta (AEO) sin
// ceder contenido para entrenar. ClaudeBot se permite a propósito (decisión del
// usuario: aquí SÍ se acepta el entrenamiento de Anthropic).
export function GET() {
  const body = `# robots.txt — Wabi-Sabi
# Politica: buscar=si, ai-input=si, ai-train=NO (contentsignals.org)
Content-Signal: search=yes, ai-input=yes, ai-train=no

# --- Buscadores clasicos + motores de respuesta (PERMITIR: SEO + AEO) ---
User-agent: Googlebot
Allow: /

User-agent: bingbot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

# ClaudeBot es el crawler de ENTRENAMIENTO de Anthropic, permitido a proposito.
User-agent: ClaudeBot
Allow: /

# --- Crawlers de ENTRENAMIENTO (BLOQUEAR) ---
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Meta-ExternalAgent
Disallow: /

# --- Resto ---
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
