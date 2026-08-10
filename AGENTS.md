# Guía de agentes — WabiSabi

Coding agent local-first con dos superficies (CLI y VS Code) sobre Substratum, Ollama o cualquier
API OpenAI-compatible. Contiene **solo reglas siempre-activas y routing**: los workflows viven en
las skills; el producto, en `DOC/ES/`.

## Orden de instrucciones

Antes de editar **DEBES**: (1) seguir esta guía; (2) cargar **todas** las skills cuyo disparador
coincida; (3) leer el `DOCUMENTATION.md` más cercano y el `README.md` del paquete si existen;
(4) seguir el precedente local de código y tests.

Ante conflicto material entre fuentes, **para y resuélvelo** en vez de elegir una en silencio.
Leer o explicar código no requiere cargar skills.

## Fronteras de los paquetes

`core` sin I/O · `terminal` el CLI, **dueño** de `~/.wabisabi/auth.json`, modos, agentes y tools ·
`vscode` extensión · `auth`, `plugins`, `admin` · `wabisabi-web-next` opcional (el CLI no depende
de él). Mapa completo en `DOC/ES/arquitectura.md`.

El CLI **escribe** las credenciales y la extensión las **lee**: tocar el formato o el cifrado de
`auth.json` es un cambio de contrato entre superficies, nunca local.

## Constraints siempre-activos

- Commits **sin `Co-Authored-By`**. Mensajes en español, `tipo(scope): descripción`, < 72 chars.
- **No ejecutar git ni GitHub** salvo petición explícita del usuario.
- **No añadir dependencias** ni cambiar versiones, features o alcance sin autorización explícita.
- **Nunca** loguear ni persistir secretos, tokens, JWT ni contenido sensible.
- **No borrar código que parezca importante** salvo que sea parte explícita de la tarea.
- Cambios mínimos; preserva los cambios no relacionados del worktree.
- Actualiza la documentación dueña cuando cambien propiedad, contratos o invariantes.

## Invariantes de corrección

- Prefiere **estado autoritativo** sobre heurísticas.
- **Un fetch fallido NUNCA puede pasar por éxito vacío.** No conviertas un error en `[]`/`{}`/`null`
  que el llamante use para limpiar estado.
- Resultados parciales, rollback, limpieza y datos rancios: comportamiento **explícito**.
- Una entidad fallida no puede borrar ni bloquear entidades no relacionadas.
- Las diferencias entre CLI y VS Code son **intencionadas y visibles en el código**.
- Permisos y privacidad son **autoridad de ejecución**: se comprueban en el core antes de actuar,
  no en la UI ni en el prompt.

## Skills de proyecto

En `.agents/skills/<nombre>/SKILL.md`. **DEBES** cargar toda skill cuyo disparador coincida antes
de editar; pueden aplicar varias. Son canónicas para su workflow. Tratar esta tabla como consejo
opcional es una violación de proceso.

| Disparador | Skill |
|---|---|
| Fuente, dependencias, exports, build, contratos de paquete, propiedad de módulo | `wabisabi-change-discipline` |
| Tools, permisos, confirmación de destructivos, registro de tools | `agent-tools-contract` |
| Clientes de proveedor, routing de modelos, estrategias, fallback, SSE, Ollama | `provider-routing` |
| `auth.json`, cifrado, keychain, OAuth, JWT, sesión compartida CLI↔VS Code | `auth-shared-session` |
| Modos, REPL/TUI, rendering, slash commands, salida no interactiva, exit codes | `cli-tui-patterns` |

Instalarlas en Claude Code u OpenCode: `bash scripts/sync-skills.sh`.

## Documentación

Lee el `DOCUMENTATION.md` más cercano bajo `packages/**` antes de tocar un módulo (anclas:
`tools/`, `routing/`, `auth/src/`). Producto: `DOC/ES/`, **fuente de verdad**; `DOC/EN/` solo a
petición. Ningún `.md` nuevo se commitea sin aprobación, salvo `README.md`.

## Validación

`package.json` manda en los comandos; la matriz riesgo→validación está en
`wabisabi-change-discipline`. Mínimos innegociables:

- **El type-check no prueba runtime**: ni CLI, ni webview, ni sandbox de plugins.
- Tools, permisos o privacidad exigen test del **caso denegado**, no solo del permitido.
- Un contrato compartido (`core`, `auth.json`, tools) se valida en **ambas** superficies.
- **Reporta exactamente qué validaste y qué no.**
