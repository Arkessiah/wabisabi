/**
 * esbuild bundler for the WabiSabi VS Code extension.
 *
 * VS Code runs the extension in Node.js; vscode itself is an "external"
 * import that must be resolved at runtime by VS Code. Everything else
 * (including @wabisabi/core) is inlined into a single dist/extension.js
 * so the .vsix doesn't carry node_modules around.
 */
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.env.NODE_ENV === "production";

/** @type {import('esbuild').BuildOptions} */
const opts = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("[esbuild] watching for changes...");
} else {
  const result = await build(opts);
  if (result.errors.length > 0) {
    process.exit(1);
  }
  console.log("[esbuild] dist/extension.js built");
}
