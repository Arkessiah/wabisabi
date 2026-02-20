/**
 * Write Tool
 *
 * Creates or overwrites files. Creates parent directories if needed.
 * Shows unified diff of changes.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { resolve, isAbsolute, dirname, basename } from "path";
import { z } from "zod";
import { defineTool, validatePathWithinProject } from "./index.js";
import { generateDiff } from "./diff.js";

// System .md files managed internally - don't require user confirmation
const SYSTEM_MD_FILES = new Set(["PLAN.md", "TODO.md", "AGENTS.md"]);

export const writeTool = defineTool("write", {
  description:
    "Create or overwrite a file with the given content. Parent directories are created automatically.",
  parameters: z.object({
    filePath: z.string().describe("Absolute or relative path for the file"),
    content: z.string().describe("The full content to write to the file"),
    userRequested: z.boolean().optional().describe("Set to true ONLY if the user explicitly asked to create this .md file. Required for creating new markdown files."),
  }),
  async execute(args, ctx) {
    const filePath = isAbsolute(args.filePath)
      ? args.filePath
      : resolve(ctx.projectRoot, args.filePath);

    // Security: Validate path is within project root
    const validation = validatePathWithinProject(filePath, ctx.projectRoot);
    if (!validation.valid) {
      return {
        title: "Access denied",
        output: `⛔ ${validation.error}`,
        metadata: { error: true, blocked: true, filePath },
      };
    }

    // Gate: new .md files (except system ones) require explicit user request
    // This prevents the LLM from burning tokens generating unrequested documentation
    const fileName = basename(filePath);
    if (filePath.endsWith(".md") && !existsSync(filePath) && !SYSTEM_MD_FILES.has(fileName) && !args.userRequested) {
      return {
        title: "Blocked: new .md file",
        output: `Creating new markdown file "${fileName}" was blocked. Markdown files consume tokens to generate. Ask the user first if they want this file created before attempting again. System files (PLAN.md, TODO.md, AGENTS.md) are exempt.`,
        metadata: { error: true, blocked: true, filePath, reason: "md-confirmation" },
      };
    }

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
