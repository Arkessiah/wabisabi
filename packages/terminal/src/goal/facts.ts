/**
 * Session Goal — reading the facts from a real transcript
 *
 * Turns a stored session into the snapshot `decide()` needs. This is where a
 * sloppy read ruins the whole loop: every field here is something the decision
 * logic trusts absolutely, so each one is derived from an explicit signal rather
 * than guessed from prose.
 */

import type { SessionInfo, SessionMessage } from "../session/types.js";
import type { TranscriptFacts, TurnUsage } from "./tick.js";

/** Marker the compaction path writes when it replaces history with a summary. */
const COMPACTION_MARKERS = ["[Cortex-compacted:", "[Compacted:", "[compacted:"];

/** Prefixes the agent uses when a turn ended badly. */
const ERROR_PREFIXES = ["Error:", "❌", "Tool iteration limit reached"];

const ABORT_MARKERS = ["[aborted]", "[interrumpido]", "(cancelled by user)"];

export function isCompactionSummary(message: SessionMessage): boolean {
  if (message.role !== "assistant" && message.role !== "user") return false;
  return COMPACTION_MARKERS.some((m) => message.content.startsWith(m));
}

export function looksErrored(message: SessionMessage): boolean {
  if (message.role !== "assistant") return false;
  const text = message.content.trimStart();
  return ERROR_PREFIXES.some((p) => text.startsWith(p));
}

export function looksAborted(message: SessionMessage): boolean {
  const text = message.content.toLowerCase();
  return ABORT_MARKERS.some((m) => text.includes(m));
}

/** Provider usage → the loop's turn cost shape. Absent stays absent. */
export function toTurnUsage(message: SessionMessage): TurnUsage | undefined {
  if (!message.usage) return undefined;
  return {
    input: message.usage.promptTokens,
    output: message.usage.completionTokens,
    cacheRead: message.usage.cacheReadTokens,
  };
}

/**
 * Read the facts.
 *
 * Quiescence is the load-bearing one: the loop must never send a continuation
 * while a turn is in flight. We treat the session as quiet only when the LAST
 * message is an assistant turn — a trailing user message means the agent has not
 * answered yet, and a trailing tool message means it is mid tool-call.
 */
export function readFactsFromSession(session: SessionInfo): TranscriptFacts {
  const messages = session.messages ?? [];

  // Ignore system messages: they are injected context (skills, reminders), not
  // conversation, and a trailing one would otherwise read as "not quiescent".
  const conversation = messages.filter((m) => m.role !== "system");
  const last = conversation[conversation.length - 1];

  if (!last) {
    return {
      hasAssistantTurn: false,
      quiescent: true,
      lastIsCompactionSummary: false,
      lastTurnErrored: false,
      lastTurnAborted: false,
    };
  }

  const hasAssistantTurn = conversation.some((m) => m.role === "assistant");
  const quiescent = last.role === "assistant";

  return {
    hasAssistantTurn,
    quiescent,
    lastIsCompactionSummary: isCompactionSummary(last),
    lastTurnErrored: quiescent && looksErrored(last),
    lastTurnAborted: looksAborted(last),
    latestUsage: quiescent ? toTurnUsage(last) : undefined,
  };
}
