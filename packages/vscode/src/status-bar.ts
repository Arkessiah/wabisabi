/**
 * Status Bar Manager
 *
 * Shows [AGENT] model | strategy in the VS Code status bar.
 * Click opens the switch-agent quick pick.
 */

import * as vscode from "vscode";
import type { WabiSabiConfig } from "./config";

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor(private readonly config: WabiSabiConfig) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "wabisabi.switchAgent";
    this.update();
    this.item.show();
  }

  update() {
    const agent = this.config.agent.toUpperCase();
    const model = this.config.model;
    const strategy = this.config.strategy;
    this.item.text = `$(robot) [${agent}] ${model} | ${strategy}`;
    this.item.tooltip = `WabiSabi: ${agent} agent, ${model}, ${strategy}`;
  }

  dispose() {
    this.item.dispose();
  }
}
