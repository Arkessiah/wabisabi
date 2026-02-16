import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve, join, normalize } from "path";
import { homedir } from "os";

/**
 * Security utilities for plugin loading
 */

const ALLOWED_PLUGIN_DIRS = [
  join(homedir(), ".wabisabi", "plugins"),
  join(process.cwd(), ".wabisabi", "plugins"),
];

/**
 * Validates that a plugin path is within allowed directories
 * Prevents path traversal and loading from arbitrary locations
 */
export function validatePluginPath(pluginPath: string): { valid: boolean; error?: string; normalized?: string } {
  try {
    // Reject URLs
    if (pluginPath.startsWith("http://") || pluginPath.startsWith("https://") || pluginPath.startsWith("file://")) {
      return { valid: false, error: "Remote plugin URLs are not allowed" };
    }

    // Normalize and resolve the path
    const normalized = normalize(resolve(pluginPath));

    // Check if it's within any allowed directory
    const isAllowed = ALLOWED_PLUGIN_DIRS.some((allowedDir) => {
      const normalizedAllowed = normalize(resolve(allowedDir));
      return normalized.startsWith(normalizedAllowed + "/") || normalized === normalizedAllowed;
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Plugin must be in: ${ALLOWED_PLUGIN_DIRS.join(", ")}`,
      };
    }

    // Check if path exists
    if (!existsSync(normalized)) {
      return { valid: false, error: "Plugin path does not exist" };
    }

    return { valid: true, normalized };
  } catch (error) {
    return { valid: false, error: `Path validation failed: ${error}` };
  }
}

/**
 * Computes SHA-256 checksum of a file
 */
export function computeChecksum(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Verifies that a file's checksum matches the expected value
 */
export function verifyChecksum(filePath: string, expectedHash: string): boolean {
  try {
    const actual = computeChecksum(filePath);
    return actual === expectedHash;
  } catch {
    return false;
  }
}

/**
 * Validates plugin file naming
 * Only allows safe filenames (no shell metacharacters)
 */
export function validatePluginFileName(fileName: string): boolean {
  // Allow: alphanumeric, dash, underscore, dot, slash (for subdirs)
  const safePattern = /^[a-zA-Z0-9._\/-]+$/;
  return safePattern.test(fileName);
}

/**
 * Gets allowed plugin directories
 */
export function getAllowedPluginDirs(): string[] {
  return [...ALLOWED_PLUGIN_DIRS];
}
