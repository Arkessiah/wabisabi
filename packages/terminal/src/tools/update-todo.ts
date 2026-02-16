/**
 * Update Todo Tool
 *
 * Allows agents to manage tasks in TODO.md.
 */

import { z } from "zod";
import { defineTool } from "./index.js";
import { TodoMdManager } from "../context/todo-md.js";

export const updateTodoTool = defineTool("update_todo", {
  description:
    "Manage tasks in TODO.md. Add new tasks, mark tasks as complete, or remove tasks. " +
    "Use this to track progress on the current work.",
  parameters: z.object({
    action: z
      .enum(["add", "complete", "remove"])
      .describe("Action: add (new task), complete (mark done), remove (delete task)"),
    task: z
      .string()
      .describe("Task description (for add) or task text to match (for complete/remove)"),
    priority: z
      .enum(["high", "medium", "low"])
      .optional()
      .describe("Priority level (only for add action)"),
  }),
  async execute(args, ctx) {
    const manager = new TodoMdManager(ctx.projectRoot);

    switch (args.action) {
      case "add":
        manager.addTask(args.task, args.priority);
        return {
          title: "Task added",
          output: `Added task: ${args.task}${args.priority ? ` [${args.priority}]` : ""}`,
          metadata: { action: "add" },
        };

      case "complete":
        manager.completeTask(args.task);
        return {
          title: "Task completed",
          output: `Marked complete: ${args.task}`,
          metadata: { action: "complete" },
        };

      case "remove":
        manager.removeTask(args.task);
        return {
          title: "Task removed",
          output: `Removed task: ${args.task}`,
          metadata: { action: "remove" },
        };

      default:
        return {
          title: "Invalid action",
          output: `Unknown action: ${args.action}`,
          metadata: { error: true },
        };
    }
  },
});
