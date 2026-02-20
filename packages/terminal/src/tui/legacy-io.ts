/**
 * Legacy Terminal I/O
 *
 * Wraps the original readline + process.stdout behavior 1:1.
 * Used as fallback when --no-tui flag is set or stdout is not a TTY.
 */

import type {
  TerminalIO,
  HeaderInfo,
  SpinnerHandle,
  PaletteItem,
  PaletteResult,
} from "./types.js";
import type { ActiveTask, PinnedItem } from "../ram/schema.js";
import chalk from "chalk";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const SLASH_COMMANDS = [
  "/help", "/clear", "/model", "/status", "/tools", "/approve",
  "/compact", "/export", "/menu", "/session", "/sessions",
  "/soul", "/ram", "/pin", "/pins", "/unpin", "/device",
  "/hat", "/profile", "/style", "/reset",
];

function slashCompleter(line: string): [string[], string] {
  if (!line.startsWith("/")) return [[], line];
  const hits = SLASH_COMMANDS.filter((c) => c.startsWith(line));
  return [hits.length ? hits : SLASH_COMMANDS, line];
}

export class LegacyTerminalIO implements TerminalIO {
  readonly isTui = false;
  private rl: import("readline").Interface | null = null;
  private history: string[] = [];

  async init(): Promise<void> {
    // History loading is handled externally by BaseAgent
  }

  destroy(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  writeOutput(text: string): void {
    console.log(text);
  }

  writeStreamToken(chunk: string): void {
    process.stdout.write(chunk);
  }

  writeToolResult(toolName: string, title: string, success: boolean): void {
    const icon = success ? chalk.green("✓") : chalk.red("✗");
    console.log(`  ${icon} ${chalk.bold(toolName)} ${chalk.dim(title)}`);
  }

  writeStatus(text: string): void {
    console.log(text);
  }

  writeError(text: string): void {
    console.log(chalk.red(text));
  }

  async readInput(prompt: string): Promise<string> {
    if (!this.rl) {
      const readline = await import("readline");
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        history: this.history,
        historySize: 500,
        completer: slashCompleter,
      });
    }
    return new Promise((resolve) => this.rl!.question(prompt, resolve));
  }

  async confirm(message: string): Promise<boolean> {
    const answer = await this.readInput(`  ${chalk.yellow("?")} ${message} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  }

  updateHeader(_info: Partial<HeaderInfo>): void {
    // No-op in legacy mode (header is printed once at start)
  }

  updateTaskQueue(_tasks: ActiveTask[]): void {
    // No-op in legacy mode
  }

  updatePins(_pins: PinnedItem[]): void {
    // No-op in legacy mode
  }

  showSpinner(text: string): SpinnerHandle {
    let i = 0;
    const timer = setInterval(() => {
      process.stdout.write(
        `\r${chalk.cyan(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${chalk.dim(text)}`,
      );
    }, 80);

    return {
      stop(finalText?: string) {
        clearInterval(timer);
        process.stdout.write(`\r${" ".repeat(text.length + 4)}\r`);
        if (finalText) process.stdout.write(finalText + "\n");
      },
      update(newText: string) {
        text = newText;
      },
    };
  }

  async openCommandPalette(_items: PaletteItem[]): Promise<PaletteResult | null> {
    // In legacy mode, command palette is not supported
    console.log(chalk.dim("  Command palette not available in legacy mode. Use slash commands."));
    return null;
  }

  clearOutput(): void {
    console.clear();
  }

  /** Set history array (called from BaseAgent) */
  setHistory(history: string[]): void {
    this.history = history;
  }
}
