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

    // Set initial prompt
    const info = agentSwitcher.getInfo();
    this.engine.input.setPrompt(`${chalk.cyan(`[${info.label}]`)} ${chalk.green(">")} `);

    // Listen for agent changes
    agentSwitcher.onChange((agent) => {
      const info = agentSwitcher.getInfo();
      this.engine.updateHeader({
        agent,
        agentIcon: info.icon,
        agentLabel: info.label,
      });
      this.engine.input.setPrompt(`${chalk.cyan(`[${info.label}]`)} ${chalk.green(">")} `);
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
  }): PaletteItem[] {
    const items: PaletteItem[] = [];

    // Agents section
    for (const agent of AGENTS) {
      items.push({
        id: agent.type,
        label: agent.label,
        description: agent.description,
        icon: agent.icon,
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

    // Provider section
    items.push({
      id: "provider-current",
      label: opts.currentProvider,
      description: "Active provider",
      active: true,
      section: "providers",
    });

    return items;
  }
}
