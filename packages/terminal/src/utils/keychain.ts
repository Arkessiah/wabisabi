/**
 * OS Keychain Integration
 *
 * Cross-platform wrapper for secure credential storage using native OS keychains.
 * Security fix for ALTA-1: Encryption Key Derivation.
 *
 * Supported platforms:
 * - macOS: Keychain Access (via `security` command)
 * - Linux: Secret Service API (via `secret-tool`)
 * - Windows: Credential Manager (via PowerShell)
 */

import { execFileSync } from "child_process";
import { platform } from "os";
import { randomBytes } from "crypto";

export interface KeychainOptions {
  service: string;
  account: string;
}

/**
 * Store a secret in the OS keychain.
 * @param options Service and account identifiers
 * @param secret The secret value to store
 * @returns true if successful, false otherwise
 */
export function setKeychainPassword(
  options: KeychainOptions,
  secret: string
): boolean {
  try {
    const os = platform();

    if (os === "darwin") {
      // macOS: Use `security` command-line tool
      // -U: Update if exists, create if not
      execFileSync(
        "security",
        [
          "add-generic-password",
          "-a", options.account,
          "-s", options.service,
          "-w", secret,
          "-U",
        ],
        { stdio: "ignore" }
      );
      return true;
    } else if (os === "linux") {
      // Linux: Use `secret-tool` (part of libsecret/gnome-keyring)
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
      // Windows: Use PowerShell with CredentialManager
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
 * Retrieve a secret from the OS keychain.
 * @param options Service and account identifiers
 * @returns The secret if found, null otherwise
 */
export function getKeychainPassword(
  options: KeychainOptions
): string | null {
  try {
    const os = platform();

    if (os === "darwin") {
      // macOS: Use `security find-generic-password`
      const output = execFileSync(
        "security",
        [
          "find-generic-password",
          "-a", options.account,
          "-s", options.service,
          "-w", // Output password only
        ],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      return output.trim();
    } else if (os === "linux") {
      // Linux: Use `secret-tool lookup`
      const output = execFileSync(
        "secret-tool",
        [
          "lookup",
          "service", options.service,
          "account", options.account,
        ],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      return output.trim();
    } else if (os === "win32") {
      // Windows: Read from credential file
      const credPath = `$env:LOCALAPPDATA\\wabisabi\\${options.service}.cred`;
      const script = `
        if (Test-Path "${credPath}") {
          $securePassword = Get-Content "${credPath}" | ConvertTo-SecureString
          $credential = New-Object System.Management.Automation.PSCredential("${options.account}", $securePassword)
          $credential.GetNetworkCredential().Password
        }
      `.trim();

      const output = execFileSync(
        "powershell",
        ["-Command", script],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      return output.trim() || null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Delete a secret from the OS keychain.
 * @param options Service and account identifiers
 * @returns true if successful, false otherwise
 */
export function deleteKeychainPassword(
  options: KeychainOptions
): boolean {
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
      const credPath = `$env:LOCALAPPDATA\\wabisabi\\${options.service}.cred`;
      execFileSync(
        "powershell",
        ["-Command", `Remove-Item -Path "${credPath}" -Force -ErrorAction SilentlyContinue`],
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
 * Check if OS keychain is available on this system.
 * @returns true if keychain commands are available
 */
export function isKeychainAvailable(): boolean {
  try {
    const os = platform();

    if (os === "darwin") {
      execFileSync("which", ["security"], { stdio: "ignore" });
      return true;
    } else if (os === "linux") {
      execFileSync("which", ["secret-tool"], { stdio: "ignore" });
      return true;
    } else if (os === "win32") {
      execFileSync("where", ["powershell"], { stdio: "ignore" });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Generate or retrieve encryption key from OS keychain.
 * Security improvement for ALTA-1.
 *
 * @param service Service identifier
 * @param account Account identifier
 * @returns 32-byte encryption key (Buffer)
 */
export function getOrCreateEncryptionKey(
  service: string,
  account: string
): Buffer {
  const options = { service, account };

  // Try to get existing key from keychain
  const existing = getKeychainPassword(options);
  if (existing) {
    return Buffer.from(existing, "hex");
  }

  // Generate new random 32-byte key
  const newKey = randomBytes(32);

  // Try to store in keychain
  const stored = setKeychainPassword(options, newKey.toString("hex"));

  if (!stored) {
    // Keychain not available - this will trigger fallback in caller
    throw new Error("Keychain not available");
  }

  return newKey;
}
