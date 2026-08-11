---
name: provider-routing
description: Use when changing WabiSabi provider clients, model routing, provider strategies, fallback behavior, SSE streaming, Substratum/Ollama endpoints, or the Ollama cluster.
triggers: provider, proveedor, routing, enrutado, modelo, model, fallback, streaming, sse, ollama, substratum, cluster, estrategia, strategy
---

# Routing de modelos y clientes de proveedor

## Dónde vive

- `packages/terminal/src/routing/index.ts` — clasificación de tarea y scoring (TheOracle).
- `packages/terminal/src/clients/api-client.ts` — cliente OpenAI-compatible con SSE.
- `packages/terminal/src/clients/ollama-cluster.ts` — cluster de nodos Ollama.
- `packages/terminal/src/config/schema.ts` — esquema de proveedores y estrategia.

## Orden de resolución (no lo alteres sin pedirlo)

1. Heurística local: clasificar tarea (`code` | `search` | `analysis` | `general`) → scoring → mejor match.
2. Remoto vía Substratum: `/v1/route` cuando está disponible.
3. Fallback: el modelo configurado por defecto.

La estrategia (`providerStrategy`: `local` / `cluster` / `cloud` / `hybrid-*`) decide **qué
proveedores entran en juego**; el router decide **cuál dentro de los permitidos**. No mezcles
las dos responsabilidades en el mismo sitio.

## Reglas duras

- **El nivel de privacidad manda sobre la estrategia.** En `LOCAL_ONLY` no se contacta con
  Substratum ni con APIs cloud, aunque la estrategia lo pida y aunque el modelo local sea peor.
  La comprobación va **antes** de construir la petición, no en el manejo del error.
- **Un proveedor caído no es un proveedor sin modelos.** Un fallo de red al listar modelos debe
  propagarse como fallo, no degradar a "este nodo no tiene nada" y sacarlo del pool en silencio.
- **El fallback es explícito y visible**: si se cae a otro proveedor o modelo, el usuario tiene
  que poder saber con qué se respondió. Un fallback silencioso convierte un problema de
  conectividad en "el agente se ha vuelto tonto".
- No cachees la URL base ni el cliente entre cambios de endpoint o de estrategia.
- Timeouts y reintentos ya existen (backoff exponencial, 3 reintentos, 120 s). No añadas un
  segundo mecanismo de reintento por encima.

## Streaming SSE

- El parseo de SSE es el punto donde más se rompe la compatibilidad entre proveedores: valida
  contra Ollama **y** contra un endpoint OpenAI-compatible antes de dar por bueno un cambio.
- Una respuesta cortada a mitad de stream debe cerrar la sesión de forma limpia y dejar el
  contenido parcial, no descartarlo.

## Cluster de Ollama

- Los nodos se configuran en `providers.ollama.nodes`. Un nodo que no responde se salta;
  que **todos** fallen es un error del usuario final, no un silencio.
- No asumas que todos los nodos tienen los mismos modelos cargados.

## Validación

- Test de clasificación de tarea con ejemplos de cada categoría.
- Test del caso `LOCAL_ONLY` intentando salir a la red → debe **denegar**.
- Prueba manual contra Ollama local; el type-check no prueba el wire format.
