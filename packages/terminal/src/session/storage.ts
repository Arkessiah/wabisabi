/**
 * Session Storage
 *
 * File-based JSON storage for sessions in ~/.wabisabi/sessions/.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SessionInfo, SessionSummary } from "./types.js";

export class SessionStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || join(homedir(), ".wabisabi", "sessions");
    try {
      mkdirSync(this.baseDir, { recursive: true });
    } catch {
      // Directory creation failed - will error on save
    }
  }

  private getFilePath(id: string): string {
    return join(this.baseDir, `${id}.json`);
  }

  async save(session: SessionInfo): Promise<void> {
    try {
      mkdirSync(this.baseDir, { recursive: true });
      const path = this.getFilePath(session.id);
      writeFileSync(path, JSON.stringify(session, null, 2), "utf-8");
    } catch {
      // Session save failed silently - non-critical
    }
  }

  async load(id: string): Promise<SessionInfo | null> {
    const path = this.getFilePath(id);
    if (!existsSync(path)) return null;

    try {
      const data = readFileSync(path, "utf-8");
      return JSON.parse(data) as SessionInfo;
    } catch {
      return null;
    }
  }

  async list(): Promise<SessionSummary[]> {
    const files = readdirSync(this.baseDir).filter((f) =>
      f.endsWith(".json"),
    );

    const summaries: SessionSummary[] = [];

    for (const file of files) {
      try {
        const data = readFileSync(join(this.baseDir, file), "utf-8");
        const session = JSON.parse(data) as SessionInfo;
        summaries.push({
          id: session.id,
          title: session.title,
          model: session.model,
          agent: session.agent,
          messageCount: session.messages.length,
          created: session.created,
          updated: session.updated,
        });
      } catch {
        // Skip corrupt files
      }
    }

    // Sort by updated time, newest first
    summaries.sort((a, b) => b.updated - a.updated);
    return summaries;
  }

  async delete(id: string): Promise<boolean> {
    const path = this.getFilePath(id);
    if (!existsSync(path)) return false;
    try {
      unlinkSync(path);
      return true;
    } catch {
      return false;
    }
  }

  async exists(id: string): Promise<boolean> {
    return existsSync(this.getFilePath(id));
  }
}
