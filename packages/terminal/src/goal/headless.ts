/**
 * Headless turn execution
 *
 * Runs one agent turn with nobody watching, so a goal can advance from the
 * daemon after the terminal is closed.
 *
 * ## The safety problem this file exists to solve
 *
 * In interactive mode, `write`, `edit` and `bash` are gated by a confirmation
 * prompt that lives in the **agent** (`base-agent.ts`), not in the tool. A
 * headless executor that called the tool registry directly would skip that gate
 * entirely and run with whatever `allowFileWrite` / `allowBash` happen to say.
 *
 * That would be a real betrayal of consent: a user who enabled `allowBash` did
 * so **with a prompt in front of them**, one call at a time. That is not the
 * same as authorising an unattended loop to run shell commands at 3am.
 *
 * So headless turns get their own policy, defaulting to read-only. Under
 * `read-only` the mutating tools are not even offered to the model — it cannot
 * ask for what it is not given, which is stronger than refusing afterwards.
 */

import { ApiClient, type ChatMessage } from "../clients/api-client.js";
import { toolRegistry } from "../tools/index.js";
import type { SessionInfo, MessageUsage } from "../session/types.js";

/** Same set the interactive agent gates behind a confirmation prompt. */
export const MUTATING_TOOLS = new Set(["write", "edit", "bash"]);

/** Tools a headless turn may use when nobody can approve anything. */
export const READ_ONLY_TOOLS = ["read", "grep", "glob", "list", "git", "web", "skill"];

/**
 * Tools withheld when nobody is watching even though they do not touch the
 * filesystem. `web` makes outbound requests, and a model can encode whatever it
 * just read into a URL — supervised that is a visible action, unsupervised it is
 * an exfiltration channel nobody sees. Enable it with `inherit` if you want it.
 */
export const UNSUPERVISED_DENY = new Set(["web"]);

/**
 * `git` is in the read-only set for `status`/`diff`/`log`, which are genuinely
 * useful context for a goal. But the tool also does `commit`, `push`, `reset`
 * and `checkout`, so tool-level gating alone would let an unattended loop
 * rewrite and publish history under a policy literally named "read-only".
 *
 * Gating therefore happens at the SUBCOMMAND level too. Allowlist, not
 * blocklist: a git subcommand added later is withheld until someone decides it
 * is safe, rather than silently inheriting permission.
 */
export const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "branch", "remote"]);

/** Whether a specific call is allowed, once the tool itself is. */
export function isCallAllowed(
  policy: AutonomousToolPolicy,
  name: string,
  args: Record<string, unknown>,
): { allowed: true } | { allowed: false; why: string } {
  if (policy === "inherit") return { allowed: true };

  if (MUTATING_TOOLS.has(name) || UNSUPERVISED_DENY.has(name)) {
    return { allowed: false, why: `"${name}" no esta disponible en ejecucion autonoma sin supervision` };
  }

  if (name === "git") {
    const sub = typeof args.subcommand === "string" ? args.subcommand : "";
    if (!READ_ONLY_GIT_SUBCOMMANDS.has(sub)) {
      return {
        allowed: false,
        why: `"git ${sub || "?"}" modifica el repositorio y no esta disponible sin supervision; ` +
          `solo puedes usar: ${[...READ_ONLY_GIT_SUBCOMMANDS].join(", ")}`,
      };
    }
  }

  return { allowed: true };
}

export type AutonomousToolPolicy = "read-only" | "inherit";

export interface HeadlessTurnOptions {
  /**
   * `read-only` (default): mutating tools are withheld.
   * `inherit`: the full tool set, i.e. the user has explicitly accepted
   * unattended writes and shell commands.
   */
  policy?: AutonomousToolPolicy;
  /** Tool ids the agent would normally have. */
  toolIds?: string[];
  maxIterations?: number;
  /**
   * Where the tools operate. Defaults to the session's project root; a writing
   * goal passes its isolated worktree instead, so nothing it does lands in the
   * user's working tree.
   */
  projectRoot?: string;
  log?: (message: string) => void;
  signal?: AbortSignal;
}

