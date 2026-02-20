/**
 * Keybindings Handler
 *
 * Centralized raw-mode keyboard input handler.
 * Parses escape sequences and dispatches to registered callbacks.
 */

export type KeyAction =
  | "tab"
  | "shift-tab"
  | "ctrl-p"
  | "ctrl-t"
  | "ctrl-l"
  | "ctrl-s"
  | "ctrl-c"
  | "ctrl-1"
  | "ctrl-2"
  | "ctrl-3"
  | "page-up"
  | "page-down"
  | "escape"
  | "input"; // Regular input passed to InputArea

export type KeyHandler = (action: KeyAction, raw: string) => void;

export class KeybindingsManager {
  private handler: KeyHandler | null = null;
  private wasRaw = false;
  private active = false;
  private onKeyBound: ((data: Buffer) => void) | null = null;

  /** Set the key handler */
  setHandler(handler: KeyHandler): void {
    this.handler = handler;
  }

  /** Start capturing keyboard input in raw mode */
  start(): void {
    if (this.active) return;

    const stdin = process.stdin;
    this.wasRaw = stdin.isRaw ?? false;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    this.onKeyBound = (data: Buffer) => this.parseKey(data);
    stdin.on("data", this.onKeyBound);
    this.active = true;
  }

  /** Stop capturing and restore terminal state */
  stop(): void {
    if (!this.active) return;

    const stdin = process.stdin;
    if (this.onKeyBound) {
      stdin.removeListener("data", this.onKeyBound);
      this.onKeyBound = null;
    }
    if (stdin.isTTY) {
      stdin.setRawMode(this.wasRaw);
    }
    this.active = false;
  }

  private parseKey(data: Buffer): void {
    if (!this.handler) return;
    const s = data.toString();

    // Ctrl+C
    if (s === "\x03") {
      this.handler("ctrl-c", s);
      return;
    }

    // Ctrl+P
    if (s === "\x10") {
      this.handler("ctrl-p", s);
      return;
    }

    // Ctrl+T
    if (s === "\x14") {
      this.handler("ctrl-t", s);
      return;
    }

    // Ctrl+L
    if (s === "\x0C") {
      this.handler("ctrl-l", s);
      return;
    }

    // Ctrl+S
    if (s === "\x13") {
      this.handler("ctrl-s", s);
      return;
    }

    // Ctrl+1, Ctrl+2, Ctrl+3 (terminal-dependent, often sent as ESC sequences)
    if (s === "\x1B1" || s === "\x1B[1;5~") {
      this.handler("ctrl-1", s);
      return;
    }
    if (s === "\x1B2" || s === "\x1B[2;5~") {
      this.handler("ctrl-2", s);
      return;
    }
    if (s === "\x1B3" || s === "\x1B[3;5~") {
      this.handler("ctrl-3", s);
      return;
    }

    // Shift+Tab (reverse tab)
    if (s === "\x1B[Z") {
      this.handler("shift-tab", s);
      return;
    }

    // Page Up
    if (s === "\x1B[5~") {
      this.handler("page-up", s);
      return;
    }

    // Page Down
    if (s === "\x1B[6~") {
      this.handler("page-down", s);
      return;
    }

    // Escape (alone, not part of a sequence)
    if (s === "\x1B" && data.length === 1) {
      this.handler("escape", s);
      return;
    }

    // Everything else is regular input
    this.handler("input", s);
  }
}
