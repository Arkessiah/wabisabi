---
name: cli-tui-patterns
description: Use when changing WabiSabi CLI commands, execution modes, the interactive REPL/TUI, terminal rendering, slash commands, non-interactive output, or process exit codes.
---

# Patrones de CLI y TUI

## Dónde vive

- `packages/terminal/src/modes/` — interactive, batch, stream, watch, web, collab.
- `packages/terminal/src/tui/` y `src/rendering/` — REPL, render de markdown, syntax highlighting.
- `packages/terminal/src/index.ts` — definición de comandos (Commander).

## Regla base: no todo es una TTY

Cada salida tiene que funcionar en tres contextos: **TTY interactiva**, **pipe/redirección** y
**CI**. Antes de añadir salida decorada, decide qué se ve en cada uno.

- Sin TTY: nada de spinners, colores, borrado de línea ni redibujado. `chalk` ya detecta el
  soporte de color, pero **no** detecta que tu spinner sobra.
- Lo que consume otro programa va a **stdout**; lo informativo (progreso, avisos) a **stderr**.
  Si mezclas, rompes `wabisabi stream | otra-cosa`.
- Los modos `batch` y `stream` son **contratos de máquina**: cambiar su formato de salida es un
  cambio de contrato externo, no cosmética.

## Códigos de salida

- `0` éxito · distinto de `0` fallo. Un error de auth, un tool denegado o un modelo inalcanzable
  **no pueden salir con 0**: rompen cualquier script que dependa del CLI.
- Ctrl-C debe cerrar limpio (abortar la petición en curso, guardar sesión) y salir con código de
  interrupción, no dejar el terminal en estado raro.

## Añadir un slash command

1. Impleméntalo donde estén sus hermanos, no en el bucle del REPL.
2. Añádelo al **tab completion** y a `/help`.
3. Añádelo a `DOC/ES/referencia-cli.md`.
4. Si persiste algo, va a `~/.wabisabi/config.jsonc` mediante el ConfigManager, no con una
   escritura suelta.

## Añadir un comando o modo

1. Decláralo en `index.ts` con descripción y flags coherentes con los existentes.
2. Los flags de permisos (`--allow-file-read`, `--allow-file-write`, `--allow-system-commands`)
   se mapean a la config; no inventes nombres nuevos para lo mismo.
3. Un modo nuevo declara explícitamente su comportamiento sin TTY.
4. Añádelo a `DOC/ES/referencia-cli.md` y a la tabla de modos.

## Rendering

- El render de markdown es propio: un cambio ahí afecta a **toda** la salida del agente.
  Compruébalo con bloques de código, tablas y listas anidadas.
- Trunca salidas largas por defecto; el usuario puede pedir más, pero un dump de 10k líneas en
  el REPL es un fallo de UX.

## Errores típicos

- Spinner o color en salida redirigida.
- Mensajes de progreso en stdout que contaminan la salida parseable.
- Salir con 0 tras un error recuperado.
- Un slash command nuevo que no aparece en `/help` ni en el completion.
