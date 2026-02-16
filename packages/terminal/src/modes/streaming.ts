/**
 * Streaming Mode
 *
 * Single-shot mode with tool-calling support.
 * Reads prompt from stdin, executes with tools, streams response.
 * Usage: echo "read package.json and list deps" | wabisabi stream
 */

import { ApiClient, type CLIOptions, type ChatMessage } from "../clients/api-client.js";
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

    let content = "";
    let hasToolCalls = false;
    const result = await (async () => {
      for await (const delta of gen) {
        if (delta.content) {
          content += delta.content;
          process.stdout.write(delta.content);
        }
      }
      // Get the final return value
      const final = await gen.next();
      return final.value;
    })();

    if (!result || result.tool_calls.length === 0) {
      break;
    }

    // Execute tool calls
    hasToolCalls = true;
    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.tool_calls,
    });

    for (const call of result.tool_calls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        args = {};
      }

      const toolResult = await toolRegistry.execute(call.function.name, args, {
        projectRoot: projectContext.getProjectRoot(),
      });

      process.stderr.write(`> ${call.function.name}: ${toolResult.title}\n`);

      messages.push({
        role: "tool",
        content: toolResult.output,
        tool_call_id: call.id,
      });
    }
  }

  process.stdout.write("\n");
}
