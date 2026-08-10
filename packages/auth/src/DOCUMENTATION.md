# Auth compartida

## Propósito

Sesión autenticada cifrada en reposo, **compartida entre el CLI y la extensión de VS Code**.
El CLI es el dueño del fichero; la extensión lo lee y debe replicar exactamente el mismo orden
de derivación de clave.

## Entrypoints

- `index.ts` — `AuthSystem` + la instancia `auth`; helpers `login`, `handleCallback`, `logout`,
  `getUser`, `getBilling`, `isAuthenticated`. Tipos: `User`, `TokenBalance`, `AuthSession`.
- `utils/keychain.ts` — `isKeychainAvailable`, `getOrCreateEncryptionKey`.
- `utils/atomic-write.ts` — `atomicWriteFileSync`.

## Cifrado en reposo

- Algoritmo: **AES-256-GCM**.
- La clave viene del **keychain del sistema** cuando está disponible:
  macOS Keychain · Linux Secret Service (gnome-keyring) · Windows Credential Manager.
  Servicio `com.wabisabi.auth`, cuenta `encryption-key`.
- **Fallback**: derivación PBKDF2 a partir del machine-id cuando no hay keychain.
- El salt es estático (`wabisabi-auth-v1`) **a propósito**: la unicidad de la clave la aporta el
  keychain o el machine-id, no el salt. No lo cambies pensando que endurece nada — lo que hace
  es invalidar todos los ficheros existentes.
- La disponibilidad de keychain y la clave se **cachean en memoria** por proceso.

## Escritura atómica

Toda escritura pasa por `atomicWriteFileSync` (temporal + rename). Un crash a mitad de escritura
no puede dejar credenciales corruptas y al usuario fuera de su sesión. **No escribas el fichero
por otro camino.**

## Invariantes

- **Cambiar formato, algoritmo u orden de derivación es un cambio de contrato entre superficies.**
  Si lo tocas en el CLI, lo tocas en la extensión en el mismo cambio, y defines qué pasa con un
  fichero escrito por la versión anterior: migración o re-login forzado **con mensaje claro**.
  Nunca un crash ni un "no hay sesión" silencioso.
- **Nunca** loguear, imprimir ni incluir en errores: tokens, JWT, refresh tokens, la clave
  derivada o el contenido descifrado. Tampoco en modo debug.
- Un token expirado se refresca en silencio; un **refresh fallido** es un fallo de auth
  explícito, no una degradación a modo anónimo.
- `logout` borra de verdad, incluida la entrada del keychain.
- Los permisos del fichero forman parte del contrato: no relajarlos.

## Validación

- Ejercitar el camino **cifrado** de verdad: un test con `auth.json` en claro no prueba nada.
- Round-trip: escribir con el CLI y leer desde la extensión.
- Caso "no puedo descifrar": debe distinguirse de "no hay sesión".

Skill asociada: `auth-shared-session`.
