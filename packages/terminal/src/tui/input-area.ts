/**
 * Input Area
 *
 * Bottom panel with command input and status bar.
 * Handles key-by-key input in raw mode with history, tab completion,
 * and multiline support.
 */

import { Panel } from "./panel.js";
import { cursor, style, padAnsi, visibleLength, box } from "./ansi.js";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HISTORY_FILE = join(homedir(), ".wabisabi", "history");
const MAX_HISTORY = 500;

const SLASH_COMMANDS = [
  "/help", "/clear", "/model", "/status", "/tools", "/approve",
  "/compact", "/export", "/menu", "/session", "/sessions",
  "/soul", "/ram", "/pin", "/pins", "/unpin", "/device",
  "/hat", "/profile", "/style", "/reset",
];

export class InputArea extends Panel {
  private buffer = "";
  private cursorPos = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private savedBuffer = ""; // buffer before history navigation
  private prompt = "";
  private _multiline = false;
  private multilineBuffer: string[] = [];
  private _statusText = "";
  private _resolve: ((value: string) => void) | null = null;

  constructor() {
    super();
    this.loadHistory();
  }

  /** Set the prompt text (e.g., "[BUILD] > ") */
  setPrompt(prompt: string): void {
    this.prompt = prompt;
    this._dirty = true;
  }

  /** Set the status bar text */
  setStatus(text: string): void {
    this._statusText = text;
    this._dirty = true;
  }

  /** Get default status bar text */
  static defaultStatusText(): string {
    return chalk.dim("Tab:agents  Ctrl+P:palette  Ctrl+T:tasks  Ctrl+L:clear  Ctrl+S:save");
  }

