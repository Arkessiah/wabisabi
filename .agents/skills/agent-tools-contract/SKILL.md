---
name: agent-tools-contract
description: Use when adding or modifying WabiSabi agent tools, their parameters, the tool registry, permission mapping, destructive-operation confirmation, or tool output handling.
---

# Contrato de tools del agente

## Dónde vive

- Definición y registro: `packages/terminal/src/tools/index.ts` (`defineTool`, `ToolRegistry`, `TOOL_PERMISSION_MAP`).
- Una tool por fichero en `packages/terminal/src/tools/`.
- **Registro real**: `packages/terminal/src/index.ts` (`toolRegistry.register(...)`). Un fichero en `tools/` que no se registra ahí **no es una tool**.
- Tests: `packages/terminal/src/tools/__tests__/`.

## El pipeline que ya te da `defineTool` (no lo reimplementes)

En este orden: **validar parámetros con Zod** → **comprobar permiso** → **comprobar abort** →
ejecutar → **truncar salida**. Si escribes una tool que valida a mano o que salta el permiso,
la estás sacando del contrato.

## Añadir una tool

1. Crea `packages/terminal/src/tools/<nombre>.ts` con `defineTool({ id, description, parameters, execute })`.
2. `parameters` es un esquema **Zod**; se convierte solo a JSON Schema para el spec OpenAI.
3. Si toca disco, red o procesos, **añade su id a `TOOL_PERMISSION_MAP`**. Mapa actual:
   `read→allowFileRead`, `write|edit→allowFileWrite`, `bash→allowBash`,
   `grep→allowGrep`, `glob→allowGlob`, `list→allowList`.
   **`checkPermission` devuelve `true` para cualquier id que no esté en el mapa**: sin entrada,
   la tool corre sin puerta. Hoy quedan fuera `git`, `web`, `update_plan` y `update_todo`
   (ver el hueco documentado en `tools/DOCUMENTATION.md`).
4. Regístrala en `packages/terminal/src/index.ts`.
5. Decide si el agente PLAN o SEARCH deben verla: ambos son **read-only** y su lista de tools
   es explícita. No la añadas ahí si escribe o ejecuta.
6. Añade tests en `tools/__tests__/`, **incluido el caso de permiso denegado**.
7. Actualiza `packages/terminal/src/tools/DOCUMENTATION.md` y la tabla de `DOC/ES/referencia-cli.md`.

## Defaults concretos

- Permisos por defecto: `allowFileRead: true`, `allowFileWrite: false`, `allowBash: false`.
- Timeout de `bash`: 120 s.
- La salida se trunca siempre; no dependas de devolver un output ilimitado.
- Los errores se devuelven como `ToolResult` con `metadata.error`, **no se lanzan**: el
  registry captura, pero un error propagado pierde el título y el contexto.

## Operaciones destructivas

- `write`, `edit` y `bash` requieren **confirmación del usuario**; el toggle es `/approve`.
- `bash` mantiene además una **lista de comandos peligrosos bloqueados** (`tools/bash.ts`);
  ampliarla es preferible a confiar en la confirmación del usuario.
- El permiso y la confirmación son **autoridad de ejecución**: se comprueban antes de actuar.
  Un prompt más asustadizo no sustituye a una comprobación.

## Errores típicos

- Añadir la tool a `tools/` y olvidar `toolRegistry.register` → la tool "no existe" en runtime.
- Olvidar `TOOL_PERMISSION_MAP` → tool destructiva sin puerta.
- Dar tools de escritura a los agentes read-only por comodidad.
- Testear solo el camino feliz; el caso denegado es el que protege al usuario.
