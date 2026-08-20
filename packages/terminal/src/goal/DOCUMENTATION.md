# Session Goal

## Propósito

Mantener una sesión trabajando hacia un **objetivo** en vez de responder un turno. Es el primer
inquilino previsto del [daemon](../daemon/DOCUMENTATION.md), para que el objetivo siga vivo con la
terminal cerrada.

**Estado**: el bucle corre dentro del daemon y lee sesiones reales. Lo único que falta es el
**ejecutor de turnos headless** — ver "Lo que falta".

## Ficheros

- `schema.ts` — `SessionGoal`, estados, veredictos y las constantes de seguridad.
- `tick.ts` — **funciones puras**: `decide()`, `accountTokens()`, `turnCost()`, `resume()`.
- `auditor.ts` — el auditor independiente sobre `cortex`.
- `store.ts` — un objetivo por sesión en `~/.wabisabi/goals/<sessionId>.json`.
- `runtime.ts` — el bucle: `tickGoal`, `tickAll`, `startGoalLoop`.
- `facts.ts` — traduce un transcript real al snapshot que consume `decide()`.
- `bridge.ts` — ata `readFacts` / `audit` / `dispatch` a la sesión, cortex y el agente.
- `harvest.ts` — destila un objetivo cumplido en una **propuesta** de skill.
- `headless.ts` — ejecuta un turno de agente sin nadie mirando.
- `worktree.ts` — aislamiento en `git worktree` para los objetivos que escriben.
- `actions.ts` — crear, pausar, reanudar y borrar. Único camino para el REPL y la CLI.

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

## Leer los hechos de un transcript real (`facts.ts`)

Cada campo se deriva de una **señal explícita**, no de la prosa. El que sostiene el peso es la
**quiescencia**: el bucle no puede mandar una continuación con un turno en vuelo, así que la sesión
solo se considera quieta cuando el **último** mensaje es del asistente. Un mensaje de usuario
colgando significa que el agente aún no ha contestado; uno de tool, que está a mitad de tool-call.

Los mensajes `system` se descartan: son contexto inyectado (skills, recordatorios), y uno al final
se leería como "no quieto".

Detalle que evita un falso positivo caro: `lastTurnErrored` mira si el turno **empieza** por
`Error:`, no si lo menciona — "he arreglado el Error: del test" es trabajo, no un fallo. Y no se
lee `usage` de un turno que aún no ha terminado.

`usage` es **opcional** en `SessionMessage`: las sesiones escritas antes cargan igual, y su
ausencia significa **desconocido**, nunca cero.

## El bridge y el ejecutor ausente (`bridge.ts`)

`dispatch` **no tiene implementación por defecto y lanza**. Es deliberado: un dispatch que no
hiciera nada dejaría al bucle contando continuaciones que nunca ocurrieron y quemando el
presupuesto de turnos en silencio. Mientras no se le pase un `runTurn`, el tick se registra como
fallido y se ve en el log.

El prompt de continuación lleva el objetivo **XML-escapado** y exige cerrar el turno con un parte
factual de hecho/verificado/pendiente — porque el auditor solo ve ese último turno: ese parte *es*
su evidencia.

## Aislamiento: un objetivo que escribe no toca tu árbol (`worktree.ts`)

Con `autonomousTools: inherit` el agente edita ficheros sin supervisión. Hacerlo **en el árbol de
trabajo del usuario** significa despertarse con un repo que otro ha estado editando, **mezclado con
tu propio trabajo sin commitear**, y sin forma limpia de separar lo uno de lo otro ni deshacer.

Por eso un objetivo que escribe recibe **su propio `git worktree`**: mismo repositorio e historia,
directorio de trabajo y rama aparte, en `~/.wabisabi/worktrees/<sessionId>` sobre
`wabisabi/goal-<sessionId>`. El resultado se revisa como **diff** y se tira con un comando.
**Es la diferencia entre un modo que nadie se atreve a activar y uno que compensa usar.**

- **El aislamiento no es opcional con `inherit`**: se activa solo.
- **Fuera de un repo git, `inherit` se NIEGA a escribir.** Sin repo no hay revisión ni undo, y un
  bucle desatendido escribiendo en un directorio sin versionar no es algo que se deba ofrecer.
- **Se ramifica desde `HEAD`, no del árbol sucio**: el objetivo parte de un estado conocido y **tu
  trabajo sin commitear ni se ve ni se toca** — no puede dañar lo que no ve.
- **Idempotente**: el segundo tick reutiliza el worktree, así que el objetivo conserva su progreso
  entre turnos y entre reinicios del daemon.
- **`worktreeChanges` incluye ficheros nuevos en el diff.** `git diff HEAD` a secas los oculta, así
  que un objetivo cuya aportación entera es un fichero nuevo saldría con diff vacío — lo contrario
  de lo que una revisión necesita.
- **Borrar sin `force` se niega** si hay cambios: tirar el trabajo de un objetivo debe ser deliberado.

## Cosecha de skills (`harvest.ts`)

Un objetivo que el auditor cierra como `complete` es **un camino que alguien recorrió hasta el
final**: justo lo que merece escribirse para que el siguiente agente no lo redescubra. Al asentar,
el bridge destila la sesión en una skill.

