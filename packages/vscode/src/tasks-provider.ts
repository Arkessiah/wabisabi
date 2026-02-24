/**
 * Tasks Tree Data Provider
 *
 * Shows active tasks in the sidebar. Reads from RAM working memory
 * at ~/.wabisabi/ram.json and refreshes periodically.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface TaskEntry {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "failed";
  agent?: string;
  createdAt?: string;
}

const STATUS_ICONS: Record<string, string> = {
  pending: "circle-outline",
  running: "sync~spin",
  done: "check",
  failed: "error",
};

class TaskItem extends vscode.TreeItem {
  constructor(task: TaskEntry) {
    super(task.title, vscode.TreeItemCollapsibleState.None);
    this.description = task.agent ? `[${task.agent.toUpperCase()}]` : "";
    this.tooltip = `${task.title} (${task.status})`;
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[task.status] || "circle-outline");
    this.contextValue = task.status;
  }
}

export class TasksProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor() {
    // Auto-refresh every 5 seconds
    this.refreshTimer = setInterval(() => this.refresh(), 5000);
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(): TaskItem[] {
    const tasks = this.readTasks();
    if (tasks.length === 0) {
      return [new EmptyItem()];
    }
    // Show running first, then pending, then done/failed
    const order = { running: 0, pending: 1, done: 2, failed: 3 };
    tasks.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
    return tasks.map((t) => new TaskItem(t));
  }

  private readTasks(): TaskEntry[] {
    const ramPath = path.join(os.homedir(), ".wabisabi", "ram.json");
    try {
      if (!fs.existsSync(ramPath)) return [];
      const raw = fs.readFileSync(ramPath, "utf-8");
      const data = JSON.parse(raw);
      // RAM stores tasks in activeTasks array
      const tasks: TaskEntry[] = data.activeTasks || data.tasks || [];
      return tasks.filter((t) => t && t.title);
    } catch {
      return [];
    }
  }
}

class EmptyItem extends vscode.TreeItem {
  constructor() {
    super("No active tasks", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
    this.description = "Tasks appear when agents are working";
  }
}
