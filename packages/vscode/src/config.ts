/**
 * VS Code Configuration Bridge
 *
 * Reads VS Code workspace settings and bridges to WabiSabi config.
 * Falls back to ~/.wabisabi/config.jsonc for shared settings.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Strip JSON comments (// and /* ... *​/) for JSONC parsing.
 */
function stripJsonComments(text: string): string {
  return text
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

export class WabiSabiConfig {
  private _globalCache: Record<string, any> | null = null;
  private _globalLoaded = false;

  // ── VS Code settings ────────────────────────────────────────

  get model(): string {
    return vscode.workspace.getConfiguration("wabisabi").get("model", "")
      || this.getGlobalConfig()?.model
      || "llama3.2";
  }

  get strategy(): string {
    return vscode.workspace.getConfiguration("wabisabi").get("providerStrategy", "")
      || this.getGlobalConfig()?.providerStrategy
      || "hybrid-local-first";
  }

  get agent(): string {
    return vscode.workspace.getConfiguration("wabisabi").get("defaultAgent", "build");
  }

  get temperature(): number {
    return this.getGlobalConfig()?.temperature ?? 0.7;
  }

  get maxTokens(): number {
    return this.getGlobalConfig()?.maxTokens ?? 4096;
  }

  // ── Provider URLs ───────────────────────────────────────────

  get ollamaUrl(): string {
    const vscodeSetting = vscode.workspace.getConfiguration("wabisabi").get<string>("ollamaUrl", "");
    if (vscodeSetting) return vscodeSetting;
    const global = this.getGlobalConfig();
    return global?.providers?.ollama?.nodes?.[0]?.url ?? "http://localhost:11434";
  }

  get substratumUrl(): string {
    const vscodeSetting = vscode.workspace.getConfiguration("wabisabi").get<string>("substratumUrl", "");
    if (vscodeSetting) return vscodeSetting;
    const global = this.getGlobalConfig();
    return global?.providers?.substratum?.url ?? "https://api.substratum.dev";
  }

  get substratumEnabled(): boolean {
    const global = this.getGlobalConfig();
    return global?.providers?.substratum?.enabled ?? false;
  }

  // ── Setters ─────────────────────────────────────────────────

  setModel(model: string) {
    vscode.workspace.getConfiguration("wabisabi").update("model", model, true);
  }

  setStrategy(strategy: string) {
    vscode.workspace.getConfiguration("wabisabi").update("providerStrategy", strategy, true);
  }

  setAgent(agent: string) {
    vscode.workspace.getConfiguration("wabisabi").update("defaultAgent", agent, true);
  }

  // ── Global config reading ───────────────────────────────────

  getGlobalConfig(): Record<string, any> | null {
    if (this._globalLoaded) return this._globalCache;

    const configPath = path.join(os.homedir(), ".wabisabi", "config.jsonc");
    try {
      if (!fs.existsSync(configPath)) {
        this._globalCache = null;
        return null;
      }
      const raw = fs.readFileSync(configPath, "utf-8");
      this._globalCache = JSON.parse(stripJsonComments(raw));
      this._globalLoaded = true;
      return this._globalCache;
    } catch {
      this._globalCache = null;
      this._globalLoaded = true;
      return null;
    }
  }

  /** Invalidate cached global config (e.g., after settings change). */
  refreshGlobalConfig(): void {
    this._globalLoaded = false;
    this._globalCache = null;
  }
}
