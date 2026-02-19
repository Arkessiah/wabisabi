# AGENTS.md - WabiSabi Terminal IDE

## Vision

Terminal IDE con agentes inteligentes para desarrollo de codigo. Conecta a Substratum backend, Ollama local, o cualquier API OpenAI-compatible. Filosofia: minimalista, rapido, privacy-first.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        WabiSabi CLI                              │
├──────────┬──────────┬───────────┬────────────────────────────────┤
│ Agents   │ Tools    │ Profiles  │ Services                       │
│ ──────── │ ──────── │ ───────── │ ────────────────────────────── │
│ Build    │ read     │ 6 Hats    │ SessionManager                 │
│ Plan     │ write    │ 7 Techs   │ ConfigManager                  │
│ Search   │ edit     │ 4 Styles  │ ProjectContext                 │
│ Coord.   │ bash     │           │ PrivacyManager                 │
│          │ grep     │           │ AgentSwitcher                  │
│          │ glob     │           │ MenuSystem                     │
│          │ list     │           │ PluginManager                  │
│          │ git      │           │ AuthManager                    │
│          │ web      │           │ DatabaseManager                │
│          │ plan/todo│           │ ModelRouter                    │
│          │          │           │ SoulManager                    │
│          │          │           │ RamManager                     │
├──────────┴──────────┴───────────┴────────────────────────────────┤
│                       API Client                                  │
│  Substratum (:3001) │ Ollama (:11434) │ OpenAI-compat            │
├──────────────────────────────────────────────────────────────────┤
│                 Context & Session Layer                            │
│  AGENTS.md │ PLAN.md │ TODO.md │ ~/.wabisabi/sessions/           │
├──────────────────────────────────────────────────────────────────┤
│              Persistence & Auth Layer                              │
│  Database (File/SQLite/Memory) │ Auth (OAuth+JWT) │ Plugins      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Agentes

### Build Agent

Genera, modifica y ejecuta codigo. Acceso completo a todas las herramientas.

- **Tools**: read, write, edit, bash, grep, glob, list, git, web, update_plan, update_todo
- **Uso**: Implementar features, fix bugs, refactoring, testing
- **Prompt**: Workflow orientado a codigo con quality guidelines

### Plan Agent

Analiza codebases y crea planes de arquitectura. Solo lectura.

- **Tools**: read, grep, glob, list, git (read-only)
- **Uso**: Analisis de arquitectura, planning, diseno de features
- **Output**: Planes estructurados con fases, decisiones, trade-offs

### Search Agent

Explora y busca en el codebase. Solo lectura + web.

- **Tools**: read, grep, glob, list, git (read-only), web
- **Uso**: Encontrar codigo, entender patrones, documentar hallazgos
- **Output**: Resultados con contexto, file paths, line numbers

### Agent Coordinator (Multi-Agent)

Orquesta multiples agentes para tareas complejas.

- **Estrategias**: sequential, parallel, pipeline
- **Descomposicion**: LLM descompone tarea en subtasks asignados a agentes
- **Dependencias**: Tasks con dependsOn para ejecucion ordenada
- **CLI**: `wabisabi collab "descripcion de tarea compleja"`

---

## Sistema de Herramientas (Tools)

| Tool | Params | Descripcion |
|------|--------|-------------|
| `read` | filePath, offset?, limit? | Lee archivos con numeros de linea |
| `write` | filePath, content | Crea/sobreescribe archivos con diff |
| `edit` | filePath, oldString, newString, replaceAll? | Buscar y reemplazar con fuzzy matching |
| `bash` | command, timeout?, workdir? | Ejecutar comandos shell (120s timeout) |
| `grep` | pattern, path?, include? | Buscar en contenido (ripgrep o fallback) |
| `glob` | pattern, path? | Buscar archivos por patron |
| `list` | path?, ignore? | Arbol de directorio |
| `git` | subcommand, args?, message? | 16 operaciones git (status, diff, log, commit, branch, add, checkout, stash, show, push, pull, merge, reset, remote, tag, cherry-pick) |
| `web` | url, prompt? | Fetch y procesar contenido web |
| `update_plan` | content | Actualizar PLAN.md |
| `update_todo` | action, task, priority? | Gestionar TODO.md |

### Permisos

Los tools respetan el sistema de config:
- `allowFileRead`: read, grep, glob, list (default: true)
- `allowFileWrite`: write, edit (default: false)
- `allowBash`: bash (default: false)

Tools destructivos (write, edit, bash) requieren confirmacion del usuario. Toggle con `/approve`.

---

## Sistema de Perfiles (Six Hats)

Inspirado en los Seis Sombreros de De Bono, adaptado para trabajo tecnico.

### Thinking Hats (perspectiva)

