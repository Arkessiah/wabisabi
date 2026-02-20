/**
 * ANSI Escape Code Utilities
 *
 * Low-level terminal control for cursor positioning, clearing regions,
 * box drawing, and screen management. No external dependencies.
 */

// ── Cursor Movement ──────────────────────────────────────────

export const cursor = {
  /** Move cursor to absolute position (1-based) */
  moveTo(row: number, col: number): string {
    return `\x1B[${row};${col}H`;
  },

  /** Move cursor up N rows */
  up(n = 1): string {
    return `\x1B[${n}A`;
  },

  /** Move cursor down N rows */
  down(n = 1): string {
    return `\x1B[${n}B`;
  },

  /** Move cursor right N cols */
  right(n = 1): string {
    return `\x1B[${n}C`;
  },

  /** Move cursor left N cols */
  left(n = 1): string {
    return `\x1B[${n}D`;
  },

  /** Save cursor position */
  save(): string {
    return "\x1B[s";
  },

  /** Restore cursor position */
  restore(): string {
    return "\x1B[u";
  },

  /** Hide cursor */
  hide(): string {
    return "\x1B[?25l";
  },

  /** Show cursor */
  show(): string {
    return "\x1B[?25h";
  },

  /** Move to column N (1-based) */
  toCol(col: number): string {
    return `\x1B[${col}G`;
  },
};

// ── Screen Control ───────────────────────────────────────────

export const screen = {
  /** Clear entire screen */
  clear(): string {
    return "\x1B[2J\x1B[H";
  },

  /** Clear from cursor to end of screen */
  clearDown(): string {
    return "\x1B[J";
  },

  /** Clear from cursor to end of line */
  clearLine(): string {
    return "\x1B[K";
  },

  /** Clear entire line */
  clearEntireLine(): string {
    return "\x1B[2K";
  },

  /** Enter alternate screen buffer */
  enterAlt(): string {
    return "\x1B[?1049h";
  },

  /** Leave alternate screen buffer */
  leaveAlt(): string {
    return "\x1B[?1049l";
  },

  /** Set scroll region (1-based, inclusive) */
  setScrollRegion(top: number, bottom: number): string {
    return `\x1B[${top};${bottom}r`;
  },

  /** Reset scroll region to full screen */
  resetScrollRegion(): string {
    return "\x1B[r";
  },

  /** Scroll up N lines within scroll region */
  scrollUp(n = 1): string {
    return `\x1B[${n}S`;
  },

  /** Scroll down N lines within scroll region */
  scrollDown(n = 1): string {
    return `\x1B[${n}T`;
  },
};

// ── Text Styling (basic, for when chalk is overkill) ─────────

export const style = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  italic: "\x1B[3m",
  underline: "\x1B[4m",
  inverse: "\x1B[7m",

  // Foreground
  fg: {
    black: "\x1B[30m",
    red: "\x1B[31m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    blue: "\x1B[34m",
    magenta: "\x1B[35m",
    cyan: "\x1B[36m",
    white: "\x1B[37m",
    gray: "\x1B[90m",
  },

  // Background
  bg: {
    black: "\x1B[40m",
    red: "\x1B[41m",
    green: "\x1B[42m",
    yellow: "\x1B[43m",
    blue: "\x1B[44m",
    magenta: "\x1B[45m",
    cyan: "\x1B[46m",
    white: "\x1B[47m",
    gray: "\x1B[100m",
  },
};

// ── Box Drawing ──────────────────────────────────────────────

export const box = {
  // Single-line borders
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeLeft: "┤",
  teeRight: "├",
  teeUp: "┴",
  teeDown: "┬",
  cross: "┼",

  // Double-line borders
  dTopLeft: "╔",
  dTopRight: "╗",
  dBottomLeft: "╚",
  dBottomRight: "╝",
  dHorizontal: "═",
  dVertical: "║",

  // Mixed (single horizontal, double vertical)
  mTeeLeft: "╡",
  mTeeRight: "╞",
};

// ── Drawing Helpers ──────────────────────────────────────────

/**
 * Draw a horizontal line at a given row, from col to col+width.
 * Uses box.horizontal by default.
 */
export function drawHLine(row: number, col: number, width: number, char = box.horizontal): string {
  return cursor.moveTo(row, col) + char.repeat(width);
}

/**
 * Draw a vertical line at a given column, from row to row+height.
 * Uses box.vertical by default.
 */
export function drawVLine(row: number, col: number, height: number, char = box.vertical): string {
  let result = "";
  for (let r = 0; r < height; r++) {
    result += cursor.moveTo(row + r, col) + char;
  }
  return result;
}

/**
 * Fill a rectangular region with spaces (clear it).
 */
export function clearRegion(row: number, col: number, width: number, height: number): string {
  const blank = " ".repeat(width);
  let result = "";
  for (let r = 0; r < height; r++) {
    result += cursor.moveTo(row + r, col) + blank;
  }
  return result;
}

/**
 * Write text at a specific position, truncating to maxWidth.
 * Strips ANSI codes for length calculation but preserves them in output.
 */
export function writeAt(row: number, col: number, text: string, maxWidth: number): string {
  const visible = stripAnsi(text);
  if (visible.length <= maxWidth) {
    return cursor.moveTo(row, col) + text;
  }
  // Truncate - need to handle ANSI codes carefully
  return cursor.moveTo(row, col) + truncateAnsi(text, maxWidth - 1) + "…";
}

/**
 * Strip ANSI escape codes from a string to get visible length.
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Get the visible length of a string (excluding ANSI codes).
 */
export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Truncate a string with ANSI codes to a maximum visible length.
 */
export function truncateAnsi(str: string, maxLen: number): string {
  let visible = 0;
  let i = 0;
  while (i < str.length && visible < maxLen) {
    if (str[i] === "\x1B") {
      // Skip entire ANSI sequence
      const end = str.indexOf("m", i);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    visible++;
    i++;
  }
  // Include any trailing ANSI codes (reset sequences)
  return str.slice(0, i) + style.reset;
}

/**
 * Pad a string with ANSI codes to a specific visible width.
 */
export function padAnsi(str: string, width: number): string {
  const len = visibleLength(str);
  if (len >= width) return truncateAnsi(str, width);
  return str + " ".repeat(width - len);
}

// ── Terminal Size ────────────────────────────────────────────

export function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

// ── Batch Write ──────────────────────────────────────────────

/**
 * Write a batch of ANSI operations to stdout in one call.
 * This minimizes flicker by writing everything at once.
 */
export function flush(buffer: string): void {
  process.stdout.write(buffer);
}
