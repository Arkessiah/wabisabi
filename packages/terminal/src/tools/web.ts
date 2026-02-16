/**
 * Web/Fetch Tool
 *
 * Fetches content from URLs and returns readable text.
 * Strips HTML tags, extracts main content, respects timeouts.
 */

import { z } from "zod";
import { defineTool, truncateOutput } from "./index.js";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 50_000; // ~50KB text limit

/**
 * Strip HTML tags and convert to readable text.
 */
function htmlToText(html: string): string {
  return html
    // Remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Convert common elements to text equivalents
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const webTool = defineTool("web", {
  description:
    "Fetch content from a URL. Returns the page text content (HTML stripped). " +
    "Use for reading documentation, APIs, web pages.",
  parameters: z.object({
    url: z.string().describe("The URL to fetch"),
    raw: z
      .boolean()
      .optional()
      .describe("Return raw response without HTML stripping"),
  }),

  async execute(args) {
    const { url, raw } = args;

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        title: "Invalid URL",
        output: `Invalid URL: ${url}`,
        metadata: { error: true },
      };
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        title: "Invalid protocol",
        output: `Only http/https URLs are supported, got: ${parsedUrl.protocol}`,
        metadata: { error: true },
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "WabiSabi/1.0 (coding-assistant)",
          Accept: "text/html,application/json,text/plain,*/*",
        },
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          title: `HTTP ${response.status}`,
          output: `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`,
          metadata: { error: true, status: response.status },
        };
      }

      const contentType = response.headers.get("content-type") || "";
      let body = await response.text();

      // Truncate if too large
      if (body.length > MAX_CONTENT_LENGTH) {
        body = body.slice(0, MAX_CONTENT_LENGTH) + "\n\n... (truncated)";
      }

      // Convert HTML to text unless raw mode
      let content: string;
      if (raw || contentType.includes("json") || contentType.includes("text/plain")) {
        content = body;
      } else {
        content = htmlToText(body);
      }

      const { content: truncated } = truncateOutput(content);

      return {
        title: `Fetched ${parsedUrl.hostname} (${contentType.split(";")[0]})`,
        output: truncated,
        metadata: {
          url,
          status: response.status,
          contentType: contentType.split(";")[0],
          length: content.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("abort")) {
        return {
          title: "Timeout",
          output: `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`,
          metadata: { error: true },
        };
      }
      return {
        title: "Fetch error",
        output: `Failed to fetch ${url}: ${msg}`,
        metadata: { error: true },
      };
    }
  },
});
