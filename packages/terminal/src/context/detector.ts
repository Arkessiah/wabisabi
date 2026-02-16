/**
 * Stack Detector
 *
 * Analyzes a project directory to detect its tech stack.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

export interface ProjectStack {
  language: string[];
  framework: string[];
  packageManager: string;
  buildTool: string[];
  testFramework: string[];
  linter: string[];
  vcs: string;
  configFiles: string[];
  envStructure: string[];
  entryPoints: string[];
  projectName: string;
}

export class StackDetector {
  constructor(private projectRoot: string) {}

  async detect(): Promise<ProjectStack> {
    const [language, framework, buildTool, testFramework, linter] =
      await Promise.all([
        this.detectLanguage(),
        this.detectFramework(),
        this.detectBuildTool(),
        this.detectTestFramework(),
        this.detectLinter(),
      ]);

    return {
      language,
      framework,
      packageManager: this.detectPackageManager(),
      buildTool,
      testFramework,
      linter,
      vcs: this.detectVcs(),
      configFiles: this.detectConfigFiles(),
      envStructure: this.detectEnvStructure(),
      entryPoints: this.detectEntryPoints(),
      projectName: this.detectProjectName(),
    };
  }

  private detectProjectName(): string {
    const pkgPath = join(this.projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name) return pkg.name;
      } catch {}
    }
    return basename(this.projectRoot);
  }

  private detectLanguage(): string[] {
    const langs: string[] = [];
    const has = (f: string) => existsSync(join(this.projectRoot, f));

    if (has("tsconfig.json") || has("tsconfig.base.json")) langs.push("typescript");
    if (has("package.json")) langs.push("javascript");
    if (has("go.mod")) langs.push("go");
    if (has("Cargo.toml")) langs.push("rust");
    if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) langs.push("python");
    if (has("Gemfile")) langs.push("ruby");
    if (has("pom.xml") || has("build.gradle")) langs.push("java");
    if (has("Package.swift")) langs.push("swift");
    if (has("composer.json")) langs.push("php");

    // Deduplicate: if we have typescript, don't also list javascript separately
    if (langs.includes("typescript") && langs.includes("javascript")) {
      return langs.filter((l) => l !== "javascript");
    }

    return langs.length > 0 ? langs : ["unknown"];
  }

  private detectFramework(): string[] {
    const frameworks: string[] = [];
    const deps = this.readDeps();

    const frameworkMap: Record<string, string> = {
      next: "Next.js",
      react: "React",
      vue: "Vue",
      svelte: "Svelte",
      angular: "Angular",
      express: "Express",
      hono: "Hono",
      fastify: "Fastify",
      koa: "Koa",
      "solid-js": "SolidJS",
      astro: "Astro",
      nuxt: "Nuxt",
      remix: "Remix",
      electron: "Electron",
      tauri: "Tauri",
      django: "Django",
      flask: "Flask",
      "react-native": "React Native",
    };

    for (const [pkg, name] of Object.entries(frameworkMap)) {
      if (deps.has(pkg)) frameworks.push(name);
    }

    return frameworks;
  }

  private detectPackageManager(): string {
    const has = (f: string) => existsSync(join(this.projectRoot, f));

    if (has("bun.lock") || has("bun.lockb")) return "bun";
    if (has("pnpm-lock.yaml")) return "pnpm";
    if (has("yarn.lock")) return "yarn";
    if (has("package-lock.json")) return "npm";
    if (has("Cargo.lock")) return "cargo";
    if (has("go.sum")) return "go";
    if (has("Pipfile.lock") || has("poetry.lock")) return "pip";
    return "unknown";
  }

  private detectBuildTool(): string[] {
    const tools: string[] = [];
    const has = (f: string) => existsSync(join(this.projectRoot, f));
    const deps = this.readDeps();

    if (deps.has("vite")) tools.push("vite");
    if (deps.has("webpack")) tools.push("webpack");
    if (deps.has("esbuild")) tools.push("esbuild");
    if (deps.has("rollup")) tools.push("rollup");
    if (deps.has("turbo") || has("turbo.json")) tools.push("turbo");
    if (has("bun.lock") || has("bun.lockb")) tools.push("bun");
    if (has("Makefile")) tools.push("make");

    return tools;
  }

  private detectTestFramework(): string[] {
    const frameworks: string[] = [];
    const deps = this.readDeps();

    if (deps.has("vitest")) frameworks.push("vitest");
    if (deps.has("jest")) frameworks.push("jest");
    if (deps.has("mocha")) frameworks.push("mocha");
    if (deps.has("ava")) frameworks.push("ava");
    if (deps.has("playwright")) frameworks.push("playwright");
    if (deps.has("cypress")) frameworks.push("cypress");

    return frameworks;
  }

  private detectLinter(): string[] {
    const linters: string[] = [];
    const deps = this.readDeps();
    const has = (f: string) => existsSync(join(this.projectRoot, f));

    if (deps.has("eslint") || has(".eslintrc.json") || has(".eslintrc.js")) linters.push("eslint");
    if (deps.has("@biomejs/biome") || has("biome.json")) linters.push("biome");
    if (deps.has("prettier") || has(".prettierrc")) linters.push("prettier");

    return linters;
  }

  private detectVcs(): string {
    return existsSync(join(this.projectRoot, ".git")) ? "git" : "none";
  }

  private detectConfigFiles(): string[] {
    const configs: string[] = [];
    const check = [
      "package.json", "tsconfig.json", "vite.config.ts", "next.config.js",
      "next.config.mjs", "next.config.ts", "tailwind.config.ts",
      "tailwind.config.js", ".eslintrc.json", ".eslintrc.js", "biome.json",
      ".prettierrc", "docker-compose.yml", "Dockerfile", ".env.example",
      "turbo.json", "Cargo.toml", "go.mod", "pyproject.toml",
      "webpack.config.js", "rollup.config.js",
    ];

    for (const file of check) {
      if (existsSync(join(this.projectRoot, file))) {
        configs.push(file);
      }
    }

    return configs;
  }

  private detectEnvStructure(): string[] {
    const envFiles = [".env.example", ".env.template", ".env.sample"];

    for (const file of envFiles) {
      const path = join(this.projectRoot, file);
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, "utf-8");
          return content
            .split("\n")
            .filter((l) => l.trim() && !l.startsWith("#"))
            .map((l) => l.split("=")[0].trim())
            .filter(Boolean);
        } catch {}
      }
    }

    return [];
  }

  private detectEntryPoints(): string[] {
    const candidates = [
      "src/index.ts", "src/index.tsx", "src/main.ts", "src/main.tsx",
      "src/app.ts", "src/app.tsx", "index.ts", "index.js",
      "src/index.js", "src/main.js", "main.go", "src/main.rs",
      "app/page.tsx", "app/layout.tsx", "pages/index.tsx",
    ];

    return candidates.filter((f) =>
      existsSync(join(this.projectRoot, f)),
    );
  }

  private readDeps(): Set<string> {
    const pkgPath = join(this.projectRoot, "package.json");
    if (!existsSync(pkgPath)) return new Set();

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);
    } catch {
      return new Set();
    }
  }
}
