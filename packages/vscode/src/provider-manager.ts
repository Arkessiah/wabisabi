/**
 * Provider Manager
 *
 * Detects available LLM providers (Ollama / Substratum) and resolves
 * connection details based on the user's configured strategy.
 * Reads auth tokens from ~/.wabisabi/auth.json (encrypted).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execFileSync } from "child_process";
import type { WabiSabiConfig } from "./config";

// ── Types ────────────────────────────────────────────────────────

export type ProviderType = "ollama" | "substratum";

export interface ResolvedProvider {
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
}

// ── Auth decryption ──────────────────────────────────────────────
//
// The CLI's AuthManager (packages/terminal/src/auth/index.ts) writes the
// encrypted blob using whichever key path is available — OS Keychain first,
// machine-derived PBKDF2 as fallback. The VS Code extension MUST mirror that
// resolution order or it will fail to decrypt the file the CLI wrote and the
// user appears "logged out" inside VS Code despite a valid session on disk.

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
        ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const hex = out.toString().trim();
      return hex ? Buffer.from(hex, "hex") : null;
    }
    if (platform === "linux") {
      const out = execFileSync(
        "secret-tool",
        ["lookup", "service", KEYCHAIN_SERVICE, "account", KEYCHAIN_ACCOUNT],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const hex = out.toString().trim();
      return hex ? Buffer.from(hex, "hex") : null;
    }
    if (platform === "win32") {
      // Windows Credential Manager via PowerShell.
      const cmd = `[System.Text.Encoding]::UTF8.GetString((Get-StoredCredential -Target '${KEYCHAIN_SERVICE}\\${KEYCHAIN_ACCOUNT}').Password)`;
      const out = execFileSync("powershell", ["-NoProfile", "-Command", cmd], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      const hex = out.toString().trim();
      return hex ? Buffer.from(hex, "hex") : null;
    }
  } catch {
    // Keychain absent / not authorised — fall back below.
  }
  return null;
}

let cachedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromChain = readKeychainKey();
  cachedKey = fromChain ?? legacyMachineKey();
  return cachedKey;
}

function decryptAuth(packed: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = packed.split(":");
    const decipher = crypto.createDecipheriv(
      AUTH_ALGO,
      getEncryptionKey(),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf-8");
  } catch {
    return null;
  }
}

// ── ProviderManager ──────────────────────────────────────────────

export class ProviderManager {
  constructor(private config: WabiSabiConfig) {}

  /**
   * Resolve the best available provider based on strategy.
   */
  async resolve(): Promise<ResolvedProvider> {
    const strategy = this.config.strategy;
    const auth = this.readAuthToken();

    // Cloud-first strategies
    if (strategy === "cloud" || strategy === "hybrid-cloud-first") {
      if (this.config.substratumEnabled || auth.bearerToken) {
        const ok = await this.checkSubstratum(this.config.substratumUrl, auth.bearerToken);
        if (ok) {
          return { type: "substratum", baseUrl: this.config.substratumUrl, ...auth };
        }
      }
      // Fallback to Ollama
      const ollamaOk = await this.checkOllama(this.config.ollamaUrl);
      if (ollamaOk) {
        return { type: "ollama", baseUrl: this.config.ollamaUrl };
      }
    }

    // Local-first strategies (default)
    if (strategy === "local" || strategy === "hybrid-local-first" || strategy === "cluster" || strategy === "hybrid-full") {
      const ollamaOk = await this.checkOllama(this.config.ollamaUrl);
      if (ollamaOk) {
        return { type: "ollama", baseUrl: this.config.ollamaUrl };
      }
      // Fallback to Substratum (unless pure local)
      if (strategy !== "local") {
        if (this.config.substratumEnabled || auth.bearerToken) {
          return { type: "substratum", baseUrl: this.config.substratumUrl, ...auth };
        }
      }
    }

    // Cluster-cloud
    if (strategy === "cluster-cloud") {
      const ollamaOk = await this.checkOllama(this.config.ollamaUrl);
      if (ollamaOk) {
        return { type: "ollama", baseUrl: this.config.ollamaUrl };
      }
      return { type: "substratum", baseUrl: this.config.substratumUrl, ...auth };
    }

    // Last resort: try Ollama then Substratum
    const ollamaOk = await this.checkOllama(this.config.ollamaUrl);
    if (ollamaOk) {
      return { type: "ollama", baseUrl: this.config.ollamaUrl };
    }

    return { type: "substratum", baseUrl: this.config.substratumUrl, ...auth };
  }

  private async checkOllama(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url}/v1/models`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async checkSubstratum(url: string, token?: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${url}/v1/models`, { signal: controller.signal, headers });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  private readAuthToken(): { apiKey?: string; bearerToken?: string } {
    // Check env vars first
    const envKey = process.env.WABISABI_API_KEY || process.env.SUBSTRATUM_API_KEY;
    if (envKey) return { apiKey: envKey };

    // Try reading encrypted auth file
    const authPath = path.join(os.homedir(), ".wabisabi", "auth.json");
    try {
      if (!fs.existsSync(authPath)) return {};
      const raw = fs.readFileSync(authPath, "utf-8");
      if (!raw.trim()) return {};
      const decrypted = decryptAuth(raw);
      if (!decrypted) return {};
      const parsed = JSON.parse(decrypted);
      if (parsed.accessToken) {
        return { bearerToken: parsed.accessToken };
      }
    } catch {
      // Corrupt or unreadable
    }
    return {};
  }
}
