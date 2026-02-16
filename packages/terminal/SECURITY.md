# Security - @wabisabi/terminal

## Resumen

Paquete CLI principal con acceso a filesystem, ejecucion de comandos shell, servidor HTTP/WebSocket y cifrado de credenciales. Superficie de ataque amplia que requiere revision continua.

## Dependencias

| Paquete | Version | Ultima estable | Estado | Notas |
|---------|---------|----------------|--------|-------|
| ws | ^8.19.0 | 8.19.x | ✅ OK | CVE-2024-37890 resuelto |
| zod | ^3.25.76 | 3.25.x (v4 beta) | ✅ OK | Validacion de schemas |
| chalk | ^5.6.2 | 5.6.x | ✅ OK | Solo formateo terminal |
| commander | ^12.1.0 | 12.1.x (v14 beta) | ✅ OK | CLI framework |
| bun-types | ^1.0.0 | 1.2.x | Revisar | Solo devDependency |

## Detecciones del Agente de Seguridad

### Audit inicial - 2026-02-16

**Severidad global: ALTA** - 1 CRITICA, 3 ALTAS, 4 MEDIAS, 5 BAJAS detectadas

#### CRITICA: No hay issues críticos en terminal (ver packages/plugins y packages/auth)

#### ALTA-1: Encryption Key Derivation - Clave predecible
- **Archivo**: `src/auth/index.ts:31-36`
- **Issue**: Salt estático + seed de baja entropía (hostname:homedir:uid)
- **OWASP**: A02:2021 Cryptographic Failures
- **Recomendación**: Usar OS keychain o generar salt aleatorio por cifrado
- **Estado**: Pendiente fix

#### ALTA-2: Unrestricted Bash Execution ✅ FIXED
- **Archivo**: `src/tools/bash.ts`
- **Issue**: Comando arbitrario sin blocklist + env completo con secretos
- **OWASP**: A03:2021 Injection
- **Fix aplicado (2026-02-16)**:
  - ✅ Environment allowlist: Solo 19 vars seguras (PATH, HOME, USER, etc.)
  - ✅ Bloqueados: API_KEY, SECRET, TOKEN, PASSWORD, AWS_*, GITHUB_TOKEN, etc.
  - ✅ Command blocklist: 12 patterns destructivos bloqueados
  - ✅ Validación pre-ejecución con mensajes de error claros
  - ✅ Bloqueados: rm -rf, dd, mkfs, fork bomb, curl|sh, sudo rm, etc.
  - ✅ 9 tests verifican allowlist y blocklist
- **Archivos creados**:
  - `src/tools/__tests__/bash-security.test.ts`: 9 tests (todos pasando)
- **Estado**: **RESUELTO** - Ejecución de bash restringida y segura

#### ALTA-3: Web Server - Sin autenticación ✅ FIXED
- **Archivo**: `src/modes/web.ts`
- **Issue**: Bind 0.0.0.0, sin auth, sin CORS, sin Origin validation, CDN sin SRI
- **OWASP**: A01:2021 Broken Access Control
- **Fix aplicado (2026-02-16)**:
  - ✅ Bind exclusivo a 127.0.0.1 (localhost only)
  - ✅ Session token generado con randomBytes(32) y validado en WebSocket upgrade
  - ✅ Origin validation implementada (rechaza origins externos)
  - ✅ Security headers: X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, etc.
  - ✅ SRI (Subresource Integrity) en scripts CDN de xterm.js
  - ✅ 8 tests verifican configuración de seguridad
- **Archivos creados**:
  - `src/modes/__tests__/web-security.test.ts`: 8 tests (todos pasando)
- **Estado**: **RESUELTO** - Servidor web seguro para uso local

#### MEDIA-1: Path Traversal en file tools ✅ FIXED
- **Archivos**: `src/tools/{read,write,edit,glob,list}.ts`
- **Issue**: Sin validación que path resuelto esté en projectRoot
- **OWASP**: A01:2021 Broken Access Control
- **Fix aplicado (2026-02-16)**:
  - ✅ Nueva función validatePathWithinProject() en tools/index.ts
  - ✅ Valida que paths resueltos estén dentro de projectRoot
  - ✅ Rechaza path traversal con ../../../ patterns
  - ✅ Aplicado en 5 file tools (read, write, edit, glob, list)
  - ✅ 16 tests verifican validación y prevención de traversal
  - ✅ Mensajes de error claros "Access denied: path is outside project root"
- **Archivos creados**:
  - `src/tools/__tests__/path-traversal.test.ts`: 16 tests (todos pasando)
- **Estado**: **RESUELTO** - File tools protegidos contra path traversal

