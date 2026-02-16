/**
 * Atomic File Write Utilities
 *
 * Prevents data corruption from crashes mid-write by using temp files + rename.
 * Security fix for BAJA-4: Escrituras no atómicas.
 */

import { writeFileSync, renameSync, unlinkSync, existsSync, openSync, fsyncSync, closeSync } from "fs";
import { randomBytes } from "crypto";

/**
 * Write file atomically to prevent corruption from crashes mid-write.
 *
 * Process:
 * 1. Write to temporary file with random suffix
 * 2. Flush to disk with fsync (ensure data persists)
 * 3. Rename temp to target (atomic operation on POSIX)
 * 4. Clean up temp file on error
 *
 * @param filePath Target file path
 * @param content Content to write
 * @param options Write options (encoding, mode, etc.)
 */
export function atomicWriteFileSync(
  filePath: string,
  content: string,
  options?: { encoding?: BufferEncoding; mode?: number }
): void {
  const tmpSuffix = randomBytes(8).toString("hex");
  const tmpPath = `${filePath}.tmp.${tmpSuffix}`;

  try {
    // 1. Write to temp file with specified options
    const writeOptions: any = { encoding: options?.encoding || "utf-8" };
    if (options?.mode !== undefined) {
      writeOptions.mode = options.mode;
    }
    writeFileSync(tmpPath, content, writeOptions);

    // 2. Flush to disk (ensure data is written to physical storage)
    const fd = openSync(tmpPath, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    // 3. Atomic rename (POSIX guarantees atomicity)
    renameSync(tmpPath, filePath);
  } catch (error) {
    // 4. Clean up temp file on error
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}
