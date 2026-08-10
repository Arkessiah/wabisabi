# Tools

## Propósito

Framework de definición, registro y ejecución de las herramientas que el agente puede invocar.
Este módulo es la **frontera de seguridad** entre el LLM y la máquina del usuario: todo lo que
el agente puede hacer al sistema pasa por aquí.

## Entrypoints y estructura

- `index.ts` — el framework: `defineTool`, `ToolRegistry`, `TOOL_PERMISSION_MAP`,
  `checkPermission`, `validatePath`, `truncateOutput`, `toToolSpecs`.
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

`checkPermission` lee la config **mergeada** (global + proyecto) en cada llamada, no cacheada.

### Hueco conocido (pendiente de decisión de producto)

`checkPermission` **devuelve `true` cuando el id no está en el mapa**. Hoy quedan sin puerta:

- **`git`** — 16 subcomandos, incluidos `commit`, `push`, `reset` y `checkout`. Es la tool con
  más capacidad destructiva después de `bash` y actualmente no la limita ningún permiso.
- **`web`** — hace peticiones de red salientes; no la cubre ningún flag de permiso (el nivel de
  privacidad sí debería gobernarla).
- `update_plan` / `update_todo` — escriben `PLAN.md` / `TODO.md` sin pasar por `allowFileWrite`.

No se ha cambiado el comportamiento: cerrar estos huecos altera lo que el agente puede hacer y
es una decisión de producto del usuario, no del código. Si se decide cerrarlos, el cambio es
añadir entradas al mapa **y** definir los defaults, porque un default restrictivo rompe flujos
que hoy funcionan.

## Validación de rutas

`validatePath` normaliza y rechaza cualquier ruta que resuelva **fuera del root del proyecto**
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
