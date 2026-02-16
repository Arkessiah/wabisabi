/**
 * PLAN.md Manager
 *
 * Generates and maintains the PLAN.md file for a project.
 * Tracks the project plan, current phase, and architectural decisions.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ProjectStack } from "./detector.js";

export class PlanMdManager {
  private filePath: string;

  constructor(private projectRoot: string) {
    this.filePath = join(projectRoot, "PLAN.md");
  }

  exists(): boolean {
    return existsSync(this.filePath);
  }

  read(): string {
    if (!this.exists()) return "";
    return readFileSync(this.filePath, "utf-8");
  }

  generate(stack: ProjectStack, initialTask?: string): string {
    const sections: string[] = [];
    const date = new Date().toISOString().split("T")[0];

    sections.push(`# PLAN.md - ${stack.projectName}\n`);
    sections.push(
      "> Project plan maintained by WabiSabi CLI. Updated automatically.\n",
    );

    sections.push("## Current Phase\n");
    sections.push(`- **Status:** Initial setup`);
    sections.push(`- **Started:** ${date}`);
    if (initialTask) {
      sections.push(`- **Goal:** ${initialTask}`);
    }

    sections.push("\n## Architecture\n");
    sections.push(
      `- ${stack.language.join(", ")} project using ${stack.framework.join(", ") || "no framework"}`,
    );
    sections.push(`- Package manager: ${stack.packageManager}`);

    sections.push("\n## Actions Log\n");
    sections.push(`- [${date}] Project initialized with WabiSabi CLI`);

    sections.push("\n## Decisions\n");
    sections.push(
      "<!-- Architectural decisions will be logged here -->",
    );

    return sections.join("\n") + "\n";
  }

  write(stack: ProjectStack, initialTask?: string): void {
    const content = this.generate(stack, initialTask);
    writeFileSync(this.filePath, content, "utf-8");
  }

  updatePhase(phase: string, status: string): void {
    if (!this.exists()) return;

    const content = this.read();
    const date = new Date().toISOString().split("T")[0];

    // Update the Current Phase section
    const phaseIdx = content.indexOf("## Current Phase");
    if (phaseIdx === -1) return;

    const nextSection = content.indexOf("\n## ", phaseIdx + 1);
    const before = content.slice(0, phaseIdx);
    const after = nextSection !== -1 ? content.slice(nextSection) : "";

    const newPhase = [
      "## Current Phase\n",
      `- **Status:** ${status}`,
      `- **Phase:** ${phase}`,
      `- **Updated:** ${date}`,
    ].join("\n");

    writeFileSync(this.filePath, before + newPhase + after, "utf-8");
  }

  addAction(action: string): void {
    if (!this.exists()) return;

    const content = this.read();
    const date = new Date().toISOString().split("T")[0];
    const entry = `- [${date}] ${action}`;

    const marker = "## Actions Log\n";
    const idx = content.indexOf(marker);
    if (idx === -1) return;

    const insertPos = idx + marker.length;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);

    writeFileSync(this.filePath, before + "\n" + entry + after, "utf-8");
  }

  addDecision(decision: string): void {
    if (!this.exists()) return;

    const content = this.read();
    const date = new Date().toISOString().split("T")[0];
    const entry = `- [${date}] ${decision}`;

    const marker = "## Decisions\n";
    const idx = content.indexOf(marker);
    if (idx === -1) return;

    const insertPos = idx + marker.length;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);

    writeFileSync(this.filePath, before + "\n" + entry + after, "utf-8");
  }
}
