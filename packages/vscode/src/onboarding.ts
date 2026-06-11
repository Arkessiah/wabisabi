/**
 * VS Code Onboarding
 *
 * Mirrors the CLI onboarding flow using VS Code native UI. Auth tokens are
 * written to ~/.wabisabi/auth.json (encrypted) so the CLI and the extension
 * share a single session — log in once, work in either surface.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execFileSync } from "child_process";
import {
  ONBOARDING_MARKER,
  PROVIDER_STRATEGIES,
  type ProviderStrategy,
  SUBSTRATUM_API_URL,
} from "@wabisabi/core";
import type { WabiSabiConfig } from "./config";

const WABISABI_DIR = path.join(os.homedir(), ".wabisabi");
const AUTH_FILE = path.join(WABISABI_DIR, "auth.json");

export async function checkFirstRun(
  _context: vscode.ExtensionContext,
  _config: WabiSabiConfig,
): Promise<void> {
  if (fs.existsSync(ONBOARDING_MARKER)) return;
  const choice = await vscode.window.showInformationMessage(
    "Welcome to WabiSabi! Set up your account and providers to get started.",
    "Run Setup",
    "Later",
  );
  if (choice === "Run Setup") {
    await vscode.commands.executeCommand("wabisabi.onboarding");
  }
}

export async function runOnboardingVSCode(config: WabiSabiConfig): Promise<void> {
  // ── Step 1: Account ────────────────────────────────────────────
  const accountChoice = await vscode.window.showQuickPick(
    [
      {
        label: "Sign in with email + password",
        description: "Direct login against your Substratum backend",
        id: "password" as const,
      },
      {
        label: "I have an API key",
        description: "Paste an existing API key / bearer token",
        id: "apikey" as const,
      },
      {
        label: "Register in browser",
        description: "Open the WabiSabi web app to create an account",
        id: "register" as const,
      },
      {
        label: "Skip for now",
        description: "Use local Ollama only (no cloud features)",
        id: "skip" as const,
      },
    ],
    { placeHolder: "WabiSabi account" },
  );

  if (!accountChoice) return;

  if (accountChoice.id === "register") {
    vscode.env.openExternal(vscode.Uri.parse("https://wabisabi.dev/register"));
    await vscode.window.showInformationMessage(
      "After registering, run WabiSabi: Run Onboarding again to sign in.",
    );
    return;
  }

  if (accountChoice.id === "password") {
    const ok = await loginWithPassword(config);
    if (!ok) return; // User aborted or login failed; don't mark onboarded.
  } else if (accountChoice.id === "apikey") {
    const ok = await pasteApiKey(config);
    if (!ok) return;
  }

  // ── Step 2: Provider strategy ──────────────────────────────────
  const strategyItems = PROVIDER_STRATEGIES.map((s: ProviderStrategy) => ({
    label: s.label,
    description: s.desc,
    id: s.id,
  }));

  const strategy = await vscode.window.showQuickPick(strategyItems, {
    placeHolder: "Select provider strategy",
  });

  if (strategy) {
    config.setStrategy((strategy as any).id);
  }

  // ── Step 3: Default model ──────────────────────────────────────
  const model = await vscode.window.showInputBox({
    prompt: "Default AI model",
    value: config.model,
    placeHolder: "llama3.2",
  });
  if (model) config.setModel(model);

  // Mark onboarded.
  fs.mkdirSync(WABISABI_DIR, { recursive: true });
  fs.writeFileSync(ONBOARDING_MARKER, new Date().toISOString(), "utf-8");

  vscode.window.showInformationMessage("WabiSabi setup complete!");
}

// ── Helpers ──────────────────────────────────────────────────────

async function loginWithPassword(config: WabiSabiConfig): Promise<boolean> {
  const substratumUrl =
    config.substratumUrl ||
    process.env.SUBSTRATUM_URL ||
    SUBSTRATUM_API_URL;

  const email = await vscode.window.showInputBox({
    prompt: `Email to sign in at ${substratumUrl}`,
    placeHolder: "you@example.com",
    ignoreFocusOut: true,
  });
  if (!email) return false;

  const password = await vscode.window.showInputBox({
    prompt: "Password",
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) return false;

  try {
    const res = await fetch(`${substratumUrl}/terminal/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        cliVersion: "vscode-0.1.0",
      }),
    });
    if (!res.ok) {
      await vscode.window.showErrorMessage(
        `Sign-in failed: ${res.status} ${res.statusText}`,
      );
      return false;
    }
    const data = (await res.json()) as {
      token: string;
      refreshToken?: string;
      sessionId?: string;
      expiresIn?: number;
      user?: { id: string; email: string };
    };

    saveEncryptedAuth({
      provider: "substratum",
      accessToken: data.token,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      expiresAt: decodeJwtExp(data.token),
      userId: data.user?.id,
      email: data.user?.email ?? email,
    });

    await vscode.window.showInformationMessage(
      `Signed in as ${data.user?.email ?? email}`,
    );
    return true;
  } catch (e: any) {
    await vscode.window.showErrorMessage(
      `Sign-in failed: ${e?.message ?? "network error"}`,
    );
    return false;
  }
}

async function pasteApiKey(_config: WabiSabiConfig): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    prompt: "Paste your API key / token",
    password: true,
    ignoreFocusOut: true,
  });
  if (!key || key.length < 10) return false;
  saveEncryptedAuth({
    provider: "substratum",
    accessToken: key,
  });
  return true;
}

// ── Encryption (matches packages/terminal/src/auth/index.ts) ─────

const AUTH_ALGO = "aes-256-gcm";
const AUTH_SALT = "wabisabi-auth-v1";
const KEYCHAIN_SERVICE = "com.wabisabi.terminal";
const KEYCHAIN_ACCOUNT = "encryption-key";

function legacyMachineKey(): Buffer {
  const seed = `${os.hostname()}:${os.homedir()}:${process.getuid?.() ?? 0}`;
  return crypto.pbkdf2Sync(seed, AUTH_SALT, 100_000, 32, "sha512");
}

function readKeychainKey(): Buffer | null {
  try {
    const platform = os.platform();
    if (platform === "darwin") {
      const out = execFileSync(
        "security",
        [
          "find-generic-password",
          "-a",
          KEYCHAIN_ACCOUNT,
          "-s",
          KEYCHAIN_SERVICE,
          "-w",
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const hex = out.toString().trim();
      return hex ? Buffer.from(hex, "hex") : null;
    }
    if (platform === "linux") {
      const out = execFileSync(
        "secret-tool",
        [
          "lookup",
          "service",
          KEYCHAIN_SERVICE,
          "account",
          KEYCHAIN_ACCOUNT,
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const hex = out.toString().trim();
      return hex ? Buffer.from(hex, "hex") : null;
    }
  } catch {
    /* keychain unavailable */
  }
  return null;
}

function getKey(): Buffer {
  return readKeychainKey() ?? legacyMachineKey();
}

function encryptAuth(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AUTH_ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

interface StoredAuth {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
  expiresAt?: number;
  userId?: string;
  email?: string;
}

function saveEncryptedAuth(auth: StoredAuth): void {
  fs.mkdirSync(WABISABI_DIR, { recursive: true });
  const packed = encryptAuth(JSON.stringify(auth));
  fs.writeFileSync(AUTH_FILE, packed, { encoding: "utf-8", mode: 0o600 });
}

function decodeJwtExp(token: string): number | undefined {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return undefined;
    const json = Buffer.from(
      payloadB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
    const obj = JSON.parse(json) as { exp?: number };
    return obj.exp;
  } catch {
    return undefined;
  }
}
