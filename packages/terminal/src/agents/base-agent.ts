/**
 * Base Agent
 *
 * Abstract base class with streaming tool-calling loop. All agents extend this.
 * Handles: project context, session management, tool execution, slash commands,
 * and the iterative LLM → tool → LLM streaming loop.
 *
 * I/O is abstracted via TerminalIO interface - supports both legacy readline
 * and the new TUI panel system.
 */

import {
  ApiClient,
  type CLIOptions,
  type ChatMessage,
  type ToolCall,
  type StreamResult,
  type TokenUsage,
} from "../clients/api-client.js";
import { toolRegistry, type ToolSpec } from "../tools/index.js";
import { projectContext } from "../context/index.js";
import { sessionManager } from "../session/index.js";
import { PlanMdManager } from "../context/plan-md.js";
import { configManager } from "../config/index.js";
import { menuSystem } from "../services/menu-system.js";
import {
  shouldCompact,
  compactMessages,
  buildCompactionPrompt,
  estimateConversationTokens,
  getModelContextLimit,
} from "../context/compactor.js";
import {
  THINKING_HATS,
  TECHNICAL_PROFILES,
  COMMUNICATION_STYLES,
  setHat,
  setProfile,
  setStyle,
  resetProfile,
  loadProfile,
  buildProfilePrompt,
  getProfileSummary,
  getActiveProfile,
  PROFILE_PRESETS,
  setPreset,
  getProfileIndicator,
} from "../profiles/index.js";
import { soulManager } from "../soul/index.js";
import {
  ramManager,
  classifyComplexity,
} from "../ram/index.js";
import { isFirstRun, runOnboarding } from "../onboarding.js";
import { renderMarkdown, hasMarkdown } from "../rendering/index.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk from "chalk";
import type { TerminalIO } from "../tui/types.js";
import { LegacyTerminalIO } from "../tui/legacy-io.js";
import { agentSwitcher } from "../services/agent-switcher.js";
import { cortexEngine } from "../cortex/index.js";
import { detectTestCommand, runAutofixLoop, type AutofixConfig } from "../services/autofix-loop.js";
import { ProgramMdManager } from "../context/program-md.js";

// Tools that modify files - auto-log to PLAN.md
const MUTATING_TOOLS = new Set(["write", "edit", "bash"]);
const MAX_TOOL_ITERATIONS = 25; // Safety limit for tool-calling loop

// ── Base Agent ──────────────────────────────────────────────────

export abstract class BaseAgent {
  protected client: ApiClient;
  protected opts: CLIOptions;
  protected conversationHistory: ChatMessage[] = [];
  protected toolSpecs: ToolSpec[] = [];
  protected autoApprove = false;
  protected io: TerminalIO;
  private totalTokens = { prompt: 0, completion: 0, total: 0 };
  private lastPromptTokens = 0; // Last known prompt_tokens from API

  constructor(opts: CLIOptions, io?: TerminalIO) {
    this.opts = opts;
    this.client = new ApiClient(opts);
    this.io = io || new LegacyTerminalIO();
  }

  /** Last auto-loaded skill block, to avoid re-injecting it every turn. */
  private lastAutoLoadedSkill = "";

  abstract getSystemPrompt(): string;
  abstract getAvailableToolIds(): string[];
  abstract getHeader(): string;

  /** Get the TerminalIO instance */
  getIO(): TerminalIO { return this.io; }

  /** Set a new TerminalIO instance (for switching between legacy and TUI) */
  setIO(io: TerminalIO): void { this.io = io; }

  /** Get token usage stats */
  getTokenStats(): { prompt: number; completion: number; total: number; lastPrompt: number } {
    return { ...this.totalTokens, lastPrompt: this.lastPromptTokens };
  }

  /**
   * Rebuild the system message when profile changes.
   * Updates the first message in conversationHistory in-place.
   */
  private rebuildSystemMessage(complexity: "simple" | "moderate" | "complex" = "moderate"): void {
    if (this.conversationHistory.length === 0) return;
    const contextPrompt = projectContext.getProjectRoot()
      ? projectContext.getSystemPrompt()
      : "";
    const profilePrompt = buildProfilePrompt();
    const soulContext = soulManager.buildSoulContext();
    const ramContext = ramManager.buildRamContext(complexity);
    const programContext = (() => {
      const cwd = projectContext.getProjectRoot();
      if (!cwd) return "";
      const pm = new ProgramMdManager(cwd);
      return pm.buildProgramContext();
    })();
    this.conversationHistory[0] = {
      role: "system",
      content: `${this.getSystemPrompt()}${profilePrompt}${soulContext}${ramContext}${programContext}\n\n${contextPrompt}`,
    };
  }

