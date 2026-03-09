/**
 * Auto-Fix Loop Service
 *
 * Inspired by Karpathy's autoresearch: autonomous loop that
 * iterates on code to fix tests/build errors.
 *
 * Pattern: commit → fix → test → keep/revert
 * - Git as ratchet: only improvements advance HEAD
 * - Experiment log: prevents re-exploring dead ends
 * - Budget: max N attempts before giving up
 */

import { execSync } from "child_process";
import { ramManager } from "../ram/index.js";
import type { ExperimentEntry } from "../ram/schema.js";
import chalk from "chalk";

// ── Types ────────────────────────────────────────────────

export interface AutofixConfig {
  /** Max attempts before stopping (default: 5) */
  maxAttempts: number;
  /** Command to run tests (default: auto-detect) */
  testCommand: string;
  /** Working directory */
  cwd: string;
  /** Timeout per attempt in ms (default: 120000) */
  timeout: number;
}

export interface AutofixResult {
  success: boolean;
  attempts: number;
  experiments: ExperimentEntry[];
  finalMessage: string;
}

interface AttemptResult {
  passed: boolean;
  output: string;
  duration: number;
}

// ── Auto-detect test command ─────────────────────────────

export function detectTestCommand(cwd: string): string {
  try {
    const pkg = execSync("cat package.json", { cwd, encoding: "utf-8" });
    const parsed = JSON.parse(pkg);
    if (parsed.scripts?.test) {
      // Detect package manager
      try {
        execSync("which bun", { stdio: "ignore" });
        return "bun test";
      } catch {
        // fall through
      }
      return "npm test";
    }
  } catch {
    // not a node project
  }

  // Try common patterns
  const commands = [
    { check: "Cargo.toml", cmd: "cargo test" },
    { check: "go.mod", cmd: "go test ./..." },
    { check: "Makefile", cmd: "make test" },
    { check: "pytest.ini", cmd: "pytest" },
    { check: "pyproject.toml", cmd: "python -m pytest" },
  ];

  for (const { check, cmd } of commands) {
    try {
      execSync(`test -f ${check}`, { cwd, stdio: "ignore" });
      return cmd;
    } catch {
      continue;
    }
  }

  return "npm test";
}

// ── Git helpers ──────────────────────────────────────────

function gitCommit(cwd: string, message: string): string | null {
  try {
    execSync("git add -A", { cwd, stdio: "ignore" });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd,
      stdio: "ignore",
    });
    const hash = execSync("git rev-parse --short HEAD", {
      cwd,
      encoding: "utf-8",
    }).trim();
    return hash;
  } catch {
    return null;
  }
}

function gitRevert(cwd: string): boolean {
  try {
    execSync("git reset HEAD~1 --hard", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasUncommittedChanges(cwd: string): boolean {
  try {
    const status = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
    });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

// ── Run tests ────────────────────────────────────────────

function runTests(command: string, cwd: string, timeout: number): AttemptResult {
  const start = Date.now();
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      passed: true,
      output: output.slice(-500),
      duration: Date.now() - start,
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = (e.stdout || "") + (e.stderr || "") || e.message || "Unknown error";
    return {
      passed: false,
      output: output.slice(-500),
      duration: Date.now() - start,
    };
  }
}

// ── Main Loop ────────────────────────────────────────────

/**
 * Run the auto-fix loop.
 *
 * This is the "ratchet" pattern:
 * 1. Run tests to see current state
 * 2. If passing → done
 * 3. If failing → agent fixes → commit → test → keep/revert
 *
 * The `fixCallback` is called with the test output and must
 * return a description of the fix attempted. The actual fix
 * is done by the agent (BaseAgent calls tools before this returns).
 */
export async function runAutofixLoop(
  config: AutofixConfig,
  fixCallback: (testOutput: string, attempt: number) => Promise<string>,
  logCallback: (message: string) => void,
): Promise<AutofixResult> {
  const experiments: ExperimentEntry[] = [];
  let attempts = 0;

  logCallback(chalk.bold("\n  Auto-Fix Loop Started"));
  logCallback(chalk.dim(`  Command: ${config.testCommand}`));
  logCallback(chalk.dim(`  Max attempts: ${config.maxAttempts}\n`));

  // Initial test run
  logCallback(chalk.cyan("  [0] Running tests..."));
  const initial = runTests(config.testCommand, config.cwd, config.timeout);

  if (initial.passed) {
    logCallback(chalk.green("  ✓ Tests already passing. Nothing to fix."));
    return {
      success: true,
      attempts: 0,
      experiments,
      finalMessage: "Tests already passing",
    };
  }

  logCallback(chalk.yellow("  ✗ Tests failing. Starting fix loop.\n"));

  while (attempts < config.maxAttempts) {
    attempts++;
    logCallback(chalk.cyan(`  [${attempts}/${config.maxAttempts}] Attempting fix...`));

    // Let the agent fix the code
    const fixDescription = await fixCallback(
      initial.passed ? "" : initial.output,
      attempts,
    );

    // Check if there are changes to commit
    if (!hasUncommittedChanges(config.cwd)) {
      logCallback(chalk.yellow("  → No changes made. Skipping."));
      const exp = ramManager.logExperiment({
        description: fixDescription,
        result: "skipped",
        duration: 0,
      });
      experiments.push(exp);
      continue;
    }

    // Commit the fix attempt
    const commitMsg = `autofix: attempt ${attempts} - ${fixDescription}`;
    const hash = gitCommit(config.cwd, commitMsg);

    // Run tests
    logCallback(chalk.dim("  → Running tests..."));
    const result = runTests(config.testCommand, config.cwd, config.timeout);

    if (result.passed) {
      // Success! Keep the commit
      logCallback(chalk.green(`  ✓ Tests passing! Fix committed: ${hash}`));
      const exp = ramManager.logExperiment({
        description: fixDescription,
        result: "success",
        metric: `tests passed in ${result.duration}ms`,
        commitHash: hash ?? undefined,
        reverted: false,
        duration: result.duration,
      });
      experiments.push(exp);

      return {
        success: true,
        attempts,
        experiments,
        finalMessage: `Fixed in ${attempts} attempt(s). Commit: ${hash}`,
      };
    }

    // Failed — revert the commit
    logCallback(chalk.red(`  ✗ Tests still failing. Reverting ${hash}...`));
    gitRevert(config.cwd);

    const exp = ramManager.logExperiment({
      description: fixDescription,
      result: "fail",
      metric: result.output.slice(-100),
      commitHash: hash ?? undefined,
      reverted: true,
      duration: result.duration,
    });
    experiments.push(exp);

    // Check if same approach was tried before
    const alreadyTried = ramManager.wasAlreadyTried(fixDescription);
    if (alreadyTried) {
      logCallback(
        chalk.yellow(`  ⚠ Similar fix already tried and failed. Changing strategy.`),
      );
    }
  }

  logCallback(chalk.red(`\n  ✗ Auto-fix exhausted ${config.maxAttempts} attempts.`));

  return {
    success: false,
    attempts,
    experiments,
    finalMessage: `Failed after ${attempts} attempts. Manual intervention needed.`,
  };
}
