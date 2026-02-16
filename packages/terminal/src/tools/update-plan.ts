/**
 * Update Plan Tool
 *
 * Allows agents to update PLAN.md with actions and decisions.
 */

import { z } from "zod";
import { defineTool } from "./index.js";
import { PlanMdManager } from "../context/plan-md.js";

export const updatePlanTool = defineTool("update_plan", {
  description:
    "Update PLAN.md with an action taken or an architectural decision. " +
    "Use this after completing significant work to keep the project plan current.",
  parameters: z.object({
    type: z
      .enum(["action", "decision", "phase"])
      .describe("Type of update: action (something done), decision (architectural choice), phase (change current phase)"),
    content: z
      .string()
      .describe("Description of the action, decision, or phase name"),
    status: z
      .string()
      .optional()
      .describe("Phase status (only for type=phase)"),
  }),
  async execute(args, ctx) {
    const manager = new PlanMdManager(ctx.projectRoot);

    if (!manager.exists()) {
      return {
        title: "PLAN.md not found",
        output: "No PLAN.md file found in project root. Run project initialization first.",
        metadata: {},
      };
    }

    switch (args.type) {
      case "action":
        manager.addAction(args.content);
        return {
          title: "Action logged",
          output: `Added action to PLAN.md: ${args.content}`,
          metadata: { type: "action" },
        };

      case "decision":
        manager.addDecision(args.content);
        return {
          title: "Decision logged",
          output: `Added decision to PLAN.md: ${args.content}`,
          metadata: { type: "decision" },
        };

      case "phase":
        manager.updatePhase(args.content, args.status || "in progress");
        return {
          title: "Phase updated",
          output: `Updated phase to: ${args.content} (${args.status || "in progress"})`,
          metadata: { type: "phase" },
        };

      default:
        return {
          title: "Invalid type",
          output: `Unknown update type: ${args.type}`,
          metadata: { error: true },
        };
    }
  },
});