| Hat | Comando | Enfoque |
|-----|---------|---------|
| White | `/hat white` | Datos, hechos, evidencia objetiva |
| Red | `/hat red` | Intuicion, instinto de developer |
| Black | `/hat black` | Riesgos, edge cases, que puede fallar |
| Yellow | `/hat yellow` | Valor, beneficios, lo que funciona |
| Green | `/hat green` | Creatividad, alternativas, ideas nuevas |
| Blue | `/hat blue` | Proceso, big picture, coordinacion |

### Technical Profiles (dominio)

| Profile | Comando | Enfoque |
|---------|---------|---------|
| Security | `/profile security` | OWASP, vulnerabilidades, auth, crypto |
| DevOps | `/profile devops` | CI/CD, containers, infra, monitoring |
| Frontend | `/profile frontend` | Componentes, UX, accesibilidad |
| Backend | `/profile backend` | APIs, databases, escalabilidad |
| Fullstack | `/profile fullstack` | End-to-end, type safety, data flow |
| Auditor | `/profile auditor` | Calidad, SOLID, coverage, compliance |
| Architect | `/profile architect` | System design, trade-offs, ADRs |

### Communication Styles

| Style | Comando | Tono |
|-------|---------|------|
| Formal | `/style formal` | Profesional, estructurado |
| Technical | `/style technical` | Conciso, codigo primero |
| Colloquial | `/style colloquial` | Casual, como un colega |
| Mentor | `/style mentor` | Educativo, explica el "por que" |

Se combinan: `/hat black` + `/profile security` + `/style formal` = auditor de seguridad cauteloso y formal.

Se persisten en `~/.wabisabi/config.jsonc`.

---

## Slash Commands

```
/help             Mostrar ayuda
/clear            Limpiar pantalla
/model <name>     Cambiar modelo (persiste)
/status           Estado completo (tokens, contexto, perfil)
/tools            Listar herramientas disponibles
/approve          Toggle auto-approve para tools destructivos
/compact          Compactar historial de conversacion
/export [file]    Exportar conversacion a markdown
/menu [cat]       Menu de configuracion
/session          Info de sesion actual
/sessions         Listar sesiones recientes
/soul             Ver perfil de alma (memoria persistente)
/ram              Ver memoria de trabajo activa
/pin <text>       Fijar informacion en RAM
/pins             Ver items fijados
/unpin <id>       Quitar item fijado
/device <type>    Cambiar perfil de dispositivo
/hat [name]       Cambiar sombrero de pensamiento
/profile [name]   Cambiar perfil tecnico
/style [name]     Cambiar estilo de comunicacion
/reset            Resetear todos los perfiles
exit              Salir
```

Tab completion disponible para todos los slash commands.

---

## Authentication

### Estrategias (en orden)

1. **JWT Bearer** - Tokens almacenados en `~/.wabisabi/auth.json` (encriptado AES-256-GCM)
2. **OAuth Device Code** - Flow interactivo para login (substratum / github)
3. **API Key Fallback** - Desde env `WABISABI_API_KEY` o `SUBSTRATUM_API_KEY`

### Comandos

```bash
wabisabi login substratum    # OAuth device-code flow
wabisabi login github        # GitHub OAuth
wabisabi logout              # Eliminar credenciales
```

---

## Database Layer

Persistencia opcional con fallback graceful.

### Adapters

| Adapter | Storage | Uso |
|---------|---------|-----|
| FileAdapter | `~/.wabisabi/db/*.json` | Default, siempre funciona |
| SqliteAdapter | `~/.wabisabi/db/wabisabi.sqlite` | Mejor rendimiento (bun:sqlite) |
| MemoryAdapter | RAM | Testing |

### Collections

- **conversations**: Historial de chat con mensajes y metadata
- **embeddings**: Vectores para busqueda semantica (futuro)
- **cache**: Key-value con TTL para respuestas de API

---

## Model Routing (TheOracle)

### Task Classification

El router clasifica tareas automaticamente:
- **code**: Generacion, debug, refactoring
- **search**: Busqueda, exploracion de codebase
- **analysis**: Arquitectura, planning, review
- **general**: Chat general, preguntas

### Routing

1. Heuristica local: Clasificar tarea → scoring de modelos → mejor match
2. Remote via Substratum: `/v1/route` endpoint (cuando disponible)
3. Fallback: Modelo configurado por defecto

---

## Context Auto-Management

### Project Context

Al iniciar, WabiSabi:
1. Detecta el root del proyecto (.git, package.json)
2. Analiza tech stack (lenguajes, frameworks, pkg manager)
3. Genera/actualiza AGENTS.md, PLAN.md, TODO.md
4. Inyecta todo como system prompt