  /**
   * Handle slash commands. Returns true if the input was a command.
   */
  protected async handleSlashCommand(input: string): Promise<boolean> {
    const parts = input.slice(1).split(/\s+/);
    const cmd = parts[0];

    switch (cmd) {
      case "help":
      case "h":
        this.io.writeOutput(
          chalk.bold("\n  Slash Commands\n") +
            chalk.dim("  ──────────────────────────────────\n") +
            "  /help             Show this help\n" +
            "  /clear            Clear screen\n" +
            "  /model <name>     Change model\n" +
            "  /status           Show current status\n" +
            "  /tools            List available tools\n" +
            "  /skills           List project skills\n" +
            "  /approve          Toggle auto-approve for tools\n" +
            "  /compact          Smart compact conversation history\n" +
            "  /export [file]    Export conversation to markdown\n" +
            "  /menu [cat]       Show config menu\n" +
            "  /session          Show session info\n" +
            "  /sessions         List recent sessions\n" +
            "  /soul             Show/edit personal memory (SOUL)\n" +
            chalk.dim("  ──────────────────────────────────\n") +
            chalk.bold("  Memory (RAM)\n") +
            "  /ram              Show working memory status\n" +
            "  /pin <text>       Pin important fact/decision\n" +
            "  /pins             List pinned items\n" +
            "  /unpin <id>       Remove a pin\n" +
            "  /device <type>    Set device profile (mobile/laptop/desktop/server)\n" +
            "  /cortex           Show Cortex ML stats & token savings\n" +
            chalk.dim("  ──────────────────────────────────\n") +
            chalk.bold("  Profiles (Six Hats)\n") +
            "  /hat [name]       Set thinking hat (white/red/black/yellow/green/blue)\n" +
            "  /profile [name]   Set technical profile (security/devops/frontend/backend/...)\n" +
            "  /style [name]     Set communication style (formal/technical/colloquial/mentor)\n" +
            "  /reset            Reset all profiles to default\n" +
            chalk.dim("  ──────────────────────────────────\n") +
            "  exit              Exit the agent\n",
        );
        return true;

      case "clear":
      case "cls":
        this.io.clearOutput();
        return true;

      case "model":
        if (parts[1]) {
          this.client.model = parts[1];
          configManager.update("model", parts[1]);
          this.io.writeOutput(chalk.green(`  Model changed to: ${parts[1]} (saved)`));
          this.io.updateHeader({ model: parts[1] });
        } else {
          this.io.writeOutput(`  Current model: ${chalk.bold(this.client.model)}`);
        }
        return true;

      case "status": {
        const sessionId = sessionManager.getCurrent()?.id || "none";
        const tokenInfo = this.totalTokens.total > 0
          ? `${this.totalTokens.total} (${this.totalTokens.prompt} in, ${this.totalTokens.completion} out)`
          : "0";
        const ctxLimit = ramManager.getEffectiveContextLimit(getModelContextLimit(this.client.model));
        const ctxUsed = this.lastPromptTokens || estimateConversationTokens(this.conversationHistory);
        const ctxPct = Math.round((ctxUsed / ctxLimit) * 100);
        const ctxColor = ctxPct > 75 ? chalk.red : ctxPct > 50 ? chalk.yellow : chalk.green;
        const dp = ramManager.getDeviceProfile();
        const profileInfo = getProfileSummary();
        const provider = this.client.getActiveProvider();
        this.io.writeOutput(
          chalk.bold("\n  Status\n") +
            chalk.dim("  ──────────────────────────────────\n") +
            `  Agent:    ${this.constructor.name}\n` +
            `  Model:    ${this.client.model}\n` +
            `  Provider: ${provider}\n` +
            `  Profile:  ${profileInfo}\n` +
            `  Session:  ${sessionId}\n` +
            `  Messages: ${this.conversationHistory.length}\n` +
            `  Tokens:   ${tokenInfo}\n` +
            `  Context:  ${ctxColor(`${ctxUsed}/${ctxLimit} (${ctxPct}%)`)}\n` +
            `  Soul:     ${soulManager.getSoul().preferences.language}/${soulManager.getSoul().preferences.technicalLevel}/${soulManager.getSoul().preferences.responseTone}\n` +
            `  RAM:      ${ramManager.getPins().length} pins, ${ramManager.getActiveFiles().length} files, device=${dp.type}\n` +
            `  Tools:    ${this.getAvailableToolIds().join(", ")}\n` +
            `  Project:  ${projectContext.getProjectRoot()}\n`,
        );
        return true;
      }

      case "tools": {
        let output = chalk.bold("\n  Available Tools\n");
        for (const id of this.getAvailableToolIds()) {
          const tool = toolRegistry.get(id);
          if (tool) {
            output += `  ${chalk.cyan(id.padEnd(10))} ${chalk.dim(tool.description.slice(0, 60))}\n`;
          }
        }
        this.io.writeOutput(output);
        return true;
      }

      case "skills": {
        const mgr = projectContext.getSkills();
        const skills = mgr?.list() ?? [];
        const drafts = mgr?.listDrafts() ?? [];

        if (drafts.length > 0) {
          let head = chalk.bold("\n  Propuestas de skill (cosechadas de objetivos cumplidos)\n");
          for (const d of drafts) {
            head += `  ${chalk.yellow(d.name.padEnd(28))} ${chalk.dim(d.description.slice(0, 46))}\n`;
            head += chalk.dim(`  ${" ".repeat(28)} ${d.path}\n`);
          }
          head += chalk.dim("\n  No se cargan en ningun prompt hasta que las adoptes.\n");
          head += chalk.dim("  Revisalas, editalas, y luego: wabisabi skills adopt <nombre>\n");
          this.io.writeOutput(head);
        }

        if (skills.length === 0) {
          this.io.writeOutput(
            chalk.dim("\n  Sin skills. Crea .agents/skills/<nombre>/SKILL.md\n"),
          );
          return true;
        }
        let output = chalk.bold("\n  Project Skills\n");
        for (const s of skills) {
          const scope = s.scope === "project" ? "proyecto" : "usuario";
          output += `  ${chalk.cyan(s.name.padEnd(28))} ${chalk.dim(`[${scope}] ` + s.description.slice(0, 50))}\n`;
        }
        for (const w of mgr?.getWarnings() ?? []) {
          output += chalk.yellow(`  ! ${w}\n`);
        }
        this.io.writeOutput(output);
        return true;
      }

      case "compact": {
        const keep = 10;
        const system = this.conversationHistory[0];
        const total = this.conversationHistory.length;

        if (total <= keep + 1) {
          this.io.writeOutput(chalk.dim("  Nothing to compact."));
          return true;
        }

        const oldMessages = this.conversationHistory.slice(1, -keep);
        const summaryParts: string[] = [];
        for (const msg of oldMessages) {
          if (msg.role === "user" && msg.content) {
            summaryParts.push(`User asked: ${String(msg.content).slice(0, 100)}`);
          } else if (msg.role === "assistant" && msg.content) {
            summaryParts.push(`Assistant: ${String(msg.content).slice(0, 100)}`);
          } else if (msg.role === "tool" && msg.content) {
            summaryParts.push(`Tool result: ${String(msg.content).slice(0, 60)}`);
          }
        }

        const summaryMsg: ChatMessage = {
          role: "user",
          content: `[Context summary of ${oldMessages.length} earlier messages]\n${summaryParts.join("\n")}`,
        };

        const recent = this.conversationHistory.slice(-keep);
        this.conversationHistory = [system, summaryMsg, ...recent];
        this.io.writeOutput(
          chalk.green(`  Compacted: ${oldMessages.length} messages -> summary + last ${keep}`),
        );
        return true;
      }

      case "export": {
        const session = sessionManager.getCurrent();
        if (!session) {
          this.io.writeOutput(chalk.dim("  No active session."));
          return true;
        }
        const filename = parts[1] || `${session.id}.md`;
        const exportPath = join(projectContext.getProjectRoot(), filename);

        const lines: string[] = [
          `# ${session.title}`,
          "",
          `- **Agent**: ${session.agent}`,
          `- **Model**: ${session.model}`,
          `- **Date**: ${new Date(session.created).toLocaleString()}`,
          `- **Messages**: ${session.messages.length}`,
          "",
          "---",
          "",
        ];

        for (const msg of this.conversationHistory) {
          if (msg.role === "system") continue;
          const label =
            msg.role === "user" ? "**User**" :
            msg.role === "assistant" ? "**Assistant**" :
            msg.role === "tool" ? "_Tool_" : msg.role;
          const content = String(msg.content || "").trim();
          if (!content) continue;
          lines.push(`### ${label}\n`);
          lines.push(content);
          lines.push("");
        }

        writeFileSync(exportPath, lines.join("\n"), "utf-8");
        this.io.writeOutput(chalk.green(`  Exported to: ${exportPath}`));
        return true;
      }

      case "approve":
      case "auto":
        this.autoApprove = !this.autoApprove;
        this.io.writeOutput(
          this.autoApprove
            ? chalk.yellow("  Auto-approve ON - tools will run without confirmation")
            : chalk.green("  Auto-approve OFF - destructive tools will ask for confirmation"),
        );
        return true;

      case "session": {
        const session = sessionManager.getCurrent();
        if (session) {
          this.io.writeOutput(
            chalk.bold("\n  Session\n") +
              chalk.dim("  ──────────────────────────────────\n") +
              `  ID:       ${session.id}\n` +
              `  Title:    ${session.title}\n` +
              `  Messages: ${session.messages.length}\n` +
              `  Created:  ${new Date(session.created).toLocaleString()}\n`,
          );
        }
        return true;
      }

      case "sessions": {
        const sessions = await sessionManager.listRecent(10);
        if (sessions.length === 0) {
          this.io.writeOutput(chalk.dim("  No sessions found."));
        } else {
          let output = chalk.bold("\n  Recent Sessions\n");
          for (const s of sessions) {
            const date = new Date(s.updated).toLocaleString();
            const current = sessionManager.getCurrent()?.id === s.id ? chalk.green(" (current)") : "";
            output += `  ${chalk.cyan(s.id)}  ${s.title.slice(0, 25).padEnd(25)}  ${chalk.dim(date)}${current}\n`;
          }
          output += chalk.dim("\n  Resume with: wabisabi session --resume <id>");
          this.io.writeOutput(output);
        }
        return true;
      }

      case "menu": {
        if (this.io.isTui) {
          // In TUI mode, open command palette instead of legacy menu
          const { TuiTerminalIO } = await import("../tui/tui-io.js");
          const items = TuiTerminalIO.buildPaletteItems({
            currentAgent: agentSwitcher.get(),
            currentModel: this.client.model,
            currentProvider: this.client.getActiveProvider(),
            tokens: this.totalTokens,
            contextUsage: this.lastPromptTokens / ramManager.getEffectiveContextLimit(getModelContextLimit(this.client.model)),
          });
          await this.io.openCommandPalette(items);
        } else {
          const category = parts[1] as import("../services/menu-system.js").MenuCategory | undefined;
          if (category) {
            menuSystem.setCategory(category);
          }
          menuSystem.open();
          await this.runInteractiveMenu();
          menuSystem.close();
        }
        return true;
      }

      case "hat": {
        const hatId = parts[1];
        if (!hatId) {
          let output = chalk.bold("\n  Thinking Hats\n");
          const active = getActiveProfile().hat;
          for (const hat of Object.values(THINKING_HATS)) {
            const marker = active === hat.id ? chalk.green(" (active)") : "";
            output += `  ${hat.emoji} ${chalk.bold(hat.id.padEnd(8))} ${chalk.dim(hat.description)}${marker}\n`;
          }
          output += chalk.dim("\n  Usage: /hat <name> or /hat off\n");
          this.io.writeOutput(output);
          return true;
        }
        if (hatId === "off" || hatId === "none") {
          setHat(null);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green("  Thinking hat removed."));
        } else if (setHat(hatId)) {
          const hat = THINKING_HATS[hatId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          this.io.writeOutput(chalk.green(`  ${hat.emoji} ${hat.name} activated: ${hat.description}`));
        } else {
          this.io.writeOutput(chalk.yellow(`  Unknown hat: ${hatId}. Use /hat to see options.`));
        }
        return true;
      }

      case "profile":
      case "prof": {
        const profId = parts[1];
        if (!profId) {
          let output = chalk.bold("\n  Technical Profiles\n");
          const active = getActiveProfile().profile;
          for (const prof of Object.values(TECHNICAL_PROFILES)) {
            const marker = active === prof.id ? chalk.green(" (active)") : "";
            output += `  ${prof.emoji} ${chalk.bold(prof.id.padEnd(12))} ${chalk.dim(prof.description)}${marker}\n`;
          }
          output += chalk.dim("\n  Usage: /profile <name> or /profile off\n");
          this.io.writeOutput(output);
          return true;
        }
        if (profId === "off" || profId === "none") {
          setProfile(null);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green("  Technical profile removed."));
        } else if (setProfile(profId)) {
          const prof = TECHNICAL_PROFILES[profId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          this.io.writeOutput(chalk.green(`  ${prof.emoji} ${prof.name} activated: ${prof.description}`));
        } else {
          this.io.writeOutput(chalk.yellow(`  Unknown profile: ${profId}. Use /profile to see options.`));
        }
        return true;
      }

      case "style": {
        const styleId = parts[1];
        if (!styleId) {
          let output = chalk.bold("\n  Communication Styles\n");
          const active = getActiveProfile().style;
          for (const s of Object.values(COMMUNICATION_STYLES)) {
            const marker = active === s.id ? chalk.green(" (active)") : "";
            output += `  ${chalk.bold(s.id.padEnd(12))} ${chalk.dim(s.description)}${marker}\n`;
          }
          output += chalk.dim("\n  Usage: /style <name> or /style off\n");
          this.io.writeOutput(output);
          return true;
        }
        if (styleId === "off" || styleId === "none") {
          setStyle(null);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green("  Communication style removed."));
        } else if (setStyle(styleId)) {
          const s = COMMUNICATION_STYLES[styleId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          this.io.writeOutput(chalk.green(`  Style set to ${s.name}: ${s.description}`));
        } else {
          this.io.writeOutput(chalk.yellow(`  Unknown style: ${styleId}. Use /style to see options.`));
        }
        return true;
      }

      case "reset": {
        resetProfile();
        this.rebuildSystemMessage();
        configManager.update("profile", getActiveProfile());
        this.io.writeOutput(chalk.green("  All profiles reset to default."));
        return true;
      }

      case "preset": {
        const presetId = parts[1];
        if (!presetId) {
          let output = chalk.bold("\n  Profile Presets\n");
          const active = getActiveProfile();
          for (const preset of Object.values(PROFILE_PRESETS)) {
            const isActive = active.hat === preset.hat && active.profile === preset.profile && active.style === preset.style;
            const marker = isActive ? chalk.green(" (active)") : "";
            output += `  ${preset.emoji} ${chalk.bold(preset.id.padEnd(16))} ${chalk.dim(preset.description)}${marker}\n`;
          }
          output += chalk.dim("\n  Usage: /preset <name>\n");
          this.io.writeOutput(output);
          return true;
        }
        if (setPreset(presetId)) {
          const preset = PROFILE_PRESETS[presetId];
          this.rebuildSystemMessage();
          configManager.update("profile", getActiveProfile());
          this.io.writeOutput(chalk.green(`  ${preset.emoji} ${preset.name} activated: ${preset.description}`));
        } else {
          this.io.writeOutput(chalk.yellow(`  Unknown preset: ${presetId}. Use /preset to see options.`));
        }
        return true;
      }

      case "soul": {
        const subCmd = parts[1];
        const subArg = parts[2];

        if (!subCmd) {
          this.io.writeOutput(
            chalk.bold("\n  SOUL (Personal Memory)\n") +
            chalk.dim("  ──────────────────────────────────\n") +
            soulManager.getSummary() +
            chalk.dim("\n  ──────────────────────────────────\n") +
            chalk.dim("\n  /soul set <key> <value>  Set preference\n") +
            chalk.dim("  /soul reset              Reset soul to defaults\n"),
          );
          return true;
        }

        if (subCmd === "set" && subArg) {
          const key = subArg;
          const value = parts[3] || "";
          const validKeys: Record<string, string[]> = {
            language: ["espanol", "ingles", "bilingue"],
            level: ["junior", "intermedio", "senior", "experto"],
            tone: ["formal", "casual", "tecnico"],
            length: ["breve", "medio", "detallado"],
            format: ["markdown", "texto-plano", "codigo-formateado"],
          };

          const keyMap: Record<string, string> = {
            language: "language",
            lang: "language",
            level: "technicalLevel",
            tone: "responseTone",
            length: "responseLength",
            format: "preferredFormat",
          };

          const mappedKey = keyMap[key];
          if (!mappedKey) {
            this.io.writeOutput(chalk.yellow(`  Unknown preference: ${key}\n`) +
              chalk.dim(`  Valid keys: ${Object.keys(validKeys).join(", ")}`));
            return true;
          }

          const allowed = validKeys[key] || validKeys[Object.keys(keyMap).find((k) => keyMap[k] === mappedKey) || ""];
          if (!value || !allowed?.includes(value)) {
            this.io.writeOutput(chalk.yellow(`  Invalid value for ${key}: ${value || "(empty)"}\n`) +
              chalk.dim(`  Valid values: ${allowed?.join(", ")}`));
            return true;
          }

          soulManager.setPreference(mappedKey as any, value as any);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green(`  Soul updated: ${key} = ${value}`));
          return true;
        }

        if (subCmd === "reset") {
          const soul = soulManager.getSoul();
          this.io.writeOutput(chalk.yellow(`  This will reset all learned patterns and preferences.\n`) +
            chalk.yellow(`  Soul ID: ${soul.metadata.id.slice(0, 8)}...`));
          soulManager.setPreference("language", "espanol");
          soulManager.setPreference("technicalLevel", "senior");
          soulManager.setPreference("responseTone", "tecnico");
          soulManager.setPreference("responseLength", "medio");
          soulManager.setPreference("preferredFormat", "markdown");
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green("  Soul preferences reset to defaults."));
          return true;
        }

        this.io.writeOutput(chalk.yellow(`  Unknown soul command: ${subCmd}. Use /soul for help.`));
        return true;
      }

