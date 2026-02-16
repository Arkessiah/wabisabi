/**
 * Watch Mode
 *
 * Monitors file changes and re-runs tasks automatically.
 * Uses fs.watch for cross-platform file watching.
 */

import { watch, type FSWatcher } from "fs";
import { resolve, relative, extname } from "path";
import { ApiClient, type CLIOptions, type ChatMessage } from "../clients/api-client.js";
import { toolRegistry, type ToolSpec } from "../tools/index.js";
import { projectContext } from "../context/index.js";
import chalk from "chalk";

const DEFAULT_IGNORE = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  ".cache", ".parcel-cache", "coverage", ".nyc_output",
]);

const WATCHED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go",
  ".java", ".rb", ".css", ".scss", ".html", ".json",
  ".md", ".yaml", ".yml", ".toml",
]);

const DEBOUNCE_MS = 500;

interface WatchOptions {
  patterns?: string[];
  ignore?: string[];
  command?: string;
  onChangePrompt?: string;
}

export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private client: ApiClient;
  private opts: CLIOptions;
  private debounceTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(opts: CLIOptions) {
    this.opts = opts;
    this.client = new ApiClient(opts);
  }

  async start(watchOpts: WatchOptions = {}): Promise<void> {
    await projectContext.initialize();
    const root = projectContext.getProjectRoot();

    console.log(chalk.bold.cyan("\n  Watch Mode"));
    console.log(chalk.dim("  ─────────────────────────────────"));
    console.log(`  Watching: ${root}`);
    console.log(`  Press Ctrl+C to stop\n`);

    const ignoreSet = new Set([
      ...DEFAULT_IGNORE,
      ...(watchOpts.ignore || []),
    ]);

    this.running = true;

    // Watch root directory recursively
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename || !this.running) return;

        // Check ignore patterns
        const parts = filename.split("/");
        if (parts.some((p) => ignoreSet.has(p))) return;

        // Check extension
        const ext = extname(filename);
        if (!WATCHED_EXTENSIONS.has(ext)) return;

        // Debounce rapid changes
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.onFileChange(filename, root, watchOpts);
        }, DEBOUNCE_MS);
      });

      this.watchers.push(watcher);
    } catch (err) {
      console.error(chalk.red(`  Watch error: ${err instanceof Error ? err.message : err}`));
      return;
    }

    // Keep process alive
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        this.stop();
        resolve();
      });
    });
  }

  private async onFileChange(
    filename: string,
    root: string,
    watchOpts: WatchOptions,
  ): Promise<void> {
    const relPath = relative(root, resolve(root, filename));
    const timestamp = new Date().toLocaleTimeString();

    console.log(chalk.yellow(`\n  [${timestamp}] Changed: ${relPath}`));

    if (watchOpts.command) {
      // Run a shell command on change
      const { spawn } = await import("child_process");
      const proc = spawn("sh", ["-c", watchOpts.command], {
        cwd: root,
        stdio: "inherit",
      });
      proc.on("close", (code) => {
        if (code === 0) {
          console.log(chalk.green(`  Command completed successfully.`));
        } else {
          console.log(chalk.red(`  Command exited with code ${code}.`));
        }
      });
    } else if (watchOpts.onChangePrompt) {
      // Send prompt to LLM about the change
      const prompt = watchOpts.onChangePrompt
        .replace("{file}", relPath)
        .replace("{path}", resolve(root, filename));

      const contextPrompt = projectContext.getSystemPrompt();
      const toolSpecs = toolRegistry.toToolSpecs(["read", "grep", "glob", "list"]);
      const messages: ChatMessage[] = [
        { role: "system", content: `You are a coding assistant.\n\n${contextPrompt}` },
        { role: "user", content: prompt },
      ];

      try {
        const response = await this.client.chatWithTools(messages, toolSpecs);
        const content = response.choices[0]?.message?.content;
        if (content) {
          console.log(chalk.dim("  ") + content.slice(0, 200));
        }
      } catch (err) {
        console.error(chalk.dim(`  LLM error: ${err instanceof Error ? err.message : err}`));
      }
    } else {
      console.log(chalk.dim(`  File changed. No action configured.`));
      console.log(chalk.dim(`  Use --command to run a command on change.`));
    }
  }

  stop(): void {
    this.running = false;
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    console.log(chalk.dim("\n  Watch mode stopped."));
  }
}

export async function watchMode(opts: CLIOptions, watchOpts: WatchOptions = {}): Promise<void> {
  const watcher = new FileWatcher(opts);
  await watcher.start(watchOpts);
}
