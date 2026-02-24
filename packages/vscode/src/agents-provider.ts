/**
 * Agents Tree Data Provider
 *
 * Shows BUILD / PLAN / SEARCH in the sidebar tree view.
 * Current agent is highlighted with a checkmark icon.
 */

import * as vscode from "vscode";
import type { WabiSabiConfig } from "./config";

interface AgentDef {
  type: string;
  label: string;
  description: string;
}

const AGENTS: AgentDef[] = [
  { type: "build", label: "BUILD", description: "Write & edit code" },
  { type: "plan", label: "PLAN", description: "Architect & plan" },
  { type: "search", label: "SEARCH", description: "Find & analyze" },
];

class AgentItem extends vscode.TreeItem {
  constructor(agent: AgentDef, isActive: boolean) {
    super(agent.label, vscode.TreeItemCollapsibleState.None);
    this.description = agent.description;
    this.tooltip = agent.description;
    this.contextValue = "agent";

    if (isActive) {
      this.iconPath = new vscode.ThemeIcon("check");
    } else {
      this.iconPath = new vscode.ThemeIcon("circle-outline");
    }

    this.command = {
      command: "wabisabi.switchAgent",
      title: "Switch Agent",
    };
  }
}

export class AgentsProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly config: WabiSabiConfig) {}

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(): AgentItem[] {
    return AGENTS.map((a) => new AgentItem(a, a.type === this.config.agent));
  }
}
