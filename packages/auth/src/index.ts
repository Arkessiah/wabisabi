/**
 * WabiSabi Auth Package
 *
 * Session tokens are encrypted at-rest using AES-256-GCM.
 *
 * Security (ALTA-1): Uses OS keychain for encryption keys when available:
 * - macOS: Keychain Access
 * - Linux: Secret Service (gnome-keyring)
 * - Windows: Credential Manager
 *
 * Falls back to PBKDF2 machine-id derivation if keychain unavailable.
 *
 * Security (BAJA-4): Uses atomic writes to prevent corruption from crashes.
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import { mkdirSync, existsSync, readFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { atomicWriteFileSync } from "./utils/atomic-write.js";
import {
  isKeychainAvailable,
  getOrCreateEncryptionKey,
} from "./utils/keychain.js";

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
const SALT = "wabisabi-auth-v1"; // static salt -- key uniqueness comes from OS keychain or machine id
const KEYCHAIN_SERVICE = "com.wabisabi.auth";
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
      // Security (BAJA-4): Atomic write prevents corruption from crashes mid-write
      atomicWriteFileSync(sessionPath, encrypt(json), { mode: 0o600 });
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
