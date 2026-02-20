/**
 * Panel Base Class
 *
 * A rectangular region of the terminal with a scrollable line buffer.
 * All TUI panels (header, output, task, input) extend this.
 */

import {
  cursor,
  clearRegion,
  writeAt,
  stripAnsi,
  visibleLength,
  padAnsi,
  flush,
  style,
  box,
} from "./ansi.js";
import type { Bounds } from "./types.js";

export class Panel {
  protected lines: string[] = [];
  protected scrollOffset = 0;
  protected _bounds: Bounds = { x: 1, y: 1, width: 80, height: 24 };
  protected _dirty = true;
  protected _title = "";
  protected _showBorder = false;

  get bounds(): Bounds { return this._bounds; }

  setBounds(bounds: Bounds): void {
    if (
      bounds.x !== this._bounds.x ||
      bounds.y !== this._bounds.y ||
      bounds.width !== this._bounds.width ||
      bounds.height !== this._bounds.height
    ) {
      this._bounds = bounds;
      this._dirty = true;
    }
  }

  get dirty(): boolean { return this._dirty; }
  markDirty(): void { this._dirty = true; }
  markClean(): void { this._dirty = false; }

  /** Get visible height (accounting for borders) */
  get visibleHeight(): number {
    return this._showBorder
      ? Math.max(0, this._bounds.height - 2)
      : this._bounds.height;
  }

  /** Get visible width (accounting for borders) */
  get visibleWidth(): number {
    return this._showBorder
      ? Math.max(0, this._bounds.width - 2)
      : this._bounds.width;
  }

  /** Get total number of lines in buffer */
  get lineCount(): number { return this.lines.length; }

  /** Maximum scroll offset */
  get maxScroll(): number {
    return Math.max(0, this.lines.length - this.visibleHeight);
  }

  /** Append a line to the buffer */
  appendLine(line: string): void {
    this.lines.push(line);
    // Auto-scroll to bottom if we were at the bottom
    if (this.scrollOffset >= this.maxScroll - 1) {
      this.scrollOffset = this.maxScroll;
    }
    this._dirty = true;
  }

  /** Append text, splitting into lines by width */
  appendWrapped(text: string): void {
    const maxW = this.visibleWidth;
    for (const rawLine of text.split("\n")) {
      const visible = stripAnsi(rawLine);
      if (visible.length <= maxW) {
        this.appendLine(rawLine);
      } else {
        // Simple word-wrap on visible characters
        let remaining = rawLine;
        while (visibleLength(remaining) > maxW) {
          // Find a break point
          let breakAt = maxW;
          const stripped = stripAnsi(remaining);
          const spaceIdx = stripped.lastIndexOf(" ", maxW);
          if (spaceIdx > maxW * 0.4) {
            breakAt = spaceIdx;
          }
          // Need to find the actual index in the ANSI string
          let visCount = 0;
          let actualIdx = 0;
          while (actualIdx < remaining.length && visCount < breakAt) {
            if (remaining[actualIdx] === "\x1B") {
              const end = remaining.indexOf("m", actualIdx);
              if (end !== -1) { actualIdx = end + 1; continue; }
            }
            visCount++;
            actualIdx++;
          }
          this.appendLine(remaining.slice(0, actualIdx));
          remaining = remaining.slice(actualIdx);
        }
        if (remaining.length > 0) {
          this.appendLine(remaining);
        }
      }
    }
  }

  /** Set all lines at once (replaces buffer) */
  setLines(lines: string[]): void {
    this.lines = lines;
    this.scrollOffset = 0;
    this._dirty = true;
  }

  /** Clear the buffer */
  clear(): void {
    this.lines = [];
    this.scrollOffset = 0;
    this._dirty = true;
  }

  /** Scroll up by N lines */
  scrollUp(n = 1): void {
    const old = this.scrollOffset;
    this.scrollOffset = Math.max(0, this.scrollOffset - n);
    if (old !== this.scrollOffset) this._dirty = true;
  }

  /** Scroll down by N lines */
  scrollDown(n = 1): void {
    const old = this.scrollOffset;
    this.scrollOffset = Math.min(this.maxScroll, this.scrollOffset + n);
    if (old !== this.scrollOffset) this._dirty = true;
  }

  /** Scroll to bottom */
  scrollToBottom(): void {
    const old = this.scrollOffset;
    this.scrollOffset = this.maxScroll;
    if (old !== this.scrollOffset) this._dirty = true;
  }

  /** Cap buffer at maxLines, removing oldest */
  trimBuffer(maxLines = 10000): void {
    if (this.lines.length > maxLines) {
      const remove = this.lines.length - maxLines + 2000;
      this.lines = this.lines.slice(remove);
      this.scrollOffset = Math.max(0, this.scrollOffset - remove);
      this._dirty = true;
    }
  }

  /** Render the panel to a string buffer (for batch writing) */
  render(): string {
    const { x, y, width, height } = this._bounds;
    let buf = "";

    if (this._showBorder) {
      buf += this.renderBorder();
      // Render content inside border
      const contentX = x + 1;
      const contentY = y + 1;
      const contentW = width - 2;
      const contentH = height - 2;

      for (let row = 0; row < contentH; row++) {
        const lineIdx = this.scrollOffset + row;
        const line = lineIdx < this.lines.length ? this.lines[lineIdx] : "";
        buf += writeAt(contentY + row, contentX, padAnsi(line, contentW), contentW);
      }
    } else {
      // No border - render directly
      for (let row = 0; row < height; row++) {
        const lineIdx = this.scrollOffset + row;
        const line = lineIdx < this.lines.length ? this.lines[lineIdx] : "";
        buf += writeAt(y + row, x, padAnsi(line, width), width);
      }
    }

    // Scroll indicator
    if (this.lines.length > this.visibleHeight && this._showBorder) {
      const scrollPct = this.maxScroll > 0
        ? Math.round((this.scrollOffset / this.maxScroll) * 100)
        : 100;
      const indicator = `${style.dim}${scrollPct}%${style.reset}`;
      buf += writeAt(y, x + width - 6, indicator, 5);
    }

    this._dirty = false;
    return buf;
  }

  /** Render border */
  private renderBorder(): string {
    const { x, y, width, height } = this._bounds;
    let buf = "";

    // Top border
    const titleStr = this._title ? ` ${this._title} ` : "";
    const topLine = box.topLeft
      + box.horizontal
      + titleStr
      + box.horizontal.repeat(Math.max(0, width - titleStr.length - 3))
      + box.topRight;
    buf += cursor.moveTo(y, x) + style.dim + topLine + style.reset;

    // Side borders
    for (let r = 1; r < height - 1; r++) {
      buf += cursor.moveTo(y + r, x) + style.dim + box.vertical + style.reset;
      buf += cursor.moveTo(y + r, x + width - 1) + style.dim + box.vertical + style.reset;
    }

    // Bottom border
    const botLine = box.bottomLeft
      + box.horizontal.repeat(Math.max(0, width - 2))
      + box.bottomRight;
    buf += cursor.moveTo(y + height - 1, x) + style.dim + botLine + style.reset;

    return buf;
  }
}
