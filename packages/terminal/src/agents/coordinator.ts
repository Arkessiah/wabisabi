/**
 * Multi-Agent Coordinator
 *
 * Orchestrates collaboration between multiple agents (Build, Plan, Search).
 * Supports task delegation, result sharing, and sequential/parallel execution.
 */

import {
  ApiClient,
  type CLIOptions,
  type ChatMessage,
} from "../clients/api-client.js";
import { toolRegistry, type ToolSpec } from "../tools/index.js";
import { projectContext } from "../context/index.js";
import chalk from "chalk";

// ── Types ────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  agent: "build" | "plan" | "search";
  prompt: string;
  dependsOn?: string[];
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}

export interface CoordinationPlan {
  tasks: AgentTask[];
  strategy: "sequential" | "parallel" | "pipeline";
  description: string;
}

// ── Agent Configs ────────────────────────────────────────────

const AGENT_CONFIGS: Record<string, { systemPrompt: string; tools: string[] }> = {
  build: {
    systemPrompt: "You are a code generation expert. Write clean, working code.",
    tools: ["read", "write", "edit", "bash", "grep", "glob", "list", "git"],
  },
  plan: {
    systemPrompt: "You are an architecture expert. Analyze code and create plans. Do NOT modify files.",
    tools: ["read", "grep", "glob", "list", "git"],
  },
  search: {
    systemPrompt: "You are a codebase exploration expert. Find code and explain patterns. Do NOT modify files.",
    tools: ["read", "grep", "glob", "list", "git", "web"],
  },
};

// ── Coordinator ──────────────────────────────────────────────

export class AgentCoordinator {
  private client: ApiClient;
  private opts: CLIOptions;

  constructor(opts: CLIOptions) {
    this.opts = opts;
    this.client = new ApiClient(opts);
  }

  /**
   * Create a coordination plan from a high-level request.
   * Uses the LLM to decompose the task into agent-specific subtasks.
   */
  async createPlan(request: string): Promise<CoordinationPlan> {
    const planPrompt = `You are a task coordinator for a coding assistant with 3 agents:
- search: finds code, explores codebase (read-only)
- plan: analyzes architecture, creates plans (read-only)
- build: writes code, runs tests (read-write)

Decompose this request into subtasks. Each task should specify which agent handles it.
Return JSON with this exact format:
{
  "strategy": "sequential" | "parallel" | "pipeline",
  "description": "brief plan summary",
  "tasks": [
    { "id": "t1", "agent": "search|plan|build", "prompt": "specific instruction", "dependsOn": [] }
  ]
}

Request: ${request}`;

    try {
      const response = await this.client.chat(planPrompt);
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        return {
          strategy: plan.strategy || "sequential",
          description: plan.description || request,
          tasks: (plan.tasks || []).map((t: any) => ({
            ...t,
            status: "pending" as const,
            dependsOn: t.dependsOn || [],
          })),
        };
      }
    } catch {}

