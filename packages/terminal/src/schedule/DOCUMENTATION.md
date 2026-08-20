# Schedule — tareas programadas

## Propósito

La pata de **scheduling** del bucle: sin ella alguien tiene que fijar cada objetivo a mano. Un
"loop" es un `.md` versionable que vive en el repo, se revisa en un PR y viaja entre máquinas.

```markdown
---
name: repaso-diario
schedule: "0 9 * * *"
enabled: true
model: qwen2.5:7b
token_budget: 50000
---
Revisa los tests que fallan y propón un arreglo.
```

Descubrimiento: `.agents/loops/*.md` (proyecto) y `~/.agents/loops/*.md` (usuario).
**Proyecto tapa a usuario** cuando comparten nombre.

## Ficheros

- `cron.ts` — parser de cron y cálculo de la próxima ejecución.
- `loops.ts` — descubrimiento, parseo y validación.
- `runtime.ts` — el planificador.

## Un loop solo crea sesión + objetivo

Y ahí acaba su trabajo. El resto lo hace el bucle de objetivo que ya existe, así que una tarea
programada **hereda** la política `read-only`, el aislamiento en worktree, el auditor independiente
y los topes de turnos y presupuesto. Un segundo camino de ejecución sería un segundo sitio donde
olvidarse de todo eso.

**El estado de ejecución nunca se escribe al markdown**: el fichero es la definición, con el mismo
contenido en todas tus máquinas. Lo demás vive en memoria del daemon.

## Reglas que evitan sorpresas caras

- **`enabled` es `false` por defecto.** Clonar un repo no puede poner tareas a correr en tu máquina
  sin que las mires. Cualquier valor que no sea exactamente `true` cuenta como apagado.
- **La identidad es la RUTA del fichero**, no el nombre: renombrar la tarea no deja un duplicado
  huérfano corriendo en paralelo.
- **Un fichero malformado NO es un fichero borrado.** Un `.md` a medio editar o con un merge sucio
  se ignora **con aviso** y no impide cargar los demás; nunca se interpreta a medias.
- **Un loop recién visto se programa, no se dispara.** Añadir una tarea no puede ejecutarla en ese
  instante.
- **Varios disparos perdidos ejecutan UNA vez.** Despertar el portátil tras el fin de semana no
  puede lanzar cuarenta tareas de golpe.
- **Los problemas se avisan una sola vez por fichero**, no en cada ciclo: un loop roto no puede
  convertir el log del daemon en ruido cada minuto.
- **Un loop que revienta no tumba al planificador** ni a los demás loops.

## El cron es propio, y estrecho a propósito

Cinco campos (`min hora dia mes dia-semana`) con `*`, números, listas, rangos y pasos. Escrito a
mano en vez de traer dependencia: el subconjunto que hace falta cabe en un fichero, y una librería
de cron es superficie de suministro por muy poco.

**No** soporta atajos con nombre (`@daily`, `MON`). Un cron que no entendemos se **rechaza**: una
tarea que corre a una hora que nadie pidió es peor que una que no corre.

La próxima ejecución es **estrictamente posterior** al momento dado — si no, una tarea que acaba de
correr se redispararía en el mismo minuto. Una expresión imposible (`0 0 31 2 *`) devuelve `null` en
lugar de girar sin fin.

## Validación

`bun test src/schedule/` — 26 tests: expansión de campos, rechazo de lo inválido, próxima ejecución
con día de la semana, `enabled` por defecto, un fichero roto que no arrastra a los demás, el primer
ciclo que solo programa, y el ciclo vencido que **de verdad** fija el objetivo sobre una sesión nueva.
