# Daemon

## Propósito

El proceso de fondo que permite que el trabajo **sobreviva al cierre de la terminal**.
Es lo que convierte a wabisabi de herramienta en servicio local, y por eso es **opt-in**:
`daemon.enabled` es `false` por defecto y nada lo arranca implícitamente.

**Fase 1 (actual)**: el proceso, su garantía de instancia única, su log y una superficie de
control (`ping` / `status` / `shutdown`). **Todavía no ejecuta ninguna carga de trabajo.**
Sus futuros inquilinos son el bucle de objetivo y las tareas programadas.

## Ficheros

- `schema.ts` — `DaemonConfigSchema` (opt-in), `DaemonLock`, `DaemonStatus`.
- `lock.ts` — `~/.wabisabi/daemon.lock`: claim, lectura, detección de PID rancio.
- `logger.ts` — log con rotación por tamaño en `~/.wabisabi/logs/daemon.log`.
- `server.ts` — superficie de control HTTP en loopback con token.
- `index.ts` — ciclo de vida: `start` (spawn desacoplado), `stop`, `status`, `runDaemon`, `request`.

## Invariantes de seguridad (no relajar sin auditoría de exposición)

1. **Bind a `127.0.0.1`, siempre.** `LOOPBACK` es una **constante, no un ajuste**: no hay
   `--lan`, ni `0.0.0.0`, ni clave de config que lo cambie. Publicar "un puerto local" en todas
   las interfaces es la forma más repetida de acabar con un panel interno en internet
   (regla #27). Hay un test que lo verifica.
2. **Cada petición exige el token** de instancia del lock, comparado en tiempo constante.
   Loopback **no es autenticación**: cualquier proceso local —y una página web vía DNS
   rebinding— alcanza `127.0.0.1`.
3. **El token nunca se loguea, ni se imprime, ni vuelve en una respuesta.** El lock se escribe
   con permisos `0600`. El 401 es deliberadamente escueto: no da pistas sobre el token válido.

## El lock y los procesos muertos

**La escritura del lock es atómica** (temp + fsync + rename, vía `utils/atomic-write.ts`). Sin eso,
un lector podía observar un lock a medio escribir, leerlo como malformado, declararlo rancio y
arrancar un **segundo daemon junto al vivo**.

**Leer no muta.** `status()` reporta el estado del lock pero **no lo borra**: solo `start`, que es
quien va a publicar, reemplaza lo que hay. Antes `status` auto-reparaba, lo que convertía a
cualquier observador en mutador de un fichero que no creó — y un `daemon status` inocente borraba
un lock *ilegible*, que no prueba nada sobre si el proceso vive.

**`LockState` es explícito**: `missing` · `alive` · `dead` (PID provablemente muerto) ·
`unreadable` (no se puede saber). **"No se puede saber" nunca se colapsa en "muerto"**: solo un PID
que no responde prueba la muerte. Lección tomada del daemon de OpenChamber/orca, donde tratar un
"no lo sé" como muerte llegó a borrar endpoints que seguían sirviendo.



`~/.wabisabi/daemon.lock` es la única fuente de verdad de "¿hay daemon y cómo le hablo?".

**Un lock cuyo proceso está muerto es rancio, no un daemon corriendo.** Un daemon que crashea o
recibe SIGKILL deja su lock atrás; tratarlo como "ya está corriendo" dejaría el daemon
inarrancable hasta que el usuario borrase a mano un fichero que no sabe que existe. Por eso
**cada lectura verifica que el PID esté vivo** (`kill(pid, 0)`; `EPERM` cuenta como vivo).

Un lock corrupto o sin token cuenta como reemplazable: una escritura truncada no puede dejar el
daemon bloqueado para siempre. Pero se marca `unreadable`, **no** `dead`, y solo lo reemplaza el
siguiente `start`.

## Orden de arranque (importa)

1. **Primero se abre el puerto**, después se escribe el lock. Al revés, un lock escrito antes de
   un bind fallido anunciaría un daemon que no está.
2. El lock publica el puerto **que el SO concedió** (`port: 0` por defecto = puerto libre
   automático), no el solicitado.
3. `start()` no responde hasta que el hijo **ha publicado su lock**. Decir "arrancado" antes de
   que el proceso sea alcanzable haría que un `status` inmediato pareciera roto.

El hijo se lanza `detached` y **sin heredar el stdio del padre**: si mantuviera las tuberías del
terminal, cerrarlo le entregaría SIGHUP o le rompería stdout. Todo va al fichero de log.

`WABISABI_DAEMON_LOCK` transporta la ruta del lock al hijo. Sin eso, `start({lockPath})` sería
una opción que miente: el hijo escribiría siempre el lock por defecto mientras el padre vigila
otro, y el arranque nunca se detectaría.

## Apagado

SIGTERM / SIGINT / `POST /shutdown` → cierra el servidor y borra el lock. **Solo borra el lock si
sigue siendo suyo** (`pid` coincide): si otra instancia tomó el relevo, borrar su lock la dejaría
huérfana. `/shutdown` responde **antes** de apagarse para que el llamante no vea un socket caído.

## Comandos

```bash
wabisabi daemon status   # por defecto
wabisabi daemon start    # falla con mensaje claro si no está activado en config
wabisabi daemon stop
wabisabi daemon logs     # imprime la ruta del log
wabisabi daemon run      # interno: el cuerpo del hijo desacoplado, no para uso manual
```

## Activarlo

`~/.wabisabi/config.jsonc`:

```jsonc
{
  "daemon": {
    "enabled": true,     // por defecto false: nada corre de fondo sin pedirlo
    "port": 0,           // 0 = lo elige el SO; siempre en 127.0.0.1
    "logMaxBytes": 1048576,
    "logKeep": 3
  }
}
```

## Validación

Tests con `bun test src/daemon/`: lock rancio, lock corrupto, doble arranque rechazado, permisos
`0600`, bind a loopback, 401 sin token y con token incorrecto, `/shutdown` solo por POST,
rotación de log. **Ninguno abre puertos salvo el que comprueba el bind.**

Verificación manual del ciclo real (no cubierta por los tests, requiere spawn):
arranque desacoplado → el shell padre muere → el daemon sigue vivo y responde → `stop` lo para.

## El hijo hereda el grafo de imports del CLI

Se lanza con `process.argv[1]`, así que **cualquier import roto del CLI impide arrancar el daemon**.
Ya mordió una vez: `rendering/` importaba `beautiful-mermaid` en el nivel superior y tumbaba el
arranque entero por un renderizador de diagramas que el daemon no usa. Se resolvió haciendo esa
carga perezosa; el paquete ya está instalado, pero la carga perezosa **se queda**: el daemon no
debe depender de que el árbol del CLI esté intacto.

**Regla que se deriva**: cualquier dependencia opcional o decorativa que cuelgue del grafo del CLI
debe cargarse bajo demanda. Un fallo al importarla no puede costar el proceso de fondo.