  /** Wait for user to submit input (press Enter) */
  waitForInput(): Promise<string> {
    this.buffer = "";
    this.cursorPos = 0;
    this.historyIndex = -1;
    this._dirty = true;
    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /** Wait for y/n confirmation */
  waitForConfirm(message: string): Promise<boolean> {
    this.setPrompt(`${chalk.yellow("?")} ${message} [y/N] `);
    this._dirty = true;
    return new Promise((resolve) => {
      this._resolve = (input: string) => {
        resolve(input.trim().toLowerCase() === "y");
      };
    });
  }

  /** Process a key event from raw mode */
  handleKey(raw: string): "submit" | "tab" | "cancel" | null {
    // Enter - submit
    if (raw === "\r" || raw === "\n") {
      if (this._multiline) {
        if (this.buffer.trim() === '"""') {
          this._multiline = false;
          const result = this.multilineBuffer.join("\n");
          this.multilineBuffer = [];
          this.submitInput(result);
          return "submit";
        }
        this.multilineBuffer.push(this.buffer);
        this.buffer = "";
        this.cursorPos = 0;
        this._dirty = true;
        return null;
      }

      // Check for multiline start
      if (this.buffer.trimStart().startsWith('"""')) {
        this._multiline = true;
        const rest = this.buffer.trimStart().slice(3);
        this.multilineBuffer = rest ? [rest] : [];
        this.buffer = "";
        this.cursorPos = 0;
        this._dirty = true;
        return null;
      }

      // Line continuation with backslash
      if (this.buffer.endsWith("\\")) {
        this.multilineBuffer.push(this.buffer.slice(0, -1));
        this._multiline = true;
        this.buffer = "";
        this.cursorPos = 0;
        this._dirty = true;
        return null;
      }

      const input = this.buffer;
      this.addToHistory(input);
      this.submitInput(input);
      return "submit";
    }

    // Backspace
    if (raw === "\x7F" || raw === "\b") {
      if (this.cursorPos > 0) {
        this.buffer = this.buffer.slice(0, this.cursorPos - 1) + this.buffer.slice(this.cursorPos);
        this.cursorPos--;
        this._dirty = true;
      }
      return null;
    }

    // Delete
    if (raw === "\x1B[3~") {
      if (this.cursorPos < this.buffer.length) {
        this.buffer = this.buffer.slice(0, this.cursorPos) + this.buffer.slice(this.cursorPos + 1);
        this._dirty = true;
      }
      return null;
    }

    // Ctrl+A - beginning of line
    if (raw === "\x01") {
      this.cursorPos = 0;
      this._dirty = true;
      return null;
    }

    // Ctrl+E - end of line
    if (raw === "\x05") {
      this.cursorPos = this.buffer.length;
      this._dirty = true;
      return null;
    }

    // Ctrl+U - clear line
    if (raw === "\x15") {
      this.buffer = "";
      this.cursorPos = 0;
      this._dirty = true;
      return null;
    }

    // Ctrl+W - delete word back
    if (raw === "\x17") {
      const before = this.buffer.slice(0, this.cursorPos);
      const trimmed = before.trimEnd();
      const lastSpace = trimmed.lastIndexOf(" ");
      const newPos = lastSpace === -1 ? 0 : lastSpace + 1;
      this.buffer = this.buffer.slice(0, newPos) + this.buffer.slice(this.cursorPos);
      this.cursorPos = newPos;
      this._dirty = true;
      return null;
    }

    // Arrow Up - history back
    if (raw === "\x1B[A") {
      if (this.history.length > 0) {
        if (this.historyIndex === -1) {
          this.savedBuffer = this.buffer;
          this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.buffer = this.history[this.historyIndex];
        this.cursorPos = this.buffer.length;
        this._dirty = true;
      }
      return null;
    }

    // Arrow Down - history forward
    if (raw === "\x1B[B") {
      if (this.historyIndex !== -1) {
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.buffer = this.history[this.historyIndex];
        } else {
          this.historyIndex = -1;
          this.buffer = this.savedBuffer;
        }
        this.cursorPos = this.buffer.length;
        this._dirty = true;
      }
      return null;
    }

    // Arrow Left
    if (raw === "\x1B[D") {
      if (this.cursorPos > 0) {
        this.cursorPos--;
        this._dirty = true;
      }
      return null;
    }

    // Arrow Right
    if (raw === "\x1B[C") {
      if (this.cursorPos < this.buffer.length) {
        this.cursorPos++;
        this._dirty = true;
      }
      return null;
    }

    // Home
    if (raw === "\x1B[H" || raw === "\x1BOH") {
      this.cursorPos = 0;
      this._dirty = true;
      return null;
    }

    // End
    if (raw === "\x1B[F" || raw === "\x1BOF") {
      this.cursorPos = this.buffer.length;
      this._dirty = true;
      return null;
    }

    // Tab - slash command completion
    if (raw === "\t") {
      if (this.buffer.startsWith("/")) {
        const hits = SLASH_COMMANDS.filter((c) => c.startsWith(this.buffer));
        if (hits.length === 1) {
          this.buffer = hits[0] + " ";
          this.cursorPos = this.buffer.length;
          this._dirty = true;
          return null;
        }
      }
      // Tab for agent switching (handled externally)
      return "tab";
    }

    // Skip other escape sequences
    if (raw.startsWith("\x1B")) return null;

    // Skip other control characters (except tab which is handled above)
    if (raw.charCodeAt(0) < 32) return null;

    // Regular character
    this.buffer = this.buffer.slice(0, this.cursorPos) + raw + this.buffer.slice(this.cursorPos);
    this.cursorPos += raw.length;
    this._dirty = true;
    return null;
  }

  /** Render input area: prompt + input line, status bar below */
  render(): string {
    const { x, y, width } = this._bounds;
    let buf = "";

    // Separator line above input
    buf += cursor.moveTo(y - 1, x) + style.dim + "─".repeat(width) + style.reset;

    // Input line
    const promptStr = this._multiline ? chalk.dim("... ") : this.prompt;
    const inputLine = promptStr + this.buffer;
    buf += cursor.moveTo(y, x) + padAnsi(inputLine, width);

    // Position the actual cursor
    const promptLen = visibleLength(promptStr);
    buf += cursor.moveTo(y, x + promptLen + this.cursorPos);

    // Status bar
    const statusLine = this._statusText || InputArea.defaultStatusText();
    buf += cursor.moveTo(y + 1, x) + padAnsi(statusLine, width);

    this._dirty = false;
    return buf;
  }

  private submitInput(input: string): void {
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(input);
    }
  }

  private loadHistory(): void {
    try {
      if (existsSync(HISTORY_FILE)) {
        this.history = readFileSync(HISTORY_FILE, "utf-8")
          .split("\n")
          .filter((l) => l.trim());
      }
    } catch {}
  }

  private addToHistory(line: string): void {
    if (!line.trim()) return;
    // Deduplicate consecutive
    if (this.history.length > 0 && this.history[this.history.length - 1] === line) return;
    this.history.push(line);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }
    this.saveHistory();
  }

  private saveHistory(): void {
    try {
      mkdirSync(join(homedir(), ".wabisabi"), { recursive: true });
      writeFileSync(HISTORY_FILE, this.history.slice(-MAX_HISTORY).join("\n") + "\n");
    } catch {}
  }
}