      case "ram": {
        this.io.writeOutput(
          chalk.bold("\n  RAM (Working Memory)\n") +
          chalk.dim("  ──────────────────────────────────\n") +
          ramManager.getSummary() +
          chalk.dim("\n  ──────────────────────────────────\n"),
        );
        return true;
      }

      case "pin": {
        const text = parts.slice(1).join(" ");
        if (!text) {
          this.io.writeOutput(chalk.dim("  Usage: /pin <text to remember>"));
          return true;
        }
        const pin = ramManager.pin(text, "fact", "user", 0.8);
        this.rebuildSystemMessage();
        this.io.writeOutput(chalk.green(`  Pinned [${pin.id}]: ${text}`));
        // Update task panel in TUI mode
        this.io.updatePins(ramManager.getPins());
        return true;
      }

      case "pins": {
        const pins = ramManager.getPins();
        if (pins.length === 0) {
          this.io.writeOutput(chalk.dim("  No pinned items. Use /pin <text> to add."));
          return true;
        }
        let output = chalk.bold("\n  Pinned Items\n");
        for (const pin of pins) {
          const typeTag = chalk.cyan(pin.type.padEnd(12));
          const imp = chalk.dim(`(${Math.round(pin.importance * 100)}%)`);
          output += `  ${chalk.yellow(pin.id)} ${typeTag} ${pin.content} ${imp}\n`;
        }
        this.io.writeOutput(output);
        return true;
      }

