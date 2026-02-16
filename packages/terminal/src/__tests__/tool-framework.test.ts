/**
 * Tests for tool framework: defineTool, ToolRegistry, truncateOutput, addLineNumbers
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  ToolRegistry,
  defineTool,
  truncateOutput,
  addLineNumbers,
} from "../tools/index.js";

// ── truncateOutput ────────────────────────────────────────────

describe("truncateOutput", () => {
  test("returns short text unchanged", () => {
    const { content, truncated } = truncateOutput("hello\nworld");
    expect(content).toBe("hello\nworld");
    expect(truncated).toBe(false);
  });

  test("truncates text exceeding max lines", () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\n");
    const { content, truncated } = truncateOutput(lines);
    expect(truncated).toBe(true);
    expect(content).toContain("truncated");
  });

  test("truncates long individual lines", () => {
    const longLine = "x".repeat(3000);
    const { content } = truncateOutput(longLine);
    expect(content.length).toBeLessThan(3000);
    expect(content).toContain("...");
  });
});

// ── addLineNumbers ────────────────────────────────────────────

describe("addLineNumbers", () => {
  test("adds line numbers starting at 1", () => {
    const result = addLineNumbers("a\nb\nc");
    expect(result).toContain("00001| a");
    expect(result).toContain("00002| b");
    expect(result).toContain("00003| c");
  });

  test("respects custom start offset", () => {
    const result = addLineNumbers("x\ny", 10);
    expect(result).toContain("00010| x");
    expect(result).toContain("00011| y");
  });
});

// ── defineTool ────────────────────────────────────────────────

describe("defineTool", () => {
  test("creates a tool with id and executes it", async () => {
    const tool = defineTool("test-tool", {
      description: "A test tool",
      parameters: z.object({
        name: z.string(),
      }),
      async execute(args) {
        return {
          title: `Hello ${args.name}`,
          output: `Greeting: ${args.name}`,
          metadata: {},
        };
      },
    });

    expect(tool.id).toBe("test-tool");
    expect(tool.description).toBe("A test tool");

    const result = await tool.execute(
      { name: "World" },
      { projectRoot: "/tmp" },
    );
    expect(result.title).toBe("Hello World");
    expect(result.output).toContain("World");
  });

  test("validates parameters with zod", async () => {
    const tool = defineTool("strict-tool", {
      description: "Strict params",
      parameters: z.object({
        count: z.number(),
      }),
      async execute(args) {
        return { title: "ok", output: String(args.count), metadata: {} };
      },
    });

    // Passing invalid type should throw (zod validation)
    expect(
      tool.execute({ count: "not a number" } as any, { projectRoot: "/tmp" }),
    ).rejects.toThrow();
  });
});

// ── ToolRegistry ──────────────────────────────────────────────

describe("ToolRegistry", () => {
  test("register and retrieve tools", () => {
    const registry = new ToolRegistry();
    const tool = defineTool("my-tool", {
      description: "desc",
      parameters: z.object({}),
      async execute() {
        return { title: "ok", output: "ok", metadata: {} };
      },
    });

    registry.register(tool);
    expect(registry.has("my-tool")).toBe(true);
    expect(registry.get("my-tool")?.id).toBe("my-tool");
    expect(registry.list()).toHaveLength(1);
  });

  test("execute returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nope", {}, { projectRoot: "/tmp" });
    expect(result.output).toContain("not found");
    expect(result.metadata.error).toBe(true);
  });

  test("execute runs registered tool", async () => {
    const registry = new ToolRegistry();
    const tool = defineTool("echo", {
      description: "echo",
      parameters: z.object({ text: z.string() }),
      async execute(args) {
        return { title: "echo", output: args.text, metadata: {} };
      },
    });

    registry.register(tool);
    const result = await registry.execute(
      "echo",
      { text: "hello" },
      { projectRoot: "/tmp" },
    );
    expect(result.output).toBe("hello");
  });

  test("toToolSpecs generates OpenAI-compatible format", () => {
    const registry = new ToolRegistry();
    const tool = defineTool("spec-tool", {
      description: "test spec",
      parameters: z.object({
        path: z.string().describe("file path"),
        verbose: z.boolean().optional(),
      }),
      async execute() {
        return { title: "ok", output: "ok", metadata: {} };
      },
    });

    registry.register(tool);
    const specs = registry.toToolSpecs();

    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe("function");
    expect(specs[0].function.name).toBe("spec-tool");
    expect(specs[0].function.description).toBe("test spec");

    const params = specs[0].function.parameters as any;
    expect(params.type).toBe("object");
    expect(params.properties.path).toBeDefined();
    expect(params.required).toContain("path");
    expect(params.required).not.toContain("verbose");
  });
});