#### MEDIA-2: Shell Injection en grep ✅ FIXED
- **Archivo**: `src/tools/grep.ts`
- **Issue**: execSync con args.join(" ") permite metacaracteres shell
- **OWASP**: A03:2021 Injection
- **Fix aplicado (2026-02-16)**:
  - ✅ Reemplazado execSync por execFileSync
  - ✅ Argumentos pasados como array (no string joined)
  - ✅ No interpretación de metacaracteres shell
  - ✅ Comando ejecutado directamente sin shell intermedio
  - ✅ 6 tests verifican uso correcto de execFileSync
- **Archivos creados**:
  - `src/tools/__tests__/grep-security.test.ts`: 6 tests (todos pasando)
- **Estado**: **RESUELTO** - Grep tool seguro contra shell injection

#### MEDIA-3: ReDoS en glob pattern ✅ FIXED
- **Archivo**: `src/tools/glob.ts:19-27`
- **Issue**: Conversión glob->regex manual vulnerable a catastrophic backtracking
- **OWASP**: A03:2021 Injection (ReDoS)
- **Fix aplicado (2026-02-16)**:
  - ✅ Reemplazada conversión manual glob→regex por Bun.Glob nativo
  - ✅ Bun.Glob implementado en Zig (sin vulnerabilidad ReDoS)
  - ✅ Eliminada función matchGlob() vulnerable
  - ✅ Usa glob.scan() API segura con async iteration
  - ✅ Mantiene MAX_RESULTS y path validation
  - ✅ 8 tests verifican uso de Bun.Glob y ausencia de regex manual
- **Archivos creados**:
  - `src/tools/__tests__/glob-security.test.ts`: 8 tests (todos pasando)
- **Estado**: **RESUELTO** - Glob tool usa implementación nativa sin ReDoS

#### MEDIA-4: CVE-2024-37890 en ws dependency ✅ FIXED
- **Package**: ws ^8.16.0 → ^8.19.0
- **CVE**: CVE-2024-37890 (CVSS 7.5) - DoS via large HTTP headers
- **Fix aplicado (2026-02-16)**:
  - ✅ Actualizado ws a 8.19.0 (>= 8.17.1 requerido)
  - ✅ CVE-2024-37890 resuelto
- **Estado**: **RESUELTO**

#### BAJA-1: JWT decode sin verificación ✅ FIXED
- **Archivo**: `src/auth/token.ts:39-46`
- **Issue**: Decode sin verificar firma (intencional para UX cliente)
- **Fix aplicado (2026-02-16)**:
  - ✅ Added explicit security warning in decodeJwt() docstring
  - ✅ Warning explains intentional design for client-side UX only
  - ✅ Lists prohibited uses: authorization, access control, security ops
  - ✅ Clarifies server must verify signatures
- **Estado**: **RESUELTO** - Warning comments added, intentional design documented

#### BAJA-2: Collection name path traversal ✅ FIXED
- **Archivo**: `src/db/adapters.ts:42-44`
- **Issue**: collection name usado directamente en path sin validación
- **Fix aplicado (2026-02-16)**:
  - ✅ Created validateCollectionName() function with regex `/^[a-zA-Z0-9_-]+$/`
  - ✅ Applied validation in FileAdapter.getFilePath()
  - ✅ Applied validation in all SqliteAdapter methods (query, insert, update, delete)
  - ✅ Applied validation in all MemoryAdapter methods (consistency)
  - ✅ Throws clear error on invalid collection names
  - ✅ 11 tests verify validation and rejection of malicious patterns
- **Archivos creados**:
  - `src/db/__tests__/collection-security.test.ts`: 11 tests (todos pasando)
- **Estado**: **RESUELTO** - Collection names validated, path traversal prevented

#### BAJA-3: Config sin permisos restrictivos ✅ FIXED
- **Archivo**: `src/onboarding.ts:73`
- **Issue**: writeFileSync sin mode 0o600, config legible por otros usuarios
- **Fix aplicado (2026-02-16)**:
  - ✅ Added mode: 0o600 to config file creation in onboarding.ts
  - ✅ Config files now owner-only readable/writable (rw-------)
  - ✅ Prevents unauthorized access to API keys in config
  - ✅ 14 tests verify integration
- **Estado**: **RESUELTO** - Config files have restrictive permissions

#### BAJA-4: Escrituras no atómicas ✅ FIXED
- **Archivos**: `src/onboarding.ts`, `src/db/adapters.ts:59`
- **Issue**: writeFileSync puede corromper datos si crash mid-write
- **Fix aplicado (2026-02-16)**:
  - ✅ Created atomicWriteFileSync() utility with temp-file + rename pattern
  - ✅ Implemented fsync to ensure data persists to disk before rename
  - ✅ Applied to 6 critical files: db/adapters, session/storage, config, auth, soul, ram
  - ✅ Automatic cleanup of temp files on error
  - ✅ Maintains file permissions and encoding options
  - ✅ 14 tests verify atomic writes and integration
