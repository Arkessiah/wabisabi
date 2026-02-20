# Cortex ML Core - Local ML Engine for Token Reduction

## Context

WabiSabi uses the main LLM tokens for everything: classifying complexity, summarizing tool results, compacting context, and answering simple questions. A small local model (qwen2.5:0.5b, ~500MB RAM) can handle these tasks without consuming main LLM tokens, significantly reducing costs.

The Ollama cluster already exists in `src/providers/ollama-cluster.ts` with configured nodes. Cortex reuses that infrastructure.

## Architecture

```
User Input --> CortexEngine.classify() --> { complexity, canAnswer, category }
                                              |
                          +-------------------+
                          |                   |
                     simple/factual      complex/creative
                          |                   |
                cortex.answer()        Main LLM
                          |                   |
                   Direct response      Tool results --> cortex.summarize()
                                              |
                                      Context grows --> cortex.compact()
```

## New Files

```
packages/terminal/src/cortex/
  schema.ts    -- CortexConfig Zod schema, result types
  client.ts    -- Lightweight Ollama client (raw /api/generate, 3s timeout)
  prompts.ts   -- Prompt templates for classify/summarize/compact/answer
  index.ts     -- CortexEngine singleton with heuristic fallbacks
```

## Files to Modify

- `src/config/schema.ts` -- Add `cortex` block to ConfigSchema
- `src/agents/base-agent.ts` -- 3 integration points:
  1. Pre-LLM: classify + direct-answer for simple queries
  2. Post-tool: summarize long tool results
  3. Compaction: smart compaction when context grows

## File Details

### `cortex/schema.ts`

```typescript
export const CortexConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default("qwen2.5:0.5b"),
  endpoint: z.string().optional(), // null = use first Ollama cluster node
  timeout: z.number().default(3000),
  thresholds: z.object({
    summarizeAbove: z.number().default(500),  // tool result chars
    compactAbove: z.number().default(8000),   // context tokens
  }).default({}),
});

export type ClassifyResult = {
  complexity: "simple" | "moderate" | "complex";
  category: "factual" | "calculation" | "code" | "creative" | "system";
  canAnswerLocally: boolean;
  confidence: number;
};
```

### `cortex/client.ts`

- Raw HTTP client against Ollama's `/api/generate`
- Hard 3s timeout, no streaming, no auth
- Retry: 0 (if it fails, fall back to heuristics)
- Reuses the first OllamaCluster node endpoint if no specific one is configured

### `cortex/prompts.ts`

- `classifyPrompt(userMessage)` --> JSON with complexity/category/canAnswer
- `summarizePrompt(toolName, rawOutput, maxChars)` --> concise summary
- `compactPrompt(messages[], keepLast)` --> compacted messages
- `answerPrompt(userMessage, context)` --> direct response

### `cortex/index.ts` - CortexEngine

```typescript
class CortexEngine {
  private client: CortexClient;
  private stats: { classified: 0, answered: 0, summarized: 0, compacted: 0, tokensSaved: 0 };

  async classify(message: string): Promise<ClassifyResult>  // fallback: keyword heuristics
  async answer(message: string, context: string): Promise<string | null>  // null = couldn't answer
  async summarize(toolName: string, output: string): Promise<string>  // fallback: truncate
  async compact(messages: Message[]): Promise<Message[]>  // fallback: drop oldest
  getStats(): CortexStats
}
export const cortexEngine: CortexEngine;  // singleton
```

## BaseAgent Integration

### Point 1 - Pre-LLM (in main loop, before calling provider)

```typescript
const classification = await cortexEngine.classify(userMessage);
if (classification.canAnswerLocally && classification.confidence > 0.8) {
  const answer = await cortexEngine.answer(userMessage, contextSummary);
  if (answer) { this.io.writeOutput(answer); continue; }
}
```

### Point 2 - Post-tool (after executing a tool)

```typescript
if (toolResult.length > cortexConfig.thresholds.summarizeAbove) {
  const summary = await cortexEngine.summarize(toolName, toolResult);
  // Use summary instead of full toolResult for LLM context
}
```

### Point 3 - Compaction (before sending to LLM, if context exceeds threshold)

```typescript
if (tokenCount > cortexConfig.thresholds.compactAbove) {
  messages = await cortexEngine.compact(messages);
}
```

## Implementation Phases