### La regla de seguridad: propuesta, nunca instalación

El borrador se escribe con **`status: draft`**, y `SkillsManager` trata los borradores como
invisibles: **no entran en el índice, no se auto-cargan, y la tool `skill` no puede abrirlos**.

El motivo es concreto: wabisabi **auto-carga** la skill que casa con la petición. Una skill que el
agente se escribe a sí mismo y que además se inyecta sola en sus futuros prompts es un agente
**reescribiendo sus propias instrucciones sin que nadie las lea**. Adoptar es un acto humano.

Adoptar = quitar la línea `status: draft` (a mano, o `wabisabi skills adopt <nombre>`). Las
ediciones del usuario en el cuerpo **sobreviven** a la adopción — de hecho editarlo antes de
adoptar es el uso previsto.

### El destilador NO responde en JSON

Pedirle a un modelo que meta markdown multilínea dentro de un string JSON produce, de forma
fiable, **saltos de línea literales dentro del string** — JSON inválido, y lo que se pierde es
justo el trabajo bueno. Comprobado contra qwen2.5:7b: los casos con sustancia fallaban al parsear
mientras los triviales (cuerpo de una línea) pasaban. La cosecha estaba **invertida**.

El formato es line-based y a prueba de saltos de línea:

```
NAME: kebab-case
DESCRIPTION: una linea
BODY:
<markdown libre hasta el final>
```

`parseDistillOutput` tolera además el ```fence con el que muchos modelos lo envuelven.

### Qué se cosecha y qué no

- Solo objetivos `complete`, y solo con **≥2 turnos**: un objetivo de un turno no enseñó nada, y
  cosechar cada final enterraría las skills buenas bajo ruido.
- El resumen conserva la **cola** de la sesión: los turnos finales tienen el resultado verificado,
  los primeros los falsos comienzos que no queremos canonizar.
- Al destilador se le pide **procedimiento generalizable**, y se le prohíbe explícitamente narrar la
  sesión, incluir rutas concretas, secretos o datos del usuario.
- **Nunca sobrescribe** una skill existente, adoptada o borrador: puede llevar ediciones del usuario.
- Todo el camino es best-effort: un destilador caído, una salida con la forma equivocada o un cuerpo
  trivial **no escriben nada** y **no afectan al objetivo que acaba de cumplirse**.

### El revisor independiente

La cosecha era **la única pieza del sistema sin auditor**: el mismo modelo que escribía la skill
decidía que merecía la pena. Es la misma auto-aprobación contra la que existe el bucle de objetivo,
y se notó — un *"mira README.md usando la tool read"* con relleno superaba cualquier heurística de
longitud.

Ahora hay un **revisor en otro modelo** (siempre el pequeño, nunca el que escribió) que además
**no ve el objetivo**, solo el borrador: el entusiasmo por la meta no es prueba de que la skill
enseñe algo.

- **Un revisor caído NO cuenta como aprobación.** Sin revisión, una propuesta no vale la atención
  del lector por defecto.
- Un veredicto ilegible tampoco aprueba.

**Calibración, medida contra qwen2.5:3b**: con solo ejemplos de rechazo, el revisor tumbaba también
el trabajo bueno. Con **un ejemplo de cada lado** discrimina correctamente. Los dos ejemplos del
prompt no son decorativos: quitarlos rompe el filtro.

### Rarezas del modelo que el parser absorbe

Observadas con qwen2.5:7b y cubiertas con test:

- Repite el marcador `BODY:` antes del contenido.
- Añade charla suya **después** de un fence de cierre, a veces en otro idioma.
- Envuelve todo en un ```fence.

Todo eso se recorta: lo que hay tras un fence de cierre es el modelo hablándonos, no la skill.

**Lo que sigue sin resolver**: el contenido puede ser plausible y estar mal (en una prueba real el
modelo escribió `jest.tmpDir()` en un proyecto de Bun). Ninguna heurística ni revisor local lo
atrapa. Por eso son **propuestas que revisa un humano**, no skills.

### Qué modelo la escribe (y por qué se dice)

`goal.harvestModel` en `config.jsonc`:

| Valor | Modelo | Coste | Calidad |
|---|---|---|---|
| `session` (**default**) | el que hizo el trabajo | el de la sesión | la buena |
| `small` | cortex local | casi cero | prosa notablemente peor |

El default es `session` a propósito: **si el usuario paga buena infraestructura —Substratum, su
propia key— ese es el modelo con el que merece la pena escribir**, y además ya lo eligió él.
Juzgar `continue/complete/blocked` le sobra a un 0.5B; redactar una skill decente es otra liga.

Si la llamada al modelo principal falla, se reintenta con el pequeño en vez de perder la cosecha:
peor prosa no es nada, y el borrador dice cuál la escribió.

**Transparencia**: el frontmatter lleva `harvested_by: <modelo>`, y tanto `/skills` como
`wabisabi skills` lo muestran. No es cosmético — una propuesta de un ayudante de 0.5B y una del
modelo principal del usuario merecen confianzas muy distintas, y **eso no se deduce de la prosa**.
Una skill escrita a mano no lleva la línea.

