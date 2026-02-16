# Security - @wabisabi/terminal

## Resumen

Paquete CLI principal con acceso a filesystem, ejecucion de comandos shell, servidor HTTP/WebSocket y cifrado de credenciales. Superficie de ataque amplia que requiere revision continua.

## Dependencias

| Paquete | Version | Ultima estable | Estado | Notas |
|---------|---------|----------------|--------|-------|
| ws | ^8.16.0 | 8.18.x | Revisar | WebSocket client/server |
| zod | ^3.22.0 | 3.24.x | Revisar | Validacion de schemas |
| chalk | ^5.3.0 | 5.4.x | OK | Solo formateo terminal |
| commander | ^12.0.0 | 12.1.x | OK | CLI framework |
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

#### ALTA-2: Unrestricted Bash Execution
- **Archivo**: `src/tools/bash.ts:50`, `src/tools/git.ts:98`
- **Issue**: Comando arbitrario sin blocklist + env completo con secretos
- **OWASP**: A03:2021 Injection
- **Recomendación**: Allowlist de env vars, blocklist de comandos destructivos
- **Estado**: Pendiente fix

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

#### MEDIA-1: Path Traversal en file tools
- **Archivos**: `src/tools/{read,write,edit,glob,list}.ts`
- **Issue**: Sin validación que path resuelto esté en projectRoot
- **OWASP**: A01:2021 Broken Access Control
- **Estado**: Pendiente fix

#### MEDIA-2: Shell Injection en grep
- **Archivo**: `src/tools/grep.ts:45`
- **Issue**: execSync con args.join(" ") permite metacaracteres shell
- **OWASP**: A03:2021 Injection
- **Recomendación**: Usar execFileSync en vez de execSync
- **Estado**: Pendiente fix

#### MEDIA-3: ReDoS en glob pattern
- **Archivo**: `src/tools/glob.ts:19-27`
- **Issue**: Conversión glob->regex sin escapar metacaracteres
- **OWASP**: A03:2021 Injection (ReDoS)
- **Estado**: Pendiente fix

#### MEDIA-4: CVE-2024-37890 en ws dependency
- **Package**: ws ^8.16.0
- **CVE**: CVE-2024-37890 (CVSS 7.5) - DoS via large HTTP headers
- **Fix**: Actualizar a ws >=8.17.1
- **Estado**: Pendiente `bun update ws`

#### BAJA-1: JWT decode sin verificación
- **Archivo**: `src/auth/token.ts:39-46`
- **Issue**: Decode sin verificar firma (intencional para UX cliente)
- **Estado**: Aceptable - añadir warning en comentarios

#### BAJA-2: Collection name path traversal
- **Archivo**: `src/db/adapters.ts:42-44`
- **Issue**: collection name usado directamente en path
- **Recomendación**: Validar contra `/^[a-zA-Z0-9_-]+$/`
- **Estado**: Pendiente fix

#### BAJA-3: Config sin permisos restrictivos
- **Archivo**: `src/onboarding.ts:73`
- **Issue**: writeFileSync sin mode 0o600
- **Estado**: Pendiente fix

#### BAJA-4: Escrituras no atómicas
- **Archivos**: `src/onboarding.ts`, `src/db/adapters.ts:59`
- **Issue**: writeFileSync puede corromper datos si crash mid-write
- **Estado**: Pendiente fix

#### BAJA-5: API key en args de CLI
- **Archivos**: `src/index.ts:56`, `src/modes/web.ts:70`
- **Issue**: --api-key visible en `ps aux`
- **Estado**: Pendiente deprecar opción CLI

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
| 2026-02-16 | Agente | ALTA-3 Fixed | Web server security implementado |
