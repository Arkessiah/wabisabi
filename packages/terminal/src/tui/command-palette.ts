/**
 * Command Palette
 *
 * Centered overlay triggered by Ctrl+P.
 * Shows: agents, models, token stats, providers, sessions, profiles.
 * Supports fuzzy search filtering and keyboard navigation.
 */

import { cursor, style, box, padAnsi, clearRegion, visibleLength, flush } from "./ansi.js";
import type { Bounds, PaletteItem, PaletteResult, PaletteSection } from "./types.js";
import chalk from "chalk";

export class CommandPalette {
  private items: PaletteItem[] = [];
  private filtered: PaletteItem[] = [];
  private searchQuery = "";
  private selectedIndex = 0;
  private scrollOffset = 0;
  private bounds: Bounds = { x: 10, y: 5, width: 60, height: 20 };
  private _resolve: ((result: PaletteResult | null) => void) | null = null;
  private _savedRegion = ""; // Not used directly, alternate screen handles this

  /** Open the palette with items, returns the selection or null on cancel */
  open(items: PaletteItem[], bounds: Bounds): Promise<PaletteResult | null> {
    this.items = items;
    this.filtered = items;
    this.searchQuery = "";
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.bounds = bounds;

    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /** Handle a key event. Returns true if palette consumed the key */
  handleKey(raw: string): boolean {
    // Escape - close
    if (raw === "\x1B" && raw.length === 1) {
      this.close(null);
      return true;
    }

    // Enter - select
    if (raw === "\r" || raw === "\n") {
      if (this.filtered.length > 0) {
        const item = this.filtered[this.selectedIndex];
        this.close({ section: item.section, itemId: item.id });
      } else {
        this.close(null);
      }
      return true;
    }

    // Arrow Up
    if (raw === "\x1B[A") {
      if (this.selectedIndex > 0) this.selectedIndex--;
      return true;
    }

    // Arrow Down
    if (raw === "\x1B[B") {
      if (this.selectedIndex < this.filtered.length - 1) this.selectedIndex++;
      return true;
    }

    // Backspace
    if (raw === "\x7F" || raw === "\b") {
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.applyFilter();
      }
      return true;
    }

    // Regular character - add to search
    if (raw.length === 1 && raw.charCodeAt(0) >= 32) {
      this.searchQuery += raw;
      this.applyFilter();
      return true;
    }

    return true; // consume all keys while palette is open
  }

  /** Render the palette overlay */
  render(): string {
    const { x, y, width, height } = this.bounds;
    let buf = "";

    // Clear the palette area
    buf += clearRegion(y, x, width, height);

    // Draw border
    const title = " Command Palette ";
    const topLine = box.topLeft + box.horizontal
      + title
      + box.horizontal.repeat(Math.max(0, width - title.length - 3))
      + box.topRight;
    buf += cursor.moveTo(y, x) + chalk.cyan(topLine);

    for (let r = 1; r < height - 1; r++) {
      buf += cursor.moveTo(y + r, x) + chalk.dim(box.vertical);
      buf += cursor.moveTo(y + r, x + width - 1) + chalk.dim(box.vertical);
    }

    const botLine = box.bottomLeft + box.horizontal.repeat(Math.max(0, width - 2)) + box.bottomRight;
    buf += cursor.moveTo(y + height - 1, x) + chalk.dim(botLine);

    // Search input
    const searchLine = ` ${chalk.green(">")} ${this.searchQuery}${chalk.dim("▋")}`;
    buf += cursor.moveTo(y + 1, x + 1) + padAnsi(searchLine, width - 2);

    // Separator
    buf += cursor.moveTo(y + 2, x + 1) + chalk.dim("─".repeat(width - 2));

    // Build all visual rows (section headers + items)
    const contentH = height - 4; // -2 border -1 search -1 separator

    type VisualRow = { type: "section"; title: string } | { type: "item"; index: number; item: PaletteItem };
    const rows: VisualRow[] = [];
    let currentSection = "";
    let selectedVisualRow = 0;

    for (let i = 0; i < this.filtered.length; i++) {
      const item = this.filtered[i];
      if (item.section !== currentSection) {
        currentSection = item.section;
        rows.push({ type: "section", title: currentSection.charAt(0).toUpperCase() + currentSection.slice(1) });
      }
      if (i === this.selectedIndex) selectedVisualRow = rows.length;
      rows.push({ type: "item", index: i, item });
    }

    // Adjust scroll so selected item is always visible
    if (selectedVisualRow < this.scrollOffset) {
      this.scrollOffset = selectedVisualRow;
    } else if (selectedVisualRow >= this.scrollOffset + contentH) {
      this.scrollOffset = selectedVisualRow - contentH + 1;
    }

    // Render visible rows
    const visibleEnd = Math.min(rows.length, this.scrollOffset + contentH);
    let row = 0;
    for (let vi = this.scrollOffset; vi < visibleEnd; vi++) {
      const vr = rows[vi];
      if (vr.type === "section") {
        buf += cursor.moveTo(y + 3 + row, x + 1) + chalk.bold.cyan(` ${vr.title}`);
        buf += " ".repeat(Math.max(0, width - vr.title.length - 4));
      } else {
        const isSelected = vr.index === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan("▶") : " ";
        const icon = vr.item.icon || " ";
        const activeMarker = vr.item.active ? chalk.green(" ✓") : "";
        const label = `${prefix} ${icon} ${vr.item.label}${activeMarker}`;
        const desc = vr.item.description ? chalk.dim(` ${vr.item.description}`) : "";

        const line = isSelected
          ? style.bg.gray + padAnsi(`${label}${desc}`, width - 2) + style.reset
          : padAnsi(`${label}${desc}`, width - 2);

        buf += cursor.moveTo(y + 3 + row, x + 1) + line;
      }
      row++;
    }

    // Scroll indicators
    if (this.scrollOffset > 0) {
      buf += cursor.moveTo(y + 3, x + width - 2) + chalk.cyan("▲");
    }
    if (visibleEnd < rows.length) {
      buf += cursor.moveTo(y + 2 + contentH, x + width - 2) + chalk.cyan("▼");
    }

    // Fill remaining rows
    for (; row < contentH; row++) {
      buf += cursor.moveTo(y + 3 + row, x + 1) + " ".repeat(width - 2);
    }

    return buf;
  }

  private applyFilter(): void {
    if (!this.searchQuery) {
      this.filtered = this.items;
    } else {
      const q = this.searchQuery.toLowerCase();
      this.filtered = this.items.filter((item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.section.includes(q)
      );
    }
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
    this.scrollOffset = 0;
  }

  private close(result: PaletteResult | null): void {
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(result);
    }
  }

  get isOpen(): boolean {
    return this._resolve !== null;
  }
}