### Auto-Compactacion

Cuando la conversacion se acerca al 75% del limite del modelo:
1. Intenta resumir con el LLM (mejor calidad)
2. Fallback a resumen heuristico (extrae archivos, decisiones, tareas)
3. Mantiene los ultimos 6 mensajes intactos
4. Muestra notificacion al usuario

---

## Modes

| Mode | Comando | Descripcion |
|------|---------|-------------|
| Interactive | `wabisabi interactive` | REPL con tool-calling loop (default) |
| Batch | `wabisabi batch <file>` | Ejecutar tareas desde JSON |
| Stream | `wabisabi stream` | stdin/stdout streaming |
| Watch | `wabisabi watch` | File watcher + auto-rerun |
| Web | `wabisabi web` | Terminal web via xterm.js (puerto 3333) |
| Collab | `wabisabi collab "<task>"` | Multi-agent collaboration |

---

## Plugin System

### Estructura

```
~/.wabisabi/plugins/
  my-plugin/
    manifest.json    # name, version, type, entry
    index.js         # Plugin code
```

### Comandos

```bash
wabisabi plugin --list              # Listar plugins instalados
wabisabi plugin --install <path>    # Instalar desde path local
wabisabi plugin --enable <name>     # Habilitar plugin
wabisabi plugin --disable <name>    # Deshabilitar plugin
wabisabi plugin --remove <name>     # Eliminar plugin
```

---

## Comandos CLI

```bash
wabisabi interactive            # REPL interactivo (default)
wabisabi agent <build|plan|search>  # Agente especifico
wabisabi batch <file.json>      # Tareas en batch
wabisabi stream                 # Modo streaming
wabisabi watch                  # File watcher
wabisabi web                    # Terminal web
wabisabi collab "<tarea>"       # Multi-agent collaboration
wabisabi session --list         # Listar sesiones
wabisabi session --resume <id>  # Resumir sesion
wabisabi config                 # Ver configuracion
wabisabi tools                  # Listar herramientas
wabisabi privacy --show         # Ver nivel de privacidad
wabisabi plugin --list          # Ver plugins
wabisabi menu                   # Menu de configuracion
wabisabi info                   # Info del sistema
wabisabi shortcuts              # Atajos de teclado
```

---

## Stack Tecnico

- **Runtime**: Bun
- **CLI**: Commander.js
- **Validation**: Zod
- **Terminal**: chalk
- **Markdown**: Custom renderer con syntax highlighting
- **API**: OpenAI-compatible (SSE streaming)
- **Auth**: OAuth device-code + JWT + AES-256-GCM encrypted storage
- **Database**: File/SQLite/Memory adapters con TTL cache
- **Retry**: Exponential backoff (3 retries, 120s timeout)
- **Tests**: bun:test (134+ tests, 11 files)
- **Web**: Bun.serve + xterm.js (WebSocket bridge)

---

## Privacy Levels

| Nivel | Red | Modelos | Skills | Telemetria |
|-------|-----|---------|--------|------------|
| LOCAL_ONLY | Deshabilitada | Solo Ollama | Solo locales | Deshabilitada |
| HYBRID (default) | Solo Substratum | Local + fallback | Local + aprobados | Anonima |
| SEMI_REMOTE | Substratum + APIs | Local + Substratum + cloud | Local + compartidos | Stats de uso |
| FULL_REMOTE | Sin restriccion | Cualquiera | Cualquiera | Completa |

---

## Configuracion

### Global: `~/.wabisabi/config.jsonc`

```jsonc
{
  "model": "llama3.2",
  "substratum": "http://localhost:3001",
  "ollama": "http://localhost:11434",
  "apiKey": "...",           // o env WABISABI_API_KEY
  "privacy": "hybrid",
  "defaultAgent": "build",
  "temperature": 0.7,
  "maxTokens": 4096,
  "streaming": true,
  "tools": {
    "allowFileRead": true,
    "allowFileWrite": false,
    "allowBash": false
  },
  "profile": {               // Persiste sombreros/perfiles
    "hat": "black",
    "profile": "security",
    "style": "formal"
  }
}
```

### Por proyecto: `.wabisabi/config.jsonc`

Mismos campos, se mergea con la global (proyecto gana).

---

## Session Management

- Sesiones persistidas en `~/.wabisabi/sessions/`
- Formato JSON con mensajes, tool calls, metadata
- Resume con `wabisabi session --resume <id>`
- Listado con `/sessions`
- Input history persistente en `~/.wabisabi/history`

---

## Git & Commits

- Todos los commits van **sin Co-Authored-By** salvo indicacion explicita del usuario.
- No agregar firmas, trailers ni metadata automatica a los mensajes de commit.
