/**
 * Task Panel
 *
 * Side panel showing active tasks from RAM and pinned items.
 * Toggleable with Ctrl+T.
 */

import { Panel } from "./panel.js";
import { cursor, style, padAnsi, box } from "./ansi.js";
import type { ActiveTask, PinnedItem } from "../ram/schema.js";
import chalk from "chalk";

export class TaskPanel extends Panel {
  private tasks: ActiveTask[] = [];
  private pins: PinnedItem[] = [];

  constructor() {
    super();
    this._showBorder = false;
  }

  setTasks(tasks: ActiveTask[]): void {
    this.tasks = tasks;
    this.rebuildLines();
  }

  setPins(pins: PinnedItem[]): void {
    this.pins = pins;
    this.rebuildLines();
  }

  private rebuildLines(): void {
    this.lines = [];
    const w = this.visibleWidth - 1;

    // Header
    this.lines.push(chalk.bold.cyan(" TASKS"));
    this.lines.push(chalk.dim(" " + "─".repeat(Math.max(0, w - 1))));

    if (this.tasks.length === 0) {
      this.lines.push(chalk.dim(" (no tasks)"));
    } else {
      for (const task of this.tasks) {
        const icon = task.status === "active"
          ? chalk.yellow("●")
          : task.status === "completed"
          ? chalk.green("✓")
          : chalk.dim("○");
        const desc = task.description.length > w - 4
          ? task.description.slice(0, w - 5) + "…"
          : task.description;
        this.lines.push(` ${icon} ${desc}`);

        // Show subtasks indented
        for (const sub of task.subtasks.slice(0, 3)) {
          const subDesc = sub.length > w - 6
            ? sub.slice(0, w - 7) + "…"
            : sub;
          this.lines.push(chalk.dim(`   └ ${subDesc}`));
        }
        if (task.subtasks.length > 3) {
          this.lines.push(chalk.dim(`   +${task.subtasks.length - 3} more`));
        }
      }
    }

    // Separator
    this.lines.push("");
    this.lines.push(chalk.bold.cyan(" PINS"));
    this.lines.push(chalk.dim(" " + "─".repeat(Math.max(0, w - 1))));

    if (this.pins.length === 0) {
      this.lines.push(chalk.dim(" (no pins)"));
    } else {
      for (const pin of this.pins.slice(0, 10)) {
        const typeIcon = pin.type === "decision" ? "📌"
          : pin.type === "task" ? "📋"
          : pin.type === "instruction" ? "📝"
          : pin.type === "fact" ? "💡"
          : "📎";
        const content = pin.content.length > w - 4
          ? pin.content.slice(0, w - 5) + "…"
          : pin.content;
        this.lines.push(` ${typeIcon} ${content}`);
      }
      if (this.pins.length > 10) {
        this.lines.push(chalk.dim(` +${this.pins.length - 10} more`));
      }
    }

    this._dirty = true;
  }

  /** Render with vertical divider on the left edge */
  render(): string {
    const { x, y, width, height } = this._bounds;
    let buf = "";

    // Draw vertical divider on left edge
    for (let r = 0; r < height; r++) {
      buf += cursor.moveTo(y + r, x - 1) + style.dim + box.vertical + style.reset;
    }

    // Draw content
    for (let row = 0; row < height; row++) {
      const lineIdx = this.scrollOffset + row;
      const line = lineIdx < this.lines.length ? this.lines[lineIdx] : "";
      buf += cursor.moveTo(y + row, x) + padAnsi(line, width);
    }

    this._dirty = false;
    return buf;
  }
}
