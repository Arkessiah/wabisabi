#!/usr/bin/env bun

import { Command } from "commander";

interface CLIOptions {
  substratum: string;
  ollama: string;
  model: string;
}

const program = new Command();

program
  .name("wabisabi")
  .description("AI Terminal IDE - Code with intelligent agents")
  .version("1.0.0")
  .option("--substratum <url>", "Substratum API URL", "http://localhost:3001")
  .option("--ollama <url>", "Ollama local URL", "http://localhost:11434")
  .option("--model <name>", "Model to use", "llama3.2");

program
  .command("interactive")
  .description("Start interactive mode")
  .action(async () => {
    const opts = program.opts() as CLIOptions;
    await import("./modes/interactive.js").then((m) => m.interactiveMode(opts));
  });

program
  .command("batch <file>")
  .description("Run batch mode with a task file")
  .action(async (file: string) => {
    const opts = program.opts() as CLIOptions;
    await import("./modes/batch.js").then((m) => m.batchMode(file, opts));
  });

program
  .command("stream")
  .description("Start streaming mode")
  .action(async () => {
    const opts = program.opts() as CLIOptions;
    await import("./modes/streaming.js").then((m) => m.streamingMode(opts));
  });

program
  .command("agent <type>")
  .description("Run a specific agent (build, plan, search)")
  .option("--task <task>", "Task description")
  .action(async (type: string, options: { task?: string }) => {
    const opts = program.opts() as CLIOptions;
    console.log(`🧠 WabiSabi Agent: ${type}`);
    console.log(`📋 Task: ${options.task || "default task"}`);
    console.log(`🔗 Target: ${opts.substratum}`);
  });

program.parse();

export { program };
