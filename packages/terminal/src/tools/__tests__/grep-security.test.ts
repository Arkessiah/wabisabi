import { describe, test, expect } from "bun:test";

describe("Grep Tool Security", () => {
  test("should use execFileSync instead of execSync", async () => {
    const grepPath = import.meta.dir + "/../grep.ts";
    const content = await Bun.file(grepPath).text();

    expect(content).toContain("execFileSync");
    // Should NOT import or call execSync (comments are OK)
    expect(content).not.toMatch(/import\s+{.*execSync.*}/);
    expect(content).not.toMatch(/execSync\(/);
  });

  test("should pass arguments as array to execFileSync", async () => {
    const grepPath = import.meta.dir + "/../grep.ts";
    const content = await Bun.file(grepPath).text();

    // Should use execFileSync("rg", args, ...) not execFileSync(args.join(" "))
    expect(content).toContain('execFileSync("rg", args,');
    expect(content).not.toContain("args.join");
  });

  test("should NOT join args with spaces", async () => {
    const grepPath = import.meta.dir + "/../grep.ts";
    const content = await Bun.file(grepPath).text();

    // Check that we don't have the vulnerable pattern
    expect(content).not.toContain('args.join(" ")');
    expect(content).not.toContain("args.join(' ')");
  });

  test("should have security comment about shell injection prevention", async () => {
    const grepPath = import.meta.dir + "/../grep.ts";
    const content = await Bun.file(grepPath).text();

    expect(content).toContain("shell injection");
    expect(content).toContain("execFileSync");
  });

  test("should use which with array args", async () => {
    const grepPath = import.meta.dir + "/../grep.ts";
    const content = await Bun.file(grepPath).text();

    // In hasRipgrep(), should use execFileSync("which", ["rg"])
    expect(content).toContain('execFileSync("which", ["rg"]');
  });

  test("should pass pattern and path as separate array elements", async () => {
    const grepPath = import.meta.dir + "/../grep.ts";
    const content = await Bun.file(grepPath).text();

    // Pattern and searchPath should be pushed to args array
    expect(content).toContain('args.push("--", pattern, searchPath)');
  });
});
