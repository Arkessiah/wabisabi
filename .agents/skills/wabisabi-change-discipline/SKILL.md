---
name: wabisabi-change-discipline
description: Use when implementing, fixing, refactoring or otherwise modifying WabiSabi source code, dependencies, exports, build configuration, package contracts or module ownership.
---

# WabiSabi Change Discipline

## Principio

Haz el **cambio completo más pequeño** y valida al nivel más estrecho que cubra el riesgo real.

## Antes de editar

1. Lee el `DOCUMENTATION.md` más cercano y el `README.md` del paquete si existen.
2. Mira la implementación y los tests vecinos **antes** de introducir un patrón nuevo.
3. Carga las demás skills cuyo disparador coincida.
4. Clasifica el riesgo más alto aplicable (tabla de `AGENTS.md`).
5. Identifica consumidores afectados, superficies (CLI **y** VS Code), datos persistidos y exports públicos.

## Reglas obligatorias

- Identifica el comportamiento ya cubierto por tests o llamantes; **presérvalo** salvo que la tarea lo reemplace explícitamente.
- **No añadas dependencias** ni cambies versiones o features sin autorización explícita del usuario.
- No añadas rutas de compatibilidad sin un consumidor persistido o externo **concreto**.
- Nunca persistas ni loguees secretos, tokens o contenido sensible.
- Haz explícitos la pérdida de datos, el fallo parcial, el rollback y el fallback.
- Actualiza la documentación dueña cuando cambien propiedad, contratos o invariantes.

## Preferencias de ingeniería

- Cambio mínimo correcto; nada de refactors de paso.
- Entrypoints finos (`packages/terminal/src/index.ts`); la lógica de dominio va al módulo dueño.
- Dependencias explícitas e inyectadas antes que acoplamiento oculto entre módulos.
- Sigue los tipos locales: evita `any`, casts a ciegas y formas de payload adivinadas.
- Early returns y ramas explícitas antes que condicionales anidados.

## Preguntas antes de ampliar un cambio

- ¿La abstracción nueva se **reutiliza**, o solo *podría* reutilizarse?
- ¿El código está en el paquete que **posee** ese comportamiento?
- ¿Cambia un contrato compartido entre CLI y extensión (tipos de `core`, `auth.json`, contrato de tools)?
- ¿Cambia datos persistidos, IDs, ficheros de config, exports o entrypoints?
- ¿Un fallo puede dejar estado, ficheros o credenciales a medias?

Para flujos parciales o destructivos responde explícitamente: qué sigue siendo válido tras el
primer fallo, qué se limpia, qué se puede reintentar, y qué ve el usuario.

## Validación

`package.json` es la fuente de verdad de los comandos.

| Cambio | Validación mínima |
|---|---|
| Un solo paquete, sin exports nuevos | `bun test` del paquete tocado |
| Export o tipo compartido en `core`/`auth` | tests de **terminal y vscode** |
| Tools, permisos o privacidad | test del **caso denegado**, no solo del permitido |
| Formato de config o de sesión | test de round-trip con datos ya existentes |
| Extensión VS Code | compilar el paquete; el type-check no prueba el runtime del webview |

**Reporta exactamente qué validaste y qué no.**

## Errores típicos

- Dar por validado con `tsc` un cambio de runtime del CLI o del webview.
- Convertir un error de red en un valor vacío que el llamante usa para limpiar estado.
- Añadir un flag de config sin default ni migración para configs existentes.
- Ampliar permisos "para que funcione el test".
