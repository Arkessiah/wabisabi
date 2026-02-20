/**
 * Workspace Trust Manager
 *
 * When wabisabi is executed in a directory, it asks the user for
 * permission to work there. Trusted directories are persisted in
 * ~/.wabisabi/trusted-workspaces.json so the prompt only appears once.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { z } from "zod";
import { askConfirm } from "../wizard/prompts.js";

const WABISABI_DIR = join(homedir(), ".wabisabi");
const TRUST_FILE = join(WABISABI_DIR, "trusted-workspaces.json");

// ── Schema ──────────────────────────────────────────────────

const TrustedWorkspaceSchema = z.object({
  path: z.string(),
  trustedAt: z.string(),
  alias: z.string().optional(),
});

const TrustStoreSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(TrustedWorkspaceSchema),
});

type TrustStore = z.infer<typeof TrustStoreSchema>;
type TrustedWorkspace = z.infer<typeof TrustedWorkspaceSchema>;

// ── Trust Manager ───────────────────────────────────────────

class WorkspaceTrustManager {
  private store: TrustStore = { version: 1, workspaces: [] };

  constructor() {
    this.load();
  }

  /** Check if a directory is trusted */
  isTrusted(dir: string): boolean {
    const normalized = resolve(dir);
    return this.store.workspaces.some((w) => normalized === w.path || normalized.startsWith(w.path + "/"));
  }

  /** Add a directory to the trust list */
  trust(dir: string, alias?: string): void {
    const normalized = resolve(dir);
    if (this.isTrusted(normalized)) return;

    this.store.workspaces.push({
      path: normalized,
      trustedAt: new Date().toISOString(),
      alias,
    });
    this.save();
  }

  /** Remove trust for a directory */
  revoke(dir: string): boolean {
    const normalized = resolve(dir);
    const before = this.store.workspaces.length;
    this.store.workspaces = this.store.workspaces.filter((w) => w.path !== normalized);
    if (this.store.workspaces.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  /** Get all trusted workspaces */
  list(): TrustedWorkspace[] {
    return [...this.store.workspaces];
  }

  /**
   * Ensure workspace is trusted. If not, prompt the user.
   * Returns true if trusted (existing or just granted), false if denied.
   */
  async ensureTrusted(dir: string): Promise<boolean> {
    const normalized = resolve(dir);

    // Home dir is always trusted
    if (normalized === homedir()) return true;

    if (this.isTrusted(normalized)) return true;

    console.log("");
    console.log(chalk.bold("  Workspace"));
    console.log(chalk.dim("  " + "-".repeat(50)));
    console.log(`  ${chalk.cyan(normalized)}`);
    console.log("");

    const granted = await askConfirm(
      "Allow wabisabi to work in this directory?",
      true,
    );

    if (granted) {
      this.trust(normalized);
      console.log(chalk.green("  + Workspace trusted"));
      console.log("");
      return true;
    }

    console.log(chalk.yellow("  - Permission denied. Exiting."));
    return false;
  }

  // ── Persistence ─────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(TRUST_FILE)) {
        const raw = JSON.parse(readFileSync(TRUST_FILE, "utf-8"));
        this.store = TrustStoreSchema.parse(raw);
      }
    } catch {
      this.store = { version: 1, workspaces: [] };
    }
  }

  private save(): void {
    try {
      mkdirSync(WABISABI_DIR, { recursive: true });
      writeFileSync(TRUST_FILE, JSON.stringify(this.store, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch {}
  }
}

export const workspaceTrust = new WorkspaceTrustManager();
