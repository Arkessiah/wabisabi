/**
 * Header Bar Panel
 *
 * 3-row panel showing:
 *   Row 1: WABI SABI branding (robot face + name + version)
 *   Row 2: agent type, model, provider, session, tokens
 *   Row 3: separator (drawn by engine)
 * Always visible at the top of the screen.
 */

import { Panel } from "./panel.js";
import { style, padAnsi, visibleLength } from "./ansi.js";
import type { HeaderInfo } from "./types.js";
import { showBannerCompact } from "./banner.js";
import chalk from "chalk";

export class HeaderBar extends Panel {
  private info: HeaderInfo = {
    agent: "build",
    agentIcon: "🏗️",
    agentLabel: "BUILD",
    model: "---",
    provider: "---",
    sessionId: "---",
    tokens: { prompt: 0, completion: 0, total: 0 },
    contextUsage: 0,
  };

  update(partial: Partial<HeaderInfo>): void {
    this.info = { ...this.info, ...partial };
    this._dirty = true;
  }

  render(): string {
    const { x, y, width } = this._bounds;
    let buf = "";

    // ── Row 1: Branding ──
    const banner = showBannerCompact();
    buf += `\x1B[${y};${x}H`;
    buf += style.bg.gray;
    buf += padAnsi(` ${banner}`, width);
    buf += style.reset;

    // ── Row 2: Status bar ──
    const tokStr = this.formatTokens(this.info.tokens.total);
    const ctxPct = Math.round(this.info.contextUsage * 100);
    const ctxColor = ctxPct > 75 ? chalk.red : ctxPct > 50 ? chalk.yellow : chalk.green;
    const ctxStr = ctxPct > 0 ? ctxColor(`${ctxPct}%`) : "";

    const agentSeg = chalk.bgCyan.black.bold(` ${this.info.agentIcon} ${this.info.agentLabel} `);
    const modelSeg = chalk.white(` ${this.info.model} `);
    const providerSeg = chalk.dim(`${this.info.provider}`);
    const sessionSeg = chalk.dim(`ses:${this.info.sessionId.slice(0, 6)}`);
    const tokenSeg = chalk.yellow(tokStr);

    const leftPart = `${agentSeg} ${modelSeg}${chalk.dim("│")} ${providerSeg}`;
    const rightPart = `${sessionSeg} ${chalk.dim("│")} ${tokenSeg}${ctxStr ? ` ${ctxStr}` : ""}`;

    const leftLen = visibleLength(leftPart);
    const rightLen = visibleLength(rightPart);
    const gap = Math.max(1, width - leftLen - rightLen);

    const fullBar = leftPart + " ".repeat(gap) + rightPart;

    buf += `\x1B[${y + 1};${x}H`;
    buf += style.bg.gray;
    buf += padAnsi(fullBar, width);
    buf += style.reset;

    // ── Row 3: Separator ──
    buf += `\x1B[${y + 2};${x}H`;
    buf += style.dim;
    buf += "─".repeat(width);
    buf += style.reset;

    this._dirty = false;
    return buf;
  }

  private formatTokens(n: number): string {
    if (n === 0) return "0 tok";
    if (n < 1000) return `${n} tok`;
    if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k tok`;
    return `${(n / 1_000_000).toFixed(1)}M tok`;
  }
}
