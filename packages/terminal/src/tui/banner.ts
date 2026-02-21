/**
 * WabiSabi ASCII Banner
 *
 * 8-bit pixel-art robot mascot alongside "WABISABI" in large block letters.
 * Displayed as splash screen on startup and in onboarding.
 */

import chalk from "chalk";

// ── Colors ──────────────────────────────────────────────────

const R = chalk.red;          // eyes
const G = chalk.gray;         // robot body
const D = chalk.dim;          // dark details
const W = chalk.white;        // highlights
const O = chalk.hex("#FF6600"); // orange accent (hoodie logo)
const GR = chalk.gray;        // WABI text (gray)
const OT = chalk.hex("#FF6600"); // SABI text (orange)

// ── 8-bit Robot (bigger, pixel-art style) ───────────────────
// Hoodie bot with dark visor, glowing red eyes, sneakers
// ~15 lines tall, ~22 chars wide

function colorizeRobot(): string[] {
  return [
    G("        ▄██████▄        "),
    G("      ▄██") + D("░░░░░░") + G("██▄      "),
    G("     ███") + D("░░░░░░░░") + G("███     "),
    G("    ███") + D("░░░░░░░░░░") + G("███    "),
    G("    ███") + D("░░") + R("██") + D("░░░░") + R("██") + D("░░") + G("███    "),
    G("    ███") + D("░░") + R("██") + D("░░░░") + R("██") + D("░░") + G("███    "),
    G("    ███") + D("░░░░░░░░░░") + G("███    "),
    G("    ███") + D("░░") + W("▄████▄") + D("░░") + G("███    "),
    G("     ███") + D("░░░░░░░░") + G("███     "),
    G("      ▀██") + D("██████") + G("██▀      "),
    G("     ▄███") + O("████████") + G("███▄     "),
    G("    ████") + O("░░░░░░░░") + G("████    "),
    G("    ████") + O("░░") + W("▄██▄") + O("░░") + G("████    "),
    G("     ███") + O("░░░░░░░░") + G("███     "),
    G("      ██") + G("████████") + G("██      "),
    G("      ██") + G("██") + D("    ") + G("██") + G("██      "),
    W("      ▀██▀") + D("    ") + W("▀██▀      "),
  ];
}

// ── WABISABI unified block text ─────────────────────────────
// Flat style, fixed-width letters (W7 A7 B7 I2 · S7 A7 B7 I2)
// WABI = gray, SABI = orange

const WABISABI_LINES = [
  "██   ██  █████  ██████  ██ ███████  █████  ██████  ██",
  "██   ██ ██   ██ ██   ██ ██ ██      ██   ██ ██   ██ ██",
  "██ █ ██ ███████ ██████  ██ ███████ ███████ ██████  ██",
  "███ ███ ██   ██ ██   ██ ██      ██ ██   ██ ██   ██ ██",
  " █   █  ██   ██ ██████  ██ ███████ ██   ██ ██████  ██",
];

function colorizeWabisabi(): string[] {
  // WABI = first 26 chars (W+A+B+I), SABI = last 26 chars (S+A+B+I)
  return WABISABI_LINES.map((line) => {
    const wabi = line.slice(0, 26);
    const gap = line.slice(26, 27);
    const sabi = line.slice(27);
    return GR(wabi) + gap + OT(sabi);
  });
}

// ── Exports ─────────────────────────────────────────────────

/**
 * Full splash banner for startup and onboarding.
 * Robot on the left, WABISABI text on the right.
 * ~17 lines tall.
 */
export function showBanner(): string {
  const robot = colorizeRobot();
  const text = colorizeWabisabi();
  const lines: string[] = [];

  lines.push("");

  // Robot is 17 lines, text is 6 lines - center text vertically beside robot
  const textStart = 5; // vertically center the text against the robot
  const maxLines = Math.max(robot.length, text.length + textStart);

  for (let i = 0; i < maxLines; i++) {
    const robotLine = i < robot.length ? robot[i] : " ".repeat(24);
    const textLine = (i >= textStart && i < textStart + text.length)
      ? "  " + text[i - textStart]
      : "";
    lines.push("  " + robotLine + textLine);
  }

  // Tagline under the text block
  lines.push("");
  lines.push(
    "  " + " ".repeat(24) + "  " +
    D("AI Terminal IDE") +
    G(" · ") +
    D("v1.0.0"),
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Startup splash for the TUI output panel.
 * Shows the full robot + WABISABI text, plus status info.
 */
export function showSplash(info: {
  model?: string;
  provider?: string;
  cwd?: string;
}): string {
  const banner = showBanner();
  const lines = [banner];

  // Status line
  const parts: string[] = [];
  if (info.model) parts.push(G("model:") + " " + W(info.model));
  if (info.provider) parts.push(G("provider:") + " " + W(info.provider));
  if (info.cwd) parts.push(G("cwd:") + " " + D(info.cwd));

  if (parts.length > 0) {
    lines.push("  " + " ".repeat(24) + "  " + parts.join(G("  ·  ")));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Compact 1-line banner for the TUI header bar.
 */
export function showBannerCompact(): string {
  const face = G("[") + R("··") + G("]");
  const name = OT.bold("WABI") + W.bold("SABI");
  const ver = D("v1.0.0");
  return `${face} ${name} ${ver}`;
}

/**
 * Compact 2-line banner for TUI header area.
 */
export function showBannerMini(): { line1: string; line2: string } {
  const face = G("[") + R("··") + G("]");
  const name = OT.bold("WABI") + W.bold("SABI");
  const ver = D("v1.0.0");
  return {
    line1: `${face} ${name} ${ver}`,
    line2: D("AI Terminal IDE"),
  };
}

/**
 * Quick-start guide shown after onboarding.
 */
export function showQuickStartGuide(): string {
  const lines: string[] = [];

  lines.push(chalk.bold("  Quick Start"));
  lines.push(D("  " + "-".repeat(45)));
  lines.push("  Type your request and press " + O("Enter"));
  lines.push("");
  lines.push("  " + O("Tab") + "       Cycle agents (BUILD > PLAN > SEARCH)");
  lines.push("  " + O("Ctrl+P") + "    Command palette");
  lines.push("  " + O("Ctrl+T") + "    Toggle task panel");
  lines.push("  " + O("Ctrl+S") + "    Save session");
  lines.push("  " + O("/help") + "     All commands");
  lines.push("  " + O("/tools") + "    Available tools");
  lines.push(D("  " + "-".repeat(45)));
  lines.push("");
  lines.push(chalk.bold("  Agents"));
  lines.push("  " + GR("build") + "   Write and modify code " + D("(default)"));
  lines.push("  " + OT("plan") + "    Analyze and plan architecture");
  lines.push("  " + chalk.cyan("search") + "  Explore and find code");
  lines.push("");

  return lines.join("\n");
}
