/**
 * Terminal Renderer
 *
 * Renders markdown-like content with syntax highlighting for the terminal.
 * Supports: headers, code blocks, inline code, bold, italic, lists, links.
 */

import chalk from "chalk";

// ── Code Block Syntax Highlighting ───────────────────────────

const KEYWORD_PATTERN = /\b(const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|import|export|from|default|async|await|try|catch|finally|throw|yield|in|of|void|delete|extends|implements|interface|type|enum|namespace|abstract|static|public|private|protected|readonly|override|declare|module|require|as|is|keyof|infer|never|unknown|any|boolean|number|string|null|undefined|true|false|def|self|None|True|False|print|elif|except|raise|pass|lambda|with|nonlocal|global|assert|cls)\b/g;

const STRING_PATTERN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
const COMMENT_PATTERN = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm;
const NUMBER_PATTERN = /\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g;
const DECORATOR_PATTERN = /(@\w+)/g;

function highlightCode(code: string, _lang?: string): string {
  // Apply highlighting in order (comments last to override)
  let result = code;

  // Numbers
  result = result.replace(NUMBER_PATTERN, chalk.yellow("$1"));

  // Strings
  result = result.replace(STRING_PATTERN, chalk.green("$1"));

  // Keywords
  result = result.replace(KEYWORD_PATTERN, chalk.blue("$1"));

  // Decorators
  result = result.replace(DECORATOR_PATTERN, chalk.magenta("$1"));

  // Comments (apply last to override other highlights)
  result = result.replace(COMMENT_PATTERN, chalk.dim("$1"));

  return result;
}

// ── Markdown Renderer ────────────────────────────────────────

/**
 * Render markdown content for terminal display.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeBuffer: string[] = [];

  for (const line of lines) {
    // Code block toggle
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        // End code block - render with highlighting
        const code = codeBuffer.join("\n");
        const highlighted = highlightCode(code, codeLang);
        result.push(chalk.dim("  ┌─" + (codeLang ? ` ${codeLang} ` : "") + "─".repeat(40)));
        for (const codeLine of highlighted.split("\n")) {
          result.push(chalk.dim("  │ ") + codeLine);
        }
        result.push(chalk.dim("  └" + "─".repeat(44)));
        codeBuffer = [];
        inCodeBlock = false;
        codeLang = "";
      } else {
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      result.push(chalk.bold.cyan("  " + line.slice(4)));
      continue;
    }
    if (line.startsWith("## ")) {
      result.push(chalk.bold.cyan("  " + line.slice(3)));
      result.push(chalk.dim("  " + "─".repeat(line.length)));
      continue;
    }
    if (line.startsWith("# ")) {
      result.push(chalk.bold.cyan("  " + line.slice(2)));
      result.push(chalk.dim("  " + "═".repeat(line.length)));
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      result.push(chalk.dim("  " + "─".repeat(50)));
      continue;
    }

    // Unordered lists
    if (/^\s*[-*+]\s/.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1] || "";
      const content = line.replace(/^\s*[-*+]\s/, "");
      result.push(indent + "  " + chalk.cyan("•") + " " + renderInline(content));
      continue;
    }

    // Ordered lists
    if (/^\s*\d+\.\s/.test(line)) {
      const match = line.match(/^(\s*)(\d+)\.\s(.*)/);
      if (match) {
        result.push(match[1] + "  " + chalk.cyan(match[2] + ".") + " " + renderInline(match[3]));
        continue;
      }
    }

    // Blockquote
    if (line.startsWith("> ")) {
      result.push(chalk.dim("  │ ") + chalk.italic(renderInline(line.slice(2))));
      continue;
    }

    // Checkbox lists
    if (/^\s*-\s\[[ x]\]\s/.test(line)) {
      const checked = line.includes("[x]");
      const content = line.replace(/^\s*-\s\[[ x]\]\s/, "");
      const checkbox = checked ? chalk.green("[x]") : chalk.dim("[ ]");
      result.push("  " + checkbox + " " + renderInline(content));
      continue;
    }

    // Normal text with inline formatting
    result.push("  " + renderInline(line));
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    const code = codeBuffer.join("\n");
    const highlighted = highlightCode(code, codeLang);
    result.push(chalk.dim("  ┌─" + (codeLang ? ` ${codeLang} ` : "") + "─".repeat(40)));
    for (const codeLine of highlighted.split("\n")) {
      result.push(chalk.dim("  │ ") + codeLine);
    }
    result.push(chalk.dim("  └" + "─".repeat(44)));
  }

  return result.join("\n");
}

/**
 * Render inline markdown: bold, italic, inline code, links, strikethrough.
 */
function renderInline(text: string): string {
  let result = text;

  // Inline code (must be before bold/italic)
  result = result.replace(/`([^`]+)`/g, (_m, code) => chalk.yellow(code));

  // Bold + italic
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, (_m, t) => chalk.bold.italic(t));

  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, (_m, t) => chalk.bold(t));
  result = result.replace(/__([^_]+)__/g, (_m, t) => chalk.bold(t));

  // Italic
  result = result.replace(/\*([^*]+)\*/g, (_m, t) => chalk.italic(t));
  result = result.replace(/_([^_]+)_/g, (_m, t) => chalk.italic(t));

  // Strikethrough
  result = result.replace(/~~([^~]+)~~/g, (_m, t) => chalk.strikethrough(t));

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
    chalk.cyan.underline(text) + chalk.dim(` (${url})`),
  );

  return result;
}

/**
 * Check if text contains markdown formatting worth rendering.
 */
export function hasMarkdown(text: string): boolean {
  return /```|^#+\s|^\s*[-*+]\s|\*\*|`[^`]+`|\[.*\]\(.*\)/.test(text);
}