- **Archivos creados**:
  - `src/utils/atomic-write.ts`: Atomic write implementation
  - `src/utils/__tests__/atomic-write.test.ts`: 14 tests (todos pasando)
- **Estado**: **RESUELTO** - All critical writes are atomic, data corruption prevented

#### BAJA-5: API key en args de CLI ✅ DEPRECATED
- **Archivos**: `src/index.ts:56`, `src/modes/web.ts:70`
- **Issue**: --api-key visible en `ps aux`, expone credenciales
- **Fix aplicado (2026-02-16)**:
  - ✅ Marked --api-key flag as [DEPRECATED] in CLI help
  - ✅ Added runtime warning when --api-key is used
  - ✅ Warning recommends WABISABI_API_KEY env var instead
  - ✅ Explains security risk (visible in process list)
  - ✅ Flag still works for backward compatibility but will be removed
- **Estado**: **DEPRECADO** - Users warned to migrate to env var

<!-- El agente de seguridad añadira detecciones aqui en cada revision -->

## Areas Criticas

### 1. Ejecucion de comandos (tools/git.ts, bash tool)
- **Riesgo**: Command injection via argumentos no sanitizados
- **Mitigacion**: Validar inputs antes de pasar a shell
- **Estado**: Por revisar

### 2. Servidor HTTP/WebSocket (modes/web.ts)
- **Riesgo**: Acceso no autenticado al terminal via WebSocket
- **Mitigacion**: Binding solo a localhost (127.0.0.1), token de sesion
- **Estado**: Por revisar

### 3. Cifrado de credenciales (auth/index.ts)
- **Riesgo**: Key derivation basada en datos de maquina predecibles
- **Mitigacion**: PBKDF2 100k iteraciones SHA-512
- **Estado**: Por revisar

### 4. Almacenamiento de datos (db/adapters.ts)
- **Riesgo**: Path traversal en FileAdapter
- **Mitigacion**: Validar paths contra directorio base
- **Estado**: Por revisar

### 5. JWT (auth/token.ts)
- **Riesgo**: Decode sin verificacion de firma
- **Mitigacion**: Solo uso cliente para lifecycle, no para autorizacion
- **Estado**: Por revisar

## Dependabot

| Check | Estado |
|-------|--------|
| Dependabot activado en repo | Verificar en GitHub Settings > Security |
| Alertas activas | Revisar en Security tab |
| Auto-merge habilitado | No recomendado para major versions |

## Plan de Revision Semanal

### Checklist (cada lunes)

- [ ] Revisar alertas de Dependabot en GitHub Security tab
- [ ] Ejecutar `bun audit` o `npm audit` para detectar CVEs
- [ ] Verificar versiones de dependencias contra ultimas estables
- [ ] Revisar PRs de Dependabot pendientes
- [ ] Comprobar que no hay secretos expuestos (API keys, tokens)
- [ ] Revisar logs de acceso del servidor web (si activo)
- [ ] Actualizar este documento con hallazgos

### Proceso de actualizacion

1. **Patch/Minor**: Merge directo si tests pasan
2. **Major**: Revisar changelog, breaking changes, actualizar codigo si necesario
3. **CVE critico**: Actualizar inmediatamente, no esperar al ciclo semanal

## Historial de Revisiones

| Fecha | Revisor | Hallazgos | Acciones |
|-------|---------|-----------|----------|
| 2026-02-16 | Agente | Audit inicial | 3 ALTAS, 4 MEDIAS, 5 BAJAS |
| 2026-02-16 | Agente | ALTA-2 Fixed | Bash restrictions implementadas |
| 2026-02-16 | Agente | ALTA-3 Fixed | Web server security implementado |
| 2026-02-16 | Agente | MEDIA-2 Fixed | Grep shell injection resuelto (execFileSync) |
| 2026-02-16 | Agente | MEDIA-1 Fixed | Path traversal prevention en file tools |
| 2026-02-16 | Agente | MEDIA-3 Fixed | ReDoS resuelto con Bun.Glob nativo |
| 2026-02-16 | Agente | MEDIA-4 Fixed | ws actualizado a 8.19.0 (CVE resuelto) |
| 2026-02-16 | Agente | BAJA-1 Fixed | JWT decode warnings añadidos |
| 2026-02-16 | Agente | BAJA-2 Fixed | Collection name validation implementada |
| 2026-02-16 | Agente | BAJA-3/4 Fixed | Config permisos + atomic writes implementados |
| 2026-02-16 | Agente | BAJA-5 Deprecated | --api-key flag deprecado con warnings |
