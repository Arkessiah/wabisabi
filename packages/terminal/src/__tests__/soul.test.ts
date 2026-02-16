/**
 * Tests for the Soul personal memory system.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { SoulManager } from "../soul/index.js";
import { SoulSchema } from "../soul/schema.js";

describe("SoulSchema", () => {
  test("parses default soul with minimal input", () => {
    const soul = SoulSchema.parse({
      metadata: {
        id: "test-uuid",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    });
    expect(soul.preferences.language).toBe("espanol");
    expect(soul.preferences.technicalLevel).toBe("senior");
    expect(soul.preferences.responseTone).toBe("tecnico");
    expect(soul.preferences.responseLength).toBe("medio");
    expect(soul.preferences.preferredFormat).toBe("markdown");
    expect(soul.usagePatterns.toolUsage).toEqual([]);
    expect(soul.learnings.commonErrors).toEqual([]);
    expect(soul.feedback.totalResponses).toBe(0);
  });

  test("validates preference enums", () => {
    expect(() =>
      SoulSchema.parse({
        metadata: {
          id: "test",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
        preferences: { language: "invalid" },
      }),
    ).toThrow();
  });

  test("parses full soul structure", () => {
    const soul = SoulSchema.parse({
      metadata: {
        id: "test-uuid",
        version: "1.0.0",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-15T00:00:00Z",
      },
      preferences: {
        language: "bilingue",
        technicalLevel: "experto",
        responseTone: "formal",
        responseLength: "detallado",
        preferredFormat: "codigo-formateado",
      },
      usagePatterns: {
        toolUsage: [{ name: "read", totalUses: 50, lastUsed: "2024-01-15" }],
        taskPatterns: [{ category: "debugging", count: 20, lastSeen: "2024-01-15" }],
        modelPreferences: [{ model: "llama3.2", totalUses: 100, successRate: 0.9 }],
        totalSessions: 25,
        totalInteractions: 500,
      },
      learnings: {
        explainedConcepts: [
          { topic: "closures", timesExplained: 3, lastTime: "2024-01-10" },
        ],
        commonErrors: [
          { error: "null-pointer", count: 5, preferredSolutions: ["optional-chaining"] },
        ],
        preferredSolutions: [
          { problem: "api-403", solution: "check-token", timesUsed: 12 },
        ],
        projectContexts: [
          {
            projectPath: "/home/user/project",
            name: "my-project",
            technologies: ["typescript", "react"],
            lastAccess: "2024-01-15",
          },
        ],
      },
      feedback: {
        totalResponses: 100,
        accepted: 85,
        rejected: 10,
        modified: 5,
        rejectionReasons: [{ reason: "too-long", count: 8 }],
      },
    });
    expect(soul.preferences.language).toBe("bilingue");
    expect(soul.usagePatterns.toolUsage[0].totalUses).toBe(50);
    expect(soul.learnings.commonErrors[0].preferredSolutions).toContain("optional-chaining");
    expect(soul.feedback.accepted).toBe(85);
  });
});

describe("SoulManager", () => {
  let manager: SoulManager;

  beforeEach(() => {
    manager = new SoulManager();
  });

  test("starts with default preferences", () => {
    const prefs = manager.getPreferences();
    expect(prefs.language).toBe("espanol");
    expect(prefs.technicalLevel).toBe("senior");
    expect(prefs.responseTone).toBe("tecnico");
  });

  test("setPreference updates values", () => {
    manager.setPreference("language", "ingles");
    expect(manager.getPreferences().language).toBe("ingles");

    manager.setPreference("technicalLevel", "experto");
    expect(manager.getPreferences().technicalLevel).toBe("experto");
  });

  test("trackToolUse increments usage count", () => {
    manager.trackToolUse("read");
    manager.trackToolUse("read");
    manager.trackToolUse("write");

    const topTools = manager.getTopTools(5);
    expect(topTools.length).toBe(2);
    expect(topTools[0].name).toBe("read");
    expect(topTools[0].totalUses).toBe(2);
    expect(topTools[1].name).toBe("write");
    expect(topTools[1].totalUses).toBe(1);
  });

  test("trackTaskPattern tracks categories", () => {
    manager.trackTaskPattern("debugging");
    manager.trackTaskPattern("debugging");
    manager.trackTaskPattern("refactoring");

    const soul = manager.getSoul();
    const debugging = soul.usagePatterns.taskPatterns.find(
      (p) => p.category === "debugging",
    );
    expect(debugging?.count).toBe(2);
  });

  test("trackModelUse tracks model preferences", () => {
    manager.trackModelUse("llama3.2", true);
    manager.trackModelUse("llama3.2", true);
    manager.trackModelUse("llama3.2", false);

    const soul = manager.getSoul();
    const model = soul.usagePatterns.modelPreferences.find(
      (m) => m.model === "llama3.2",
    );
    expect(model?.totalUses).toBe(3);
    // 2 successes out of 3 = ~0.667
    expect(model?.successRate).toBeCloseTo(0.667, 1);
  });

  test("trackSession and trackInteraction increment counts", () => {
    manager.trackSession();
    manager.trackSession();
    manager.trackInteraction();
    manager.trackInteraction();
    manager.trackInteraction();

    const soul = manager.getSoul();
    expect(soul.usagePatterns.totalSessions).toBe(2);
    expect(soul.usagePatterns.totalInteractions).toBe(3);
  });

  test("trackConceptExplained tracks topics", () => {
    manager.trackConceptExplained("closures");
    manager.trackConceptExplained("closures");
    manager.trackConceptExplained("promises");

    const soul = manager.getSoul();
    const closures = soul.learnings.explainedConcepts.find(
      (c) => c.topic === "closures",
    );
    expect(closures?.timesExplained).toBe(2);
  });

  test("trackCommonError tracks errors and solutions", () => {
    manager.trackCommonError("null-pointer", "optional-chaining");
    manager.trackCommonError("null-pointer", "null-coalescing");
    manager.trackCommonError("null-pointer", "optional-chaining"); // duplicate solution

    const soul = manager.getSoul();
    const err = soul.learnings.commonErrors.find(
      (e) => e.error === "null-pointer",
    );
    expect(err?.count).toBe(3);
    expect(err?.preferredSolutions).toEqual([
      "optional-chaining",
      "null-coalescing",
    ]);
  });

  test("trackPreferredSolution tracks solutions", () => {
    manager.trackPreferredSolution("api-403", "check-token");
    manager.trackPreferredSolution("api-403", "check-token");

    const soul = manager.getSoul();
    const solution = soul.learnings.preferredSolutions.find(
      (s) => s.problem === "api-403",
    );
    expect(solution?.timesUsed).toBe(2);
  });

  test("trackProjectContext tracks projects", () => {
    manager.trackProjectContext("/path/to/project", "my-project", [
      "typescript",
      "react",
    ]);

    const soul = manager.getSoul();
    expect(soul.learnings.projectContexts.length).toBe(1);
    expect(soul.learnings.projectContexts[0].name).toBe("my-project");
    expect(soul.learnings.projectContexts[0].technologies).toEqual([
      "typescript",
      "react",
    ]);
  });

  test("trackProjectContext updates existing project", () => {
    manager.trackProjectContext("/path/to/project", "old-name", ["js"]);
    manager.trackProjectContext("/path/to/project", "new-name", ["ts", "react"]);

    const soul = manager.getSoul();
    expect(soul.learnings.projectContexts.length).toBe(1);
    expect(soul.learnings.projectContexts[0].name).toBe("new-name");
  });

  test("feedback tracking works", () => {
    manager.trackResponseAccepted();
    manager.trackResponseAccepted();
    manager.trackResponseRejected("too-long");
    manager.trackResponseModified();

    const soul = manager.getSoul();
    expect(soul.feedback.totalResponses).toBe(4);
    expect(soul.feedback.accepted).toBe(2);
    expect(soul.feedback.rejected).toBe(1);
    expect(soul.feedback.modified).toBe(1);
    expect(soul.feedback.rejectionReasons[0]).toEqual({
      reason: "too-long",
      count: 1,
    });
  });

  test("buildSoulContext returns formatted string", () => {
    manager.setPreference("language", "bilingue");
    manager.trackToolUse("read");
    manager.trackSession();

    const context = manager.buildSoulContext();
    expect(context).toContain("USER SOUL");
    expect(context).toContain("bilingue");
    expect(context).toContain("read(1)");
    expect(context).toContain("1 sessions");
  });

  test("getSummary returns formatted display", () => {
    manager.trackSession();
    manager.trackInteraction();
    manager.trackToolUse("bash");

    const summary = manager.getSummary();
    expect(summary).toContain("Sessions:");
    expect(summary).toContain("espanol");
    expect(summary).toContain("bash(1)");
  });
});
