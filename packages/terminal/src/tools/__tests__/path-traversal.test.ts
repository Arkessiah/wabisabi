import { describe, test, expect } from "bun:test";
import { validatePathWithinProject } from "../index";
import { join } from "path";

describe("Path Traversal Security", () => {
  const projectRoot = "/home/user/project";

  describe("validatePathWithinProject", () => {
    test("should allow paths within project root", () => {
      const result = validatePathWithinProject(
        "/home/user/project/src/index.ts",
        projectRoot
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("should allow project root itself", () => {
      const result = validatePathWithinProject(projectRoot, projectRoot);
      expect(result.valid).toBe(true);
    });

    test("should allow subdirectories", () => {
      const result = validatePathWithinProject(
        "/home/user/project/nested/deep/file.txt",
        projectRoot
      );
      expect(result.valid).toBe(true);
    });

    test("should reject paths outside project root with ../", () => {
      const result = validatePathWithinProject(
        "/home/user/other-dir/file.txt",
        projectRoot
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside project root");
    });

    test("should reject path traversal to parent directory", () => {
      // Simulating resolve("projectRoot", "../../../etc/passwd")
      const maliciousPath = "/etc/passwd";
      const result = validatePathWithinProject(maliciousPath, projectRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside project root");
    });

    test("should reject path traversal to home directory", () => {
      const maliciousPath = "/home/user/.ssh/id_rsa";
      const result = validatePathWithinProject(maliciousPath, projectRoot);
      expect(result.valid).toBe(false);
    });

    test("should reject path traversal to system files", () => {
      const maliciousPath = "/etc/shadow";
      const result = validatePathWithinProject(maliciousPath, projectRoot);
      expect(result.valid).toBe(false);
    });

    test("should handle normalized paths with . correctly", () => {
      const result = validatePathWithinProject(
        "/home/user/project/./src/./index.ts",
        projectRoot
      );
      expect(result.valid).toBe(true);
    });

    test("should handle paths with .. within project", () => {
      const result = validatePathWithinProject(
        "/home/user/project/src/../lib/utils.ts",
        projectRoot
      );
      expect(result.valid).toBe(true);
    });

    test("should reject paths that escape via .. sequence", () => {
      const result = validatePathWithinProject(
        "/home/user/project/../other/file.txt",
        projectRoot
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("Tool Integration", () => {
    test("read tool should have validatePathWithinProject import", async () => {
      const readPath = import.meta.dir + "/../read.ts";
      const content = await Bun.file(readPath).text();
      expect(content).toContain("validatePathWithinProject");
    });

    test("write tool should have validatePathWithinProject import", async () => {
      const writePath = import.meta.dir + "/../write.ts";
      const content = await Bun.file(writePath).text();
      expect(content).toContain("validatePathWithinProject");
    });

    test("edit tool should have validatePathWithinProject import", async () => {
      const editPath = import.meta.dir + "/../edit.ts";
      const content = await Bun.file(editPath).text();
      expect(content).toContain("validatePathWithinProject");
    });

    test("list tool should have validatePathWithinProject import", async () => {
      const listPath = import.meta.dir + "/../list.ts";
      const content = await Bun.file(listPath).text();
      expect(content).toContain("validatePathWithinProject");
    });

    test("glob tool should have validatePathWithinProject import", async () => {
      const globPath = import.meta.dir + "/../glob.ts";
      const content = await Bun.file(globPath).text();
      expect(content).toContain("validatePathWithinProject");
    });

    test("all file tools should call validation", async () => {
      const tools = ["read", "write", "edit", "list", "glob"];

      for (const tool of tools) {
        const toolPath = import.meta.dir + `/../${tool}.ts`;
        const content = await Bun.file(toolPath).text();

        // Should call the validation function
        expect(content).toContain("validatePathWithinProject");
        // Should check if valid
        expect(content).toContain("validation.valid");
        // Should return access denied
        expect(content).toContain("Access denied");
      }
    });
  });
});
