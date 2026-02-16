import { describe, test, expect } from "bun:test";

describe("Glob Tool Security", () => {
  test("should use Bun.Glob instead of manual regex conversion", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    // Should import Glob from bun
    expect(content).toContain('import { Glob } from "bun"');
    // Should use new Glob(pattern)
    expect(content).toContain("new Glob(");
  });

  test("should NOT have manual regex conversion (ReDoS vulnerable)", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    // Should NOT have the vulnerable matchGlob function
    expect(content).not.toContain("function matchGlob");
    expect(content).not.toContain(".replace(/\\*\\*/g");
    expect(content).not.toContain(".replace(/\\*/g");
    expect(content).not.toContain("<<GLOBSTAR>>");
  });

  test("should NOT use RegExp constructor with glob pattern", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    // Should NOT construct regex from pattern
    expect(content).not.toContain("new RegExp");
  });

  test("should NOT have recursive findFiles with manual matching", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    // Should NOT have old findFiles implementation
    expect(content).not.toContain("function findFiles");
    expect(content).not.toContain("IGNORE_DIRS");
  });

  test("should use glob.scan() for file iteration", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    // Should use the safe Bun.Glob API
    expect(content).toContain("glob.scan");
    expect(content).toContain("for await");
  });

  test("should have security comment about ReDoS prevention", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    expect(content).toContain("ReDoS");
    expect(content).toContain("Bun.Glob");
  });

  test("should still enforce MAX_RESULTS limit", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    expect(content).toContain("MAX_RESULTS");
    expect(content).toContain("results.length >= MAX_RESULTS");
  });

  test("should still use validatePathWithinProject", async () => {
    const globPath = import.meta.dir + "/../glob.ts";
    const content = await Bun.file(globPath).text();

    expect(content).toContain("validatePathWithinProject");
    expect(content).toContain("validation.valid");
  });
});
