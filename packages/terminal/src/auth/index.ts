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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";

import { AuthConfigSchema, type AuthConfig, type AuthProvider, type DeviceCodeResponse } from "./schema.js";
import { decodeJwt, isExpired, needsRefresh } from "./token.js";

// Re-export everything consumers need
export { AuthConfigSchema, type AuthConfig, type AuthProvider, type DeviceCodeResponse } from "./schema.js";
export { decodeJwt, isExpired, needsRefresh, type JwtPayload } from "./token.js";

// ── Encryption helpers ─────────────────────────────────────────

const ALGO = "aes-256-gcm" as const;
const SALT = "wabisabi-auth-v1"; // static salt -- key uniqueness comes from machine id

function machineKey(): Buffer {
  // Deterministic per-machine seed: hostname + home path + uid
  const seed = `${require("os").hostname()}:${homedir()}:${process.getuid?.() ?? 0}`;
  return pbkdf2Sync(seed, SALT, 100_000, 32, "sha512");
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, machineKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack as iv:tag:ciphertext, all hex-encoded
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(packed: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = packed.split(":");
    const decipher = createDecipheriv(ALGO, machineKey(), Buffer.from(ivHex, "hex"));
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
      writeFileSync(this.authPath, encrypt(json), { mode: 0o600 });
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
        writeFileSync(this.authPath, "", { mode: 0o600 });
      }
    } catch {
      // best-effort cleanup
    }
  }

  getConfig(): AuthConfig | null {
    return this.config ? { ...this.config } : null;
  }

  // ── Internal ───────────────────────────────────────────────

  private getApiKeyFallback(): string | null {
    return process.env.WABISABI_API_KEY ?? process.env.SUBSTRATUM_API_KEY ?? null;
  }

  private async refreshToken(): Promise<void> {
    if (!this.config?.refreshToken) return;
    const endpoint =
      this.config.provider === "github"
        ? "https://github.com/login/oauth/access_token"
        : `${process.env.SUBSTRATUM_URL ?? "http://localhost:3001"}/auth/token`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: this.config.refreshToken }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data.access_token === "string") {
        this.config.accessToken = data.access_token;
        if (typeof data.refresh_token === "string") {
          this.config.refreshToken = data.refresh_token;
        }
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
        : `${process.env.SUBSTRATUM_URL ?? "http://localhost:3001"}/auth/device/code`;

    const tokenEndpoint =
      provider === "github"
        ? "https://github.com/login/oauth/access_token"
        : `${process.env.SUBSTRATUM_URL ?? "http://localhost:3001"}/auth/device/token`;

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
