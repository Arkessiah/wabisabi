import { describe, test, expect } from "bun:test";

describe("Bash Tool Security", () => {
  test("should have environment allowlist defined", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toContain("ENV_ALLOWLIST");
    expect(content).toContain("PATH");
    expect(content).toContain("HOME");
    expect(content).toContain("USER");
    expect(content).toContain("SHELL");
  });

  test("should use getSafeEnv() instead of process.env", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toContain("getSafeEnv()");
    expect(content).not.toContain("env: { ...process.env }");
  });

  test("should have command blocklist defined", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toContain("COMMAND_BLOCKLIST");
    expect(content).toContain("rm -rf");
    expect(content).toContain("dd");
    expect(content).toContain("mkfs");
    expect(content).toContain("fork bomb");
  });

  test("should validate commands before execution", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toContain("validateCommand");
    expect(content).toContain("blocked: true");
  });

  test("should block rm -rf /", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toMatch(/rm.*-rf.*\//i);
  });

  test("should block dd operations", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toMatch(/dd.*of=/i);
  });

  test("should block curl | sh", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toMatch(/curl.*sh/i);
  });

  test("should block wget | sh", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    expect(content).toMatch(/wget.*sh/i);
  });

  test("allowlist should NOT include sensitive vars", async () => {
    const bashPath = import.meta.dir + "/../bash.ts";
    const content = await Bun.file(bashPath).text();

    // Ensure these sensitive vars are NOT in the allowlist
    const allowlistSection = content.split("ENV_ALLOWLIST")[1].split("] as const")[0];

    expect(allowlistSection).not.toContain("API_KEY");
    expect(allowlistSection).not.toContain("SECRET");
    expect(allowlistSection).not.toContain("TOKEN");
    expect(allowlistSection).not.toContain("PASSWORD");
    expect(allowlistSection).not.toContain("AWS_");
    expect(allowlistSection).not.toContain("GITHUB_TOKEN");
  });
});
