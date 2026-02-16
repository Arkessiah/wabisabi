/**
 * WabiSabi Tool Engine
 *
 * Framework for defining, registering, and executing tools.
 * Tools are the core capabilities that agents use to interact with the filesystem,
 * execute commands, and search code.
 */

import { z } from "zod";
import { configManager } from "../config/index.js";
import type { ToolPermissions } from "../config/schema.js";

// ── Types ──────────────────────────────────────────────────────

export interface ToolResult {
  title: string;
  output: string;
  metadata: Record<string, unknown>;
}

export interface ToolContext {
  projectRoot: string;
  sessionId?: string;
  abort?: AbortSignal;
}

export interface ToolDefinition<P extends z.ZodType = z.ZodType> {
  id: string;
  description: string;
  parameters: P;
  execute(args: z.infer<P>, ctx: ToolContext): Promise<ToolResult>;
}

// ── Constants ──────────────────────────────────────────────────

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024; // 50KB
const MAX_LINE_LENGTH = 2000;

// ── Permission Mapping ─────────────────────────────────────────

const TOOL_PERMISSION_MAP: Record<string, keyof ToolPermissions> = {
  read: "allowFileRead",
  write: "allowFileWrite",
  edit: "allowFileWrite",
  bash: "allowBash",
  grep: "allowGrep",
  glob: "allowGlob",
  list: "allowList",
};

function checkPermission(toolId: string): boolean {
  const config = configManager.getMerged();
  const key = TOOL_PERMISSION_MAP[toolId];
  if (!key) return true;
  return config.tools[key];
}

// ── Truncation ─────────────────────────────────────────────────

export function truncateOutput(text: string): { content: string; truncated: boolean } {
  const lines = text.split("\n");
  let byteCount = 0;
  let lineCount = 0;
  const result: string[] = [];

  for (const line of lines) {
    const truncatedLine =
      line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH) + "..."
        : line;
    const lineBytes = Buffer.byteLength(truncatedLine, "utf-8");

    if (byteCount + lineBytes > MAX_BYTES || lineCount >= MAX_LINES) {
      const remaining = lines.length - lineCount;
      result.push(
        `\n... ${remaining} lines truncated (output exceeded ${MAX_LINES} lines / ${MAX_BYTES / 1024}KB) ...`,
      );
      return { content: result.join("\n"), truncated: true };
    }

    result.push(truncatedLine);
    byteCount += lineBytes + 1; // +1 for newline
    lineCount++;
  }

  return { content: result.join("\n"), truncated: false };
}

// ── Line Numbering ─────────────────────────────────────────────

export function addLineNumbers(text: string, startLine: number = 1): string {
  const lines = text.split("\n");
  const totalLines = startLine + lines.length - 1;
  const padWidth = Math.max(5, String(totalLines).length);

  return lines
    .map((line, i) => {
      const lineNum = String(startLine + i).padStart(padWidth, "0");
      return `${lineNum}| ${line}`;
    })
    .join("\n");
}

// ── Tool Factory ───────────────────────────────────────────────

export function defineTool<P extends z.ZodType>(
  id: string,
  def: Omit<ToolDefinition<P>, "id">,
): ToolDefinition<P> {
  return {
    id,
    description: def.description,
    parameters: def.parameters,
    execute: async (args: z.infer<P>, ctx: ToolContext): Promise<ToolResult> => {
      // Validate parameters
      const parsed = def.parameters.parse(args);

      // Check permissions
      if (!checkPermission(id)) {
        return {
          title: `Permission denied: ${id}`,
          output: `Tool "${id}" is not allowed by current permissions. Use --allow-file-read, --allow-file-write, or --allow-system-commands flags.`,
          metadata: { error: true, permission: TOOL_PERMISSION_MAP[id] },
        };
      }

      // Check abort
      if (ctx.abort?.aborted) {
        return {
          title: `Aborted: ${id}`,
          output: "Operation was cancelled.",
          metadata: { aborted: true },
        };
      }

      // Execute
      const result = await def.execute(parsed, ctx);

      // Truncate output if needed
      const { content, truncated } = truncateOutput(result.output);
      return {
        ...result,
        output: content,
        metadata: { ...result.metadata, truncated },
      };
    },
  };
}

// ── Tool Registry ──────────────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  async execute(
    id: string,
    args: unknown,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(id);
    if (!tool) {
      return {
        title: `Unknown tool: ${id}`,
        output: `Tool "${id}" not found. Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
        metadata: { error: true },
      };
    }
    try {
      return await tool.execute(args, ctx);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        title: `Error: ${id}`,
        output: `Tool "${id}" failed: ${message}`,
        metadata: { error: true, errorMessage: message },
      };
    }
  }

  toToolSpecs(toolIds?: string[]): ToolSpec[] {
    const tools = toolIds
      ? toolIds.map((id) => this.tools.get(id)).filter(Boolean)
      : Array.from(this.tools.values());

    return (tools as ToolDefinition[]).map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters),
      },
    }));
  }
}

export const toolRegistry = new ToolRegistry();

// ── OpenAI Tool Spec Format ────────────────────────────────────

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

function zodToJsonSchema(schema: z.ZodType): object {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as z.ZodType;
      properties[key] = zodFieldToJson(zodField);
      if (!(zodField instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return { type: "object", properties, required };
  }
  return { type: "object" };
}

function zodFieldToJson(field: z.ZodType): object {
  if (field instanceof z.ZodString) {
    return { type: "string", description: field.description || "" };
  }
  if (field instanceof z.ZodNumber) {
    return { type: "number", description: field.description || "" };
  }
  if (field instanceof z.ZodBoolean) {
    return { type: "boolean", description: field.description || "" };
  }
  if (field instanceof z.ZodOptional) {
    return zodFieldToJson(field.unwrap());
  }
  if (field instanceof z.ZodDefault) {
    return zodFieldToJson(field.removeDefault());
  }
  if (field instanceof z.ZodArray) {
    return { type: "array", items: zodFieldToJson(field.element) };
  }
  return { type: "string" };
}
