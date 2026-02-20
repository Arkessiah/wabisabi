/**
 * TUI Types & Interfaces
 *
 * Abstracts all terminal I/O so BaseAgent is UI-agnostic.
 * Two implementations: LegacyTerminalIO (readline) and TuiTerminalIO (panels).
 */

import type { ActiveTask, PinnedItem } from "../ram/schema.js";
import type { AgentType } from "../services/agent-switcher.js";

// ── Header Info ──────────────────────────────────────────────

export interface HeaderInfo {
  agent: AgentType;
  agentIcon: string;
  agentLabel: string;
  model: string;
  provider: string;
  sessionId: string;
  tokens: { prompt: number; completion: number; total: number };
  contextUsage: number; // 0-1 percentage
}

// ── Spinner Handle ───────────────────────────────────────────

export interface SpinnerHandle {
  stop(finalText?: string): void;
  update(text: string): void;
}

// ── Command Palette ──────────────────────────────────────────

export type PaletteSection = "agents" | "models" | "tokens" | "providers" | "sessions" | "profiles";

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  active?: boolean;
  section: PaletteSection;
}

export interface PaletteResult {
  section: PaletteSection;
  itemId: string;
}

// ── Terminal I/O Interface ───────────────────────────────────

export interface TerminalIO {
  // Lifecycle
  init(): Promise<void>;
  destroy(): void;

  // Output
  writeOutput(text: string): void;
  writeStreamToken(chunk: string): void;
  writeToolResult(toolName: string, title: string, success: boolean): void;
  writeStatus(text: string): void;
  writeError(text: string): void;

  // Input
  readInput(prompt: string): Promise<string>;
  confirm(message: string): Promise<boolean>;

  // UI State
  updateHeader(info: Partial<HeaderInfo>): void;
  updateTaskQueue(tasks: ActiveTask[]): void;
  updatePins(pins: PinnedItem[]): void;

  // Spinner
  showSpinner(text: string): SpinnerHandle;

  // Overlays
  openCommandPalette(items: PaletteItem[]): Promise<PaletteResult | null>;

  // Screen
  clearOutput(): void;

  // Capabilities
  readonly isTui: boolean;
}

// ── Panel Bounds ─────────────────────────────────────────────

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Key Event ────────────────────────────────────────────────

export interface KeyEvent {
  raw: string;
  name: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  sequence: string;
}

// ── Layout Config ────────────────────────────────────────────

export interface LayoutConfig {
  headerHeight: 1;
  inputHeight: 2;       // 1 input + 1 status bar
  taskPanelWidth: 28;
  taskPanelVisible: boolean;
  minWidth: 80;
  minHeight: 24;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  headerHeight: 1,
  inputHeight: 2,
  taskPanelWidth: 28,
  taskPanelVisible: true,
  minWidth: 80,
  minHeight: 24,
};
