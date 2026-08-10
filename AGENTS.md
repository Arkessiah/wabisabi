# Guía de agentes — WabiSabi

## Propósito

WabiSabi es un coding agent local-first con dos superficies (CLI de terminal y extensión de
VS Code) sobre un backend Substratum, Ollama local o cualquier API OpenAI-compatible.

Este fichero contiene **solo reglas siempre-activas y routing**. Los workflows detallados
viven en las skills de proyecto y en la documentación de módulo. La referencia de producto
(qué hace cada comando, cómo se configura) vive en `DOC/ES/`.

## Orden de instrucciones

Antes de editar, **DEBES**:

1. Seguir esta guía.
2. Cargar **todas** las skills cuyo disparador coincida con el cambio, y las referencias que
   esas skills exijan.
3. Leer el `DOCUMENTATION.md` más cercano y el `README.md` del paquete cuando existan.
4. Seguir el precedente local de código y tests.

Si estas fuentes entran en conflicto material, **para y resuelve el conflicto** en vez de
elegir una en silencio. Leer o explicar código no requiere cargar skills de implementación.

## Fronteras de los paquetes

- `packages/core` — tipos, constantes y estrategias compartidas. Sin I/O ni dependencias de superficie.
- `packages/terminal` — el CLI. **Dueño** de `~/.wabisabi/auth.json`, de los modos, los agentes y los tools.
- `packages/vscode` — extensión: webview de chat, inline completion, ejecución de tools en el IDE.
- `packages/auth` — esquemas de auth compartidos entre superficies.
- `packages/plugins` — sistema de plugins con sandbox (compatible Claude Code / OpenCode).
- `packages/admin` — superficies de administración.
- `wabisabi-web-next` — companion Next.js opcional; no es dependencia del CLI.

El CLI **escribe** las credenciales; la extensión las **lee**. Un cambio en el formato o en
el cifrado de `auth.json` es un cambio de contrato entre superficies, nunca local.

## Constraints siempre-activos

- **Commits sin `Co-Authored-By`** ni trailers ni metadata automática. Mensajes en español,
  formato `tipo(scope): descripción`, primera línea < 72 caracteres.
- **No ejecutar git ni comandos de GitHub** salvo que el usuario lo pida explícitamente.
- **No añadir dependencias** ni cambiar versiones, features o alcance sin autorización explícita.
- **Nunca** loguear, persistir ni imprimir secretos, tokens, JWT ni contenido sensible de usuario.
- **No borrar código que parezca importante** salvo que borrarlo sea parte explícita de la tarea.
- La seguridad y la corrección se aplican en la **lógica de core/runtime**, no solo en la
  visibilidad de la UI o en los prompts.
- Cambios mínimos: preserva los cambios no relacionados del worktree.
- Actualiza la documentación dueña cuando cambien la propiedad, los contratos o las
  invariantes de un módulo.

## Invariantes de corrección

- Prefiere **estado autoritativo** sobre heurísticas.
- **Un fetch fallido NUNCA puede hacerse pasar por un éxito vacío.** No conviertas un error
  de API en `[]`, `{}` o `null` que el llamante use para limpiar estado.
- Los fallbacks temporales van acotados y se limpian cuando llega el estado autoritativo.
- Resultados parciales, rollback, limpieza y datos rancios: comportamiento **explícito**.
- Una entidad fallida no puede borrar ni bloquear entidades no relacionadas.
- Las diferencias entre superficies (CLI vs VS Code) son **intencionadas y visibles en el
  código**, nunca accidentales.
- Los permisos (`allowFileRead` / `allowFileWrite` / `allowBash`) y el nivel de privacidad son
  **autoridad de ejecución**: se comprueban antes de actuar, no se avisan después.

## Skills de proyecto

Viven en `.agents/skills/<nombre>/SKILL.md` (formato portable). **DEBES** cargar toda skill
cuyo disparador coincida antes de editar; pueden aplicar varias. Las skills son canónicas
para su workflow detallado. Tratar esta tabla como consejo opcional es una violación de proceso.

| Disparador | Skill obligatoria |
|---|---|
| Cualquier cambio de fuente, dependencia, export, config de build, contrato de paquete o propiedad de módulo | `wabisabi-change-discipline` |
| Tools nuevas o modificadas, permisos, confirmación de operaciones destructivas, registro de tools | `agent-tools-contract` |
| Clientes de proveedor, estrategias, routing de modelos, fallback, streaming SSE, Substratum/Ollama | `provider-routing` |
| `auth.json`, cifrado, keychain, OAuth device-code, JWT, sesión compartida CLI↔VS Code | `auth-shared-session` |
| Modos, REPL/TUI, rendering, slash commands, salida no interactiva, códigos de salida | `cli-tui-patterns` |

Para instalar estas skills en Claude Code o en OpenCode: `bash scripts/sync-skills.sh`.

## Descubrimiento de documentación

Antes de cambiar un módulo, busca el `DOCUMENTATION.md` más cercano; antes de trabajo a nivel
de paquete, lee su `README.md`. Descubre la documentación dinámicamente bajo
`packages/**/DOCUMENTATION.md` en vez de fiarte de un mapa estático.

Anclas de alto valor:

- Tools y permisos: `packages/terminal/src/tools/DOCUMENTATION.md`
- Routing y clientes de proveedor: `packages/terminal/src/routing/DOCUMENTATION.md`
- Auth compartida: `packages/auth/src/DOCUMENTATION.md`
- Referencia de producto: `DOC/ES/arquitectura.md`, `DOC/ES/referencia-cli.md`,
  `DOC/ES/configuracion-y-privacidad.md`

## Matriz de riesgo → validación

`package.json` es la fuente de verdad de los comandos.

| Riesgo | Ejemplos | Validación mínima |
|---|---|---|
| Implementación local | Helper privado en un solo paquete | Preserva el comportamiento observable; tests del paquete dueño |
| Contrato de módulo | Export o invariante documentada | Inspecciona consumidores; actualiza tests de contrato y su `DOCUMENTATION.md` |
| Contrato entre superficies | Tipos de `core`, formato de `auth.json`, contrato de tools | Traza **todos** los consumidores reales (terminal **y** vscode) y valida en ambos |
| Persistido o externo | `config.jsonc`, sesiones, `~/.wabisabi/db`, salida del CLI | Define compatibilidad, round-trip, fallo y conversión para datos ya existentes |
| Seguridad | Permisos, privacidad, sandbox de plugins, cifrado | Test explícito del caso denegado, no solo del permitido |

Reglas de honestidad:

- **El type-check no cubre** comportamiento de runtime, la extensión empaquetada, ni el
  sandbox de plugins. Corre tests enfocados o valida a mano la superficie tocada.
- **Reporta exactamente qué validaste y qué no.** Los checks estáticos no prueban corrección
  de runtime.

## Documentación interna

La documentación interna vive en **`DOC/ES/`** y el **español es la fuente de verdad**.
`DOC/EN/` solo se genera si el usuario lo pide explícitamente; los ficheros en inglés que ya
existen se quedan como están y **no se mantienen sincronizados**.

Ningún `.md` nuevo se commitea sin aprobación explícita del usuario, salvo `README.md`.
