import { SITE_URL, SITE_DESCRIPTION } from "@/lib/site";

// llms.txt (llmstxt.org): índice en Markdown para agentes. No es factor de
// ranking; se sirve por ser barato y útil para agentes. Generado en build.
export const dynamic = "force-static";

export function GET() {
  const body = `# Wabi-Sabi

> ${SITE_DESCRIPTION}

## Product
- [Wabi-Sabi](${SITE_URL}): collaborative AI development platform.
- [Sign in](${SITE_URL}/login): access your account.
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
