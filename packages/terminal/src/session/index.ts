/**
 * Session Manager
 *
 * Manages conversation sessions with creation, persistence, and resumption.
 */

import { SessionStorage } from "./storage.js";
import type { SessionInfo, SessionMessage, SessionSummary } from "./types.js";

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 5);
  return `sess_${date}_${time}_${rand}`;
}

export class SessionManager {
  private storage: SessionStorage;
  private currentSession: SessionInfo | null = null;

  constructor(baseDir?: string) {
    this.storage = new SessionStorage(baseDir);
  }

  async create(opts: {
    projectRoot: string;
    model: string;
    agent: string;
    title?: string;
  }): Promise<SessionInfo> {
    const now = Date.now();
    const session: SessionInfo = {
      id: generateId(),
      title: opts.title || `Session ${new Date().toLocaleString()}`,
      projectRoot: opts.projectRoot,
      model: opts.model,
      agent: opts.agent,
      messages: [],
      created: now,
      updated: now,
    };

    this.currentSession = session;
    await this.storage.save(session);
    return session;
  }

  async resume(id: string): Promise<SessionInfo | null> {
    const session = await this.storage.load(id);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  async addMessage(message: SessionMessage): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.messages.push(message);
    this.currentSession.updated = Date.now();
    await this.storage.save(this.currentSession);
  }

  async updateTitle(title: string): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.title = title;
    this.currentSession.updated = Date.now();
    await this.storage.save(this.currentSession);
  }

  async save(): Promise<void> {
    if (!this.currentSession) return;
    this.currentSession.updated = Date.now();
    await this.storage.save(this.currentSession);
  }

  async listRecent(limit: number = 20): Promise<SessionSummary[]> {
    const all = await this.storage.list();
    return all.slice(0, limit);
  }

  async deleteSession(id: string): Promise<boolean> {
    if (this.currentSession?.id === id) {
      this.currentSession = null;
    }
    return this.storage.delete(id);
  }

  getCurrent(): SessionInfo | null {
    return this.currentSession;
  }

  getMessages(): SessionMessage[] {
    return this.currentSession?.messages || [];
  }
}

export const sessionManager = new SessionManager();

export type { SessionInfo, SessionMessage, SessionSummary, ToolCallRecord } from "./types.js";
