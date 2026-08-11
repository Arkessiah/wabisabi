---
name: auth-shared-session
description: Use when changing WabiSabi authentication, the auth.json format or its encryption, keychain access, OAuth device-code flow, JWT refresh, or anything affecting the shared session between the CLI and the VS Code extension.
triggers: auth, autenticacion, authentication, login, token, jwt, keychain, cifrado, encryption, credencial, credenciales, sesion, session, oauth
---

# Auth y sesión compartida CLI ↔ VS Code

## El invariante que lo gobierna todo

**El CLI escribe `~/.wabisabi/auth.json`; la extensión de VS Code lo lee.** Cualquier cambio en
el formato, en el cifrado o en el orden de derivación de la clave es un **cambio de contrato
entre superficies**, nunca un cambio local. Si tocas uno, tocas los dos en el mismo cambio.

## Dónde vive

- `packages/auth/src/` — esquemas compartidos.
- `packages/terminal/src/auth/` — dueño del fichero: escritura, cifrado, refresco.
- `packages/vscode/src/` — lectura y réplica del orden de descifrado.

## Orden de la clave (idéntico en ambas superficies)

1. **OS Keychain** cuando está disponible.
2. **Fallback derivado de la máquina** cuando no lo está.

Si cambias el fallback, un `auth.json` escrito por una versión anterior deja de descifrarse:
eso es una **migración**, y necesita ruta de recuperación (re-login limpio, no un crash).

## Estrategias de credencial (en orden)

1. JWT Bearer desde `auth.json` (AES-256-GCM).
2. OAuth device-code (`substratum`, `github`).
3. API key desde `WABISABI_API_KEY` / `SUBSTRATUM_API_KEY`.

## Reglas duras

- **Nunca** loguear, imprimir ni incluir en mensajes de error: tokens, JWT, refresh tokens,
  claves derivadas ni el contenido de `auth.json`. Tampoco en modo debug.
- Un token expirado se **refresca en silencio**; un refresh fallido es un fallo de auth
  explícito, no un fallback silencioso a modo anónimo.
- Escritura del fichero: **atómica** (escribir temporal + rename). Un crash a mitad de escritura
  no puede dejar credenciales corruptas y al usuario fuera.
- `logout` borra credenciales de verdad, incluida la entrada del keychain.
- Los permisos del fichero son parte del contrato: no los relajes.

## Al cambiar el esquema

1. Versiona el payload; no infieras la versión por la presencia de campos.
2. Define qué pasa con un fichero de la versión anterior: migrar o forzar re-login **con mensaje claro**.
3. Comprueba el caso real: escribir con el CLI y leer desde la extensión (y al revés si aplica).
4. Actualiza `packages/auth/src/DOCUMENTATION.md`.

## Errores típicos

- Cambiar el formato solo en el CLI y descubrirlo cuando la extensión deja de autenticar.
- Tratar "no puedo descifrar" como "no hay sesión" → el usuario pierde la sesión sin saber por qué.
- Meter el token en una URL o en un query param.
- Tests que usan un `auth.json` en claro y por tanto no ejercen el camino de cifrado.
