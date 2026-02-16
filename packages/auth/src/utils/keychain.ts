/**
 * OS Keychain Integration
 *
 * Secure storage for encryption keys using native OS keychains:
 * - macOS: Keychain Access (security command)
 * - Linux: Secret Service API (secret-tool, gnome-keyring)
 * - Windows: Credential Manager (PowerShell)
 *
 * Security fix for ALTA-1: Encryption key derivation.
 * Replaces predictable machine-id derivation with random keys stored in OS keychain.
 */

import { execFileSync } from "child_process";
import { platform } from "os";
import { randomBytes } from "crypto";

export interface KeychainOptions {
  service: string;
  account: string;
}

/**
 * Check if OS keychain is available on this system.
 * @returns true if keychain commands are available
 */
export function isKeychainAvailable(): boolean {
  try {
    const os = platform();

    if (os === "darwin") {
      // macOS: Check if security command exists
      execFileSync("which", ["security"], { stdio: "ignore" });
      return true;
    } else if (os === "linux") {
      // Linux: Check if secret-tool exists (gnome-keyring)
      execFileSync("which", ["secret-tool"], { stdio: "ignore" });
      return true;
    } else if (os === "win32") {
      // Windows: PowerShell is built-in on Windows 7+
      execFileSync("where", ["powershell"], { stdio: "ignore" });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Store a password/secret in OS keychain.
 * Security (ALTA-1): Uses execFileSync to prevent shell injection.
 *
 * @returns true if successful, false otherwise
 */
export function setKeychainPassword(
  options: KeychainOptions,
  secret: string
): boolean {
  try {
    const os = platform();

    if (os === "darwin") {
      // macOS: security add-generic-password
      execFileSync(
        "security",
        [
          "add-generic-password",
          "-a", options.account,
          "-s", options.service,
          "-w", secret,
          "-U", // Update if exists
        ],
        { stdio: "ignore" }
      );
      return true;
    } else if (os === "linux") {
      // Linux: secret-tool store
      execFileSync(
        "secret-tool",
        [
          "store",
          "--label", `${options.service}:${options.account}`,
          "service", options.service,
          "account", options.account,
        ],
        { input: secret, stdio: ["pipe", "ignore", "ignore"] }
      );
      return true;
    } else if (os === "win32") {
      // Windows: PowerShell Credential Manager
      const script = `
        $password = ConvertTo-SecureString -String "${secret.replace(/"/g, '`"')}" -AsPlainText -Force
        $credential = New-Object System.Management.Automation.PSCredential("${options.account}", $password)
        $credential.Password | ConvertFrom-SecureString | Out-File -FilePath "$env:LOCALAPPDATA\\wabisabi\\${options.service}.cred" -Force
      `.trim();

      execFileSync(
        "powershell",
        ["-Command", script],
        { stdio: "ignore" }
      );
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Retrieve a password/secret from OS keychain.
 *
 * @returns The secret, or null if not found
 */
export function getKeychainPassword(options: KeychainOptions): string | null {
  try {
    const os = platform();

    if (os === "darwin") {
      // macOS: security find-generic-password
      const output = execFileSync(
        "security",
        [
          "find-generic-password",
          "-a", options.account,
          "-s", options.service,
          "-w", // -w prints password to stdout
        ],
        { encoding: "utf-8" }
      );
      return output.trim();
    } else if (os === "linux") {
      // Linux: secret-tool lookup
      const output = execFileSync(
        "secret-tool",
        [
          "lookup",
          "service", options.service,
          "account", options.account,
        ],
        { encoding: "utf-8" }
      );
      return output.trim();
    } else if (os === "win32") {
      // Windows: PowerShell read credential
      const script = `
        $credPath = "$env:LOCALAPPDATA\\wabisabi\\${options.service}.cred"
        if (Test-Path $credPath) {
          $securePassword = Get-Content $credPath | ConvertTo-SecureString
          $credential = New-Object System.Management.Automation.PSCredential("${options.account}", $securePassword)
          $credential.GetNetworkCredential().Password
        }
      `.trim();

      const output = execFileSync(
        "powershell",
        ["-Command", script],
        { encoding: "utf-8" }
      );
      const password = output.trim();
      return password || null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Delete a password/secret from OS keychain.
 *
 * @returns true if deleted or didn't exist, false on error
 */
export function deleteKeychainPassword(options: KeychainOptions): boolean {
  try {
    const os = platform();

    if (os === "darwin") {
      execFileSync(
        "security",
        [
          "delete-generic-password",
          "-a", options.account,
          "-s", options.service,
        ],
        { stdio: "ignore" }
      );
      return true;
    } else if (os === "linux") {
      execFileSync(
        "secret-tool",
        [
          "clear",
          "service", options.service,
          "account", options.account,
        ],
        { stdio: "ignore" }
      );
      return true;
    } else if (os === "win32") {
      const script = `
        $credPath = "$env:LOCALAPPDATA\\wabisabi\\${options.service}.cred"
        if (Test-Path $credPath) { Remove-Item $credPath -Force }
      `.trim();

      execFileSync(
        "powershell",
        ["-Command", script],
        { stdio: "ignore" }
      );
      return true;
    }

    return false;
  } catch {
    // Not found or already deleted
    return true;
  }
}

/**
 * Generate or retrieve encryption key from OS keychain.
 * Security (ALTA-1): Random 32-byte key instead of predictable machine-id.
 *
 * @param service Keychain service name
 * @param account Keychain account name
 * @returns 32-byte Buffer for AES-256
 */
export function getOrCreateEncryptionKey(
  service: string,
  account: string
): Buffer {
  // Try to retrieve existing key
  const existing = getKeychainPassword({ service, account });
  if (existing) {
    return Buffer.from(existing, "hex");
  }

  // Generate new random 32-byte key
  const newKey = randomBytes(32);
  const hexKey = newKey.toString("hex");

  // Store in keychain
  const stored = setKeychainPassword({ service, account }, hexKey);
  if (!stored) {
    throw new Error("Failed to store encryption key in OS keychain");
  }

  return newKey;
}
