# Autoresearch Patterns Integration

> Patterns inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch), adapted for WabiSabi agents.

## Overview

Three features were added based on the autoresearch "ratchet" pattern: autonomous iteration where only improvements advance, failures are reverted, and all experiments are logged.

## 1. Auto-Fix Loop (`/autofix`)

Autonomous loop that iterates to fix failing tests.

**Pattern**: `commit -> fix -> test -> keep/revert`

- Git as ratchet: only passing tests advance HEAD
- Agent analyzes test output, applies fix, commits, runs tests
- If tests pass: keep commit. If fail: `git reset HEAD~1`
- Budget: max N attempts (default 5) to prevent infinite loops
- Auto-detects test command (bun/npm/cargo/go/pytest/make)

**Usage**:
```
/autofix       # 5 attempts (default)
/autofix 10    # 10 attempts
```

**Files**:
- `packages/terminal/src/services/autofix-loop.ts` - Loop service
- `packages/terminal/src/agents/base-agent.ts` - `/autofix` command

## 2. Experiment Log

Persistent log of all fix attempts to prevent re-exploring dead ends.

**Schema** (`ExperimentEntry`):
- `id`, `description`, `result` (success/fail/crash/skipped)
- `metric` (e.g. "tests: 125/125"), `commitHash`, `reverted`
- `duration` (ms), `createdAt`

**Features**:
- `wasAlreadyTried(description)` - checks if similar fix was already attempted
- Recent failures injected into system prompt ("do not retry")
- Max 100 entries, FIFO eviction

**Usage**:
```
/experiments   # View experiment history
```

**Files**:
- `packages/terminal/src/ram/schema.ts` - ExperimentEntry schema
- `packages/terminal/src/ram/index.ts` - logExperiment(), getRecentFailures(), wasAlreadyTried()

## 3. PROGRAM.md (Direction Interface)

Human writes strategy in prose, agent executes in code.

**Structure**:
```markdown
## Strategy
<!-- High-level approach -->

## Objectives
1. [pending] First objective
2. [in_progress] Second objective
3. [done] Third objective

## Constraints
- Do not break existing tests
- Keep changes minimal

## Execution Log
- [2026-03-09 14:30] Started: First objective
```

**Features**:
- Objectives parsed and injected into system prompt
- Constraints enforced during agent execution
- Status tracking: pending -> in_progress -> done/blocked
- Execution log auto-populated

**Usage**:
```
/program          # Show status
/program init     # Create PROGRAM.md template
/program next     # Start next pending objective
/program done <N> # Mark objective N as done
```

**Files**:
- `packages/terminal/src/context/program-md.ts` - ProgramMdManager
- `packages/terminal/src/agents/base-agent.ts` - `/program` command + system prompt integration

## Architecture

```
BaseAgent.rebuildSystemMessage()
  |
  +-- getSystemPrompt()       # Agent-specific prompt
  +-- buildProfilePrompt()    # Six Hats + profiles
  +-- soulContext             # Long-term memory
  +-- ramContext              # Working memory + failed experiments
  +-- programContext          # PROGRAM.md objectives + constraints
  +-- projectContext          # Codebase analysis
```

The autofix loop integrates with the existing tool-calling flow: it feeds test output to the LLM, lets it use write/edit/bash tools to fix code, then evaluates the result.
