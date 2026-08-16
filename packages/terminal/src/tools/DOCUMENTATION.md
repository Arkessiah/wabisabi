# Tools

## Propósito

Framework de definición, registro y ejecución de las herramientas que el agente puede invocar.
Este módulo es la **frontera de seguridad** entre el LLM y la máquina del usuario: todo lo que
el agente puede hacer al sistema pasa por aquí.

## Entrypoints y estructura

- `index.ts` — el framework: `defineTool`, `ToolRegistry`, `TOOL_PERMISSION_MAP`,
  `checkPermission`, `validatePathWithinProject`, `truncateOutput`, `toToolSpecs`.
- Una tool por fichero (`read.ts`, `write.ts`, `edit.ts`, `bash.ts`, `grep.ts`, `glob.ts`,
  `list.ts`, `git.ts`, `web.ts`, `update-plan.ts`, `update-todo.ts`).
- `diff.ts` — helper de renderizado de diffs para `write`/`edit`. **No es una tool** y no se registra.
- Tests en `__tests__/`.

**El registro NO ocurre aquí**: `packages/terminal/src/index.ts` llama a
`toolRegistry.register(...)` por cada tool. Un fichero en este directorio que no aparezca allí
no existe en runtime.

## Contrato de ejecución

`defineTool` envuelve cada `execute` con un pipeline fijo, en este orden:

1. **Validación de parámetros** con el esquema Zod de la tool.
2. **Comprobación de permiso** (`checkPermission`) → si falla devuelve un `ToolResult` con
   `metadata.error` y `metadata.permission`, sin ejecutar nada.
3. **Comprobación de abort** (`ctx.abort`) → devuelve resultado con `metadata.aborted`.
4. `execute` de la tool.
5. **Truncado de salida** (`truncateOutput`) → añade `metadata.truncated`.

Invariante: **una tool no lanza excepciones hacia fuera**. `ToolRegistry.execute` captura y
convierte a `ToolResult`, pero un error propagado pierde título y contexto. Devuelve el error
como resultado.

## Permisos

`TOOL_PERMISSION_MAP` mapea id de tool → clave de `ToolPermissions`:

| Tool | Permiso | Default |
|---|---|---|
| `read` | `allowFileRead` | `true` |
| `grep` | `allowGrep` | — |
| `glob` | `allowGlob` | — |
| `list` | `allowList` | — |
| `write`, `edit` | `allowFileWrite` | `false` |
| `bash` | `allowBash` | `false` |
| `skill` | `allowFileRead` | `true` |

`checkPermission` lee la config **mergeada** (global + proyecto) en cada llamada, no cacheada.

### Toda tool registrada está mapeada (y hay un test que lo exige)

`checkPermission` devuelve `true` para cualquier id **que no esté en el mapa**: una tool nueva sin
entrada corre **sin puerta** y nadie se entera. Por eso `__tests__/permissions.test.ts` comprueba
que toda tool registrada tiene entrada, y que toda clave del mapa existe en el esquema.

`git`, `web`, `update_plan` y `update_todo` ya tienen la suya (`allowGit`, `allowWeb`,
`allowPlanWrite`). Sus **defaults son `true`**: ya corrían sin restricción, y apagarlas por sorpresa
rompería configuraciones que hoy funcionan. Lo que aportan las claves es poder apagarlas.

### Una clave ausente es DESCONOCIDA, no denegada

Si el `config.jsonc` del usuario se escribió antes de que existiera una clave, o algo reemplaza el
objeto `tools` entero, la clave no está. Tratar eso como `false` **apaga en silencio una tool que
funcionaba**. Se resuelve al default del esquema.

Pasó de verdad al añadir estas tres: un `configManager.update("tools", {...})` con las seis claves
antiguas dejó `git` denegado y tumbó 9 tests. El fallo no era del test.

## Validación de rutas

`validatePathWithinProject` normaliza y rechaza cualquier ruta que resuelva **fuera del root del
proyecto**
(comprueba que el relativo no empiece por `..` ni sea absoluto). Toda tool que reciba una ruta
del LLM debe pasar por ella: es la defensa contra path traversal inducido por prompt.

## Truncado

La salida se trunca siempre, por longitud de línea y por bytes totales. Ninguna tool debe
asumir que su output llega entero al modelo; si el resultado importa completo, escríbelo a un
fichero y devuelve la ruta.

## Al añadir o cambiar una tool

Carga la skill `agent-tools-contract`. Resumen: definir con `defineTool` → mapear permiso →
registrar en `index.ts` → decidir si los agentes read-only (PLAN/SEARCH) la ven → test del
**caso denegado** → actualizar este fichero y `DOC/ES/referencia-cli.md`.
