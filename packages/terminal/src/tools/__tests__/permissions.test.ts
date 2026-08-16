/**
 * El hueco que este fichero existe para que no vuelva:
 * `checkPermission` devuelve true para cualquier tool que no este en el mapa,
 * asi que una tool nueva sin entrada corre SIN PUERTA y nadie se entera.
 */

import { describe, expect, test } from "bun:test";
import { toolRegistry, TOOL_PERMISSION_MAP } from "../index.js";
import { ToolPermissionsSchema } from "../../config/schema.js";
import { readTool } from "../read.js";
import { writeTool } from "../write.js";
import { editTool } from "../edit.js";
import { bashTool } from "../bash.js";
import { grepTool } from "../grep.js";
import { globTool } from "../glob.js";
import { listTool } from "../list.js";
import { gitTool } from "../git.js";
import { webTool } from "../web.js";
import { updatePlanTool } from "../update-plan.js";
import { updateTodoTool } from "../update-todo.js";
import { skillTool } from "../skill.js";

// El mismo conjunto que registra src/index.ts.
const REGISTERED = [
  readTool, writeTool, editTool, bashTool, grepTool, globTool, listTool,
  gitTool, webTool, updatePlanTool, updateTodoTool, skillTool,
];
for (const t of REGISTERED) toolRegistry.register(t);

describe("ninguna tool corre sin puerta", () => {
  test("toda tool registrada tiene entrada en TOOL_PERMISSION_MAP", () => {
    const sinMapear = REGISTERED.map((t) => t.id).filter((id) => !(id in TOOL_PERMISSION_MAP));
    expect(sinMapear).toEqual([]);
  });

  test("toda clave del mapa existe en el esquema de permisos", () => {
    const claves = Object.keys(ToolPermissionsSchema.parse({}));
    const inventadas = Object.values(TOOL_PERMISSION_MAP).filter((k) => !claves.includes(k));
    expect(inventadas).toEqual([]);
  });

  test("las tools destructivas siguen apagadas por defecto", () => {
    const d = ToolPermissionsSchema.parse({});
    expect(d.allowFileWrite).toBe(false);
    expect(d.allowBash).toBe(false);
  });

  test("las que ya corrian sin restriccion siguen encendidas: no rompemos flujos", () => {
    const d = ToolPermissionsSchema.parse({});
    expect(d.allowGit).toBe(true);
    expect(d.allowWeb).toBe(true);
    expect(d.allowPlanWrite).toBe(true);
  });
});
