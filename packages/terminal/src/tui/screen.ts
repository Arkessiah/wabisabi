/**
 * Screen Manager
 *
 * Handles terminal size detection, resize events, and alternate screen buffer.
 * Provides a clean abstraction over raw terminal state.
 */

import { cursor, screen, getTerminalSize, flush } from "./ansi.js";
import type { Bounds, LayoutConfig } from "./types.js";
import { DEFAULT_LAYOUT } from "./types.js";

export class ScreenManager {
  private _cols = 80;
  private _rows = 24;
  private _inAltBuffer = false;
  private _resizeListeners: (() => void)[] = [];
  private _layout: LayoutConfig;

  constructor(layout: LayoutConfig = DEFAULT_LAYOUT) {
    this._layout = layout;
    this.updateSize();
  }

  get cols(): number { return this._cols; }
  get rows(): number { return this._rows; }
  get layout(): LayoutConfig { return this._layout; }

  /** Update cached terminal dimensions */
  updateSize(): void {
    const { cols, rows } = getTerminalSize();
    this._cols = Math.max(cols, this._layout.minWidth);
    this._rows = Math.max(rows, this._layout.minHeight);
  }

  /** Start listening for resize events */
  startResizeListener(): void {
    process.stdout.on("resize", () => {
      this.updateSize();
      for (const listener of this._resizeListeners) {
        listener();
      }
    });
  }

  /** Register a resize callback */
  onResize(callback: () => void): () => void {
    this._resizeListeners.push(callback);
    return () => {
      this._resizeListeners = this._resizeListeners.filter((l) => l !== callback);
    };
  }

  /** Enter alternate screen buffer (preserves original terminal content) */
  enterAltBuffer(): void {
    if (this._inAltBuffer) return;
    flush(screen.enterAlt() + cursor.hide() + screen.clear());
    this._inAltBuffer = true;
  }

  /** Leave alternate screen buffer (restores original terminal content) */
  leaveAltBuffer(): void {
    if (!this._inAltBuffer) return;
    flush(screen.leaveAlt() + cursor.show());
    this._inAltBuffer = false;
  }

  /** Toggle task panel visibility */
  toggleTaskPanel(): void {
    this._layout = {
      ...this._layout,
      taskPanelVisible: !this._layout.taskPanelVisible,
    };
  }

  get taskPanelVisible(): boolean {
    return this._layout.taskPanelVisible;
  }

  // ── Layout Calculations ──────────────────────────────────

  /** Calculate header panel bounds */
  getHeaderBounds(): Bounds {
    return {
      x: 1,
      y: 1,
      width: this._cols,
      height: this._layout.headerHeight,
    };
  }

  /** Calculate main output panel bounds */
  getOutputBounds(): Bounds {
    const taskWidth = this._layout.taskPanelVisible ? this._layout.taskPanelWidth : 0;
    return {
      x: 1,
      y: this._layout.headerHeight + 1, // below header + separator
      width: this._cols - taskWidth - (taskWidth > 0 ? 1 : 0), // -1 for vertical divider
      height: this._rows - this._layout.headerHeight - this._layout.inputHeight - 2, // -2 for separators
    };
  }

  /** Calculate task panel bounds */
  getTaskPanelBounds(): Bounds {
    if (!this._layout.taskPanelVisible) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const outputBounds = this.getOutputBounds();
    return {
      x: this._cols - this._layout.taskPanelWidth + 1,
      y: this._layout.headerHeight + 1,
      width: this._layout.taskPanelWidth,
      height: outputBounds.height,
    };
  }

  /** Calculate input area bounds */
  getInputBounds(): Bounds {
    return {
      x: 1,
      y: this._rows - this._layout.inputHeight,
      width: this._cols,
      height: this._layout.inputHeight,
    };
  }

  /** Calculate command palette overlay bounds (centered) */
  getPaletteBounds(): Bounds {
    const width = Math.min(60, this._cols - 4);
    const height = Math.min(20, this._rows - 4);
    return {
      x: Math.floor((this._cols - width) / 2) + 1,
      y: Math.floor((this._rows - height) / 2) + 1,
      width,
      height,
    };
  }
}
