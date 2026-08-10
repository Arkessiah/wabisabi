# Arquitectura de WabiSabi

> Extraído de `AGENTS.md` el 2026-08-11, cuando el guía de agentes pasó a ser un fichero
> fino de routing. Este documento es la **referencia de producto**: qué hay y cómo encaja.
> Para *cómo cambiarlo*, ver `AGENTS.md` y `.agents/skills/`.

## Visión

Terminal IDE con agentes inteligentes para desarrollo de código. Conecta a un backend
Substratum, a Ollama local, o a cualquier API OpenAI-compatible.
Filosofía: **minimalista, rápido, privacy-first**.

## Diagrama de capas

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

## Paquetes

```
wabisabi/
├── packages/
│   ├── core/          tipos, constantes y estrategias compartidas (terminal + vscode)
│   ├── terminal/      el CLI — dueño de ~/.wabisabi/auth.json, modos, agentes, tools
│   ├── vscode/        extensión VS Code — chat webview, inline completion, tools
│   ├── auth/          esquemas de auth compartidos
│   ├── admin/         superficies de administración
│   └── plugins/       sistema de plugins (compatible Claude Code / OpenCode)
├── wabisabi-web-next/  companion Next.js (opcional)
└── BASE/               assets de marca
```

## Agentes

### Build Agent
Genera, modifica y ejecuta código. Acceso completo a todas las herramientas.
- **Tools**: read, write, edit, bash, grep, glob, list, git, web, update_plan, update_todo
- **Uso**: implementar features, fix de bugs, refactoring, testing
- **Prompt**: workflow orientado a código con guías de calidad

### Plan Agent
Analiza codebases y crea planes de arquitectura. **Solo lectura.**
- **Tools**: read, grep, glob, list, git (read-only)
- **Output**: planes estructurados con fases, decisiones y trade-offs

### Search Agent
Explora y busca en el codebase. **Solo lectura + web.**
- **Tools**: read, grep, glob, list, git (read-only), web
- **Output**: resultados con contexto, rutas de fichero y números de línea

### Agent Coordinator (multi-agente)
Orquesta varios agentes para tareas complejas.
- **Estrategias**: sequential, parallel, pipeline
- **Descomposición**: el LLM descompone la tarea en subtasks asignados a agentes
- **Dependencias**: tasks con `dependsOn` para ejecución ordenada
- **CLI**: `wabisabi collab "descripción de tarea compleja"`

## Model Routing (TheOracle)

El router clasifica la tarea automáticamente en `code` (generación, debug, refactoring),
`search` (búsqueda, exploración), `analysis` (arquitectura, planning, review) o `general`.

Orden de resolución:
1. **Heurística local** — clasificar tarea → scoring de modelos → mejor match.
2. **Remoto vía Substratum** — endpoint `/v1/route` cuando está disponible.
3. **Fallback** — modelo configurado por defecto.

## Gestión automática de contexto

**Project Context.** Al iniciar, WabiSabi detecta el root del proyecto (`.git`, `package.json`),
analiza el stack (lenguajes, frameworks, gestor de paquetes), genera/actualiza `AGENTS.md`,
`PLAN.md` y `TODO.md`, e inyecta todo como system prompt.

**Auto-compactación.** Al acercarse al **75%** del límite del modelo:
1. Intenta resumir con el LLM (mejor calidad).
2. Fallback a resumen heurístico (extrae ficheros, decisiones, tareas).
3. Mantiene los **últimos 6 mensajes** intactos.
4. Notifica al usuario.

## Sesiones

- Persistidas en `~/.wabisabi/sessions/`, formato JSON con mensajes, tool calls y metadata.
- `wabisabi session --resume <id>` para retomar; `/sessions` para listar.
- Historial de input persistente en `~/.wabisabi/history`.

## Capa de base de datos

Persistencia opcional con degradación elegante.

| Adapter | Almacenamiento | Uso |
|---------|----------------|-----|
| FileAdapter | `~/.wabisabi/db/*.json` | Default, siempre funciona |
| SqliteAdapter | `~/.wabisabi/db/wabisabi.sqlite` | Mejor rendimiento (`bun:sqlite`) |
| MemoryAdapter | RAM | Testing |

Colecciones: **conversations** (historial con mensajes y metadata), **embeddings** (vectores
para búsqueda semántica, futuro), **cache** (key-value con TTL para respuestas de API).

## Sistema de plugins

Compatible con plugins de Claude Code y OpenCode.

```
~/.wabisabi/plugins/
  my-plugin/
    manifest.json    # name, version, type, entry
    index.js         # código del plugin
```

Gestión: `wabisabi plugin --list | --install <path> | --enable <name> | --disable <name> | --remove <name>`.

## Stack técnico

- **Runtime**: Bun
- **CLI**: Commander.js
- **Validación**: Zod
- **Terminal**: chalk
- **Markdown**: renderer propio con syntax highlighting
- **API**: OpenAI-compatible (SSE streaming)
- **Auth**: OAuth device-code + JWT + almacenamiento cifrado AES-256-GCM
- **Base de datos**: adapters File/SQLite/Memory con cache TTL
- **Retry**: exponential backoff (3 reintentos, timeout 120 s)
- **Tests**: `bun:test` — **30 ficheros, 369 casos** (verificado 2026-08-11)
- **Web**: `Bun.serve` + xterm.js (puente WebSocket)

## Superficies

El CLI y la extensión de VS Code **comparten autenticación** vía el fichero cifrado que
escribe el CLI: se firma una vez y ambas superficies lo recogen. La extensión replica el
orden del CLI (OS Keychain → fallback derivado de la máquina) para que el fichero sea
descifrable desde las dos.
