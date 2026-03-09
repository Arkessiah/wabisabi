# Patrones Autoresearch Integrados

> Patrones inspirados en [autoresearch de Karpathy](https://github.com/karpathy/autoresearch), adaptados para los agentes de WabiSabi.

## Resumen

Se integraron tres funcionalidades basadas en el patron "ratchet" de autoresearch: iteracion autonoma donde solo las mejoras avanzan, los fallos se revierten, y todos los experimentos se registran.

## 1. Auto-Fix Loop (`/autofix`)

Loop autonomo que itera para arreglar tests fallidos.

**Patron**: `commit -> fix -> test -> mantener/revertir`

- Git como ratchet: solo los tests que pasan avanzan HEAD
- El agente analiza la salida del test, aplica fix, commit, ejecuta tests
- Si pasan: mantiene commit. Si fallan: `git reset HEAD~1`
- Presupuesto: maximo N intentos (default 5) para prevenir loops infinitos
- Auto-detecta el comando de test (bun/npm/cargo/go/pytest/make)

**Uso**:
```
/autofix       # 5 intentos (default)
/autofix 10    # 10 intentos
```

**Archivos**:
- `packages/terminal/src/services/autofix-loop.ts` - Servicio del loop
- `packages/terminal/src/agents/base-agent.ts` - Comando `/autofix`

## 2. Log de Experimentos

Registro persistente de todos los intentos de fix para no re-explorar caminos muertos.

**Schema** (`ExperimentEntry`):
- `id`, `description`, `result` (success/fail/crash/skipped)
- `metric` (ej. "tests: 125/125"), `commitHash`, `reverted`
- `duration` (ms), `createdAt`

**Funcionalidades**:
- `wasAlreadyTried(description)` - verifica si un fix similar ya fue intentado
- Fallos recientes inyectados en system prompt ("no reintentar")
- Maximo 100 entradas, eviccion FIFO

**Uso**:
```
/experiments   # Ver historial de experimentos
```

**Archivos**:
- `packages/terminal/src/ram/schema.ts` - Schema ExperimentEntry
- `packages/terminal/src/ram/index.ts` - logExperiment(), getRecentFailures(), wasAlreadyTried()

## 3. PROGRAM.md (Interfaz de Direccion)

El humano escribe estrategia en prosa, el agente ejecuta en codigo.

**Estructura**:
```markdown
## Strategy
<!-- Enfoque de alto nivel -->

## Objectives
1. [pending] Primer objetivo
2. [in_progress] Segundo objetivo
3. [done] Tercer objetivo

## Constraints
- No romper tests existentes
- Mantener cambios minimos

## Execution Log
- [2026-03-09 14:30] Started: Primer objetivo
```

**Funcionalidades**:
- Objetivos parseados e inyectados en el system prompt
- Restricciones aplicadas durante la ejecucion del agente
- Tracking de estado: pending -> in_progress -> done/blocked
- Log de ejecucion auto-poblado

**Uso**:
```
/program          # Ver estado
/program init     # Crear template PROGRAM.md
/program next     # Iniciar siguiente objetivo pendiente
/program done <N> # Marcar objetivo N como completado
```

**Archivos**:
- `packages/terminal/src/context/program-md.ts` - ProgramMdManager
- `packages/terminal/src/agents/base-agent.ts` - Comando `/program` + integracion system prompt

## Arquitectura

```
BaseAgent.rebuildSystemMessage()
  |
  +-- getSystemPrompt()       # Prompt del agente
  +-- buildProfilePrompt()    # Six Hats + perfiles
  +-- soulContext             # Memoria a largo plazo
  +-- ramContext              # Memoria de trabajo + experimentos fallidos
  +-- programContext          # Objetivos + restricciones PROGRAM.md
  +-- projectContext          # Analisis del codebase
```

El autofix loop se integra con el flujo de tool-calling existente: alimenta la salida del test al LLM, le permite usar tools write/edit/bash para arreglar el codigo, y luego evalua el resultado.
