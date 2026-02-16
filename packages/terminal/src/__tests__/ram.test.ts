/**
 * Tests for RAM (Working Memory) system.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { RamManager, classifyComplexity, scoreMessageImportance, getContextBudget } from "../ram/index.js";
import { RamSchema } from "../ram/schema.js";
import type { ChatMessage } from "../clients/api-client.js";

describe("RamSchema", () => {
  test("parses default RAM with minimal input", () => {
    const ram = RamSchema.parse({
      metadata: { updatedAt: "2024-01-01T00:00:00Z" },
    });
    expect(ram.pins).toEqual([]);
    expect(ram.activeFiles).toEqual([]);
    expect(ram.activeTasks).toEqual([]);
    expect(ram.deviceProfile.type).toBe("laptop");
    expect(ram.lastSessionSummary).toBeNull();
  });

  test("parses full RAM structure", () => {
    const ram = RamSchema.parse({
      metadata: { updatedAt: "2024-01-01T00:00:00Z", sessionCount: 5 },
      pins: [{
        id: "abc123",
        content: "Use TypeScript strict mode",
        type: "instruction",
        source: "user",
        createdAt: "2024-01-01T00:00:00Z",
        expiresAt: null,
        importance: 0.9,
      }],
      deviceProfile: { type: "desktop", maxContextTokens: 128000 },
      lastSessionSummary: "Worked on authentication module",
    });
    expect(ram.pins.length).toBe(1);
    expect(ram.deviceProfile.type).toBe("desktop");
    expect(ram.lastSessionSummary).toBe("Worked on authentication module");
  });
});

describe("RamManager", () => {
  let manager: RamManager;

  beforeEach(() => {
    manager = new RamManager();
  });

  test("starts with empty working memory", () => {
    const ram = manager.getRam();
    expect(ram.pins).toEqual([]);
    expect(ram.activeFiles).toEqual([]);
    expect(ram.activeTasks).toEqual([]);
  });

  // ── Pins ─────────────────────────────────────────────

  test("pin adds items with auto-generated ID", () => {
    const pin = manager.pin("Use bun as runtime", "instruction", "user", 0.8);
    expect(pin.id).toBeTruthy();
    expect(pin.content).toBe("Use bun as runtime");
    expect(pin.type).toBe("instruction");
    expect(pin.importance).toBe(0.8);
  });

  test("pins are sorted by importance", () => {
    manager.pin("Low priority", "fact", "agent", 0.2);
    manager.pin("High priority", "decision", "user", 0.9);
    manager.pin("Medium priority", "task", "user", 0.5);

    const pins = manager.getPins();
    expect(pins[0].importance).toBe(0.9);
    expect(pins[1].importance).toBe(0.5);
    expect(pins[2].importance).toBe(0.2);
  });

  test("unpin removes by ID", () => {
    const pin = manager.pin("Temporary note", "fact", "user");
    expect(manager.getPins().length).toBe(1);

    const removed = manager.unpin(pin.id);
    expect(removed).toBe(true);
    expect(manager.getPins().length).toBe(0);
  });

  test("unpin returns false for non-existent ID", () => {
    expect(manager.unpin("nonexistent")).toBe(false);
  });

  // ── Active Files ─────────────────────────────────────

  test("trackFileAccess adds new files", () => {
    manager.trackFileAccess("/src/index.ts", "Main entry point");
    const files = manager.getActiveFiles();
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("/src/index.ts");
    expect(files[0].accessCount).toBe(1);
    expect(files[0].summary).toBe("Main entry point");
  });

  test("trackFileAccess increments count for existing files", () => {
    manager.trackFileAccess("/src/index.ts");
    manager.trackFileAccess("/src/index.ts");
    manager.trackFileAccess("/src/index.ts");

    const files = manager.getActiveFiles();
    expect(files[0].accessCount).toBe(3);
  });

  // ── Active Tasks ─────────────────────────────────────

  test("addTask creates active task", () => {
    const task = manager.addTask("Implement auth", ["Add JWT", "Add OAuth"]);
    expect(task.status).toBe("active");
    expect(task.subtasks).toEqual(["Add JWT", "Add OAuth"]);
  });

  test("completeTask marks task as completed", () => {
    const task = manager.addTask("Fix bug");
    expect(manager.getActiveTasks().length).toBe(1);

    manager.completeTask(task.id);
    expect(manager.getActiveTasks().length).toBe(0);
  });

  // ── Device Profile ───────────────────────────────────

  test("default device profile is laptop", () => {
    const dp = manager.getDeviceProfile();
    expect(dp.type).toBe("laptop");
    expect(dp.maxContextTokens).toBe(65_536);
  });

  test("setDeviceProfile changes profile", () => {
    const dp = manager.setDeviceProfile("desktop");
    expect(dp.type).toBe("desktop");
    expect(dp.maxContextTokens).toBe(128_000);
  });

  test("setDeviceProfile handles mobile", () => {
    const dp = manager.setDeviceProfile("mobile");
    expect(dp.type).toBe("mobile");
    expect(dp.maxContextTokens).toBe(16_384);
    expect(dp.compactionThreshold).toBe(0.65);
  });

  test("getEffectiveContextLimit returns min of model and device", () => {
    manager.setDeviceProfile("mobile"); // 16K
    expect(manager.getEffectiveContextLimit(128_000)).toBe(16_384);
    expect(manager.getEffectiveContextLimit(8_000)).toBe(8_000);
  });

  // ── Session Continuity ───────────────────────────────

  test("session summary persists", () => {
    manager.setLastSessionSummary("Worked on auth module");
    expect(manager.getLastSessionSummary()).toBe("Worked on auth module");
    expect(manager.getRam().metadata.sessionCount).toBe(1);
  });

  // ── Context Building ─────────────────────────────────

  test("buildRamContext returns empty for no data", () => {
    const ctx = manager.buildRamContext("moderate");
    expect(ctx).toBe("");
  });

  test("buildRamContext includes pins", () => {
    manager.pin("Always use strict mode", "instruction", "user", 0.9);
    const ctx = manager.buildRamContext("moderate");
    expect(ctx).toContain("PINNED");
    expect(ctx).toContain("Always use strict mode");
  });

  test("buildRamContext includes session summary for complex", () => {
    manager.setLastSessionSummary("Previous: auth module complete");
    const ctx = manager.buildRamContext("complex");
    expect(ctx).toContain("PREVIOUS SESSION");
    expect(ctx).toContain("auth module complete");
  });

  test("buildRamContext respects simple budget", () => {
    manager.setLastSessionSummary("Previous session info");
    manager.addTask("Active task");
    // Simple should NOT include session summary (ratio < 0.3)
    const ctx = manager.buildRamContext("simple");
    expect(ctx).not.toContain("PREVIOUS SESSION");
    expect(ctx).not.toContain("ACTIVE TASKS");
  });

  test("getSummary returns formatted display", () => {
    manager.pin("Test pin");
    manager.trackFileAccess("/test.ts");
    const summary = manager.getSummary();
    expect(summary).toContain("Pins:");
    expect(summary).toContain("Files:");
    expect(summary).toContain("laptop");
  });
});

describe("classifyComplexity", () => {
  test("classifies simple queries", () => {
    expect(classifyComplexity("hi", 0)).toBe("simple");
    expect(classifyComplexity("ok", 0)).toBe("simple");
    expect(classifyComplexity("/help", 0)).toBe("simple");
    expect(classifyComplexity("yes", 0)).toBe("simple");
    expect(classifyComplexity("hola", 0)).toBe("simple");
  });

  test("classifies moderate queries", () => {
    expect(classifyComplexity("fix the bug in the login function", 0)).toBe("moderate");
    expect(classifyComplexity("read the package.json file", 0)).toBe("moderate");
    expect(classifyComplexity("what does this function do?", 0)).toBe("moderate");
  });

  test("classifies complex queries", () => {
    expect(classifyComplexity("implement the authentication system with JWT", 0)).toBe("complex");
    expect(classifyComplexity("refactor the entire database layer", 0)).toBe("complex");
    expect(classifyComplexity("design the API architecture for the new service", 0)).toBe("complex");
    expect(classifyComplexity("deploy the CI/CD pipeline", 0)).toBe("complex");
  });

  test("long conversations increase complexity", () => {
    expect(classifyComplexity("fix a small thing", 35)).toBe("complex");
  });
});

describe("scoreMessageImportance", () => {
  test("user messages score higher than tool messages", () => {
    const user: ChatMessage = { role: "user", content: "Do something" };
    const tool: ChatMessage = { role: "tool", content: "Result" };
    expect(scoreMessageImportance(user)).toBeGreaterThan(scoreMessageImportance(tool));
  });

  test("messages with tool calls score higher", () => {
    const withTools: ChatMessage = {
      role: "assistant",
      content: "Let me write that",
      tool_calls: [{
        id: "1",
        type: "function",
        function: { name: "write", arguments: '{"filePath": "test.ts"}' },
      }],
    };
    const withoutTools: ChatMessage = {
      role: "assistant",
      content: "Here is the answer",
    };
    expect(scoreMessageImportance(withTools)).toBeGreaterThan(
      scoreMessageImportance(withoutTools),
    );
  });

  test("error messages score higher", () => {
    const error: ChatMessage = { role: "assistant", content: "Error: file not found" };
    const normal: ChatMessage = { role: "assistant", content: "Done successfully" };
    expect(scoreMessageImportance(error)).toBeGreaterThan(
      scoreMessageImportance(normal),
    );
  });

  test("scores are between 0 and 1", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "test" },
      { role: "assistant", content: "result" },
      { role: "tool", content: "output" },
      { role: "system", content: "prompt" },
    ];
    for (const msg of msgs) {
      const score = scoreMessageImportance(msg);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

describe("getContextBudget", () => {
  test("simple has low ratios", () => {
    const budget = getContextBudget("simple");
    expect(budget.projectContextRatio).toBeLessThan(0.5);
    expect(budget.maxPins).toBeLessThan(5);
  });

  test("complex has full ratios", () => {
    const budget = getContextBudget("complex");
    expect(budget.projectContextRatio).toBe(1.0);
    expect(budget.soulContextRatio).toBe(1.0);
  });

  test("moderate is between simple and complex", () => {
    const simple = getContextBudget("simple");
    const moderate = getContextBudget("moderate");
    const complex = getContextBudget("complex");
    expect(moderate.projectContextRatio).toBeGreaterThan(simple.projectContextRatio);
    expect(moderate.projectContextRatio).toBeLessThan(complex.projectContextRatio);
  });
});
