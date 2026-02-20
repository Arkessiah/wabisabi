/**
 * TUI Engine
 *
 * Composes all panels into a unified terminal interface.
 * Manages layout, render loop, resize handling, and panel coordination.
 */

import { ScreenManager } from "./screen.js";
import { HeaderBar } from "./header-bar.js";
import { OutputPanel } from "./output-panel.js";
import { TaskPanel } from "./task-panel.js";
import { InputArea } from "./input-area.js";
import { CommandPalette } from "./command-palette.js";
import { KeybindingsManager, type KeyAction } from "./keybindings.js";
import { cursor, screen, style, box, flush, drawHLine } from "./ansi.js";
import type {
  HeaderInfo,
  PaletteItem,
  PaletteResult,
  SpinnerHandle,
} from "./types.js";
import type { ActiveTask, PinnedItem } from "../ram/schema.js";
import type { AgentType } from "../services/agent-switcher.js";
import chalk from "chalk";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class TuiEngine {
  readonly screen: ScreenManager;
  readonly header: HeaderBar;
  readonly output: OutputPanel;
  readonly taskPanel: TaskPanel;
  readonly input: InputArea;
  readonly palette: CommandPalette;
  readonly keys: KeybindingsManager;

  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private _running = false;

  // External event handlers
  private onAgentSwitch: ((agent: AgentType) => void) | null = null;
  private onSaveSession: (() => void) | null = null;

  constructor() {
    this.screen = new ScreenManager();
    this.header = new HeaderBar();
    this.output = new OutputPanel();
    this.taskPanel = new TaskPanel();
    this.input = new InputArea();
    this.palette = new CommandPalette();
    this.keys = new KeybindingsManager();
  }

  /** Register handler for agent switching */
  onAgentChange(handler: (agent: AgentType) => void): void {
    this.onAgentSwitch = handler;
  }

  /** Register handler for save session */
  onSave(handler: () => void): void {
    this.onSaveSession = handler;
  }

  /** Start the TUI */
  start(): void {
    if (this._running) return;
    this._running = true;

    // Enter alternate screen
    this.screen.enterAltBuffer();
    this.screen.startResizeListener();

    // Recalculate layout on resize
    this.screen.onResize(() => {
      this.recalculateLayout();
      this.fullRender();
    });

    // Initial layout
    this.recalculateLayout();
    this.input.setStatus(InputArea.defaultStatusText());

    // Start key handler
    this.keys.setHandler((action, raw) => this.handleKey(action, raw));
    this.keys.start();

    // Start render loop (30fps)
    this.renderTimer = setInterval(() => this.renderDirty(), 33);

    // Initial full render
    this.fullRender();
  }

  /** Stop the TUI and restore terminal */
  stop(): void {
    if (!this._running) return;
    this._running = false;

    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }

    this.keys.stop();
    this.screen.leaveAltBuffer();
    flush(cursor.show());
  }

  /** Recalculate panel bounds based on terminal size */
  private recalculateLayout(): void {
    this.header.setBounds(this.screen.getHeaderBounds());
    this.output.setBounds(this.screen.getOutputBounds());
    this.taskPanel.setBounds(this.screen.getTaskPanelBounds());
    this.input.setBounds(this.screen.getInputBounds());

    // Mark all dirty
    this.header.markDirty();
    this.output.markDirty();
    this.taskPanel.markDirty();
    this.input.markDirty();
  }

  /** Full render of all panels */
  fullRender(): void {
    let buf = screen.clear();

    // Draw frame separators
    buf += this.drawSeparators();

    // Render all panels
    buf += this.header.render();
    buf += this.output.render();
    if (this.screen.taskPanelVisible) {
      buf += this.taskPanel.render();
    }
    buf += this.input.render();

    // Palette overlay if open
    if (this.palette.isOpen) {
      buf += this.palette.render();
    }

    buf += cursor.show();
    flush(buf);
  }

  /** Only render dirty panels */
  private renderDirty(): void {
    let buf = "";
    let hasDirty = false;

    buf += cursor.hide();

    if (this.header.dirty) {
      buf += this.header.render();
      hasDirty = true;
    }
    if (this.output.dirty) {
      buf += this.output.render();
      hasDirty = true;
    }
    if (this.screen.taskPanelVisible && this.taskPanel.dirty) {
      buf += this.taskPanel.render();
      hasDirty = true;
    }
    if (this.input.dirty) {
      buf += this.input.render();
      hasDirty = true;
    }
    if (this.palette.isOpen) {
      buf += this.palette.render();
      hasDirty = true;
    }

    if (hasDirty) {
      buf += cursor.show();
      // Position cursor at input
      const inputBounds = this.input.bounds;
      flush(buf);
    }
  }

  /** Draw separator lines between panels */
  private drawSeparators(): string {
    const { cols, rows } = this.screen;
    let buf = "";

    // Header bottom separator
    const headerH = this.screen.layout.headerHeight;
    buf += cursor.moveTo(headerH + 1, 1) + style.dim;
    buf += "─".repeat(cols);
    buf += style.reset;

    return buf;
  }

  /** Handle keyboard input */
  private handleKey(action: KeyAction, raw: string): void {
    // If palette is open, route all keys there
    if (this.palette.isOpen) {
      if (action === "escape" || action === "ctrl-c") {
        // Handled by palette
      }
      this.palette.handleKey(raw);
      return;
    }

    switch (action) {
      case "ctrl-c":
        this.stop();
        process.exit(0);
        break;

      case "ctrl-p":
        // Will be handled by TuiTerminalIO
        break;

      case "ctrl-t":
        this.screen.toggleTaskPanel();
        this.recalculateLayout();
        this.fullRender();
        break;

      case "ctrl-l":
        this.output.clear();
        this.fullRender();
        break;

      case "ctrl-s":
        if (this.onSaveSession) this.onSaveSession();
        this.output.writeStatus(chalk.green("  Session saved."));
        break;

      case "ctrl-1":
        if (this.onAgentSwitch) this.onAgentSwitch("build");
        break;

      case "ctrl-2":
        if (this.onAgentSwitch) this.onAgentSwitch("plan");
        break;

      case "ctrl-3":
        if (this.onAgentSwitch) this.onAgentSwitch("search");
        break;

      case "page-up":
        this.output.scrollUp(this.output.visibleHeight - 2);
        break;

      case "page-down":
        this.output.scrollDown(this.output.visibleHeight - 2);
        break;

      case "tab":
      case "shift-tab":
      case "input":
        // Route to input area
        const inputResult = this.input.handleKey(raw);
        if (inputResult === "tab" && this.onAgentSwitch) {
          // Tab from input area when not completing a slash command = cycle agent
          // This is handled by TuiTerminalIO
        }
        break;
    }
  }

  /** Create a spinner in the output panel */
  createSpinner(text: string): SpinnerHandle {
    let frame = 0;
    const timer = setInterval(() => {
      this.output.writeSpinner(SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length], text);
    }, 80);

    return {
      stop: (finalText?: string) => {
        clearInterval(timer);
        this.output.clearSpinner(finalText);
      },
      update: (newText: string) => {
        text = newText;
      },
    };
  }

  // ── Convenience Methods ────────────────────────────────────

  updateHeader(info: Partial<HeaderInfo>): void {
    this.header.update(info);
  }

  updateTasks(tasks: ActiveTask[]): void {
    this.taskPanel.setTasks(tasks);
  }

  updatePins(pins: PinnedItem[]): void {
    this.taskPanel.setPins(pins);
  }
}

export { LegacyTerminalIO } from "./legacy-io.js";
export { TuiTerminalIO } from "./tui-io.js";
export type { TerminalIO } from "./types.js";
