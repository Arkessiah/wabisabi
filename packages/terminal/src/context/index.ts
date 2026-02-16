/**
 * Project Context
 *
 * Orchestrates project detection, analysis, and the three MD files
 * (AGENTS.md, PLAN.md, TODO.md) that form the persistent project memory.
 */

import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { StackDetector, type ProjectStack } from "./detector.js";
import { AgentsMdManager } from "./agents-md.js";
import { PlanMdManager } from "./plan-md.js";
import { TodoMdManager } from "./todo-md.js";
import { configManager } from "../config/index.js";

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "Package.swift",
  "Makefile",
];

export class ProjectContext {
  private projectRoot: string | null = null;
  private stack: ProjectStack | null = null;
  private agentsMd: AgentsMdManager | null = null;
  private planMd: PlanMdManager | null = null;
  private todoMd: TodoMdManager | null = null;
  private initialized = false;

  detectProjectRoot(startDir?: string): string {
    let dir = resolve(startDir || process.cwd());

    while (dir !== dirname(dir)) {
      for (const marker of PROJECT_MARKERS) {
        if (existsSync(join(dir, marker))) {
          return dir;
        }
      }
      dir = dirname(dir);
    }

    // Fallback to cwd if no project root found
    return resolve(startDir || process.cwd());
  }

  async initialize(startDir?: string): Promise<void> {
    if (this.initialized) return;

    // 1. Find project root
    this.projectRoot = this.detectProjectRoot(startDir);

    // 2. Load project config
    configManager.loadGlobal();
    configManager.loadProject(this.projectRoot);

    // 3. Detect tech stack
    try {
      const detector = new StackDetector(this.projectRoot);
      this.stack = await detector.detect();
    } catch {
      this.stack = null;
    }

    // 4. Initialize MD managers
    this.agentsMd = new AgentsMdManager(this.projectRoot);
    this.planMd = new PlanMdManager(this.projectRoot);
    this.todoMd = new TodoMdManager(this.projectRoot);

    // 5. Create MD files if they don't exist
    try {
      if (!this.agentsMd.exists()) {
        this.agentsMd.write(this.stack);
      }
      if (!this.planMd.exists()) {
        this.planMd.write(this.stack);
      }
      if (!this.todoMd.exists()) {
        this.todoMd.write();
      }
    } catch {
      // MD file creation failed - non-critical, agent can still operate
    }

    this.initialized = true;
  }

  getSystemPrompt(): string {
    const parts: string[] = [];

    if (this.stack) {
      parts.push(`## Project: ${this.stack.projectName}`);
      parts.push(
        `Tech: ${this.stack.language.join(", ")}${this.stack.framework.length > 0 ? " / " + this.stack.framework.join(", ") : ""}`,
      );
      parts.push(`Package Manager: ${this.stack.packageManager}`);
      parts.push(`Root: ${this.projectRoot}`);
    }

    if (this.agentsMd?.exists()) {
      const content = this.agentsMd.read();
      // Limit to 4000 chars to avoid overwhelming the context
      parts.push(
        `\n## AGENTS.md\n${content.length > 4000 ? content.slice(0, 4000) + "\n..." : content}`,
      );
    }

    if (this.planMd?.exists()) {
      const content = this.planMd.read();
      parts.push(
        `\n## PLAN.md\n${content.length > 4000 ? content.slice(0, 4000) + "\n..." : content}`,
      );
    }

    if (this.todoMd?.exists()) {
      const content = this.todoMd.read();
      parts.push(
        `\n## TODO.md\n${content.length > 4000 ? content.slice(0, 4000) + "\n..." : content}`,
      );
    }

    return parts.join("\n");
  }

  getProjectRoot(): string {
    if (!this.projectRoot) {
      throw new Error(
        "ProjectContext not initialized. Call initialize() first.",
      );
    }
    return this.projectRoot;
  }

  getStack(): ProjectStack | null {
    return this.stack;
  }

  getAgentsMd(): AgentsMdManager | null {
    return this.agentsMd;
  }

  getPlanMd(): PlanMdManager | null {
    return this.planMd;
  }

  getTodoMd(): TodoMdManager | null {
    return this.todoMd;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const projectContext = new ProjectContext();
