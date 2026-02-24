/**
 * VS Code Configuration Bridge
 *
 * Reads VS Code workspace settings and bridges to WabiSabi config.
 * Falls back to ~/.wabisabi/config.jsonc for shared settings.
 */

import * as vscode from "vscode";

export class WabiSabiConfig {
  get model(): string {
    return vscode.workspace.getConfiguration("wabisabi").get("model", "llama3.2");
  }

  get strategy(): string {
    return vscode.workspace.getConfiguration("wabisabi").get("providerStrategy", "hybrid-local-first");
  }

  get agent(): string {
    return vscode.workspace.getConfiguration("wabisabi").get("defaultAgent", "build");
  }

  setModel(model: string) {
    vscode.workspace.getConfiguration("wabisabi").update("model", model, true);
  }

  setStrategy(strategy: string) {
    vscode.workspace.getConfiguration("wabisabi").update("providerStrategy", strategy, true);
  }

  setAgent(agent: string) {
    vscode.workspace.getConfiguration("wabisabi").update("defaultAgent", agent, true);
  }
}
