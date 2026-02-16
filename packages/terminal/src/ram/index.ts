/**
 * RAM Manager (Working Memory)
 *
 * Hierarchical memory system inspired by SpikingBrain architecture.
 * Manages the working memory layer between ephemeral conversation
 * and persistent soul.
 *
 * Features:
 * - Pinned items: Important facts/decisions that persist across messages
 * - Active files: Track which files the user is working on
 * - Active tasks: Current task state and subtasks
 * - Complexity routing: Decide how much context to inject
 * - Device profiles: Adapt to device capabilities
 * - Cross-session continuity: Last session summary
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import {
  RamSchema,
  type Ram,
  type PinnedItem,
  type ActiveFile,
  type ActiveTask,
  type DeviceProfile,
  type ComplexityLevel,
} from "./schema.js";
import type { ChatMessage } from "../clients/api-client.js";

// ── Constants ────────────────────────────────────────────────

const RAM_DIR = join(homedir(), ".wabisabi");
const RAM_FILE = join(RAM_DIR, "ram.json");
const MAX_PINS = 50;
const MAX_ACTIVE_FILES = 30;
const MAX_ACTIVE_TASKS = 20;
const SAVE_DEBOUNCE_MS = 3_000;

// ── Device Profile Presets ───────────────────────────────────

const DEVICE_PRESETS: Record<string, DeviceProfile> = {
  mobile: {
    type: "mobile",
    maxContextTokens: 16_384,
    maxWorkingMemoryItems: 20,
    compactionThreshold: 0.65,
  },
  laptop: {
    type: "laptop",
    maxContextTokens: 65_536,
    maxWorkingMemoryItems: 50,
    compactionThreshold: 0.75,
  },
  desktop: {
    type: "desktop",
    maxContextTokens: 128_000,
    maxWorkingMemoryItems: 100,
    compactionThreshold: 0.80,
  },
  server: {
    type: "server",
    maxContextTokens: 200_000,
    maxWorkingMemoryItems: 200,
    compactionThreshold: 0.85,
  },
};

// ── Complexity Router ────────────────────────────────────────

/**
 * Analyze query complexity to decide how much context to inject.
 *
 * Simple: greetings, single commands, short questions → minimal context
 * Moderate: code questions, file operations, debugging → standard context
 * Complex: architecture, multi-file changes, planning → full context
 */
export function classifyComplexity(
  input: string,
  conversationLength: number,
): ComplexityLevel {
  const lower = input.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Simple patterns
  const simplePatterns = [
    /^(hi|hello|hey|hola|ok|si|no|gracias|thanks)\b/,
    /^\/\w+/, // Slash commands
    /^(exit|quit|bye)/,
    /^(yes|no|y|n)$/i,
  ];
  if (wordCount <= 3 || simplePatterns.some((p) => p.test(lower))) {
    return "simple";
  }

  // Complex patterns
  const complexPatterns = [
    /\b(architect|design|refactor|restructur|migrat)/,
    /\b(implement|build|create|develop)\b.*\b(system|module|feature|api|service)/,
    /\b(plan|analyz|review|audit)\b.*\b(entire|whole|full|complete)/,
    /\b(multi.?file|cross.?cutting|end.?to.?end)/,
    /\b(deploy|ci.?cd|pipeline|infrastructure)/,
    /\b(database|schema|migration|model)/,
    /\b(security|vulnerabilit|auth)/,
  ];
  if (
    complexPatterns.some((p) => p.test(lower)) ||
    wordCount > 50 ||
    conversationLength > 30
  ) {
    return "complex";
  }

  return "moderate";
}

/**
 * Determine how much context to inject based on complexity.
 * Returns ratios for different context sources.
 */
export function getContextBudget(complexity: ComplexityLevel): {
  projectContextRatio: number; // 0-1 how much project context
  soulContextRatio: number; // 0-1 how much soul context
  ramContextRatio: number; // 0-1 how much RAM context
  maxPins: number; // Max pinned items to include
} {
  switch (complexity) {
    case "simple":
      return {
        projectContextRatio: 0.3,
        soulContextRatio: 0.2,
        ramContextRatio: 0.1,
        maxPins: 3,
      };
    case "moderate":
      return {
        projectContextRatio: 0.7,
        soulContextRatio: 0.5,
        ramContextRatio: 0.5,
        maxPins: 10,
      };
    case "complex":
      return {
        projectContextRatio: 1.0,
        soulContextRatio: 1.0,
        ramContextRatio: 1.0,
        maxPins: MAX_PINS,
      };
  }
}

// ── Importance Scoring ───────────────────────────────────────

/**
 * Score the importance of a message for compaction decisions.
 * Higher = more important = should be kept.
 */
