/**
 * Soul Manager
 *
 * Manages the SOUL.ms personal memory system. Tracks user preferences,
 * usage patterns, learnings, and implicit feedback. Evolves with each interaction.
 *
 * Storage: ~/.wabisabi/soul.json (local filesystem)
 * Future: sync with Substratum (PostgreSQL + Redis)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import {
  SoulSchema,
  type Soul,
  type UserPreferences,
  type ToolUsage,
  type TaskPattern,
  type ModelPreference,
  type ExplainedConcept,
  type CommonError,
  type PreferredSolution,
  type ProjectContext,
} from "./schema.js";

// ── Constants ────────────────────────────────────────────────

const SOUL_DIR = join(homedir(), ".wabisabi");
const SOUL_FILE = join(SOUL_DIR, "soul.json");
const SAVE_DEBOUNCE_MS = 5_000; // Batch saves every 5s
const MAX_ITEMS_PER_LIST = 100; // Cap learnings/patterns lists

// ── Soul Manager ─────────────────────────────────────────────

export class SoulManager {
  private soul: Soul;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.soul = this.createDefault();
  }

  /** Create a fresh soul with defaults. */
  private createDefault(): Soul {
    const now = new Date().toISOString();
    return SoulSchema.parse({
      metadata: {
        id: randomUUID(),
        version: "1.0.0",
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  /** Load soul from disk. Creates default if not found. */
  load(): Soul {
    try {
      if (existsSync(SOUL_FILE)) {
        const raw = readFileSync(SOUL_FILE, "utf-8");
        const data = JSON.parse(raw);
        this.soul = SoulSchema.parse(data);
      }
    } catch {
      // Corrupted file - start fresh but don't overwrite
      this.soul = this.createDefault();
    }
    return this.soul;
  }

  /** Save soul to disk immediately. */
  save(): void {
    try {
      mkdirSync(SOUL_DIR, { recursive: true });
      this.soul.metadata.updatedAt = new Date().toISOString();
      writeFileSync(SOUL_FILE, JSON.stringify(this.soul, null, 2));
      this.dirty = false;
    } catch {
      // Silently fail - don't break the user's workflow
    }
  }

  /** Schedule a debounced save to avoid excessive disk writes. */
  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) this.save();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Flush any pending saves. Call on shutdown. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) this.save();
  }

  /** Get the full soul object (read-only copy). */
  getSoul(): Soul {
    return { ...this.soul };
  }

  // ── Preferences ──────────────────────────────────────────

  getPreferences(): UserPreferences {
    return { ...this.soul.preferences };
  }

  setPreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ): void {
    this.soul.preferences[key] = value;
    this.scheduleSave();
  }

  // ── Tool Usage Tracking ──────────────────────────────────

  trackToolUse(toolName: string): void {
    const usage = this.soul.usagePatterns.toolUsage;
    const existing = usage.find((t) => t.name === toolName);
    const now = new Date().toISOString();

    if (existing) {
      existing.totalUses++;
      existing.lastUsed = now;
    } else {
      usage.push({ name: toolName, totalUses: 1, lastUsed: now });
    }
    this.scheduleSave();
  }

  getTopTools(limit = 5): ToolUsage[] {
    return [...this.soul.usagePatterns.toolUsage]
      .sort((a, b) => b.totalUses - a.totalUses)
      .slice(0, limit);
  }

  // ── Task Pattern Tracking ────────────────────────────────

  trackTaskPattern(category: string): void {
    const patterns = this.soul.usagePatterns.taskPatterns;
    const existing = patterns.find((p) => p.category === category);
    const now = new Date().toISOString();

    if (existing) {
      existing.count++;
      existing.lastSeen = now;
    } else {
      patterns.push({ category, count: 1, lastSeen: now });
      // Cap the list
      if (patterns.length > MAX_ITEMS_PER_LIST) {
        patterns.sort((a, b) => b.count - a.count);
        patterns.length = MAX_ITEMS_PER_LIST;
      }
    }
    this.scheduleSave();
  }

  // ── Model Preference Tracking ────────────────────────────

  trackModelUse(model: string, success: boolean): void {
    const prefs = this.soul.usagePatterns.modelPreferences;
    const existing = prefs.find((m) => m.model === model);

    if (existing) {
      existing.totalUses++;
      // Running average of success rate
      const total = existing.totalUses;
      existing.successRate =
        (existing.successRate * (total - 1) + (success ? 1 : 0)) / total;
    } else {
      prefs.push({ model, totalUses: 1, successRate: success ? 1 : 0 });
    }
    this.scheduleSave();
  }

  // ── Session Tracking ─────────────────────────────────────

  trackSession(): void {
    this.soul.usagePatterns.totalSessions++;
    this.scheduleSave();
  }

  trackInteraction(): void {
    this.soul.usagePatterns.totalInteractions++;
    this.scheduleSave();
  }

  // ── Learnings ────────────────────────────────────────────

  trackConceptExplained(topic: string): void {
    const concepts = this.soul.learnings.explainedConcepts;
    const existing = concepts.find((c) => c.topic === topic);
    const now = new Date().toISOString();

    if (existing) {
      existing.timesExplained++;
      existing.lastTime = now;
    } else {
      concepts.push({ topic, timesExplained: 1, lastTime: now });
      if (concepts.length > MAX_ITEMS_PER_LIST) {
        concepts.sort((a, b) => b.timesExplained - a.timesExplained);
        concepts.length = MAX_ITEMS_PER_LIST;
      }
    }
    this.scheduleSave();
  }

  trackCommonError(error: string, solution?: string): void {
    const errors = this.soul.learnings.commonErrors;
    const existing = errors.find((e) => e.error === error);

    if (existing) {
      existing.count++;
      if (solution && !existing.preferredSolutions.includes(solution)) {
        existing.preferredSolutions.push(solution);
      }
    } else {
      errors.push({
        error,
        count: 1,
        preferredSolutions: solution ? [solution] : [],
      });
      if (errors.length > MAX_ITEMS_PER_LIST) {
        errors.sort((a, b) => b.count - a.count);
        errors.length = MAX_ITEMS_PER_LIST;
      }
    }
    this.scheduleSave();
  }

  trackPreferredSolution(problem: string, solution: string): void {
    const solutions = this.soul.learnings.preferredSolutions;
    const existing = solutions.find(
      (s) => s.problem === problem && s.solution === solution,
    );

    if (existing) {
      existing.timesUsed++;
    } else {
      solutions.push({ problem, solution, timesUsed: 1 });
      if (solutions.length > MAX_ITEMS_PER_LIST) {
        solutions.sort((a, b) => b.timesUsed - a.timesUsed);
        solutions.length = MAX_ITEMS_PER_LIST;
      }
    }
    this.scheduleSave();
  }

  trackProjectContext(
    projectPath: string,
    name: string,
    technologies: string[],
  ): void {
    const contexts = this.soul.learnings.projectContexts;
    const existing = contexts.find((p) => p.projectPath === projectPath);
    const now = new Date().toISOString();

    if (existing) {
      existing.lastAccess = now;
      existing.name = name;
      existing.technologies = technologies;
    } else {
      contexts.push({ projectPath: projectPath, name, technologies, lastAccess: now });
      if (contexts.length > MAX_ITEMS_PER_LIST) {
        contexts.sort(
          (a, b) =>
            new Date(b.lastAccess).getTime() -
            new Date(a.lastAccess).getTime(),
        );
        contexts.length = MAX_ITEMS_PER_LIST;
      }
    }
    this.scheduleSave();
  }

  // ── Feedback ─────────────────────────────────────────────

  trackResponseAccepted(): void {
    this.soul.feedback.totalResponses++;
    this.soul.feedback.accepted++;
    this.scheduleSave();
  }

  trackResponseRejected(reason?: string): void {
    this.soul.feedback.totalResponses++;
    this.soul.feedback.rejected++;
    if (reason) {
      const existing = this.soul.feedback.rejectionReasons.find(
        (r) => r.reason === reason,
      );
      if (existing) {
        existing.count++;
      } else {
        this.soul.feedback.rejectionReasons.push({ reason, count: 1 });
      }
    }
    this.scheduleSave();
  }

  trackResponseModified(): void {
    this.soul.feedback.totalResponses++;
    this.soul.feedback.modified++;
    this.scheduleSave();
  }

  // ── System Prompt Integration ────────────────────────────

  /**
   * Build a context string from the soul to inject into system prompts.
   * Returns relevant preferences and patterns for the LLM to adapt.
   */
  buildSoulContext(): string {
    const pref = this.soul.preferences;
    const patterns = this.soul.usagePatterns;
    const learnings = this.soul.learnings;

    const parts: string[] = [];

    // User preferences
    parts.push("── USER SOUL (Personal Memory) ──");
    parts.push(
      `Language: ${pref.language} | Level: ${pref.technicalLevel} | ` +
        `Tone: ${pref.responseTone} | Length: ${pref.responseLength} | ` +
        `Format: ${pref.preferredFormat}`,
    );

    // Top tools
    const topTools = this.getTopTools(5);
    if (topTools.length > 0) {
      parts.push(
        `Frequent tools: ${topTools.map((t) => `${t.name}(${t.totalUses})`).join(", ")}`,
      );
    }

    // Common task patterns
    const topTasks = [...patterns.taskPatterns]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    if (topTasks.length > 0) {
      parts.push(
        `Common tasks: ${topTasks.map((t) => `${t.category}(${t.count})`).join(", ")}`,
      );
    }

    // Common errors the user hits
    const topErrors = [...learnings.commonErrors]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    if (topErrors.length > 0) {
      for (const err of topErrors) {
        const solutions =
          err.preferredSolutions.length > 0
            ? ` -> ${err.preferredSolutions.join(", ")}`
            : "";
        parts.push(`Common error: "${err.error}"(${err.count}x)${solutions}`);
      }
    }

    // Recent projects
    const recentProjects = [...learnings.projectContexts]
      .sort(
        (a, b) =>
          new Date(b.lastAccess).getTime() - new Date(a.lastAccess).getTime(),
      )
      .slice(0, 3);
    if (recentProjects.length > 0) {
      parts.push(
        `Recent projects: ${recentProjects.map((p) => `${p.name}[${p.technologies.join(",")}]`).join(", ")}`,
      );
    }

    // Feedback stats
    const fb = this.soul.feedback;
    if (fb.totalResponses > 10) {
      const acceptRate = Math.round((fb.accepted / fb.totalResponses) * 100);
      parts.push(`Response acceptance rate: ${acceptRate}%`);

      const topReasons = [...fb.rejectionReasons]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      if (topReasons.length > 0) {
        parts.push(
          `Top rejection reasons: ${topReasons.map((r) => `${r.reason}(${r.count})`).join(", ")}`,
        );
      }
    }

    // Experience summary
    if (patterns.totalSessions > 0) {
      parts.push(
        `Experience: ${patterns.totalSessions} sessions, ${patterns.totalInteractions} interactions`,
      );
    }

    parts.push("── END SOUL ──");

    return "\n\n" + parts.join("\n");
  }

  // ── Display ──────────────────────────────────────────────

  /** Format soul summary for /soul command display. */
  getSummary(): string {
    const pref = this.soul.preferences;
    const pat = this.soul.usagePatterns;
    const fb = this.soul.feedback;

    const lines: string[] = [];
    lines.push(`  ID:          ${this.soul.metadata.id.slice(0, 8)}...`);
    lines.push(`  Created:     ${new Date(this.soul.metadata.createdAt).toLocaleDateString()}`);
    lines.push(`  Updated:     ${new Date(this.soul.metadata.updatedAt).toLocaleDateString()}`);
    lines.push("");
    lines.push(`  Language:    ${pref.language}`);
    lines.push(`  Level:       ${pref.technicalLevel}`);
    lines.push(`  Tone:        ${pref.responseTone}`);
    lines.push(`  Length:      ${pref.responseLength}`);
    lines.push(`  Format:      ${pref.preferredFormat}`);
    lines.push("");
    lines.push(`  Sessions:    ${pat.totalSessions}`);
    lines.push(`  Interactions: ${pat.totalInteractions}`);

    if (fb.totalResponses > 0) {
      const rate = Math.round((fb.accepted / fb.totalResponses) * 100);
      lines.push(`  Acceptance:  ${rate}% (${fb.totalResponses} responses)`);
    }

    const topTools = this.getTopTools(3);
    if (topTools.length > 0) {
      lines.push(
        `  Top tools:   ${topTools.map((t) => `${t.name}(${t.totalUses})`).join(", ")}`,
      );
    }

    const projects = this.soul.learnings.projectContexts.length;
    const concepts = this.soul.learnings.explainedConcepts.length;
    const errors = this.soul.learnings.commonErrors.length;
    lines.push(`  Projects:    ${projects} | Concepts: ${concepts} | Errors tracked: ${errors}`);

    return lines.join("\n");
  }
}

// ── Singleton ────────────────────────────────────────────────

export const soulManager = new SoulManager();
