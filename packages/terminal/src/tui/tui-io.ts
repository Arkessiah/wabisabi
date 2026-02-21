/**
 * TUI Terminal I/O
 *
 * Implementation of TerminalIO that uses the TUI panel system.
 * Replaces the legacy readline-based I/O with a full split-pane interface.
 */

import type {
  TerminalIO,
  HeaderInfo,
  SpinnerHandle,
  PaletteItem,
  PaletteResult,
} from "./types.js";
import type { ActiveTask, PinnedItem } from "../ram/schema.js";
import { TuiEngine } from "./index.js";
import { agentSwitcher, AGENTS } from "../services/agent-switcher.js";
import { configManager } from "../config/index.js";
import { showSplash } from "./banner.js";
import chalk from "chalk";

export class TuiTerminalIO implements TerminalIO {
  readonly isTui = true;
  private engine: TuiEngine;
  private _ctrlPHandler: ((items: PaletteItem[]) => Promise<PaletteResult | null>) | null = null;
  private _paletteItems: PaletteItem[] = [];
  private _tabHandler: (() => void) | null = null;

  constructor() {
    this.engine = new TuiEngine();
  }

  getEngine(): TuiEngine {
    return this.engine;
  }

  async init(): Promise<void> {
    this.engine.start();

    // Show splash banner in the output panel
    const splash = showSplash({
      model: "llama3.2",
      provider: "ollama",
      cwd: process.cwd(),
    });
    for (const line of splash.split("\n")) {
      this.engine.output.writeStatus(line);
    }

    // Set initial prompt
    const info = agentSwitcher.getInfo();
    this.engine.input.setPrompt(`${chalk.cyan(`[${info.label}]`)} ${chalk.green(">")} `);

    // Listen for agent changes
    agentSwitcher.onChange((agent) => {
      const info = agentSwitcher.getInfo();
      this.engine.updateHeader({
        agent,
        agentLabel: info.label,
      });
      this.engine.input.setPrompt(`${chalk.cyan(`[${info.label}]`)} ${chalk.green(">")} `);
    });

    // Wire Tab -> agent cycle
    this.engine.onTab(() => {
      agentSwitcher.cycle();
    });

    // Wire Ctrl+P -> command palette
    this.engine.onPalette(async () => {
      const currentInfo = agentSwitcher.getInfo();
      const merged = configManager.getMerged();
      const providers = configManager.getProviders();
      const items = TuiTerminalIO.buildPaletteItems({
        currentAgent: currentInfo.type,
        currentModel: merged.model || "llama3.2",
        currentProvider: merged.providerStrategy || "hybrid-local-first",
        tokens: { prompt: 0, completion: 0, total: 0 },
        contextUsage: 0,
        providers,
        providerStrategy: merged.providerStrategy || "hybrid-local-first",
      });
      const result = await this.openCommandPalette(items);
      if (result) {
        if (result.section === "agents") {
          agentSwitcher.set(result.itemId as any);
        } else if (result.section === "strategies") {
          configManager.update("providerStrategy", result.itemId, "global");
        }
      }
    });
  }

  destroy(): void {
    this.engine.stop();
  }

  writeOutput(text: string): void {
    this.engine.output.writeMarkdown(text);
  }

  writeStreamToken(chunk: string): void {
    if (!this.engine.output.isStreaming) {
      this.engine.output.startStream();
    }
    this.engine.output.appendToken(chunk);
  }

  writeToolResult(toolName: string, title: string, success: boolean): void {
    this.engine.output.writeToolResult(toolName, title, success);
  }

  writeStatus(text: string): void {
    this.engine.output.writeStatus(text);
  }

  writeError(text: string): void {
    this.engine.output.writeError(text);
  }

  async readInput(prompt: string): Promise<string> {
    // End any active stream
    if (this.engine.output.isStreaming) {
      this.engine.output.endStream();
    }

    // Trim output buffer
    this.engine.output.trimBuffer();

    return this.engine.input.waitForInput();
  }

  async confirm(message: string): Promise<boolean> {
    return this.engine.input.waitForConfirm(message);
  }

  updateHeader(info: Partial<HeaderInfo>): void {
    this.engine.updateHeader(info);
  }

