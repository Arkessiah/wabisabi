/**
 * Tests for diff generation
 */

import { describe, test, expect } from "bun:test";
import { generateDiff } from "../tools/diff.js";

describe("generateDiff", () => {
  test("shows additions", () => {
    const diff = generateDiff("test.txt", "a\nb\n", "a\nb\nc\n");
    expect(diff).toContain("+c");
  });

  test("shows deletions", () => {
    const diff = generateDiff("test.txt", "a\nb\nc\n", "a\nc\n");
    expect(diff).toContain("-b");
  });

  test("shows modifications", () => {
    const diff = generateDiff("test.txt", "hello\n", "world\n");
    expect(diff).toContain("-hello");
    expect(diff).toContain("+world");
  });

  test("returns 'No changes.' for identical content", () => {
    const diff = generateDiff("test.txt", "same\n", "same\n");
    expect(diff).toContain("No changes");
  });

  test("includes file header", () => {
    const diff = generateDiff("src/foo.ts", "a\n", "b\n");
    expect(diff).toContain("src/foo.ts");
  });
});
