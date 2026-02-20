/**
 * WabiSabi ASCII Banner
 *
 * 8-bit style robot mascot (hoodie, dark face, red eyes)
 * alongside "WABI SABI" in large block letters.
 * Colors: grey robot, red eyes, blue->purple gradient text, orange accents.
 */

import chalk from "chalk";

// ── 8-bit Robot (hoodie, dark face, glowing eyes, sneakers) ──

const ROBOT_LINES = [
  "     ┌─────┐     ",
  "    ┌┤ ░░░ ├┐    ",
  "    │├─────┤│    ",
  "    ││ " + "● ●" + " ││    ",
  "    │├─────┤│    ",
  "    └┤ ▬▬▬ ├┘    ",
  "     ├─────┤     ",
  "   ┌─┤     ├─┐   ",
  "   │ ├─────┤ │   ",
  "   └┐│     │┌┘   ",
  "    └┤     ├┘    ",
  "     │ │ │ │     ",
  "     └─┘ └─┘     ",
];

// Colorized robot
function colorizeRobot(): string[] {
  return [
    chalk.gray("     ┌─────┐     "),
    chalk.gray("    ┌┤") + chalk.gray(" ░░░ ") + chalk.gray("├┐    "),
    chalk.gray("    │├─────┤│    "),
    chalk.gray("    ││ ") + chalk.red("● ●") + chalk.gray(" ││    "),
    chalk.gray("    │├─────┤│    "),
    chalk.gray("    └┤") + chalk.gray(" ▬▬▬ ") + chalk.gray("├┘    "),
    chalk.gray("     ├─────┤     "),
    chalk.gray("   ┌─┤     ├─┐   "),
    chalk.gray("   │ ├─────┤ │   "),
    chalk.gray("   └┐│") + chalk.hex("#FF6600")("░░░░░") + chalk.gray("│┌┘   "),
    chalk.gray("    └┤     ├┘    "),
    chalk.gray("     │ │ │ │     "),
    chalk.white("     └─┘ └─┘     "),
  ];
}

// ── WABI SABI block text ──

const WABI_LINES = [
  "██╗    ██╗ █████╗ ██████╗ ██╗",
  "██║    ██║██╔══██╗██╔══██╗██║",
  "██║ █╗ ██║███████║██████╔╝██║",
  "██║███╗██║██╔══██║██╔══██╗██║",
  "╚███╔███╔╝██║  ██║██████╔╝██║",
  " ╚══╝╚══╝ ╚═╝  ╚═╝╚═════╝ ╚═╝",
];

const SABI_LINES = [
  "███████╗ █████╗ ██████╗ ██╗",
  "██╔════╝██╔══██╗██╔══██╗██║",
  "███████╗███████║██████╔╝██║",
  "╚════██║██╔══██║██╔══██╗██║",
  "███████║██║  ██║██████╔╝██║",
  "╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝",
];

function colorizeText(): string[] {
  const result: string[] = [];
  for (let i = 0; i < WABI_LINES.length; i++) {
    const wabi = chalk.blue(WABI_LINES[i]);
    const sabi = chalk.magenta(SABI_LINES[i]);
    result.push(wabi + "  " + sabi);
  }
  return result;
}

// ── Exports ──────────────────────────────────────────────────

/**
 * Full banner for onboarding and first-run splash.
 * Robot on the left, WABI SABI text on the right.
 * ~13 lines tall.
 */
export function showBanner(): string {
  const robot = colorizeRobot();
  const text = colorizeText();
  const lines: string[] = [];

  lines.push("");

  // Robot is 13 lines, text is 6 lines - center text vertically
  const textStart = 3; // Start text at robot line 3 to center
  const maxLines = Math.max(robot.length, text.length + textStart);

  for (let i = 0; i < maxLines; i++) {
    const robotLine = i < robot.length ? robot[i] : " ".repeat(18);
    const textLine = (i >= textStart && i < textStart + text.length)
      ? "  " + text[i - textStart]
      : "";
    lines.push("  " + robotLine + textLine);
  }

  // Tagline
  lines.push("");
  lines.push(
    "  " + " ".repeat(18) + "  " +
    chalk.dim("AI Terminal IDE") +
    chalk.gray(" · ") +
    chalk.dim("v1.0.0"),
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Compact 1-line banner for the TUI header.
 * Shows mini robot face + "WABI SABI" styled.
 */
export function showBannerCompact(): string {
  const face = chalk.gray("[ ") + chalk.red("●●") + chalk.gray(" ]");
  const name = chalk.blue.bold("WABI") + chalk.magenta.bold(" SABI");
  const ver = chalk.dim("v1.0.0");
  return `${face} ${name} ${ver}`;
}

/**
 * Compact 2-line banner for TUI header area.
 * Line 1: Robot face + WABI SABI + version
 * Line 2: Tagline
 */
export function showBannerMini(): { line1: string; line2: string } {
  const face = chalk.gray("[ ") + chalk.red("●●") + chalk.gray(" ]");
  const name = chalk.blue.bold("WABI") + chalk.magenta.bold(" SABI");
  const ver = chalk.dim("v1.0.0");
  return {
    line1: `${face} ${name} ${ver}`,
    line2: chalk.dim("AI Terminal IDE"),
  };
}

/**
 * Quick-start guide shown after onboarding.
 * Uses orange for command highlights.
 */
export function showQuickStartGuide(): string {
  const lines: string[] = [];

  lines.push(chalk.bold("  Quick Start"));
  lines.push(chalk.dim("  " + "─".repeat(45)));
  lines.push("  Type your request and press " + chalk.hex("#FF6600")("Enter"));
  lines.push("");
  lines.push("  " + chalk.hex("#FF6600")("Tab") + "       Cycle agents (BUILD → PLAN → SEARCH)");
  lines.push("  " + chalk.hex("#FF6600")("Ctrl+P") + "    Command palette");
  lines.push("  " + chalk.hex("#FF6600")("Ctrl+T") + "    Toggle task panel");
  lines.push("  " + chalk.hex("#FF6600")("Ctrl+S") + "    Save session");
  lines.push("  " + chalk.hex("#FF6600")("/help") + "     All commands");
  lines.push("  " + chalk.hex("#FF6600")("/tools") + "    Available tools");
  lines.push(chalk.dim("  " + "─".repeat(45)));
  lines.push("");
  lines.push(chalk.bold("  Agents"));
  lines.push("  " + chalk.blue("build") + "   Write and modify code " + chalk.dim("(default)"));
  lines.push("  " + chalk.magenta("plan") + "    Analyze and plan architecture");
  lines.push("  " + chalk.cyan("search") + "  Explore and find code");
  lines.push("");

  return lines.join("\n");
}
