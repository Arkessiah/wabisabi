/**
 * Tests for SessionManager and SessionStorage
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SessionManager } from "../session/index.js";

const TEST_DIR = join(tmpdir(), `wabisabi-session-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("SessionManager", () => {
  test("creates a new session", async () => {
    const mgr = new SessionManager(TEST_DIR);
    const session = await mgr.create({
      projectRoot: "/tmp/project",
      model: "test-model",
      agent: "BuildAgent",
    });

    expect(session.id).toMatch(/^sess_/);
    expect(session.model).toBe("test-model");
    expect(session.agent).toBe("BuildAgent");
    expect(session.messages).toHaveLength(0);
  });

  test("adds messages to current session", async () => {
    const mgr = new SessionManager(TEST_DIR);
    await mgr.create({
      projectRoot: "/tmp",
      model: "m",
      agent: "A",
    });

    await mgr.addMessage({
      role: "user",
      content: "hello",
      timestamp: Date.now(),
    });

    await mgr.addMessage({
      role: "assistant",
      content: "hi there",
      timestamp: Date.now(),
    });

    const msgs = mgr.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("hello");
    expect(msgs[1].content).toBe("hi there");
  });

  test("resumes a session by ID", async () => {
    const mgr = new SessionManager(TEST_DIR);
    const created = await mgr.create({
      projectRoot: "/tmp",
      model: "m",
      agent: "A",
    });

    await mgr.addMessage({
      role: "user",
      content: "test message",
      timestamp: Date.now(),
    });

    // Create a new manager instance to simulate restart
    const mgr2 = new SessionManager(TEST_DIR);
    const resumed = await mgr2.resume(created.id);

    expect(resumed).not.toBeNull();
    expect(resumed!.id).toBe(created.id);
    expect(resumed!.messages).toHaveLength(1);
    expect(resumed!.messages[0].content).toBe("test message");
  });

  test("lists recent sessions sorted by updated time", async () => {
    const mgr = new SessionManager(TEST_DIR);

    await mgr.create({ projectRoot: "/tmp", model: "m", agent: "A", title: "First" });
    await new Promise((r) => setTimeout(r, 10));
    await mgr.create({ projectRoot: "/tmp", model: "m", agent: "B", title: "Second" });

    const list = await mgr.listRecent();
    expect(list.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    expect(list[0].updated).toBeGreaterThanOrEqual(list[1].updated);
  });

  test("deletes a session", async () => {
    const mgr = new SessionManager(TEST_DIR);
    const session = await mgr.create({
      projectRoot: "/tmp",
      model: "m",
      agent: "A",
    });

    const deleted = await mgr.deleteSession(session.id);
    expect(deleted).toBe(true);

    const resumed = await mgr.resume(session.id);
    expect(resumed).toBeNull();
  });

  test("returns null for non-existent session", async () => {
    const mgr = new SessionManager(TEST_DIR);
    const result = await mgr.resume("sess_nonexistent_000");
    expect(result).toBeNull();
  });
});
