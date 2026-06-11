/**
 * WabiSabi Auth Manager
 *
 * Singleton that manages authentication state for the terminal CLI.
 * Supports three credential strategies (checked in order):
 *
 *   1. JWT bearer tokens  -- stored in ~/.wabisabi/auth.json (encrypted)
 *   2. OAuth device-code  -- for interactive login (substratum / github)
 *   3. API key fallback   -- from env WABISABI_API_KEY or global config
 *
 * Token storage is encrypted at rest using AES-256-GCM with a key derived
 * from the machine-id (hostname + homedir + uid) via PBKDF2. This is NOT
 * a substitute for OS keychain -- it prevents casual plaintext leaks.
 */

import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import { atomicWriteFileSync } from "../utils/atomic-write.js";
import {
  isKeychainAvailable,
  getOrCreateEncryptionKey,
} from "../utils/keychain.js";

import { configManager } from "../config/index.js";
import { AuthConfigSchema, type AuthConfig, type AuthProvider, type DeviceCodeResponse } from "./schema.js";
import { decodeJwt, isExpired, needsRefresh } from "./token.js";

// Re-export everything consumers need
export { AuthConfigSchema, type AuthConfig, type AuthProvider, type DeviceCodeResponse } from "./schema.js";
export { decodeJwt, isExpired, needsRefresh, type JwtPayload } from "./token.js";

// ── Encryption helpers ─────────────────────────────────────────

const ALGO = "aes-256-gcm" as const;
const SALT = "wabisabi-auth-v1"; // static salt -- key uniqueness comes from machine id
const KEYCHAIN_SERVICE = "com.wabisabi.terminal";
const KEYCHAIN_ACCOUNT = "encryption-key";

// Cache for keychain availability check (don't check every time)
let keychainAvailable: boolean | null = null;
let encryptionKey: Buffer | null = null;

/**
 * Get encryption key with ALTA-1 security improvement.
 * Tries OS keychain first, falls back to machine-derived key.
 */
