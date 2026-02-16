/**
 * TODO.md Manager
 *
 * Generates and maintains the TODO.md file for a project.
 * Tracks tasks with checkbox syntax and priorities.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface TodoItem {
  text: string;
  done: boolean;
  priority?: "high" | "medium" | "low";
}

export class TodoMdManager {
  private filePath: string;

  constructor(private projectRoot: string) {
    this.filePath = join(projectRoot, "TODO.md");
  }

  exists(): boolean {
    return existsSync(this.filePath);
  }

  read(): string {
    if (!this.exists()) return "";
    return readFileSync(this.filePath, "utf-8");
  }

  parse(): TodoItem[] {
    if (!this.exists()) return [];

    const content = this.read();
    const items: TodoItem[] = [];
    const regex = /^- \[([ x])\]\s*(?:\*\*(HIGH|MEDIUM|LOW)\*\*\s*)?(.+)$/gm;

    let match;
    while ((match = regex.exec(content)) !== null) {
      items.push({
        done: match[1] === "x",
        priority: match[2]
          ? (match[2].toLowerCase() as "high" | "medium" | "low")
          : undefined,
        text: match[3].trim(),
      });
    }

    return items;
  }

  generate(): string {
    const sections: string[] = [];

    sections.push("# TODO.md\n");
    sections.push(
      "> Task list maintained by WabiSabi CLI. Updated automatically.\n",
    );

    sections.push("## In Progress\n");
    sections.push("<!-- Active tasks go here -->\n");

    sections.push("## Pending\n");
    sections.push("<!-- Upcoming tasks go here -->\n");

    sections.push("## Completed\n");
    sections.push("<!-- Finished tasks go here -->\n");

    return sections.join("\n") + "\n";
  }

  write(): void {
    const content = this.generate();
    writeFileSync(this.filePath, content, "utf-8");
  }

  addTask(text: string, priority?: "high" | "medium" | "low"): void {
    if (!this.exists()) {
      this.write();
    }

    const content = this.read();
    const priorityTag = priority
      ? `**${priority.toUpperCase()}** `
      : "";
    const entry = `- [ ] ${priorityTag}${text}`;

    // Add to "In Progress" or "Pending" section
    const marker = "## Pending\n";
    const idx = content.indexOf(marker);
    if (idx === -1) {
      // Append to end
      writeFileSync(this.filePath, content + "\n" + entry + "\n", "utf-8");
      return;
    }

    const insertPos = idx + marker.length;
    const before = content.slice(0, insertPos);
    const after = content.slice(insertPos);

    writeFileSync(this.filePath, before + "\n" + entry + after, "utf-8");
  }

  completeTask(taskText: string): void {
    if (!this.exists()) return;

    let content = this.read();

    // Find the task line and mark as done
    const escapedText = taskText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `^- \\[ \\]\\s*(?:\\*\\*(?:HIGH|MEDIUM|LOW)\\*\\*\\s*)?${escapedText}`,
      "m",
    );

    const match = content.match(regex);
    if (!match) return;

    // Replace [ ] with [x]
    content = content.replace(match[0], match[0].replace("- [ ]", "- [x]"));

    writeFileSync(this.filePath, content, "utf-8");
  }

  removeTask(taskText: string): void {
    if (!this.exists()) return;

    const content = this.read();
    const lines = content.split("\n");
    const filtered = lines.filter(
      (line) => !line.includes(taskText) || !line.startsWith("- ["),
    );

    writeFileSync(this.filePath, filtered.join("\n"), "utf-8");
  }

  getSummary(): { total: number; done: number; pending: number } {
    const items = this.parse();
    const done = items.filter((i) => i.done).length;
    return {
      total: items.length,
      done,
      pending: items.length - done,
    };
  }
}