export interface HeadlessTurnResult {
  content: string;
  toolCalls: number;
  iterations: number;
  usage?: MessageUsage;
  /** Tools the model asked for and did not get, under `read-only`. */
  withheld: string[];
  stoppedBy: "done" | "iteration-limit" | "aborted" | "error";
  error?: string;
}

/** The tool ids actually offered, given the policy. */
export function allowedToolIds(
  policy: AutonomousToolPolicy,
  toolIds: string[] = READ_ONLY_TOOLS,
): string[] {
  if (policy === "inherit") return toolIds;
  return toolIds.filter((id) => !MUTATING_TOOLS.has(id) && !UNSUPERVISED_DENY.has(id));
}

/**
 * Rebuild the conversation for the model from stored session messages.
 * Tool messages are dropped: their results are already summarised in the
 * assistant turns that follow, and replaying them would blow the context of a
 * long-running goal for no gain.
 */
export function toChatMessages(session: SessionInfo, systemPrompt: string): ChatMessage[] {
  const history = (session.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  return [{ role: "system", content: systemPrompt }, ...history];
}

/**
 * Execute one turn. Never throws: a failure comes back in `stoppedBy`, because
 * the goal loop must record what happened rather than crash the daemon.
 */
export async function runHeadlessTurn(
  client: Pick<ApiClient, "chatWithTools">,
  session: SessionInfo,
  systemPrompt: string,
  prompt: string,
  options: HeadlessTurnOptions = {},
): Promise<HeadlessTurnResult> {
  const policy = options.policy ?? "read-only";
  const maxIterations = options.maxIterations ?? 10;
  const log = options.log ?? (() => {});

  const offered = allowedToolIds(policy, options.toolIds);
  const specs = toolRegistry.toToolSpecs(offered);
  const withheld: string[] = [];

  // `toToolSpecs` silently drops ids the registry does not know, so an
  // unpopulated registry yields zero tools and the model just talks instead of
  // working — a turn that looks successful and achieves nothing. Fail loudly.
  if (offered.length > 0 && specs.length === 0) {
    return {
      content: "",
      toolCalls: 0,
      iterations: 0,
      withheld,
      stoppedBy: "error",
      error:
        "el registro de herramientas esta vacio: el turno headless no tendria con que trabajar",
    };
  }

  const messages: ChatMessage[] = [
    ...toChatMessages(session, systemPrompt),
    { role: "user", content: prompt },
  ];

  let iterations = 0;
  let toolCalls = 0;
  let usage: MessageUsage | undefined;

  while (iterations < maxIterations) {
    if (options.signal?.aborted) {
      return { content: "", toolCalls, iterations, withheld, stoppedBy: "aborted" };
    }
    iterations++;

    let response;
    try {
      response = await client.chatWithTools(messages, specs);
    } catch (error) {
      return {
        content: "",
        toolCalls,
        iterations,
        withheld,
        stoppedBy: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (response.usage) {
      usage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      };
    }

    const message = response.choices?.[0]?.message;
    if (!message) {
      return {
        content: "",
        toolCalls,
        iterations,
        usage,
        withheld,
        stoppedBy: "error",
        error: "el proveedor no devolvio ningun mensaje",
      };
    }

    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      return {
        content: message.content ?? "",
        toolCalls,
        iterations,
        usage,
        withheld,
        stoppedBy: "done",
      };
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = call.function?.name ?? "";

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        // A malformed argument blob is the model's error, not a crash of ours.
      }

      // Withheld rather than executed. The model is told plainly, so it can
      // report the blocker instead of looping on something it will never get.
      const verdict = isCallAllowed(policy, name, args);
      if (!verdict.allowed) {
        withheld.push(name);
        log(`turno headless: ${verdict.why}`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `${verdict.why}. No lo reintentes: informa de que hace falta y sigue con lo demas.`,
        });
        continue;
      }

      const result = await toolRegistry.execute(name, args, {
        projectRoot: options.projectRoot ?? session.projectRoot,
        sessionId: session.id,
        ...(options.signal ? { abort: options.signal } : {}),
      });
      toolCalls++;

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.output,
      });
    }
  }

  return {
    content: "",
    toolCalls,
    iterations,
    usage,
    withheld,
    stoppedBy: "iteration-limit",
  };
}
