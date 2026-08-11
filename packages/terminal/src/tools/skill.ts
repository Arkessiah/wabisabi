/**
 * Skill Tool
 *
 * Loads a portable project skill (`.agents/skills/<name>/SKILL.md`) on demand.
 * The system prompt only carries the skill index; this tool is how the agent
 * pulls the full procedure when it decides it needs it.
 *
 * Read-only over a fixed, discovered set of files: the agent names a skill, never
 * a path, so this cannot be used to read arbitrary files.
 */

import { z } from "zod";
import { defineTool } from "./index.js";
import { projectContext } from "../context/index.js";
import { SkillsManager, MAX_AUTOLOAD_CHARS } from "../context/skills.js";

const params = z.object({
  name: z
    .string()
    .describe("Skill name exactly as listed in the skills index (e.g. 'agent-tools-contract')."),
});

/** Falls back to a standalone manager when the project context is not initialized. */
function resolveSkills(projectRoot: string): SkillsManager {
  const fromContext = projectContext.getSkills?.();
  if (fromContext) return fromContext;
  return new SkillsManager(projectRoot);
}

export const skillTool = defineTool("skill", {
  description:
    "Load a project skill by name. Skills are mandatory procedures for their area — " +
    "load the matching one before editing code it covers. Names come from the skills index.",
  parameters: params,
  execute: async ({ name }, ctx) => {
    const skills = resolveSkills(ctx.projectRoot);
    const available = skills.list();

    if (available.length === 0) {
      return {
        title: "No hay skills",
        output:
          "Este proyecto no tiene skills en .agents/skills/ (ni el usuario en ~/.agents/skills/).",
        metadata: { skills: 0 },
      };
    }

    const loaded = skills.load(name, MAX_AUTOLOAD_CHARS);
    if (!loaded) {
      return {
        title: `Skill no encontrada: ${name}`,
        output:
          `No existe la skill "${name}". Disponibles: ` +
          available.map((s) => s.name).join(", "),
        metadata: { error: true, available: available.map((s) => s.name) },
      };
    }

    return {
      title: `Skill: ${loaded.meta.name}`,
      output: loaded.content,
      metadata: {
        skill: loaded.meta.name,
        scope: loaded.meta.scope,
        truncated: loaded.truncated,
      },
    };
  },
});
