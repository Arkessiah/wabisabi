import { SITE_URL, SITE_DESCRIPTION, REPO_URL } from "@/lib/site";

// llms.txt (llmstxt.org): índice en Markdown para agentes. No es factor de
// ranking; se sirve por ser barato y útil para agentes. Generado en build.
// Solo hechos que también están en la landing: si cambian allí, cambiar aquí.
export const dynamic = "force-static";

export function GET() {
  const body = `# Wabi-Sabi

> ${SITE_DESCRIPTION}

Wabi-Sabi has two clients: a terminal CLI and a VS Code extension. Both run
autonomous coding agents that read, write and run code, delegate work to
subagents and keep persistent memory per user and team. Models are local
(through Ollama) or cloud (through a Substratum account).

## Product
- [Home](${SITE_URL}): overview of the platform, the agents and the token economy.
- [Installation](${SITE_URL}/#install): CLI requirements (Bun or Node.js 18+) and the VS Code extension (VS Code 1.85+).
- [Features](${SITE_URL}/#features): agents and subagents, workflows, team and user memory, distributed computing, model routing.
- [Token economy](${SITE_URL}/#economy): buy tokens, earn them by contributing CPU/GPU compute, sell unused tokens, Gold status.
- [Pricing](${SITE_URL}/#pricing): plans.
- [FAQ](${SITE_URL}/#faq): common questions.

## Source
- [GitHub repository](${REPO_URL}): source code, MIT license.

## Optional
- [Sign in](${SITE_URL}/login): account access (not indexed).
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