    // Fallback: simple sequential plan
    return {
      strategy: "sequential",
      description: request,
      tasks: [
        { id: "t1", agent: "search", prompt: `Analyze the codebase for: ${request}`, status: "pending" },
        { id: "t2", agent: "plan", prompt: `Create a plan for: ${request}`, dependsOn: ["t1"], status: "pending" },
        { id: "t3", agent: "build", prompt: `Implement: ${request}`, dependsOn: ["t2"], status: "pending" },
      ],
    };
  }

  /**
   * Execute a coordination plan.
   */
  async execute(plan: CoordinationPlan): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    console.log(chalk.bold.cyan(`\n  Multi-Agent: ${plan.description}`));
    console.log(chalk.dim(`  Strategy: ${plan.strategy}`));
    console.log(chalk.dim(`  Tasks: ${plan.tasks.length}\n`));

    if (plan.strategy === "parallel") {
      await this.executeParallel(plan.tasks, results);
    } else {
      await this.executeSequential(plan.tasks, results);
    }

    // Summary
    console.log(chalk.bold("\n  Results Summary"));
    console.log(chalk.dim("  ─────────────────────────────────"));
    for (const task of plan.tasks) {
      const status = task.status === "completed"
        ? chalk.green("OK")
        : chalk.red("FAIL");
      console.log(`  ${status} [${task.agent}] ${task.prompt.slice(0, 50)}`);
    }

    return results;
  }

  private async executeSequential(
    tasks: AgentTask[],
    results: Map<string, string>,
  ): Promise<void> {
    for (const task of tasks) {
      // Check dependencies
      if (task.dependsOn?.length) {
        const unmet = task.dependsOn.filter((dep) => !results.has(dep));
        if (unmet.length > 0) {
          task.status = "failed";
          task.result = `Unmet dependencies: ${unmet.join(", ")}`;
          continue;
        }
      }

      await this.executeTask(task, results);
    }
  }

  private async executeParallel(
    tasks: AgentTask[],
    results: Map<string, string>,
  ): Promise<void> {
    // Group tasks by dependency level
    const levels: AgentTask[][] = [];
    const placed = new Set<string>();

    while (placed.size < tasks.length) {
      const level: AgentTask[] = [];
      for (const task of tasks) {
        if (placed.has(task.id)) continue;
        const depsOk = !task.dependsOn?.length ||
          task.dependsOn.every((d) => placed.has(d));
        if (depsOk) level.push(task);
      }
      if (level.length === 0) break; // Circular dependency
      for (const t of level) placed.add(t.id);
      levels.push(level);
    }

    for (const level of levels) {
      await Promise.all(level.map((task) => this.executeTask(task, results)));
    }
  }

  private async executeTask(
    task: AgentTask,
    results: Map<string, string>,
  ): Promise<void> {
    task.status = "running";
    const config = AGENT_CONFIGS[task.agent] || AGENT_CONFIGS.build;

    console.log(chalk.cyan(`  [${task.agent}] ${task.prompt.slice(0, 60)}...`));

    // Build context from dependency results
    let context = "";
    if (task.dependsOn?.length) {
      const depResults = task.dependsOn
        .map((d) => results.get(d))
        .filter(Boolean)
        .join("\n\n");
      if (depResults) {
        context = `\n\nContext from previous tasks:\n${depResults}`;
      }
    }

    const contextPrompt = projectContext.getProjectRoot()
      ? projectContext.getSystemPrompt()
      : "";

    const messages: ChatMessage[] = [
      { role: "system", content: `${config.systemPrompt}\n\n${contextPrompt}` },
      { role: "user", content: task.prompt + context },
    ];

    const toolSpecs = toolRegistry.toToolSpecs(config.tools);

    try {
      // Tool-calling loop
      let iterations = 0;
      const MAX = 15;

      while (iterations < MAX) {
        iterations++;
        const response = await this.client.chatWithTools(messages, toolSpecs);
        const msg = response.choices[0]?.message;
        if (!msg) break;

        if (!msg.tool_calls?.length) {
          task.result = msg.content || "";
          task.status = "completed";
          results.set(task.id, task.result);
          console.log(chalk.green(`  [${task.agent}] Done`));
          return;
        }

        // Execute tools
        messages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        });

        for (const call of msg.tool_calls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(call.function.arguments);
          } catch {
            args = {};
          }
          const result = await toolRegistry.execute(call.function.name, args, {
            projectRoot: projectContext.getProjectRoot(),
          });
          messages.push({
            role: "tool",
            content: result.output,
            tool_call_id: call.id,
          });
          console.log(chalk.dim(`    ${call.function.name}: ${result.title}`));
        }
      }

      task.status = "completed";
      task.result = "Max iterations reached";
      results.set(task.id, task.result);
    } catch (err) {
      task.status = "failed";
      task.result = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  [${task.agent}] Failed: ${task.result}`));
    }
  }
}
