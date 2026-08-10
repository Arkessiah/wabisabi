# Routing de modelos (TheOracle)

## Propósito

Decide **qué modelo atiende cada tarea**. Clasifica la petición, puntúa los modelos
disponibles y devuelve una decisión de routing. Los clientes que ejecutan esa decisión viven
en `../clients/`.

## Entrypoints

- `index.ts` — `ModelRouter` (clase), `modelRouter` (instancia compartida),
  `ModelCapabilitySchema` / `ModelCapability`, `TaskType`, `RoutingDecision`.
- `../clients/api-client.ts` — cliente OpenAI-compatible con streaming SSE.
- `../clients/ollama-cluster.ts` — pool de nodos Ollama.

## Modelo conceptual

Dos responsabilidades **separadas a propósito**:

- **Estrategia** (`providerStrategy` en config: `local` / `cluster` / `cloud` / `hybrid-*`)
  decide **qué proveedores entran en juego**.
- **Router** decide **cuál de los permitidos** atiende esta tarea concreta.

No mezclar ambas en el mismo punto: si el router empieza a decidir proveedores, la estrategia
del usuario deja de significar nada.

## Orden de resolución

1. **Heurística local** — clasificar la tarea (`code` | `search` | `analysis` | `general`) →
   scoring de modelos por capacidad → mejor match.
2. **Remoto vía Substratum** — endpoint `/v1/route` cuando está disponible.
3. **Fallback** — el modelo configurado por defecto.

## Invariantes

- **La privacidad manda sobre la estrategia y sobre el router.** En `LOCAL_ONLY` no se contacta
  con Substratum ni con APIs cloud aunque el scoring prefiera un modelo remoto. La comprobación
  va antes de construir la petición, no en el manejo del error.
- **Un proveedor caído ≠ un proveedor sin modelos.** Un fallo al listar modelos se propaga como
  fallo; convertirlo en lista vacía saca el nodo del pool en silencio y el usuario ve
  degradación sin causa visible.
- **El fallback es visible.** Si se responde con un proveedor o modelo distinto al elegido, el
  usuario debe poder saberlo. Un fallback silencioso convierte un problema de red en "el agente
  se ha vuelto tonto".
- No cachear URL base ni cliente entre cambios de endpoint o de estrategia.
- Reintentos: ya existe backoff exponencial (3 reintentos, 120 s) en el cliente. No apilar un
  segundo mecanismo por encima.

## Cluster de Ollama

Nodos en `providers.ollama.nodes`. Un nodo que no responde se salta; que fallen **todos** es un
error visible para el usuario. No asumir que todos los nodos tienen los mismos modelos cargados.

## Validación

- Clasificación: casos de ejemplo por cada `TaskType`.
- Privacidad: `LOCAL_ONLY` intentando salir a la red debe **denegar** (test del caso negativo).
- SSE: probar contra Ollama **y** contra un endpoint OpenAI-compatible; el type-check no valida
  el wire format. Una respuesta cortada a mitad de stream debe conservar el contenido parcial.

Skill asociada: `provider-routing`.