export function scoreMessageImportance(msg: ChatMessage): number {
  let score = 0.3; // Base score

  const content = String(msg.content || "");

  // User messages are generally important
  if (msg.role === "user") {
    score += 0.2;
    // Questions are more important
    if (content.includes("?")) score += 0.1;
    // Long instructions are important
    if (content.length > 200) score += 0.1;
  }

  // Tool calls indicate substantive work
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    score += 0.2;
    // Write/edit operations are very important
    for (const tc of msg.tool_calls) {
      if (["write", "edit"].includes(tc.function.name)) score += 0.2;
      if (tc.function.name === "bash") score += 0.1;
    }
  }

  // Error messages are important to remember
  if (content.toLowerCase().includes("error") || content.includes("Error:")) {
    score += 0.15;
  }

  // Decision markers
  if (
    content.includes("decided") ||
    content.includes("decision") ||
    content.includes("approach") ||
    content.includes("strategy")
  ) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

// ── RAM Manager ──────────────────────────────────────────────

export class RamManager {
  private ram: Ram;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ram = this.createDefault();
  }

  private createDefault(): Ram {
    return RamSchema.parse({
      metadata: {
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // ── Persistence ────────────────────────────────────────

  load(): Ram {
    try {
      if (existsSync(RAM_FILE)) {
        const raw = readFileSync(RAM_FILE, "utf-8");
        this.ram = RamSchema.parse(JSON.parse(raw));
        // Clean up expired pins
        this.cleanExpiredPins();
      }
    } catch {
      this.ram = this.createDefault();
    }
    return this.ram;
  }

  save(): void {
    try {
      mkdirSync(RAM_DIR, { recursive: true });
      this.ram.metadata.updatedAt = new Date().toISOString();
      writeFileSync(RAM_FILE, JSON.stringify(this.ram, null, 2));
      this.dirty = false;
    } catch {}
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.save();
    }, SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) this.save();
  }

  getRam(): Ram {
    return { ...this.ram };
  }

  // ── Pinned Items ───────────────────────────────────────

  pin(
    content: string,
    type: PinnedItem["type"] = "fact",
    source: PinnedItem["source"] = "user",
    importance = 0.5,
    ttlMinutes?: number,
  ): PinnedItem {
    const now = new Date();
    const item: PinnedItem = {
      id: randomUUID().slice(0, 8),
      content,
      type,
      source,
      createdAt: now.toISOString(),
      expiresAt: ttlMinutes
        ? new Date(now.getTime() + ttlMinutes * 60_000).toISOString()
        : null,
      importance,
    };

    this.ram.pins.push(item);

    // Enforce limit - remove least important first
    if (this.ram.pins.length > MAX_PINS) {
      this.ram.pins.sort((a, b) => b.importance - a.importance);
      this.ram.pins.length = MAX_PINS;
    }

    this.scheduleSave();
    return item;
  }

  unpin(id: string): boolean {
    const before = this.ram.pins.length;
    this.ram.pins = this.ram.pins.filter((p) => p.id !== id);
    if (this.ram.pins.length < before) {
      this.scheduleSave();
      return true;
    }
    return false;
  }

  getPins(maxCount?: number): PinnedItem[] {
    const sorted = [...this.ram.pins].sort(
      (a, b) => b.importance - a.importance,
    );
    return maxCount ? sorted.slice(0, maxCount) : sorted;
  }

  private cleanExpiredPins(): void {
    const now = Date.now();
    const before = this.ram.pins.length;
    this.ram.pins = this.ram.pins.filter((p) => {
      if (!p.expiresAt) return true;
      return new Date(p.expiresAt).getTime() > now;
    });
    if (this.ram.pins.length < before) {
      this.scheduleSave();
    }
  }

  // ── Active Files ───────────────────────────────────────

  trackFileAccess(path: string, summary?: string): void {
    const existing = this.ram.activeFiles.find((f) => f.path === path);
    const now = new Date().toISOString();

    if (existing) {
      existing.lastAccessed = now;
      existing.accessCount++;
      if (summary) existing.summary = summary;
    } else {
      this.ram.activeFiles.push({
        path,
        lastAccessed: now,
        accessCount: 1,
        summary,
      });

      // Enforce limit - remove least recently accessed
      if (this.ram.activeFiles.length > MAX_ACTIVE_FILES) {
        this.ram.activeFiles.sort(
          (a, b) =>
            new Date(b.lastAccessed).getTime() -
            new Date(a.lastAccessed).getTime(),
        );
        this.ram.activeFiles.length = MAX_ACTIVE_FILES;
      }
    }

    this.scheduleSave();
  }

  getActiveFiles(limit = 10): ActiveFile[] {
    return [...this.ram.activeFiles]
      .sort(
        (a, b) =>
          new Date(b.lastAccessed).getTime() -
          new Date(a.lastAccessed).getTime(),
      )
      .slice(0, limit);
  }

  // ── Active Tasks ───────────────────────────────────────

  addTask(description: string, subtasks: string[] = []): ActiveTask {
    const now = new Date().toISOString();
    const task: ActiveTask = {
      id: randomUUID().slice(0, 8),
      description,
      status: "active",
      createdAt: now,
      updatedAt: now,
      subtasks,
    };

    this.ram.activeTasks.push(task);

    if (this.ram.activeTasks.length > MAX_ACTIVE_TASKS) {
      // Remove completed tasks first
      this.ram.activeTasks = this.ram.activeTasks.filter(
        (t) => t.status !== "completed",
      );
      if (this.ram.activeTasks.length > MAX_ACTIVE_TASKS) {
        this.ram.activeTasks.length = MAX_ACTIVE_TASKS;
      }
    }

    this.scheduleSave();
    return task;
  }

  completeTask(id: string): boolean {
    const task = this.ram.activeTasks.find((t) => t.id === id);
    if (task) {
      task.status = "completed";
      task.updatedAt = new Date().toISOString();
      this.scheduleSave();
      return true;
    }
    return false;
  }

  getActiveTasks(): ActiveTask[] {
    return this.ram.activeTasks.filter((t) => t.status !== "completed");
  }

  // ── Device Profile ─────────────────────────────────────

  setDeviceProfile(type: string): DeviceProfile {
    const preset = DEVICE_PRESETS[type];
    if (preset) {
      this.ram.deviceProfile = { ...preset };
      this.scheduleSave();
      return this.ram.deviceProfile;
    }
    return this.ram.deviceProfile;
  }

  getDeviceProfile(): DeviceProfile {
    return { ...this.ram.deviceProfile };
  }

  getEffectiveContextLimit(modelLimit: number): number {
    // Use the minimum of model limit and device profile limit
    return Math.min(modelLimit, this.ram.deviceProfile.maxContextTokens);
  }

  getCompactionThreshold(): number {
    return this.ram.deviceProfile.compactionThreshold;
  }

  // ── Session Continuity ─────────────────────────────────

  setLastSessionSummary(summary: string): void {
    this.ram.lastSessionSummary = summary;
    this.ram.metadata.sessionCount++;
    this.scheduleSave();
  }

  getLastSessionSummary(): string | null {
    return this.ram.lastSessionSummary;
  }

  // ── Context Building ───────────────────────────────────

  /**
   * Build the RAM context string to inject into system prompts.
   * Respects the complexity-based budget.
   */
  buildRamContext(complexity: ComplexityLevel = "moderate"): string {
    const budget = getContextBudget(complexity);
    const parts: string[] = [];

    // Last session summary (cross-session continuity)
    if (this.ram.lastSessionSummary && budget.ramContextRatio >= 0.3) {
      parts.push("── PREVIOUS SESSION ──");
      parts.push(this.ram.lastSessionSummary);
    }

    // Pinned items
    const pins = this.getPins(budget.maxPins);
    if (pins.length > 0) {
      parts.push("── PINNED (Working Memory) ──");
      for (const pin of pins) {
        const typeTag = pin.type.toUpperCase();
        parts.push(`[${typeTag}] ${pin.content}`);
      }
    }

    // Active tasks
    const tasks = this.getActiveTasks();
    if (tasks.length > 0 && budget.ramContextRatio >= 0.5) {
      parts.push("── ACTIVE TASKS ──");
      for (const task of tasks) {
        parts.push(`- ${task.description} (${task.status})`);
        for (const sub of task.subtasks) {
          parts.push(`  - ${sub}`);
        }
      }
    }

    // Active files (for moderate/complex)
    if (budget.ramContextRatio >= 0.5) {
      const files = this.getActiveFiles(5);
      if (files.length > 0) {
        parts.push(
          `── ACTIVE FILES: ${files.map((f) => f.path.split("/").pop()).join(", ")} ──`,
        );
      }
    }

    if (parts.length === 0) return "";
    return "\n\n" + parts.join("\n") + "\n── END RAM ──";
  }

  // ── Display ────────────────────────────────────────────

  getSummary(): string {
    const dp = this.ram.deviceProfile;
    const lines: string[] = [];
    lines.push(`  Device:     ${dp.type} (${dp.maxContextTokens} max tokens)`);
    lines.push(`  Threshold:  ${Math.round(dp.compactionThreshold * 100)}%`);
    lines.push(`  Pins:       ${this.ram.pins.length}`);
    lines.push(`  Files:      ${this.ram.activeFiles.length} tracked`);
    lines.push(`  Tasks:      ${this.getActiveTasks().length} active`);
    lines.push(`  Sessions:   ${this.ram.metadata.sessionCount}`);
    if (this.ram.lastSessionSummary) {
      lines.push(
        `  Last session: ${this.ram.lastSessionSummary.slice(0, 60)}...`,
      );
    }
    return lines.join("\n");
  }
}

// ── Singleton ────────────────────────────────────────────────

export const ramManager = new RamManager();
