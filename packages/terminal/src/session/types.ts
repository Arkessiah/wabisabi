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

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  toolCallId?: string;
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
