# Referencia de comandos y herramientas

> Extraído de `AGENTS.md` el 2026-08-11. Referencia de superficie de usuario:
> comandos, slash commands, modos, herramientas y perfiles.

## Comandos CLI

```bash
wabisabi interactive                # REPL interactivo (default)
wabisabi agent <build|plan|search>  # Agente específico
wabisabi batch <file.json>          # Tareas en batch
wabisabi stream                     # Modo streaming
wabisabi watch                      # File watcher
wabisabi web                        # Terminal web
wabisabi collab "<tarea>"           # Colaboración multi-agente
wabisabi session --list             # Listar sesiones
wabisabi session --resume <id>      # Retomar sesión
wabisabi config                     # Ver configuración
wabisabi config --wizard            # Re-ejecutar el asistente de onboarding
wabisabi login                      # Re-autenticar (email/password o --device)
wabisabi tools                      # Listar herramientas
wabisabi privacy --show             # Ver nivel de privacidad
wabisabi plugin --list              # Ver plugins
wabisabi menu                       # Menú de configuración
wabisabi info                       # Info del sistema
wabisabi goal list                  # Objetivos de todas las sesiones
wabisabi goal set "..."             # Fijar objetivo (--budget, --session)
wabisabi skills                     # Skills activas y propuestas pendientes
wabisabi skills adopt <nombre>      # Adoptar una propuesta cosechada
wabisabi daemon status              # Proceso de fondo (opt-in)
wabisabi shortcuts                  # Atajos de teclado
```

## Modos

| Modo | Comando | Descripción |
|------|---------|-------------|
| Interactive | `wabisabi interactive` | REPL con bucle de tool-calling (default) |
| Batch | `wabisabi batch <file>` | Ejecutar tareas desde JSON |
| Stream | `wabisabi stream` | Streaming por stdin/stdout |
| Watch | `wabisabi watch` | File watcher + auto-rerun |
| Web | `wabisabi web` | Terminal web vía xterm.js (puerto 3333) |
| Collab | `wabisabi collab "<task>"` | Colaboración multi-agente |

## Slash commands

```
/help             Mostrar ayuda
/clear            Limpiar pantalla
/model <name>     Cambiar modelo (persiste)
/status           Estado completo (tokens, contexto, perfil)
/tools            Listar herramientas disponibles
/skills           Listar skills del proyecto (y avisos de las malformadas)
/goal [texto]     Fijar/ver el objetivo de la sesión (pause|resume|clear)
/approve          Toggle auto-approve para tools destructivos
/compact          Compactar historial de conversación
/export [file]    Exportar conversación a markdown
/menu [cat]       Menú de configuración
/session          Info de sesión actual
/sessions         Listar sesiones recientes
/soul             Ver perfil de alma (memoria persistente)
/ram              Ver memoria de trabajo activa
/pin <text>       Fijar información en RAM
/pins             Ver items fijados
/unpin <id>       Quitar item fijado
/device <type>    Cambiar perfil de dispositivo
/hat [name]       Cambiar sombrero de pensamiento
/profile [name]   Cambiar perfil técnico
/style [name]     Cambiar estilo de comunicación
/preset [name]    Cargar preset de perfil (hat+profile+style)
/reset            Resetear todos los perfiles
/autofix [N]      Auto-fix loop: commit→fix→test→keep/revert (máx N intentos)
/program          Interfaz de dirección PROGRAM.md
/program init     Crear PROGRAM.md con template
/program next     Iniciar siguiente objetivo pendiente
/program done <N> Marcar objetivo N como completado
/experiments      Ver log de experimentos
exit              Salir
```

Hay tab completion para todos los slash commands.

## Herramientas

