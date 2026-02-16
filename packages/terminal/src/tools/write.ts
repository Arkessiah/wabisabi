/**
 * Write Tool
 *
 * Creates or overwrites files. Creates parent directories if needed.
 * Shows unified diff of changes.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { resolve, isAbsolute, dirname } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";
import { generateDiff } from "./diff.js";

export const writeTool = defineTool("write", {
  description:
    "Create or overwrite a file with the given content. Parent directories are created automatically.",
  parameters: z.object({
    filePath: z.string().describe("Absolute or relative path for the file"),
    content: z.string().describe("The full content to write to the file"),
  }),
  async execute(args, ctx) {
    const filePath = isAbsolute(args.filePath)
      ? args.filePath
      : resolve(ctx.projectRoot, args.filePath);

    const existed = existsSync(filePath);
    let oldContent = "";
    if (existed) {
      try {
        oldContent = readFileSync(filePath, "utf-8");
      } catch {
        // File exists but can't be read
      }
    }

    // Create parent directories + write file
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, args.content, "utf-8");
    } catch (err) {
      return {
        title: "Write error",
        output: `Cannot write "${filePath}": ${err instanceof Error ? err.message : "permission denied"}`,
        metadata: { error: true, filePath },
      };
    }

    const newLines = args.content.split("\n").length;

    // Generate diff
    const diff = existed
      ? generateDiff(filePath, oldContent, args.content)
      : `Created new file with ${newLines} lines.`;

    return {
      title: existed ? `Updated ${filePath}` : `Created ${filePath}`,
      output: `${diff}\nFile written successfully: ${filePath}`,
      metadata: {
        filePath,
        existed,
        lines: newLines,
        bytes: Buffer.byteLength(args.content, "utf-8"),
      },
    };
  },
});
