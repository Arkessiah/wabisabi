/**
 * Output Panel
 *
 * Main scrollable panel that displays LLM streaming tokens, tool results,
 * markdown-rendered output, and system messages. Supports real-time
 * streaming by maintaining a "current line" buffer.
 */

import { Panel } from "./panel.js";
import { cursor, padAnsi, style, visibleLength, flush } from "./ansi.js";
import { renderMarkdown, hasMarkdown } from "../rendering/index.js";
import chalk from "chalk";

export class OutputPanel extends Panel {
  private currentLine = ""; // Accumulates streaming tokens
  private _isStreaming = false;

  constructor() {
    super();
    this._showBorder = false;
  }

  get isStreaming(): boolean { return this._isStreaming; }

  /** Start a new streaming session */
  startStream(): void {
    this._isStreaming = true;
    this.currentLine = "";
    this.appendLine(""); // blank line before response
  }

  /** Append a streaming token chunk */
  appendToken(chunk: string): void {
    for (const char of chunk) {
      if (char === "\n") {
        // Commit current line and start new one
        this.appendLine("  " + this.currentLine);
        this.currentLine = "";
      } else {
        this.currentLine += char;
      }
    }
    this.scrollToBottom();
    this._dirty = true;
  }

  /** End streaming - commit remaining text */
  endStream(): void {
    if (this.currentLine.length > 0) {
      this.appendLine("  " + this.currentLine);
      this.currentLine = "";
    }
    this._isStreaming = false;
    this._dirty = true;
  }

  /** Write a tool execution result */
  writeToolResult(toolName: string, title: string, success: boolean): void {
    const icon = success ? chalk.green("✓") : chalk.red("✗");
    this.appendLine(`  ${icon} ${chalk.bold(toolName)} ${chalk.dim(title)}`);
    this.scrollToBottom();
  }

  /** Write a status/info message */
  writeStatus(text: string): void {
    this.appendLine(`  ${text}`);
    this.scrollToBottom();
  }

  /** Write an error message */
  writeError(text: string): void {
    this.appendLine(`  ${chalk.red(text)}`);
    this.scrollToBottom();
  }

  /** Write markdown-rendered output */
  writeMarkdown(text: string): void {
    if (hasMarkdown(text)) {
      const rendered = renderMarkdown(text);
      for (const line of rendered.split("\n")) {
        this.appendLine(line);
      }
    } else {
      for (const line of text.split("\n")) {
        this.appendLine("  " + line);
      }
    }
    this.scrollToBottom();
  }

  /** Write a spinner line (overwrites last line if already a spinner) */
  writeSpinner(frame: string, text: string): void {
    const spinnerLine = `  ${chalk.cyan(frame)} ${chalk.dim(text)}`;
    // Replace last line if it was a spinner
    if (this.lines.length > 0 && this.lines[this.lines.length - 1].includes("⠋") ||
        this.lines.length > 0 && this.lines[this.lines.length - 1].includes("⠙") ||
        this.lines.length > 0 && this.lines[this.lines.length - 1].includes("⠹")) {
      this.lines[this.lines.length - 1] = spinnerLine;
    } else {
      this.appendLine(spinnerLine);
    }
    this.scrollToBottom();
    this._dirty = true;
  }

  /** Remove the last spinner line (when spinner stops) */
  clearSpinner(finalText?: string): void {
    // Remove last line if it's a spinner
    if (this.lines.length > 0) {
      const last = this.lines[this.lines.length - 1];
      if (last.includes("⠋") || last.includes("⠙") || last.includes("⠹") ||
          last.includes("⠸") || last.includes("⠼") || last.includes("⠴") ||
          last.includes("⠦") || last.includes("⠧") || last.includes("⠇") ||
          last.includes("⠏")) {
        this.lines.pop();
      }
    }
    if (finalText) {
      this.appendLine(finalText);
    }
    this.scrollToBottom();
    this._dirty = true;
  }

  /** Override render to handle streaming current line */
  render(): string {
    const { x, y, width, height } = this._bounds;
    let buf = "";

    // Get visible lines
    const totalLines = this.lines.length + (this._isStreaming && this.currentLine ? 1 : 0);
    const effectiveScroll = Math.min(this.scrollOffset, Math.max(0, totalLines - height));

    for (let row = 0; row < height; row++) {
      const lineIdx = effectiveScroll + row;
      let line = "";

      if (lineIdx < this.lines.length) {
        line = this.lines[lineIdx];
      } else if (lineIdx === this.lines.length && this._isStreaming && this.currentLine) {
        // Show current streaming line with cursor
        line = "  " + this.currentLine + chalk.dim("▋");
      }

      buf += cursor.moveTo(y + row, x) + padAnsi(line, width);
    }

    // Scroll indicator on right edge
    if (totalLines > height) {
      const scrollPct = Math.round((effectiveScroll / Math.max(1, totalLines - height)) * 100);
      const indicatorH = Math.max(1, Math.round((height / totalLines) * height));
      const indicatorY = Math.round((effectiveScroll / Math.max(1, totalLines - height)) * (height - indicatorH));

      for (let r = 0; r < height; r++) {
        const isThumb = r >= indicatorY && r < indicatorY + indicatorH;
        buf += cursor.moveTo(y + r, x + width - 1);
        buf += isThumb ? (style.dim + "█" + style.reset) : (style.dim + "░" + style.reset);
      }
    }

    this._dirty = false;
    return buf;
  }
}