| Tool | Params | Descripción |
|------|--------|-------------|
| `read` | filePath, offset?, limit? | Lee archivos con números de línea |
| `write` | filePath, content | Crea/sobrescribe archivos mostrando diff |
| `edit` | filePath, oldString, newString, replaceAll? | Buscar y reemplazar con fuzzy matching |
| `bash` | command, timeout?, workdir? | Ejecutar comandos shell (timeout 120 s) |
| `grep` | pattern, path?, include? | Buscar en contenido (ripgrep o fallback) |
| `glob` | pattern, path? | Buscar archivos por patrón |
| `list` | path?, ignore? | Árbol de directorio |
| `git` | subcommand, args?, message? | 16 operaciones git (status, diff, log, commit, branch, add, checkout, stash, show, push, pull, merge, reset, remote, tag, cherry-pick) |
| `web` | url, prompt? | Fetch y procesado de contenido web |
| `update_plan` | content | Actualizar `PLAN.md` |
| `update_todo` | action, task, priority? | Gestionar `TODO.md` |
| `skill` | name | Cargar entera una skill de `.agents/skills/` |

Registro real en `packages/terminal/src/index.ts`. Contrato e invariantes en
`packages/terminal/src/tools/DOCUMENTATION.md`.

### Permisos

Los tools respetan la configuración:

- `allowFileRead` → read, grep, glob, list, skill (default: `true`)
- `allowFileWrite` → write, edit (default: `false`)
- `allowBash` → bash (default: `false`)

Los tools destructivos (write, edit, bash) requieren **confirmación del usuario**.
Toggle con `/approve`.

## Perfiles (Six Hats)

Inspirado en los Seis Sombreros de De Bono, adaptado a trabajo técnico.

### Thinking Hats (perspectiva)

| Hat | Comando | Enfoque |
|-----|---------|---------|
| White | `/hat white` | Datos, hechos, evidencia objetiva |
| Red | `/hat red` | Intuición, instinto de developer |
| Black | `/hat black` | Riesgos, edge cases, qué puede fallar |
| Yellow | `/hat yellow` | Valor, beneficios, lo que funciona |
| Green | `/hat green` | Creatividad, alternativas, ideas nuevas |
| Blue | `/hat blue` | Proceso, big picture, coordinación |

### Technical Profiles (dominio)

| Profile | Comando | Enfoque |
|---------|---------|---------|
| Security | `/profile security` | OWASP, vulnerabilidades, auth, crypto |
| DevOps | `/profile devops` | CI/CD, containers, infra, monitoring |
| Frontend | `/profile frontend` | Componentes, UX, accesibilidad |
| Backend | `/profile backend` | APIs, bases de datos, escalabilidad |
| Fullstack | `/profile fullstack` | End-to-end, type safety, data flow |
| Auditor | `/profile auditor` | Calidad, SOLID, coverage, compliance |
| Architect | `/profile architect` | System design, trade-offs, ADRs |

### Communication Styles

| Style | Comando | Tono |
|-------|---------|------|
| Formal | `/style formal` | Profesional, estructurado |
| Technical | `/style technical` | Conciso, código primero |
| Colloquial | `/style colloquial` | Casual, como un colega |
| Mentor | `/style mentor` | Educativo, explica el "por qué" |

Se combinan: `/hat black` + `/profile security` + `/style formal` = auditor de seguridad
cauteloso y formal. Se persisten en `~/.wabisabi/config.jsonc`.

## Comandos de la extensión de VS Code

| Comando | Acción |
|---|---|
| `WabiSabi: Open Chat` | Enfocar el webview de chat |
| `WabiSabi: Switch Agent` | BUILD / PLAN / SEARCH |
| `WabiSabi: Switch Model` | Elegir el modelo por defecto |
| `WabiSabi: Switch Strategy` | local / cluster / cloud / hybrid-* |
| `WabiSabi: Run Onboarding` | Re-ejecutar el asistente de configuración |
| `WabiSabi: Explain Selection` | Enviar la selección al chat con prompt de explicación |
| `WabiSabi: Fix Selection` | Igual, con prompt de fix |
| `WabiSabi: Generate Test` | Igual, generando tests |