      case "unpin": {
        const pinId = parts[1];
        if (!pinId) {
          this.io.writeOutput(chalk.dim("  Usage: /unpin <id>"));
          return true;
        }
        if (ramManager.unpin(pinId)) {
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green(`  Unpinned: ${pinId}`));
          this.io.updatePins(ramManager.getPins());
        } else {
          this.io.writeOutput(chalk.yellow(`  Pin not found: ${pinId}`));
        }
        return true;
      }

      case "device": {
        const deviceType = parts[1];
        if (!deviceType) {
          const dp = ramManager.getDeviceProfile();
          this.io.writeOutput(
            chalk.bold("\n  Device Profile\n") +
            `  Type:      ${dp.type}\n` +
            `  Context:   ${dp.maxContextTokens} tokens\n` +
            `  Threshold: ${Math.round(dp.compactionThreshold * 100)}%\n` +
            `  Max items: ${dp.maxWorkingMemoryItems}\n` +
            chalk.dim("\n  Usage: /device <mobile|laptop|desktop|server>\n"),
          );
          return true;
        }
        const validTypes = ["mobile", "laptop", "desktop", "server"];
        if (!validTypes.includes(deviceType)) {
          this.io.writeOutput(chalk.yellow(`  Unknown device type: ${deviceType}\n`) +
            chalk.dim(`  Valid types: ${validTypes.join(", ")}`));
          return true;
        }
        const profile = ramManager.setDeviceProfile(deviceType);
        this.io.writeOutput(chalk.green(`  Device profile set: ${profile.type} (${profile.maxContextTokens} max tokens, ${Math.round(profile.compactionThreshold * 100)}% threshold)`));
        return true;
      }

      case "cortex": {
        const stats = cortexEngine.getStats();
        const available = cortexEngine.isAvailable;
        const enabled = cortexEngine.isEnabled;
        this.io.writeOutput(
          chalk.bold("\n  Cortex ML Core\n") +
            chalk.dim("  ──────────────────────────────────\n") +
            `  Status:     ${enabled ? (available ? chalk.green("active") : chalk.yellow("enabled (model unavailable)")) : chalk.dim("disabled")}\n` +
            `  Classified: ${stats.classified}\n` +
            `  Answered:   ${stats.answered}\n` +
            `  Summarized: ${stats.summarized}\n` +
            `  Compacted:  ${stats.compacted}\n` +
            `  Fallbacks:  ${stats.fallbacks}\n` +
            (cortexEngine.lastError
              ? `  Last error: ${chalk.yellow(cortexEngine.lastError)}\n`
              : "") +
            chalk.dim("  ──────────────────────────────────\n") +
            chalk.bold(`  Tokens saved: ~${stats.tokensSaved.toLocaleString()}\n`),
        );
        return true;
      }

      case "autofix": {
        const maxStr = parts[1];
        const max = maxStr ? parseInt(maxStr) : 5;
        const cwd = projectContext.getProjectRoot() || process.cwd();
        const testCmd = detectTestCommand(cwd);

        this.io.writeOutput(chalk.bold("\n  Starting Auto-Fix Loop"));
        this.io.writeOutput(chalk.dim(`  Test command: ${testCmd}`));
        this.io.writeOutput(chalk.dim(`  Max attempts: ${max}\n`));

        const config: AutofixConfig = {
          maxAttempts: max,
          testCommand: testCmd,
          cwd,
          timeout: 120_000,
        };

        const result = await runAutofixLoop(
          config,
          async (testOutput: string, attempt: number) => {
            // Feed the test failure to the LLM and let it fix
            const fixPrompt = `Tests are failing (attempt ${attempt}/${max}). Fix the code.\n\nTest output:\n\`\`\`\n${testOutput.slice(-1000)}\n\`\`\`\n\nAnalyze the error, identify the root cause, and fix it. Only modify what's necessary.`;
            this.conversationHistory.push({ role: "user", content: fixPrompt });
            const streamResult = await this.streamResponse();

            // Execute any tool calls from the fix
            let currentResult = streamResult;
            let iterations = 0;
            while (currentResult.tool_calls.length > 0 && iterations < 10) {
              for (const call of currentResult.tool_calls) {
                const toolResult = await this.executeToolCall(call);
                this.conversationHistory.push({
                  role: "tool",
                  content: toolResult,
                  tool_call_id: call.id,
                });
              }
              currentResult = await this.streamResponse();
              iterations++;
            }

            if (currentResult.content) {
              this.conversationHistory.push({
                role: "assistant",
                content: currentResult.content,
              });
            }

            return currentResult.content?.slice(0, 100) || `fix attempt ${attempt}`;
          },
          (msg) => this.io.writeOutput(msg),
        );

        if (result.success) {
          this.io.writeOutput(chalk.green(`\n  ✓ ${result.finalMessage}`));
        } else {
          this.io.writeOutput(chalk.red(`\n  ✗ ${result.finalMessage}`));
        }
        return true;
      }

      case "program": {
        const subCmd = parts[1];
        const cwd = projectContext.getProjectRoot() || process.cwd();
        const programMd = new ProgramMdManager(cwd);

        if (!subCmd) {
          // Show current PROGRAM.md status
          if (!programMd.exists()) {
            this.io.writeOutput(
              chalk.dim("  No PROGRAM.md found.\n") +
              chalk.dim("  Use /program init to create one.\n") +
              chalk.dim("  Use /program set <objective> to add objectives.\n"),
            );
            return true;
          }

          const objectives = programMd.parseObjectives();
          const constraints = programMd.parseConstraints();
          let output = chalk.bold("\n  PROGRAM.md (Direction Interface)\n");
          output += chalk.dim("  ──────────────────────────────────\n");

          if (objectives.length > 0) {
            output += chalk.bold("  Objectives:\n");
            for (const obj of objectives) {
              const icon = obj.status === "done" ? "✓" : obj.status === "in_progress" ? "→" : obj.status === "blocked" ? "✗" : "○";
              const color = obj.status === "done" ? chalk.green : obj.status === "in_progress" ? chalk.cyan : obj.status === "blocked" ? chalk.red : chalk.white;
              output += `  ${color(`${icon} ${obj.id}. ${obj.text}`)}\n`;
            }
          }

          if (constraints.length > 0) {
            output += chalk.bold("\n  Constraints:\n");
            for (const c of constraints) {
              output += chalk.dim(`  - ${c.text}\n`);
            }
          }

          output += chalk.dim("  ──────────────────────────────────\n");
          this.io.writeOutput(output);
          return true;
        }

        if (subCmd === "init") {
          if (programMd.exists()) {
            this.io.writeOutput(chalk.yellow("  PROGRAM.md already exists."));
            return true;
          }
          const name = projectContext.getProjectRoot()?.split("/").pop() || "project";
          programMd.create(name);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green("  PROGRAM.md created. Edit it to define your objectives."));
          return true;
        }

        if (subCmd === "next") {
          const next = programMd.getNextObjective();
          if (!next) {
            this.io.writeOutput(chalk.green("  All objectives completed or none defined."));
            return true;
          }
          programMd.updateObjectiveStatus(next.id, "in_progress");
          programMd.addLogEntry(`Started: ${next.text}`);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.cyan(`  → Starting objective ${next.id}: ${next.text}`));
          return true;
        }

        if (subCmd === "done") {
          const idStr = parts[2];
          if (!idStr) {
            this.io.writeOutput(chalk.dim("  Usage: /program done <id>"));
            return true;
          }
          programMd.updateObjectiveStatus(parseInt(idStr), "done");
          programMd.addLogEntry(`Completed objective ${idStr}`);
          this.rebuildSystemMessage();
          this.io.writeOutput(chalk.green(`  ✓ Objective ${idStr} marked as done.`));
          return true;
        }

        this.io.writeOutput(
          chalk.dim("  Commands:\n") +
          chalk.dim("  /program          Show status\n") +
          chalk.dim("  /program init     Create PROGRAM.md\n") +
          chalk.dim("  /program next     Start next pending objective\n") +
          chalk.dim("  /program done <N> Mark objective N as done\n"),
        );
        return true;
      }

      case "experiments": {
        const exps = ramManager.getExperiments(15);
        if (exps.length === 0) {
          this.io.writeOutput(chalk.dim("  No experiments logged yet."));
          return true;
        }
        let output = chalk.bold("\n  Experiment Log\n");
        for (const exp of exps) {
          const icon = exp.result === "success" ? chalk.green("✓") : exp.result === "fail" ? chalk.red("✗") : exp.result === "crash" ? chalk.red("💥") : chalk.yellow("⊘");
          const revert = exp.reverted ? chalk.dim(" (reverted)") : "";
          output += `  ${icon} ${chalk.dim(exp.createdAt.slice(0, 16))} ${exp.description.slice(0, 60)}${revert}\n`;
        }
        this.io.writeOutput(output);
        return true;
      }

      default:
        this.io.writeOutput(chalk.yellow(`  Unknown command: /${cmd}. Type /help for commands.`));
        return true;
    }
  }

  /**
   * Interactive menu with keyboard navigation (legacy mode only).
   * Uses raw mode to capture arrow keys, enter, space, esc.
   */
  private async runInteractiveMenu(): Promise<void> {
    const categories: import("../services/menu-system.js").MenuCategory[] = [
      "models", "skills", "plugins", "privacy", "settings",
    ];

    return new Promise<void>((resolve) => {
      const render = () => {
        process.stdout.write("\x1B[2J\x1B[H");
        console.log(menuSystem.renderToText());
        console.log(chalk.dim("\n  [Arrow keys] Navigate  [Enter] Select  [Space] Toggle  [Tab] Category  [Esc/q] Close"));
      };

      render();

      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.resume();

      const onKey = (key: Buffer) => {
        const s = key.toString();
        if (s === "\x1B" || s === "q") { cleanup(); return; }
        if (s === "\x03") { cleanup(); return; }
        if (s === "\r" || s === "\n") { menuSystem.select(); render(); return; }
        if (s === " ") { menuSystem.toggle(); render(); return; }
        if (s === "\t") {
          const state = menuSystem.getState();
          const idx = categories.indexOf(state.category);
          const next = categories[(idx + 1) % categories.length];
          menuSystem.setCategory(next);
          render();
          return;
        }
        if (s === "\x1B[A") { menuSystem.moveUp(); render(); return; }
        if (s === "\x1B[B") { menuSystem.moveDown(); render(); return; }
        if (s === "\x1B[C") {
          const state = menuSystem.getState();
          const idx = categories.indexOf(state.category);
          if (idx < categories.length - 1) { menuSystem.setCategory(categories[idx + 1]); render(); }
          return;
        }
        if (s === "\x1B[D") {
          const state = menuSystem.getState();
          const idx = categories.indexOf(state.category);
          if (idx > 0) { menuSystem.setCategory(categories[idx - 1]); render(); }
          return;
        }
      };

      const cleanup = () => {
        stdin.removeListener("data", onKey);
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        process.stdout.write("\x1B[2J\x1B[H");
        resolve();
      };

      stdin.on("data", onKey);
    });
  }

  /**
   * Execute one tool call and return the result.
   */
  private async executeToolCall(
    call: ToolCall,
  ): Promise<{ args: Record<string, unknown>; output: string; title: string }> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      args = {};
    }

    const argsPreview = Object.entries(args)
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `${k}=${val.length > 40 ? val.slice(0, 40) + "..." : val}`;
      })
      .join(" ");

    // Confirmation for destructive tools
    if (!this.autoApprove && MUTATING_TOOLS.has(call.function.name)) {
      this.io.writeOutput(
        `\n  ${chalk.yellow("⚠")} ${chalk.bold(call.function.name)} ${chalk.dim(argsPreview)}`,
      );
      const confirmed = await this.io.confirm("Allow this tool call?");
      if (!confirmed) {
        this.io.writeOutput(chalk.dim("  Skipped."));
        return {
          args,
          output: "Tool call was rejected by the user.",
          title: "Rejected",
        };
      }
    }

    const spinner = this.io.showSpinner(
      `${call.function.name} ${chalk.dim(argsPreview)}`,
    );

    try {
      const result = await toolRegistry.execute(call.function.name, args, {
        projectRoot: projectContext.getProjectRoot(),
      });

      spinner.stop(
        `  ${chalk.green("✓")} ${chalk.bold(call.function.name)} ${chalk.dim(result.title)}`,
      );

      // Auto-log mutating tool calls to PLAN.md
      if (MUTATING_TOOLS.has(call.function.name) && !result.metadata?.error) {
        try {
          const planMd = new PlanMdManager(projectContext.getProjectRoot());
          if (planMd.exists()) {
            const summary = `${call.function.name}: ${result.title}`;
            planMd.addAction(summary);
          }
        } catch {
          // Don't fail on plan logging
        }
      }

      // Track tool usage in soul
      soulManager.trackToolUse(call.function.name);

      // Track file access in RAM
      const filePath = (args as any).filePath || (args as any).path;
      if (filePath && typeof filePath === "string") {
        ramManager.trackFileAccess(filePath, result.title);
      }

      // Update task panel after tool execution
      this.io.updateTaskQueue(ramManager.getActiveTasks());

      return { args, output: result.output, title: result.title };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      spinner.stop(
        `  ${chalk.red("✗")} ${chalk.bold(call.function.name)} ${chalk.dim(errMsg)}`,
      );
      return { args, output: `Error: ${errMsg}`, title: "Error" };
    }
  }

  /**
   * Stream a response from the LLM, printing tokens as they arrive.
   * Returns the accumulated result (content + tool_calls).
   */
  private async streamResponse(): Promise<StreamResult> {
    const gen = this.client.chatWithToolsStream(
      this.conversationHistory,
      this.toolSpecs,
    );

    let hasContent = false;
    let result: StreamResult | undefined;

    try {
      while (true) {
        const { done, value } = await gen.next();
        if (done) {
          result = value as StreamResult;
          break;
        }
        // Print content tokens as they arrive
        if (value.content) {
          if (!hasContent) {
            hasContent = true;
          }
          this.io.writeStreamToken(value.content);
        }
      }
    } catch (error) {
      // Fallback to non-streaming on error
      const response = await this.client.chatWithTools(
        this.conversationHistory,
        this.toolSpecs,
      );
      const msg = response.choices[0]?.message;
      if (!msg) {
        return { content: "", tool_calls: [], finish_reason: "error" };
      }
      if (msg.content) {
        this.io.writeOutput(hasMarkdown(msg.content) ? renderMarkdown(msg.content) : msg.content);
      }
      return {
        content: msg.content || "",
        tool_calls: msg.tool_calls || [],
        finish_reason: response.choices[0]?.finish_reason || "stop",
      };
    }

    // Track token usage
    if (result?.usage) {
      this.totalTokens.prompt += result.usage.prompt_tokens;
      this.totalTokens.completion += result.usage.completion_tokens;
      this.totalTokens.total += result.usage.total_tokens;
      this.lastPromptTokens = result.usage.prompt_tokens;

      // Update header with new token info
      const ctxLimit = ramManager.getEffectiveContextLimit(getModelContextLimit(this.client.model));
      this.io.updateHeader({
        tokens: { ...this.totalTokens },
        contextUsage: this.lastPromptTokens / ctxLimit,
      });
    }

    return result!;
  }

  /**
   * Auto-compact conversation when approaching context limit.
   */
  private async autoCompact(): Promise<void> {
    const deviceProfile = ramManager.getDeviceProfile();
    const effectiveLimit = ramManager.getEffectiveContextLimit(
      getModelContextLimit(this.client.model),
    );
    const threshold = deviceProfile.compactionThreshold;

    if (!shouldCompact(
      this.conversationHistory, this.client.model,
      this.lastPromptTokens, threshold, effectiveLimit,
    )) {
      return;
    }

    const limit = effectiveLimit;
    const currentTokens = this.lastPromptTokens || estimateConversationTokens(this.conversationHistory);

    this.io.writeStatus(
      chalk.yellow(
        `\n  Context approaching limit (${Math.round((currentTokens / limit) * 100)}% of ${limit} tokens). Auto-compacting...`,
      ),
    );

    const system = this.conversationHistory[0];
    const keep = 6;
    const oldMessages = this.conversationHistory.slice(1, -keep);
    const recent = this.conversationHistory.slice(-keep);

    if (oldMessages.length <= 2) return;

    let summaryContent: string;

    // Try Cortex first (free, local), then main LLM, then heuristic
    if (cortexEngine.isEnabled && cortexEngine.isAvailable) {
      const cortexResult = await cortexEngine.compact(this.conversationHistory, keep);
      if (cortexResult.length < this.conversationHistory.length) {
        this.conversationHistory = cortexResult;
        this.lastPromptTokens = 0;
        const tokensAfter = estimateConversationTokens(this.conversationHistory);
        this.io.writeOutput(
          chalk.green(
            `  Cortex-compacted: ${oldMessages.length} messages -> summary + last ${keep}` +
              chalk.dim(` (~${currentTokens} -> ~${tokensAfter} tokens)`),
          ),
        );
        return;
      }
    }

    try {
      const compactionPrompt = buildCompactionPrompt(oldMessages);
      const summaryResponse = await this.client.chatWithTools(
        [
          { role: "system", content: "You are a conversation summarizer. Be concise and structured." },
          { role: "user", content: compactionPrompt },
        ],
        [],
      );
      const llmSummary = summaryResponse.choices[0]?.message?.content;

      if (llmSummary && llmSummary.length > 50) {
        summaryContent =
          `[Auto-compacted: ${oldMessages.length} messages summarized by LLM]\n\n${llmSummary}`;
      } else {
        throw new Error("LLM summary too short");
      }
    } catch {
      const result = compactMessages(this.conversationHistory);
      if (!result.compacted || !result.summaryMessage) return;
      summaryContent = String(result.summaryMessage.content);
    }

    const summaryMsg: ChatMessage = {
      role: "user",
      content: summaryContent,
    };

    this.conversationHistory = [system, summaryMsg, ...recent];
    this.lastPromptTokens = 0;

    const tokensAfter = estimateConversationTokens(this.conversationHistory);
    this.io.writeOutput(
      chalk.green(
        `  Compacted: ${oldMessages.length} messages -> summary + last ${keep}` +
          chalk.dim(` (~${currentTokens} -> ~${tokensAfter} tokens)`),
      ),
    );
  }

  async run(resumeSessionId?: string): Promise<void> {
    // Onboarding on first run
    if (isFirstRun()) {
      await runOnboarding();
    }

    // Initialize I/O
    await this.io.init();

    this.io.writeOutput(this.getHeader());

    // Detect provider
    const providerSpinner = this.io.showSpinner("Detecting providers...");
    const provider = await this.client.detectProvider();
    if (this.client.isProviderAvailable()) {
      providerSpinner.stop(
        chalk.green(`  ✓ Provider: ${provider}`) +
          chalk.dim(` (model: ${this.client.model})`),
      );
    } else {
      providerSpinner.stop(
        chalk.yellow(`  ⚠ No providers available`) +
          chalk.dim(` (will retry on each request)`),
      );
      this.io.writeOutput(
        chalk.dim(`    Start Substratum or Ollama, or set --substratum/--ollama URL`),
      );
    }

    // Initialize Cortex ML core
    const cortexConfig = configManager.getMerged().cortex;
    if (cortexConfig?.enabled !== false) {
      // Get first Ollama node URL as fallback endpoint for Cortex
      const merged = configManager.getMerged();
      const ollamaEndpoint = merged.providers?.ollama?.nodes?.[0]?.url
        || merged.ollama
        || "http://localhost:11434";
      cortexEngine.updateConfig(cortexConfig || {}, ollamaEndpoint);
      const cortexAvailable = await cortexEngine.checkAvailability();
      if (cortexAvailable) {
        this.io.writeOutput(chalk.green("  ✓ Cortex ML") + chalk.dim(` (${cortexConfig?.model || "qwen2.5:0.5b"})`));
      }
    }

    // Initialize project context
    const initSpinner = this.io.showSpinner("Initializing project context...");
    await projectContext.initialize();
    initSpinner.stop(
      chalk.green("  ✓ Project context loaded") +
        chalk.dim(` (${projectContext.getProjectRoot()})`),
    );

    // Load saved profile from config
    const savedProfile = configManager.getMerged().profile;
    if (savedProfile) {
      loadProfile(savedProfile as any);
    }

    // Load soul (personal memory)
    soulManager.load();
    soulManager.trackSession();

    // Load RAM (working memory)
    ramManager.load();

    // Track project context in soul
    const root = projectContext.getProjectRoot();
    if (root) {
      const stack = projectContext.getStack();
      const projectName = root.split("/").pop() || root;
      const techs = [
        ...(stack?.languages || []),
        ...(stack?.frameworks || []),
      ].filter(Boolean);
      soulManager.trackProjectContext(root, projectName, techs);
    }

    // Build system message
    const contextPrompt = projectContext.getSystemPrompt();
    const profilePrompt = buildProfilePrompt();
    const soulContext = soulManager.buildSoulContext();
    const ramContext = ramManager.buildRamContext("moderate");
    const systemMessage: ChatMessage = {
      role: "system",
      content: `${this.getSystemPrompt()}${profilePrompt}${soulContext}${ramContext}\n\n${contextPrompt}`,
    };

    // Show active profile if any
    const activeProfileSummary = getProfileSummary();
    if (activeProfileSummary !== "Default (no profile)") {
      this.io.writeOutput(chalk.cyan(`  Profile: ${activeProfileSummary}`));
    }

    this.toolSpecs = toolRegistry.toToolSpecs(this.getAvailableToolIds());

    // Update header with initial state
    const sessionId = sessionManager.getCurrent()?.id || "";
    this.io.updateHeader({
      agent: agentSwitcher.get(),
      agentLabel: agentSwitcher.getInfo().label,
      model: this.client.model,
      provider: provider,
      sessionId,
      tokens: { ...this.totalTokens },
      contextUsage: 0,
    });

    // Update task panel with initial data
    this.io.updateTaskQueue(ramManager.getActiveTasks());
    this.io.updatePins(ramManager.getPins());

    // Resume existing session or create new one
    if (resumeSessionId) {
      const session = await sessionManager.resume(resumeSessionId);
      if (!session) {
        this.io.writeError(`  Session not found: ${resumeSessionId}`);
        return;
      }
      this.io.writeOutput(
        chalk.green(`  ✓ Resumed session: ${session.title}`) +
          chalk.dim(` (${session.messages.length} messages)`),
      );
      this.conversationHistory = [systemMessage];
      for (const msg of session.messages) {
        if (msg.role === "system") continue;
        this.conversationHistory.push({
          role: msg.role,
          content: msg.content,
          ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
        });
      }
    } else {
      await sessionManager.create({
        projectRoot: projectContext.getProjectRoot(),
        model: this.opts.model,
        agent: this.constructor.name,
      });
      this.conversationHistory = [systemMessage];
    }

    // REPL loop
    const agentLabel = chalk.dim(`[${this.constructor.name}]`);

    try {
      while (true) {
        const input = await this.io.readInput(`\n${agentLabel} ${chalk.green(">")} `);
        const trimmed = input.trim();

        if (!trimmed) continue;
        if (trimmed === "exit" || trimmed === "quit") break;

        // Handle slash commands
        if (trimmed.startsWith("/")) {
          await this.handleSlashCommand(trimmed);
          continue;
        }

        // Track interaction in soul
        soulManager.trackInteraction();

        // Cortex pre-LLM: classify and attempt local answer
        if (cortexEngine.isEnabled) {
          const classification = await cortexEngine.classify(trimmed);
          if (
            classification.canAnswerLocally &&
            classification.confidence >= (cortexEngine.thresholds.answerConfidence)
          ) {
            const localAnswer = await cortexEngine.answer(trimmed);
            if (localAnswer) {
              this.io.writeOutput(chalk.dim("[cortex] ") + localAnswer);
              this.conversationHistory.push({ role: "user", content: trimmed });
              this.conversationHistory.push({ role: "assistant", content: localAnswer });
              await sessionManager.addMessage({ role: "user", content: trimmed, timestamp: Date.now() });
              await sessionManager.addMessage({ role: "assistant", content: `[cortex] ${localAnswer}`, timestamp: Date.now() });
              continue;
            }
          }
        }

        // Deterministic skill auto-load: inject the matching project skill as a
        // system message BEFORE the user turn, so small local models get the
        // procedure without having to call the `skill` tool themselves.
        const skillContext = projectContext.getSkills()?.buildAutoLoadContext(trimmed) ?? "";
        if (skillContext && skillContext !== this.lastAutoLoadedSkill) {
          this.conversationHistory.push({ role: "system", content: skillContext });
          this.lastAutoLoadedSkill = skillContext;
        }

        // Add user message
        this.conversationHistory.push({ role: "user", content: trimmed });
        await sessionManager.addMessage({
          role: "user",
          content: trimmed,
          timestamp: Date.now(),
        });

        // Stream + tool-calling loop
        let result = await this.streamResponse();

        // Iterate while the model requests tool calls (with safety limit)
        let toolIterations = 0;
        while (result.tool_calls.length > 0 && toolIterations < MAX_TOOL_ITERATIONS) {
          toolIterations++;
          this.conversationHistory.push({
            role: "assistant",
            content: result.content || null,
            tool_calls: result.tool_calls,
          });

          for (const call of result.tool_calls) {
            const toolResult = await this.executeToolCall(call);

            // Cortex post-tool: summarize long outputs to save context
            let contextOutput = toolResult.output;
            if (
              cortexEngine.isEnabled &&
              cortexEngine.isAvailable &&
              toolResult.output.length > cortexEngine.thresholds.summarizeAbove
            ) {
              const summary = await cortexEngine.summarize(call.function.name, toolResult.output);
              if (summary.length < toolResult.output.length) {
                contextOutput = summary;
              }
            }

            this.conversationHistory.push({
              role: "tool",
              content: contextOutput,
              tool_call_id: call.id,
            });

            await sessionManager.addMessage({
              role: "tool",
              content: toolResult.output,
              timestamp: Date.now(),
              toolCalls: [
                {
                  toolId: call.function.name,
                  args: toolResult.args,
                  result: {
                    title: toolResult.title,
                    output: toolResult.output,
                  },
                  timestamp: Date.now(),
                },
              ],
              toolCallId: call.id,
            });
          }

          result = await this.streamResponse();
        }

        if (toolIterations >= MAX_TOOL_ITERATIONS) {
          this.io.writeOutput(
            chalk.yellow(`\n  Tool iteration limit reached (${MAX_TOOL_ITERATIONS}). Stopping tool loop.`),
          );
        }

        // Save final assistant response
        const answer = result.content || "(no response)";
        this.conversationHistory.push({
          role: "assistant",
          content: answer,
        });
        await sessionManager.addMessage({
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
          // Recorded so a goal loop can price the turn later. Absent when the
          // provider reported nothing: unknown must not be stored as zero.
          ...(result.usage
            ? {
                usage: {
                  promptTokens: result.usage.prompt_tokens,
                  completionTokens: result.usage.completion_tokens,
                },
              }
            : {}),
        });

        // Track model usage in soul
        soulManager.trackModelUse(
          this.client.model,
          answer !== "(no response)" && !answer.startsWith("Error:"),
        );
        soulManager.trackResponseAccepted();

        // Show token usage in legacy mode
        if (!this.io.isTui && this.totalTokens.total > 0) {
          this.io.writeOutput(
            chalk.dim(
              `\n  tokens: ${this.totalTokens.total} (${this.totalTokens.prompt} in, ${this.totalTokens.completion} out)`,
            ),
          );
        }

        // Auto-compact if approaching context limit
        await this.autoCompact();
      }
    } finally {
      // Save session summary to RAM for cross-session continuity
      const recentMsgs = this.conversationHistory.slice(-6);
      const summaryParts: string[] = [];
      for (const msg of recentMsgs) {
        if (msg.role === "user" && msg.content) {
          summaryParts.push(`User: ${String(msg.content).slice(0, 100)}`);
        } else if (msg.role === "assistant" && msg.content) {
          summaryParts.push(`Agent: ${String(msg.content).slice(0, 100)}`);
        }
      }
      if (summaryParts.length > 0) {
        ramManager.setLastSessionSummary(summaryParts.join(" | "));
      }

      soulManager.flush();
      ramManager.flush();
      await sessionManager.save();

      this.io.writeOutput(chalk.dim("\nSession saved. Goodbye."));
      this.io.destroy();
    }
  }
}
