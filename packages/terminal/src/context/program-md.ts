/**
 * PROGRAM.md Manager
 *
 * Inspired by Karpathy's autoresearch pattern: human writes strategy
 * in prose (PROGRAM.md), agent executes in code.
 *
 * PROGRAM.md acts as the "direction interface" — the user defines
 * objectives, constraints, and priorities; the agent decomposes
 * them into actionable steps and executes autonomously.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface ProgramObjective {
  id: number;
  text: string;
  status: "pending" | "in_progress" | "done" | "blocked";
}

export interface ProgramConstraint {
  text: string;
}

export class ProgramMdManager {
  private filePath: string;

  constructor(private projectRoot: string) {
    this.filePath = join(projectRoot, "PROGRAM.md");
  }

  exists(): boolean {
    return existsSync(this.filePath);
  }

  read(): string {
    if (!this.exists()) return "";
    return readFileSync(this.filePath, "utf-8");
  }

  /**
   * Parse objectives from PROGRAM.md.
   * Expects lines like: "1. [pending] Build auth module"
   */
  parseObjectives(): ProgramObjective[] {
    const content = this.read();
    const section = this.extractSection(content, "## Objectives");
    if (!section) return [];

    const objectives: ProgramObjective[] = [];
    const lines = section.split("\n");
    for (const line of lines) {
      const match = line.match(
        /^\s*(\d+)\.\s*\[(pending|in_progress|done|blocked)\]\s*(.+)/,
      );
      if (match) {
        objectives.push({
          id: parseInt(match[1]),
          text: match[3].trim(),
          status: match[2] as ProgramObjective["status"],
        });
      }
    }
    return objectives;
  }

  /**
   * Parse constraints from PROGRAM.md.
   */
  parseConstraints(): ProgramConstraint[] {
    const content = this.read();
    const section = this.extractSection(content, "## Constraints");
    if (!section) return [];

    const constraints: ProgramConstraint[] = [];
    const lines = section.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*-\s+(.+)/);
      if (match) {
        constraints.push({ text: match[1].trim() });
      }
    }
    return constraints;
  }

  /**
   * Get the next pending objective to work on.
   */
  getNextObjective(): ProgramObjective | null {
    const objectives = this.parseObjectives();
    return objectives.find((o) => o.status === "pending") ?? null;
  }

  /**
   * Update the status of an objective by id.
   */
  updateObjectiveStatus(
    id: number,
    status: ProgramObjective["status"],
  ): void {
    if (!this.exists()) return;

    const content = this.read();
    // Match the line with this objective id
    const pattern = new RegExp(
      `^(\\s*${id}\\.\\s*\\[)(pending|in_progress|done|blocked)(\\].*)$`,
      "m",
    );
    const updated = content.replace(pattern, `$1${status}$3`);
    if (updated !== content) {
      writeFileSync(this.filePath, updated, "utf-8");
    }
  }

  /**
   * Add an entry to the execution log.
   */
  addLogEntry(entry: string): void {
    if (!this.exists()) return;

    const content = this.read();
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toTimeString().split(" ")[0].slice(0, 5);
    const logEntry = `- [${date} ${time}] ${entry}`;

    const marker = "## Execution Log\n";
    const idx = content.indexOf(marker);
    if (idx === -1) {
      // Append section if missing
      writeFileSync(
        this.filePath,
        content + `\n${marker}\n${logEntry}\n`,
        "utf-8",
      );
      return;
    }

    const insertPos = idx + marker.length;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);
    writeFileSync(this.filePath, before + "\n" + logEntry + after, "utf-8");
  }

  /**
   * Generate a new PROGRAM.md template.
   */
  generate(projectName: string): string {
    return `# PROGRAM.md - ${projectName}

> Direction interface for WabiSabi agents.
> Write your objectives in natural language. The agent will decompose and execute them.
> Inspired by Karpathy's autoresearch pattern.

## Strategy

<!-- Describe the high-level strategy, priorities, and approach -->

## Objectives

<!-- Format: N. [status] Description -->
<!-- Status: pending | in_progress | done | blocked -->
1. [pending] Define your first objective here

## Constraints

<!-- Rules the agent must follow during execution -->
- Do not break existing tests
- Keep changes minimal and focused

## Execution Log

<!-- Auto-populated by the agent -->
`;
  }

  /**
   * Create a new PROGRAM.md with the template.
   */
  create(projectName: string): void {
    if (this.exists()) return;
    writeFileSync(this.filePath, this.generate(projectName), "utf-8");
  }

  /**
   * Build a context string for system prompt injection.
   */
  buildProgramContext(): string {
    if (!this.exists()) return "";

    const objectives = this.parseObjectives();
    const constraints = this.parseConstraints();

    if (objectives.length === 0 && constraints.length === 0) return "";

    const parts: string[] = ["── PROGRAM (Direction) ──"];

    if (objectives.length > 0) {
      parts.push("Objectives:");
      for (const obj of objectives) {
        const marker =
          obj.status === "done"
            ? "✓"
            : obj.status === "in_progress"
              ? "→"
              : obj.status === "blocked"
                ? "✗"
                : "○";
        parts.push(`  ${marker} ${obj.id}. ${obj.text}`);
      }
    }

    if (constraints.length > 0) {
      parts.push("Constraints:");
      for (const c of constraints) {
        parts.push(`  - ${c.text}`);
      }
    }

    parts.push("── END PROGRAM ──");
    return "\n\n" + parts.join("\n");
  }

  private extractSection(content: string, heading: string): string | null {
    const idx = content.indexOf(heading);
    if (idx === -1) return null;

    const start = idx + heading.length;
    const nextSection = content.indexOf("\n## ", start);
    return nextSection !== -1
      ? content.slice(start, nextSection)
      : content.slice(start);
  }
}
