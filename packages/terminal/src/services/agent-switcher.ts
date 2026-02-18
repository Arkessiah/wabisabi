/**
 * 🎯 WabiSabi Agent Switcher Service
 *
 * Handles agent switching with Tab and keyboard shortcuts.
 * Inspired by OpenCode/Claude Code.
 */

export type AgentType = "build" | "plan" | "search";

export interface AgentInfo {
  type: AgentType;
  label: string;
  icon: string;
  description: string;
  shortcut: string;
}

// Agent definitions in order for cycling
export const AGENTS: AgentInfo[] = [
  {
    type: "build",
    label: "BUILD",
    icon: "🏗️",
    description: "Generates complete code",
    shortcut: "Ctrl+1",
  },
  {
    type: "plan",
    label: "PLAN",
    icon: "📋",
    description: "Creates plans and tasks",
    shortcut: "Ctrl+2",
  },
  {
    type: "search",
    label: "SEARCH",
    icon: "🔍",
    description: "Researches and finds information",
    shortcut: "Ctrl+3",
  },
];

export class AgentSwitcher {
  private currentAgent: AgentType;
  private history: AgentType[] = [];
  private listeners: ((agent: AgentType) => void)[] = [];

  constructor(initialAgent: AgentType = "build") {
    this.currentAgent = initialAgent;
    this.history = [initialAgent];
  }

  /**
   * 🔄 Cycle to next agent (used with Tab)
   */
  cycle(): AgentType {
    const currentIndex = AGENTS.findIndex((a) => a.type === this.currentAgent);
    const nextIndex = (currentIndex + 1) % AGENTS.length;
    const nextAgent = AGENTS[nextIndex].type;

    this.set(nextAgent);
    return nextAgent;
  }

  /**
   * 🔙 Go to previous agent
   */
  previous(): AgentType {
    if (this.history.length > 1) {
      this.history.pop();
    }
    const previousAgent = this.history[this.history.length - 1];
    this.set(previousAgent);
    return previousAgent;
  }

  /**
   * 🎯 Set agent directly
   */
  set(agent: AgentType): void {
    if (agent === this.currentAgent) return;

    this.currentAgent = agent;
    this.history.push(agent);

    // Limit history to 10 entries
    if (this.history.length > 10) {
      this.history = this.history.slice(-10);
    }

    this.notifyListeners();
  }

  /**
   * 📍 Get current agent
   */
  get(): AgentType {
    return this.currentAgent;
  }

  /**
   * ℹ️ Get current agent info
   */
  getInfo(): AgentInfo {
    return AGENTS.find((a) => a.type === this.currentAgent)!;
  }

  /**
   * 🎨 Generate prompt with agent indicator
   */
  formatPrompt(): string {
    const info = this.getInfo();
    return `${info.icon} [${info.label}] > `;
  }

  /**
   * 📋 Get all agents
   */
  getAll(): AgentInfo[] {
    return AGENTS;
  }

  /**
   * 🔌 Subscribe to agent changes
   */
  onChange(callback: (agent: AgentType) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l(this.currentAgent));
  }

  /**
   * 🧪 Reset to initial agent
   */
  reset(): void {
    this.set("build");
    this.history = ["build"];
  }
}

// Singleton instance
export const agentSwitcher = new AgentSwitcher();