### Phase 1: Foundation
1. `cortex/schema.ts` - Zod schemas and types
2. `cortex/client.ts` - HTTP client against Ollama
3. `cortex/prompts.ts` - Prompt templates
4. `cortex/index.ts` - CortexEngine with fallbacks
5. Update `config/schema.ts` with cortex block

### Phase 2: Tool Result Summarization (highest impact)
6. Integrate `cortex.summarize()` in base-agent.ts post-tool
7. Configurable threshold (default: >500 chars)

### Phase 3: Complexity Classification
8. Integrate `cortex.classify()` pre-LLM in the loop
9. Routing: simple --> cortex.answer(), complex --> main LLM

### Phase 4: Direct Answering
10. Integrate `cortex.answer()` for simple queries
11. Show visual indicator "[cortex]" when answering locally

### Phase 5: Compaction + Stats
12. Integrate `cortex.compact()` as alternative to existing compactor
13. `/cortex` command to view savings statistics
14. Show saved tokens in TUI header

## Verification

1. `~/.bun/bin/bun test` -- Existing tests pass (cortex disabled = no-op)
2. `~/.bun/bin/bun build src/index.ts --outfile dist/index.js --target bun` -- Build OK
3. With Ollama running + qwen2.5:0.5b: classify returns valid JSON
4. Tool results >500 chars are automatically summarized
5. Simple queries ("what time is it", "2+2") answered without main LLM
6. `/cortex` shows usage stats and saved tokens
7. Without Ollama: silent fallback to heuristics, no errors

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Ollama not available | Fallback to heuristics (truncate, keywords, drop oldest) |
| Model too slow | Hard 3s timeout, if exceeded --> fallback |
| Incorrect classification | 0.8 confidence threshold, only answers when confident |
| Summary loses critical info | Original output preserved, summary only for LLM context |

---

# Cortex ML Core - Motor ML Local para Reduccion de Tokens

## Contexto

WabiSabi consume tokens del LLM principal para TODO: clasificar complejidad, resumir resultados de herramientas, compactar contexto y responder preguntas simples. Un modelo local pequeno (qwen2.5:0.5b, ~500MB RAM) puede manejar estas tareas sin consumir tokens del LLM principal, reduciendo costos significativamente.

El cluster Ollama ya existe en `src/providers/ollama-cluster.ts` con nodos configurados. Cortex reutiliza esa infraestructura.

## Arquitectura

```
User Input --> CortexEngine.classify() --> { complexity, canAnswer, category }
                                              |
                          +-------------------+
                          |                   |
                     simple/factual      complex/creative
                          |                   |
                cortex.answer()        LLM principal
                          |                   |
                   Respuesta directa    Tool results --> cortex.summarize()
                                              |
                                      Contexto crece --> cortex.compact()
```

## Archivos Nuevos

```
packages/terminal/src/cortex/
  schema.ts    -- CortexConfig Zod schema, tipos de resultado
  client.ts    -- Cliente Ollama ligero (raw /api/generate, timeout 3s)
  prompts.ts   -- Templates de prompts para classify/summarize/compact/answer
  index.ts     -- CortexEngine singleton con fallback a heuristicas
```

## Archivos a Modificar

- `src/config/schema.ts` -- Anadir bloque `cortex` al ConfigSchema
- `src/agents/base-agent.ts` -- 3 puntos de integracion:
  1. Pre-LLM: classify + direct-answer para queries simples
  2. Post-tool: resumir resultados largos de herramientas
  3. Compaction: compactacion inteligente cuando el contexto crece

## Detalle de Archivos

### `cortex/schema.ts`

```typescript
export const CortexConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default("qwen2.5:0.5b"),
  endpoint: z.string().optional(), // null = usa primer nodo del cluster Ollama
  timeout: z.number().default(3000),
  thresholds: z.object({
    summarizeAbove: z.number().default(500),  // chars de tool result
    compactAbove: z.number().default(8000),   // tokens de contexto
  }).default({}),
});

export type ClassifyResult = {
  complexity: "simple" | "moderate" | "complex";
  category: "factual" | "calculation" | "code" | "creative" | "system";
  canAnswerLocally: boolean;
  confidence: number;
};
```

### `cortex/client.ts`

