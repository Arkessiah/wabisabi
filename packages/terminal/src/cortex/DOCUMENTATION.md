# Cortex

## Propósito

Pre-procesador ML **local** que reduce el consumo de tokens del LLM principal. Usa un modelo
pequeño vía Ollama (por defecto `qwen2.5:0.5b`) para clasificar complejidad, resumir resultados
de tools, compactar historial y responder consultas triviales. **Siempre degrada a heurística**
cuando el modelo no está disponible: cortex nunca es un punto de fallo.

Es el "modelo pequeño" del proyecto: el canal para llamadas LLM que **no son la conversación**.

## Ficheros

- `index.ts` — `CortexEngine` (singleton `cortexEngine`): orquestación, heurísticas de fallback,
  estadísticas y ahorro estimado.
- `client.ts` — `CortexClient`: HTTP contra `/api/generate` de Ollama. Sin streaming, sin auth,
  timeout duro, cero reintentos.
- `prompts.ts` — los prompts de cada tarea. `schema.ts` — config Zod y tipos de resultado.
- `__tests__/client.test.ts` — el contrato de fallos, con `fetch` stubbeado (no requiere Ollama).

## Contrato de resultado (lo más importante de este módulo)

`generate()` y `generateJSON()` devuelven un **resultado discriminado**, no `string | null`:

```ts
type CortexResult<T> =
  | { ok: true; value: T; truncatedInput: boolean }
  | { ok: false; failure: CortexFailure; detail?: string };
```

`CortexFailure` distingue: `unavailable` (endpoint inalcanzable) · `timeout` · `http-error` ·
`aborted` (el llamante canceló) · `empty-output` (respondió pero sin texto) · `invalid-output`
(no era el JSON esperado) · `input-too-large`.

**Por qué.** Antes todo fallo colapsaba en `null`: timeout, Ollama caído, HTTP 500 y "el modelo
no dijo nada" eran indistinguibles. Eso viola la invariante del proyecto *"un fetch fallido nunca
puede pasar por éxito vacío"* (`AGENTS.md`). Para compactar da igual —se cae a heurística— pero
un futuro llamante que deba **actuar** sobre la respuesta (un auditor de progreso que decide si
un objetivo sigue o termina) se conduciría a ciegas: no podría distinguir "el auditor no está
disponible" de "el auditor dice que sigas".

Los llamantes a los que el motivo les da igual usan `textOrNull(result)`.

`CortexEngine.lastError` expone el último fallo (visible en `/cortex`). Es **diagnóstico**: la
ruta de degradación no cambió, solo dejó de ser silenciosa.

## Presupuesto de entrada

`generate()` mide el prompt contra un presupuesto en caracteres (**8.000** por defecto, ~4
chars/token, conservador para un modelo sub-1B). La política la decide el llamante:

- `truncate` (default) — recorta y devuelve `truncatedInput: true`. Correcto para quien degrada
  bien (resúmenes, compactación).
- `error` — devuelve `input-too-large` **sin llamar al modelo**. Correcto cuando una entrada
  recortada produciría una salida silenciosamente equivocada.

Sin esto, un prompt grande contra un modelo de 0.5B devuelve basura con total seguridad.

## JSON

`generateJSON()` pide **`format: "json"` a Ollama** en lugar de confiar en que el modelo obedezca
la instrucción, y aun así tolera que envuelva el objeto en prosa (extrae el primer bloque `{...}`).
El parámetro `validate` permite rechazar un JSON bien formado con la forma equivocada: eso vuelve
como `invalid-output`, **distinto** de un fallo de transporte.

## Cancelación

`signal` en las opciones se combina con el timeout duro del cliente. Un signal ya abortado **no
llega a hacer fetch**. Abortar durante la petición devuelve `aborted`, no `timeout`.

## Invariantes

- **Cortex nunca rompe el flujo principal.** Todo camino tiene heurística de fallback
  (`heuristicClassify`, `heuristicSummarize`, `heuristicCompact`) o devuelve `null` de forma
  contemplada. Un cambio aquí no puede hacer que un fallo de cortex propague hacia arriba.
- `isAvailable()` responde `false` ante un fallo de transporte **a propósito**: el llamante solo
  necesita saber "¿puedo usarlo ahora?"; el motivo real lo da `generate()` si se usa igualmente.
- El cliente **no reintenta**. Si algún día hace falta reintento, va en el llamante, no aquí:
  el LLM principal ya tiene su propio backoff y apilarlos multiplica la latencia.
- Las estadísticas (`stats.fallbacks`) cuentan degradaciones, y son la señal de que el modelo
  pequeño no está aportando.

## Limitaciones conocidas

- **Solo Ollama.** No reutiliza las credenciales de Substratum ni de un endpoint
  OpenAI-compatible, así que sin Ollama cortex queda inerte (degradando a heurística). No hay
  cadena de resolución con caída al modelo de la sesión.
- El presupuesto de entrada es un número fijo, no el `limit.context` real del modelo resuelto.
