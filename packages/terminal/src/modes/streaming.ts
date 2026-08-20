/**
 * Streaming Mode
 *
 * Single-shot mode with tool-calling support.
 * Reads prompt from stdin, executes with tools, streams response.
 * Usage: echo "read package.json and list deps" | wabisabi stream
 */

import {
  ApiClient,
  type CLIOptions,
  type ChatMessage,
  type StreamDelta,
  type StreamResult,
} from "../clients/api-client.js";
import { toolRegistry, type ToolSpec } from "../tools/index.js";
import { projectContext } from "../context/index.js";

const ALL_TOOLS = ["read", "write", "edit", "bash", "grep", "glob", "list", "git"];

export async function streamingMode(opts: CLIOptions): Promise<void> {
  // Read all stdin
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk.toString());
  }
  const input = chunks.join("").trim();

  if (!input) {
    console.error("No input provided. Pipe text to this command:");
    console.error("  echo 'your prompt' | wabisabi stream");
    process.exit(1);
  }

  await projectContext.initialize();
  const client = new ApiClient(opts);
  const contextPrompt = projectContext.getSystemPrompt();
  const toolSpecs = toolRegistry.toToolSpecs(ALL_TOOLS);

  const messages: ChatMessage[] = [
    { role: "system", content: `You are a coding assistant.\n\n${contextPrompt}` },
    { role: "user", content: input },
  ];

  // Tool-calling loop (non-streaming for tool calls, streaming for final response)
  let maxIterations = 20;
  while (maxIterations-- > 0) {
    const gen = client.chatWithToolsStream(messages, toolSpecs);

    // El valor de RETORNO del generador (el que trae las tool_calls) se entrega
    // en la llamada a next() que marca done. Un `for await` lo DESCARTA, y llamar
    // a next() despues sobre un generador agotado devuelve undefined — con lo que
    // el modo stream nunca ejecutaba ninguna herramienta: rompia el bucle en la
    // primera vuelta. Hay que consumirlo a mano, como hace base-agent.
    let result: StreamResult | undefined;
    while (true) {
      const { done, value } = await gen.next();
      if (done) {
        result = value as StreamResult | undefined;
        break;
      }
      const delta = value as StreamDelta;
      if (delta?.content) {
        process.stdout.write(delta.content);
      }
    }

    const calls = result?.tool_calls ?? [];
    if (calls.length === 0) break;

    messages.push({
      role: "assistant",
      content: result?.content || null,
      tool_calls: calls,
    });

    for (const call of calls) {
      // Una tool call a medio llegar no puede tumbar el modo stream.
      const name = call.function?.name;
      if (!name) {
        process.stderr.write("> tool call incompleta, ignorada\n");
        continue;
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }

      const toolResult = await toolRegistry.execute(name, args, {
        projectRoot: projectContext.getProjectRoot(),
      });

      process.stderr.write(`> ${name}: ${toolResult.title}\n`);

      messages.push({
        role: "tool",
        content: toolResult.output,
        tool_call_id: call.id,
      });
    }
  }

  process.stdout.write("\n");
}
