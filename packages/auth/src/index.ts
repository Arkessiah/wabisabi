/**
 * WabiSabi Auth Package
 *
 * Session tokens are encrypted at-rest using AES-256-GCM with a key derived
 * from machine-id (hostname + homedir + uid) via PBKDF2. This prevents
 * casual plaintext leaks but is NOT a substitute for OS keychain.
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { homedir } from "os";

export interface User {
  id: string;
  email: string;
  name: string;
  provider: "google" | "github" | "email";
  avatar?: string;
  tokens: TokenBalance;
  createdAt: Date;
}

export interface TokenBalance {
  available: number;
  used: number;
  total: number;
}

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// ── Encryption helpers ─────────────────────────────────────────

const ALGO = "aes-256-gcm" as const;
const SALT = "wabisabi-auth-v1";

function machineKey(): Buffer {
  const seed = `${require("os").hostname()}:${homedir()}:${process.getuid?.() ?? 0}`;
  return pbkdf2Sync(seed, SALT, 100_000, 32, "sha512");
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, machineKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
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

// ── AuthSystem ─────────────────────────────────────────────────

class AuthSystem {
  private session: AuthSession | null = null;
  private apiUrl: string = "http://localhost:3001";

  async login(provider: "google" | "github" | "email"): Promise<string> {
    const authUrl = `${this.apiUrl}/auth/${provider}`;
    console.log(`🔐 Opening OAuth flow: ${authUrl}`);
    console.log("Please complete authentication in your browser...");
    return authUrl;
  }

  async handleCallback(code: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        const data = await response.json();
        this.session = {
          userId: data.user.id,
          accessToken: data.token,
          refreshToken: data.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
        this.saveSession();
        console.log("✅ Authentication successful!");
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Auth failed:", error);
      return false;
    }
  }

  async logout(): Promise<void> {
    this.session = null;
    this.clearSession();
    console.log("👋 Logged out successfully");
  }

  isAuthenticated(): boolean {
    if (!this.session) return false;
    if (new Date() > this.session.expiresAt) {
      console.log("⚠️ Session expired, please login again");
      return false;
    }
    return true;
  }

  async getUser(): Promise<User | null> {
    if (!this.isAuthenticated()) return null;

    try {
      const response = await fetch(`${this.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${this.session!.accessToken}` },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Failed to get user:", error);
    }
    return null;
  }

  async getBilling(): Promise<TokenBalance | null> {
    if (!this.isAuthenticated()) return null;

    try {
      const response = await fetch(`${this.apiUrl}/billing/balance`, {
        headers: { Authorization: `Bearer ${this.session!.accessToken}` },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Failed to get billing:", error);
    }
    return null;
  }

  private saveSession(): void {
    if (!this.session) return;
    try {
      const dir = homedir() + "/.wabisabi";
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(this.session);
      const sessionPath = dir + "/session.json";
      writeFileSync(sessionPath, encrypt(json), { mode: 0o600 });
    } catch (error) {
      console.error("⚠️ Failed to save session:", error);
    }
  }

  private loadSession(): void {
    try {
      const sessionPath = homedir() + "/.wabisabi/session.json";
      if (!existsSync(sessionPath)) {
        this.session = null;
        return;
      }
      const raw = readFileSync(sessionPath, "utf-8");
      const decrypted = decrypt(raw);
      if (!decrypted) {
        this.session = null;
        return;
      }
      this.session = JSON.parse(decrypted);
    } catch {
      this.session = null;
    }
  }

  private clearSession(): void {
    try {
      const sessionPath = homedir() + "/.wabisabi/session.json";
      if (existsSync(sessionPath)) {
        unlinkSync(sessionPath);
      }
    } catch {}
  }

  constructor() {
    this.loadSession();
  }
}

export const auth = new AuthSystem();
export async function login(provider: "google" | "github" | "email") {
  return auth.login(provider);
}
export async function handleCallback(code: string) {
  return auth.handleCallback(code);
}
export async function logout() {
  return auth.logout();
}
export async function getUser() {
  return auth.getUser();
}
export async function getBilling() {
  return auth.getBilling();
}
export function isAuthenticated() {
  return auth.isAuthenticated();
}