function getEncryptionKey(): Buffer {
  // Return cached key if available
  if (encryptionKey) return encryptionKey;

  // Check keychain availability (cached after first check)
  if (keychainAvailable === null) {
    keychainAvailable = isKeychainAvailable();
    if (!keychainAvailable) {
      console.warn("⚠️  OS Keychain not available - using fallback key derivation");
      console.warn("   Install keychain tools for improved security:");
      console.warn("   - macOS: security (built-in)");
      console.warn("   - Linux: apt install gnome-keyring / yum install gnome-keyring");
      console.warn("   - Windows: PowerShell (built-in)\n");
    }
  }

  // Try to use OS keychain for secure key storage
  if (keychainAvailable) {
    try {
      encryptionKey = getOrCreateEncryptionKey(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      return encryptionKey;
    } catch {
      // Keychain operation failed - fall through to legacy method
      console.warn("⚠️  Keychain operation failed - using fallback\n");
      keychainAvailable = false;
    }
  }

  // Fallback: DEPRECATED machine-derived key (ALTA-1 vulnerability)
  // Only used when OS keychain is not available
  encryptionKey = legacyMachineKey();
  return encryptionKey;
}

/**
 * @deprecated Legacy key derivation - VULNERABLE to prediction (ALTA-1)
 * Only used as fallback when OS keychain is unavailable.
 */
function legacyMachineKey(): Buffer {
  // Deterministic per-machine seed: hostname + home path + uid
  const seed = `${require("os").hostname()}:${homedir()}:${process.getuid?.() ?? 0}`;
  return pbkdf2Sync(seed, SALT, 100_000, 32, "sha512");
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack as iv:tag:ciphertext, all hex-encoded
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(packed: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = packed.split(":");
    const decipher = createDecipheriv(ALGO, getEncryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf-8");
  } catch {
    return null;
  }
}

// ── AuthManager ────────────────────────────────────────────────

export class AuthManager {
  private config: AuthConfig | null = null;
  private authPath: string;

  constructor() {
    this.authPath = join(homedir(), ".wabisabi", "auth.json");
    this.load();
  }

  // ── Persistence ────────────────────────────────────────────

  private load(): void {
    try {
      if (!existsSync(this.authPath)) return;
      const raw = readFileSync(this.authPath, "utf-8");
      const decrypted = decrypt(raw);
      if (!decrypted) return;
      const parsed = JSON.parse(decrypted);
      this.config = AuthConfigSchema.parse(parsed);
    } catch {
      // Corrupt or unreadable file -- treat as unauthenticated
      this.config = null;
    }
  }

  private save(): void {
    try {
      const dir = join(homedir(), ".wabisabi");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(this.config);
      // Security (BAJA-4): Atomic write prevents corruption from crashes mid-write
      // Security (BAJA-3): Mode 0o600 restricts access to owner only
      atomicWriteFileSync(this.authPath, encrypt(json), { mode: 0o600 });
    } catch {
      // Non-critical -- tokens stay in memory for this session
    }
  }

  // ── Public API ─────────────────────────────────────────────

  isAuthenticated(): boolean {
    if (this.config?.accessToken) {
      // If it is a JWT, check expiry; opaque tokens are always "valid" locally
      if (this.config.accessToken.includes(".")) {
        return !isExpired(this.config.accessToken);
      }
      return true;
    }
    // Fallback: env / config API key counts as authenticated
    return Boolean(this.getApiKeyFallback());
  }

  /**
   * Return the current access token, refreshing first if needed.
   */
  async getToken(): Promise<string | null> {
    if (this.config?.accessToken) {
      // Proactive refresh for JWTs approaching expiry
      if (this.config.accessToken.includes(".") && needsRefresh(this.config.accessToken)) {
        await this.refreshToken();
      }
      if (this.config.accessToken && !isExpired(this.config.accessToken)) {
        return this.config.accessToken;
      }
    }
    return this.getApiKeyFallback();
  }

  /**
   * Build the headers object for authenticated requests.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    if (!token) return {};
    // JWTs use Bearer; opaque API keys use X-API-Key
    if (token.includes(".")) {
      return { Authorization: `Bearer ${token}` };
    }
    return { "X-API-Key": token };
  }

  /**
   * Authenticate with the given provider.
   */
  async login(provider: AuthProvider): Promise<boolean> {
    if (provider === "apikey") {
      const key = this.getApiKeyFallback();
      if (!key) return false;
      this.config = { provider: "apikey", accessToken: key };
      this.save();
      return true;
    }
    // OAuth device-code flow for substratum / github
    return this.deviceCodeFlow(provider);
  }

  logout(): void {
    this.config = null;
    try {
      if (existsSync(this.authPath)) {
        atomicWriteFileSync(this.authPath, "", { mode: 0o600 });
      }
    } catch {
      // best-effort cleanup
    }
  }

  getConfig(): AuthConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Return the stored session ID (from /terminal/auth/login).
   */
  getSessionId(): string | null {
    return this.config?.sessionId ?? null;
  }

  /**
   * Login via Substratum terminal endpoint (email/password).
   * POST /terminal/auth/login → { token, refreshToken?, sessionId, expiresIn, user? }
   *
   * The substratum backend bridges this endpoint to its canonical
   * user-management.authenticateUser so a dashboard-registered user can log in
   * through the CLI with the same credentials.
   */
  async loginTerminal(email: string, password: string): Promise<boolean> {
    const baseUrl = this.getSubstratumUrl();
    try {
      const res = await fetch(`${baseUrl}/terminal/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, cliVersion: "1.0.0" }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data.token !== "string") return false;

      const payload = decodeJwt(data.token);
      // Prefer the user object the backend returns; fall back to JWT sub.
      const userObj = (data.user ?? {}) as Record<string, unknown>;
      const resolvedUserId =
        typeof userObj.id === "string"
          ? userObj.id
          : typeof payload?.sub === "string"
            ? payload.sub
            : undefined;
      const resolvedEmail =
        typeof userObj.email === "string" ? userObj.email : email;

      this.config = {
        provider: "substratum",
        accessToken: data.token,
        refreshToken:
          typeof data.refreshToken === "string" ? data.refreshToken : undefined,
        sessionId:
          typeof data.sessionId === "string" ? data.sessionId : undefined,
        expiresAt: payload?.exp,
        userId: resolvedUserId,
        email: resolvedEmail,
      };
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  // ── Internal ───────────────────────────────────────────────

  private getSubstratumUrl(): string {
    try {
      return configManager.getProviders().substratum.url;
    } catch {
      return process.env.SUBSTRATUM_URL ?? "https://api.substratum.dev";
    }
  }

  private getApiKeyFallback(): string | null {
    return process.env.WABISABI_API_KEY ?? process.env.SUBSTRATUM_API_KEY ?? null;
  }

  private async refreshToken(): Promise<void> {
    if (!this.config?.refreshToken) return;

    // GitHub still speaks OAuth snake_case; the Substratum gateway uses
    // camelCase ({ refreshToken } in, { accessToken, refreshToken } out).
    const isGithub = this.config.provider === "github";
    const endpoint = isGithub
      ? "https://github.com/login/oauth/access_token"
      : `${this.getSubstratumUrl()}/auth/refresh`;

    const body = isGithub
      ? JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: this.config.refreshToken,
        })
      : JSON.stringify({ refreshToken: this.config.refreshToken });

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      });
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, unknown>;

      // Accept both camelCase (Substratum) and snake_case (OAuth/GitHub).
      const access =
        (typeof data.accessToken === "string" && data.accessToken) ||
        (typeof data.access_token === "string" && data.access_token) ||
        null;
      const refresh =
        (typeof data.refreshToken === "string" && data.refreshToken) ||
        (typeof data.refresh_token === "string" && data.refresh_token) ||
        null;

      if (access) {
        this.config.accessToken = access;
        if (refresh) this.config.refreshToken = refresh;
        const payload = decodeJwt(this.config.accessToken);
        if (payload?.exp) this.config.expiresAt = payload.exp;
        this.save();
      }
    } catch {
      // Network failure -- caller will see the expired token and can re-login
    }
  }

  private async deviceCodeFlow(provider: AuthProvider): Promise<boolean> {
    const codeEndpoint =
      provider === "github"
        ? "https://github.com/login/device/code"
        : `${this.getSubstratumUrl()}/auth/device/code`;

    const tokenEndpoint =
      provider === "github"
        ? "https://github.com/login/oauth/access_token"
        : `${this.getSubstratumUrl()}/auth/device/token`;

    // Step 1: Request device code
    const codeRes = await fetch(codeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: process.env.WABISABI_CLIENT_ID ?? "wabisabi-cli" }),
    });
    if (!codeRes.ok) return false;

    const raw = (await codeRes.json()) as Record<string, unknown>;
    const device: DeviceCodeResponse = {
      deviceCode: (raw.device_code as string) ?? "",
      userCode: (raw.user_code as string) ?? "",
      verificationUri: (raw.verification_uri as string) ?? (raw.verification_url as string) ?? "",
      expiresIn: (raw.expires_in as number) ?? 900,
      interval: (raw.interval as number) ?? 5,
    };

    // Step 2: Show the user their code
    console.log(`\n  Open:  ${device.verificationUri}`);
    console.log(`  Code:  ${device.userCode}\n`);

    // Step 3: Poll for the token
    const deadline = Date.now() + device.expiresIn * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, device.interval * 1000));
      try {
        const tokenRes = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            client_id: process.env.WABISABI_CLIENT_ID ?? "wabisabi-cli",
            device_code: device.deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });
        if (!tokenRes.ok) continue;
        const tokenData = (await tokenRes.json()) as Record<string, unknown>;

        if (tokenData.error === "authorization_pending") continue;
        if (tokenData.error === "slow_down") {
          device.interval = Math.min(device.interval + 5, 30);
          continue;
        }
        if (typeof tokenData.access_token === "string") {
          const payload = decodeJwt(tokenData.access_token);
          this.config = {
            provider,
            accessToken: tokenData.access_token,
            refreshToken: typeof tokenData.refresh_token === "string" ? tokenData.refresh_token : undefined,
            expiresAt: payload?.exp,
            userId: typeof payload?.sub === "string" ? payload.sub : undefined,
            email: typeof payload?.email === "string" ? payload.email : undefined,
            sessionId: typeof tokenData.session_id === "string" ? tokenData.session_id : undefined,
          };
          this.save();
          return true;
        }
      } catch {
        // Network hiccup -- keep polling
      }
    }
    return false;
  }
}

export const authManager = new AuthManager();
