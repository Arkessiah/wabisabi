/**
 * Batch Mode
 *
 * Runs a list of tasks from a JSON file, each with tool-calling support.
 * Tasks are executed sequentially with full agent capabilities.
 */

import { ApiClient, type CLIOptions, type ChatMessage } from "../clients/api-client.js";
import { toolRegistry, type ToolSpec } from "../tools/index.js";
import { projectContext } from "../context/index.js";
import { readFileSync } from "fs";

interface BatchTask {
  name: string;
  prompt: string;
  tools?: string[];
}

interface BatchFile {
  version: string;
  tasks: BatchTask[];
}

const ALL_TOOLS = ["read", "write", "edit", "bash", "grep", "glob", "list"];

export async function batchMode(
  filePath: string,
  opts: CLIOptions,
): Promise<void> {
  console.log("Batch Mode");
  console.log(`File: ${filePath}\n`);

  const content = readFileSync(filePath, "utf-8");
  const batch: BatchFile = JSON.parse(content);

  if (!Array.isArray(batch.tasks)) {
    throw new Error("Batch file must contain a 'tasks' array");
  }

  await projectContext.initialize();
  const client = new ApiClient(opts);
  const contextPrompt = projectContext.getSystemPrompt();

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < batch.tasks.length; i++) {
    const task = batch.tasks[i];
    console.log(`[${i + 1}/${batch.tasks.length}] ${task.name}`);

    const toolIds = task.tools ?? ALL_TOOLS;
    const toolSpecs = toolRegistry.toToolSpecs(toolIds);

    const messages: ChatMessage[] = [
      { role: "system", content: `You are a coding assistant.\n\n${contextPrompt}` },
      { role: "user", content: task.prompt },
    ];

    try {
      let result = await runWithTools(client, messages, toolSpecs);

      // Tool-calling loop
      while (result.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.toolCalls,
        });

        for (const call of result.toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(call.function.arguments);
          } catch {
            args = {};
          }

          const toolResult = await toolRegistry.execute(call.function.name, args, {
            projectRoot: projectContext.getProjectRoot(),
          });

          messages.push({
            role: "tool",
            content: toolResult.output,
            tool_call_id: call.id,
          });

          console.log(`  > ${call.function.name}: ${toolResult.title}`);
        }

        result = await runWithTools(client, messages, toolSpecs);
      }

      if (result.content) {
        // Truncate long output for batch display
        const lines = result.content.split("\n");
        const preview = lines.slice(0, 5).join("\n");
        console.log(`  ${preview}${lines.length > 5 ? `\n  ... (${lines.length} lines)` : ""}`);
      }

      passed++;
      console.log(`  OK\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED: ${msg}\n`);
      failed++;
    }
  }

  console.log(`\nBatch complete: ${passed} passed, ${failed} failed`);
}

async function runWithTools(
  client: ApiClient,
  messages: ChatMessage[],
  toolSpecs: ToolSpec[],
): Promise<{ content: string; toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }> {
  const response = await client.chatWithTools(messages, toolSpecs);
  const msg = response.choices[0]?.message;
  return {
    content: msg?.content || "",
    toolCalls: msg?.tool_calls || [],
  };
}
