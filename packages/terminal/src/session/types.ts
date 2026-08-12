/**
 * Session Types
 *
 * Data structures for conversation sessions and message history.
 */

export interface ToolCallRecord {
  toolId: string;
  args: Record<string, unknown>;
  result: {
    title: string;
    output: string;
  };
  timestamp: number;
}

/**
 * Tokens the provider reported for one completed assistant turn.
 *
 * Optional and additive: sessions written before this existed load unchanged,
 * and consumers must treat its absence as "unknown", never as zero.
 */
export interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  /** Tokens served from cache, when the provider reports them separately. */
  cacheReadTokens?: number;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
  /** Present on assistant turns when the provider reported usage. */
  usage?: MessageUsage;
}

export interface SessionInfo {
  id: string;
  title: string;
  projectRoot: string;
  model: string;
  agent: string;
  messages: SessionMessage[];
  created: number;
  updated: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  model: string;
  agent: string;
  messageCount: number;
  created: number;
  updated: number;
}