- Cliente HTTP raw contra `/api/generate` de Ollama
- Timeout hard de 3s, sin streaming, sin auth
- Retry: 0 (si falla, fallback a heuristicas)
- Reutiliza el endpoint del primer nodo de OllamaCluster si no se configura uno especifico

### `cortex/prompts.ts`

- `classifyPrompt(userMessage)` --> JSON con complexity/category/canAnswer
- `summarizePrompt(toolName, rawOutput, maxChars)` --> resumen conciso
- `compactPrompt(messages[], keepLast)` --> mensajes compactados
- `answerPrompt(userMessage, context)` --> respuesta directa

### `cortex/index.ts` - CortexEngine

```typescript
class CortexEngine {
  private client: CortexClient;
  private stats: { classified: 0, answered: 0, summarized: 0, compacted: 0, tokensSaved: 0 };

  async classify(message: string): Promise<ClassifyResult>  // fallback: heuristica por keywords
  async answer(message: string, context: string): Promise<string | null>  // null = no pudo
  async summarize(toolName: string, output: string): Promise<string>  // fallback: truncar
  async compact(messages: Message[]): Promise<Message[]>  // fallback: drop oldest
  getStats(): CortexStats
}
export const cortexEngine: CortexEngine;  // singleton
```

## Integracion en BaseAgent

### Punto 1 - Pre-LLM (en el loop principal, antes de llamar al provider)

```typescript
const classification = await cortexEngine.classify(userMessage);
if (classification.canAnswerLocally && classification.confidence > 0.8) {
  const answer = await cortexEngine.answer(userMessage, contextSummary);
  if (answer) { this.io.writeOutput(answer); continue; }
}
```

### Punto 2 - Post-tool (despues de ejecutar una herramienta)

```typescript
if (toolResult.length > cortexConfig.thresholds.summarizeAbove) {
  const summary = await cortexEngine.summarize(toolName, toolResult);
  // Usar summary en vez de toolResult completo para el contexto del LLM
}
```

### Punto 3 - Compaction (antes de enviar al LLM, si contexto excede umbral)

```typescript
if (tokenCount > cortexConfig.thresholds.compactAbove) {
  messages = await cortexEngine.compact(messages);
}
```

## Fases de Implementacion

### Fase 1: Fundacion
1. `cortex/schema.ts` - Schemas Zod y tipos
2. `cortex/client.ts` - Cliente HTTP contra Ollama
3. `cortex/prompts.ts` - Templates de prompts
4. `cortex/index.ts` - CortexEngine con fallbacks
5. Actualizar `config/schema.ts` con bloque cortex

### Fase 2: Sumarizacion de Tool Results (mayor impacto)
6. Integrar `cortex.summarize()` en base-agent.ts post-tool
7. Threshold configurable (default: >500 chars)

### Fase 3: Clasificacion de Complejidad
8. Integrar `cortex.classify()` pre-LLM en el loop
9. Routing: simple --> cortex.answer(), complex --> LLM principal

### Fase 4: Respuesta Directa
10. Integrar `cortex.answer()` para queries simples
11. Mostrar indicador visual "[cortex]" cuando responde localmente

### Fase 5: Compaction + Stats
12. Integrar `cortex.compact()` como alternativa al compactor existente
13. Comando `/cortex` para ver estadisticas de ahorro
14. Mostrar tokens ahorrados en header del TUI

## Verificacion

1. `~/.bun/bin/bun test` -- Tests existentes pasan (cortex disabled = no-op)
2. `~/.bun/bin/bun build src/index.ts --outfile dist/index.js --target bun` -- Build OK
3. Con Ollama corriendo + qwen2.5:0.5b: classify devuelve JSON valido
4. Tool results >500 chars se resumen automaticamente
5. Queries simples ("que hora es", "2+2") se responden sin LLM principal
6. `/cortex` muestra estadisticas de uso y tokens ahorrados
7. Sin Ollama: fallback silencioso a heuristicas, sin errores

## Riesgos y Mitigacion

| Riesgo | Mitigacion |
|--------|------------|
| Ollama no disponible | Fallback a heuristicas (truncar, keywords, drop oldest) |
| Modelo demasiado lento | Timeout 3s hard, si excede --> fallback |
| Clasificacion incorrecta | Confidence threshold 0.8, solo responde si esta seguro |
| Resumen pierde info critica | Se guarda output original, resumen solo para contexto LLM |