`goal.harvestSkills: false` desactiva la cosecha entera.

### Cómo se entera el usuario

- El daemon lo registra en su log de forma explícita, con la ruta y el comando para adoptarla.
- `/skills` en el REPL y `wabisabi skills` listan las propuestas pendientes **antes** que las
  activas, diciendo que no se cargan en ningún prompt.

## Turnos sin supervisión (`headless.ts`)

Es lo que permite que el objetivo avance con la terminal cerrada. Y es donde estaba el problema
de seguridad más serio de todo esto.

**En modo interactivo, `write`, `edit` y `bash` están protegidos por una confirmación que vive en
el AGENTE, no en el tool.** Un ejecutor headless que llamase al registry directamente se la
saltaría entera y correría con lo que digan `allowFileWrite` / `allowBash`.

Eso sería traicionar el consentimiento: quien activó `allowBash` lo hizo **con un prompt delante,
llamada a llamada**. No es lo mismo que autorizar a un bucle a lanzar comandos de shell a las 3 de
la mañana. Son dos decisiones distintas, y la segunda hay que pedirla aparte.

Por eso los turnos headless tienen **política propia**:

| `goal.autonomousTools` | Efecto |
|---|---|
| `read-only` (**default**) | `write`, `edit` y `bash` **ni se le ofrecen al modelo**, y `git` se filtra por subcomando |
| `inherit` | conjunto completo: el usuario acepta escrituras y shell sin supervisión |

Retirar la tool es más fuerte que rechazarla después: **el modelo no puede pedir lo que no se le
da**. Si aun así la pide (porque la conoce), se le responde que no está disponible y que **no la
reintente**, para que informe del bloqueo en vez de gastar iteraciones.

**No basta con filtrar por tool.** `git` es útil en modo lectura (`status`, `diff`, `log`) pero el
mismo tool hace `commit`, `push`, `reset` y `checkout`: dejarlo entero convertía la política
llamada literalmente *read-only* en permiso para **reescribir y publicar historia sin supervisión**.
El filtro es también **por subcomando**, y es una **allowlist**: un subcomando de git que se añada
mañana queda retenido hasta que alguien decida que es seguro, en vez de heredar permiso en silencio.

Otras protecciones:

- Tope de iteraciones de tool-calling por turno (`maxTurnIterations`, 10).
- **Nunca lanza**: un proveedor caído, una respuesta sin mensaje o un abort vuelven en `stoppedBy`,
  porque el bucle tiene que registrar qué pasó, no tumbar el daemon.
- **Registro de tools vacío = error explícito.** `toToolSpecs` descarta en silencio los ids que no
  conoce, así que un registry sin poblar daría cero herramientas y el modelo se limitaría a hablar:
  un turno que parece exitoso y no hace nada.
- Los mensajes `tool` del historial **no se replayean**: sus resultados ya están resumidos en los
  turnos del asistente, y repetirlos reventaría el contexto de un objetivo largo.
- El turno se **persiste en la sesión** (con su `usage`). Sin eso el siguiente tick releería un
  transcript sin cambios y el bucle nunca vería su propio trabajo.

## Comandos

En el REPL:

```
/goal <texto>     fija el objetivo de la sesion actual
/goal             muestra estado y nota del auditor
/goal pause | /goal resume | /goal clear
```

Fuera del REPL:

```bash
wabisabi goal list                       # objetivos de todas las sesiones
wabisabi goal show [--session <id>]
wabisabi goal set "..." [--budget 50000] # por defecto, la sesion mas reciente
wabisabi goal pause | resume | clear
```

**El bucle nunca crea un objetivo por su cuenta**: solo lee intención del disco. Un bucle autónomo
que además decidiera en qué trabajar no respondería ante nadie.

Detalles con consecuencias:

- **Crear fija un `tokensBaseline`** con lo que la conversación ya costaba. Sin eso, el primer tick
  facturaría la sesión entera anterior contra el presupuesto del objetivo.
- **Reemplazar genera un id nuevo**, que es justo lo que invalida las escrituras de un tick que
  seguía corriendo con el objetivo viejo.
- Un objetivo que **excede el límite se rechaza, no se recorta**: recortarlo cambiaría en silencio
  lo que juzga el auditor.
- Un objetivo **cumplido no se reanuda** — se crea uno nuevo.
- Al fijarlo se avisa de que **sin daemon activo el objetivo queda guardado pero nadie lo empuja**.

## Lo que falta

- Notificación al asentar con la UI cerrada (más allá del log del daemon).
- **Sin probar de extremo a extremo con un modelo real**: cada pieza tiene tests, y el daemon
  arranca el bucle, pero no se ha visto un objetivo completarse contra un LLM de verdad.

## Validación

`bun test src/goal/` — 194 tests: orden de decisión, abort=pausa, las tres paradas duras, la
compactación no juzgada, las rachas de bloqueo y de fallo de auditoría, la contabilidad segmentada
y monótona, y la higiene del prompt del auditor (escapado XML, recorte por el final, rechazo de
veredictos inventados). Ninguno necesita modelo ni red.
