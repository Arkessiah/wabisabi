/**
 * Read Tool
 *
 * Reads file contents with line numbers, pagination, and binary detection.
 */

import { readFileSync, existsSync, statSync } from "fs";
import { resolve, isAbsolute } from "path";
import { z } from "zod";
import { defineTool, addLineNumbers } from "./index.js";

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".ogg",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
]);

function isBinaryFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;

  try {
    const buffer = Buffer.alloc(4096);
    const fd = require("fs").openSync(filePath, "r");
    const bytesRead = require("fs").readSync(fd, buffer, 0, 4096, 0);
    require("fs").closeSync(fd);

    let nullBytes = 0;
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) nullBytes++;
    }
    return nullBytes / bytesRead > 0.3;
  } catch {
    return false;
  }
}

export const readTool = defineTool("read", {
  description:
    "Read the contents of a file. Returns line-numbered content with pagination support.",
  parameters: z.object({
    filePath: z.string().describe("Absolute or relative path to the file"),
    offset: z
      .number()
      .optional()
      .describe("Line number to start reading from (1-based)"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of lines to read (default: 2000)"),
  }),
  async execute(args, ctx) {
    const filePath = isAbsolute(args.filePath)
      ? args.filePath
      : resolve(ctx.projectRoot, args.filePath);

    if (!existsSync(filePath)) {
      return {
        title: "File not found",
        output: `File not found: ${filePath}`,
        metadata: { error: true, filePath },
      };
    }

    let stat;
    try {
      stat = statSync(filePath);
    } catch (err) {
      return {
        title: "Permission denied",
        output: `Cannot access "${filePath}": ${err instanceof Error ? err.message : "permission denied"}`,
        metadata: { error: true, filePath },
      };
    }

    if (stat.isDirectory()) {
      return {
        title: "Not a file",
        output: `"${filePath}" is a directory. Use the "list" tool to view directory contents.`,
        metadata: { error: true, filePath },
      };
    }

    if (isBinaryFile(filePath)) {
      return {
        title: "Binary file",
        output: `"${filePath}" appears to be a binary file and cannot be displayed as text.`,
        metadata: { error: true, filePath, binary: true },
      };
    }

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (err) {
      return {
        title: "Read error",
        output: `Cannot read "${filePath}": ${err instanceof Error ? err.message : "unknown error"}`,
        metadata: { error: true, filePath },
      };
    }
    const allLines = content.split("\n");
    const totalLines = allLines.length;

    const offset = Math.max(1, args.offset || 1);
    const limit = args.limit || 2000;
    const startIdx = offset - 1;
    const endIdx = Math.min(startIdx + limit, totalLines);
    const selectedLines = allLines.slice(startIdx, endIdx);

    const numbered = addLineNumbers(selectedLines.join("\n"), offset);
    const truncated = endIdx < totalLines;

    let output = numbered;
    if (truncated) {
      output += `\n\n... (showing lines ${offset}-${endIdx} of ${totalLines} total)`;
    } else {
      output += `\n\n(End of file - ${totalLines} lines)`;
    }

    return {
      title: `Read ${filePath}`,
      output,
      metadata: {
        filePath,
        totalLines,
        linesShown: endIdx - startIdx,
        offset,
        truncated,
      },
    };
  },
});
