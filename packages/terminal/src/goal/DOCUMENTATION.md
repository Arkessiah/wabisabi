# Session Goal

## Propósito

Mantener una sesión trabajando hacia un **objetivo** en vez de responder un turno. Es el primer
inquilino previsto del [daemon](../daemon/DOCUMENTATION.md), para que el objetivo siga vivo con la
terminal cerrada.

**Estado**: lógica, auditor, persistencia y bucle hechos y probados. Lo que falta es **conectar
`readFacts` y `dispatch` al agente real** — ver "Lo que falta".

## Ficheros

- `schema.ts` — `SessionGoal`, estados, veredictos y las constantes de seguridad.
- `tick.ts` — **funciones puras**: `decide()`, `accountTokens()`, `turnCost()`, `resume()`.
- `auditor.ts` — el auditor independiente sobre `cortex`.
- `store.ts` — un objetivo por sesión en `~/.wabisabi/goals/<sessionId>.json`.
- `runtime.ts` — el bucle: `tickGoal`, `tickAll`, `startGoalLoop`.

`tick.ts` no hace I/O, no llama al modelo, no toca el reloj. Todo lo sutil de un bucle autónomo
vive ahí precisamente para poder probarlo exhaustivamente sin ejecutar nada.

## La regla que lo gobierna todo

**El agente que trabaja no tiene canal para declararse terminado.** Sólo pueden cerrar un objetivo:

1. Un **auditor independiente** (el modelo pequeño) con veredicto `complete`.
2. Una **parada dura**: error del turno, presupuesto agotado, tope de continuaciones.

Un agente al que le preguntas si ha terminado dice que sí. Por eso el auditor corre en otro modelo,
ve **sólo** el objetivo y el **último** turno —ni historial ni prompts de continuación— y su
entrada va XML-escapada y etiquetada como datos, para que el texto que produjo el trabajo no pueda
convencerlo por la vía de darle órdenes.

## Orden de decisión (importa, y es lo más barato primero)

1. Objetivo no activo, sin turno que auditar, o turno en curso → **esperar**.
2. **Abort del usuario → PAUSA**, nunca bloqueo, y sin auditar. "Stop" significa stop en los dos
   ejes; el bucle no puede colar una continuación por encima de una parada explícita. El abort
   manda incluso sobre un error.
3. Paradas duras: turno con error → `blocked`; presupuesto agotado → `budgetLimited`;
   `turnsUsed >= 20` → `blocked`. **Antes de gastar en auditar.**
4. **Si el último mensaje es una compactación, continuar sin auditar.** Chocar con la ventana de
   contexto es por definición "en progreso"; el resumen es un relato, no evidencia, y juzgarlo
   sería juzgar el retelling. Las paradas duras siguen mandando sobre esto.
5. Auditar. `complete` cierra. `blocked` **no cierra a la primera**: hacen falta **3 seguidos**,
   porque un tropiezo puntual no puede matar un objetivo. `continue` sigue.

## El auditor caído no conduce el bucle a ciegas

Si la auditoría falla (modelo inalcanzable, timeout, salida inválida) se tolera **exactamente una**
continuación sin auditar; a la segunda el objetivo se cierra como `blocked` con motivo
"auditoría no disponible" — reanudable. Al asentar se **resetea la racha**, para que un `resume`
deliberado tenga margen nuevo.

Esto es lo que exigía el contrato de fallos de [cortex](../cortex/DOCUMENTATION.md): un auditor que
no distingue "el modelo no responde" de "el modelo dice que sigas" es peor que no tener auditor.
El tope de turnos sigue aplicando aunque el auditor esté muerto.

## Contabilidad de tokens: snapshot, no suma

El coste de un turno es `input + output + cache.read` del **último turno completo**. Los turnos
anteriores se pliegan en la caché del siguiente, así que **el último snapshot ya factura toda la
corrida**; sumar mensajes cuenta doble.

- Se mide **relativo** a `tokensBaseline` (el snapshot del turno previo al objetivo).
- La **compactación corta la cadena**: el mensaje resumen cierra el segmento en `tokensCommitted`
  (su propio snapshot leyó todo el contexto, así que factura la compactación) y el siguiente
  segmento arranca con baseline 0.
- `tokensUsed` es **monótono**: un contexto que encoge sin avisar nunca mueve el presupuesto hacia
  atrás.
- Sin datos de uso del proveedor, la contabilidad **no se inventa nada**: deja los valores como estaban.

## Constantes de seguridad

| Constante | Valor | Por qué |
|---|---|---|
| `MAX_AUTO_TURNS` | 20 | Tope duro, sobrevive a un auditor caído |
| `BLOCKED_STREAK_LIMIT` | 3 | Un tropiezo puntual no mata el objetivo |
| `AUDIT_FAIL_LIMIT` | 2 | Una continuación sin auditar, no más |
| `MAX_OBJECTIVE_CHARS` | 5.000 | Un objetivo que no cabe se rechaza, no se recorta |

## Persistencia y bucle

Un objetivo por sesión, en `~/.wabisabi/goals/<sessionId>.json` (escritura atómica). Se guarda
fuera del transcript porque el objetivo puede ocupar varios KB y el transcript se reescribe en cada
turno. El id del payload es el **guardia contra escrituras rancias**: un tick que estaba auditando
cuando el usuario reemplazó la meta no puede resucitar el estado viejo (`saveIfCurrent`).

**Orden que cuesta datos si se rompe: se persiste ANTES de despachar.** Un crash tras la escritura
solo espera al siguiente ciclo; al revés, se enviaría la misma continuación dos veces sin contar
ninguna. Hay un test que comprueba que al despachar el turno ya está contado en disco.

Otras reglas del bucle:

- **El auditor solo se llama si hace falta.** El tick decide primero con un thunk sonda; si una
  parada dura o una compactación ya resuelven, no se gasta una llamada al modelo.
- **Los ciclos no se solapan**: una auditoría lenta no puede apilar ticks y despachar dos
  continuaciones para el mismo objetivo.
- **Una sesión rota no arrastra a las demás**: un objetivo que lanza se registra y se salta.
- El intervalo es la única señal en la que el daemon puede confiar: no hay canal vivo hacia un CLI
  que puede no estar corriendo.

## Lo que falta

- **Conectar `readFacts` y `dispatch` al agente real.** Hoy son dependencias inyectadas con
  implementación de prueba. El daemon ya arranca por el entrypoint real del CLI (la carga de
  `beautiful-mermaid` se hizo perezosa), así que el camino está abierto.
- **Arrancar el bucle dentro del daemon** (`startGoalLoop` desde `runDaemon`).
- **Uso de tokens por turno**: `SessionMessage` no guarda `usage`, así que `accountTokens` no tiene
  de dónde leer. Requiere añadir un campo opcional a la sesión (cambio de dato persistido,
  compatible hacia atrás por ser opcional).
- Persistencia del objetivo junto a la sesión, y comandos (`/goal`, `wabisabi goal ...`).
- Notificación al asentar con la UI cerrada.

## Validación

`bun test src/goal/` — 65 tests: orden de decisión, abort=pausa, las tres paradas duras, la
compactación no juzgada, las rachas de bloqueo y de fallo de auditoría, la contabilidad segmentada
y monótona, y la higiene del prompt del auditor (escapado XML, recorte por el final, rechazo de
veredictos inventados). Ninguno necesita modelo ni red.