  updateTaskQueue(tasks: ActiveTask[]): void {
    this.engine.updateTasks(tasks);
  }

  updatePins(pins: PinnedItem[]): void {
    this.engine.updatePins(pins);
  }

  showSpinner(text: string): SpinnerHandle {
    return this.engine.createSpinner(text);
  }

  async openCommandPalette(items: PaletteItem[]): Promise<PaletteResult | null> {
    const bounds = this.engine.screen.getPaletteBounds();
    const result = await this.engine.palette.open(items, bounds);
    this.engine.fullRender(); // Redraw after palette closes
    return result;
  }

  clearOutput(): void {
    this.engine.output.clear();
    this.engine.fullRender();
  }

  /** Set the handler for Tab key (agent cycling) */
  onTab(handler: () => void): void {
    this._tabHandler = handler;
  }

  /** Build palette items from current state */
  static buildPaletteItems(opts: {
    currentAgent: string;
    currentModel: string;
    currentProvider: string;
    tokens: { prompt: number; completion: number; total: number };
    contextUsage: number;
    availableModels?: string[];
    providers?: import("../config/schema.js").ProvidersConfig;
    providerStrategy?: string;
  }): PaletteItem[] {
    const items: PaletteItem[] = [];

    // Agents section
    for (const agent of AGENTS) {
      items.push({
        id: agent.type,
        label: agent.label,
        description: agent.description,
        active: agent.type === opts.currentAgent,
        section: "agents",
      });
    }

    // Models section
    const models = opts.availableModels || ["llama3.2", "codellama", "mistral", "mixtral", "deepseek-coder"];
    for (const model of models) {
      items.push({
        id: model,
        label: model,
        active: model === opts.currentModel,
        section: "models",
      });
    }

    // Provider strategy section
    const strategies = [
      { id: "local", label: "Ollama Local", desc: "Single instance, private" },
      { id: "cluster", label: "Ollama Cluster", desc: "Multiple machines" },
      { id: "cloud", label: "Substratum Cloud", desc: "Powerful models, costs tokens" },
      { id: "cluster-cloud", label: "Cluster + Cloud", desc: "Cluster with cloud fallback" },
      { id: "hybrid-local-first", label: "Local + Cloud", desc: "Local preferred, cloud for complex" },
      { id: "hybrid-cloud-first", label: "Cloud + Local", desc: "Cloud preferred, local fallback" },
      { id: "hybrid-full", label: "Full Hybrid", desc: "Local + Cluster + Cloud" },
    ];

    for (const s of strategies) {
      items.push({
        id: s.id,
        label: s.label,
        description: s.desc,
        active: s.id === opts.providerStrategy,
        section: "strategies",
      });
    }

    // Providers status section
    if (opts.providers) {
      const p = opts.providers;
      if (p.substratum.enabled) {
        items.push({
          id: "substratum",
          label: `Substratum: ${p.substratum.url}`,
          description: p.substratum.apiKey ? "API key configured" : "No API key",
          section: "providers",
        });
      }
      for (const node of p.ollama.nodes) {
        items.push({
          id: `ollama-${node.name}`,
          label: `Ollama: ${node.name} (${node.url})`,
          description: `Priority: ${node.priority}${node.gpu ? ` [${node.gpu}]` : ""}`,
          section: "providers",
        });
      }
    }

    // Token stats section
    const { prompt, completion, total } = opts.tokens;
    const ctxPct = Math.round(opts.contextUsage * 100);
    items.push({
      id: "token-prompt",
      label: `Prompt: ${prompt.toLocaleString()} tokens`,
      section: "tokens",
    });
    items.push({
      id: "token-completion",
      label: `Completion: ${completion.toLocaleString()} tokens`,
      section: "tokens",
    });
    items.push({
      id: "token-total",
      label: `Total: ${total.toLocaleString()} tokens`,
      section: "tokens",
    });
    items.push({
      id: "token-context",
      label: `Context: ${ctxPct}% used`,
      description: ctxPct > 75 ? "WARNING" : ctxPct > 50 ? "moderate" : "ok",
      section: "tokens",
    });

    return items;
  }
}
