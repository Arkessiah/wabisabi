# Security - @wabisabi/auth

## Resumen

Sistema de autenticacion con OAuth, JWT y hashing de passwords. Maneja credenciales sensibles y tokens de acceso. Paquete de alto riesgo que requiere atencion prioritaria.

## Dependencias

| Paquete | Version | Ultima estable | Estado | Notas |
|---------|---------|----------------|--------|-------|
| openid-client | ^5.6.0 | 6.x | Revisar | OAuth/OIDC - v6 es breaking change |
| jsonwebtoken | ^9.0.0 | 9.0.2 | Revisar | Firma y verificacion JWT |
| bcryptjs | ^2.4.0 | 2.4.3 | OK | Hashing de passwords |
| bun-types | ^1.0.0 | 1.2.x | Revisar | Solo devDependency |

## Detecciones del Agente de Seguridad

### Audit inicial - 2026-02-16

**Severidad global: CRITICA** - 1 CRITICA, 2 ALTAS, 1 MEDIA, 1 BAJA

#### CRITICA-1: Session tokens en plaintext
- **Archivo**: `src/index.ts:112-117`
- **Issue**: `session.json` guardado sin cifrado y sin permisos restrictivos (mode 0o600)
- **OWASP**: A02:2021 Cryptographic Failures
- **Impacto**: accessToken y refreshToken legibles por cualquier usuario/malware local
- **Recomendación**: Cifrar como en packages/terminal/src/auth/index.ts (AES-256-GCM)
- **Estado**: **CRITICO - Fix inmediato requerido**

#### ALTA-1: OAuth sin validación de respuesta
- **Archivo**: `src/index.ts:35-59`
- **Issue**: Sin validar datos de callback, sin state parameter (CSRF), exp hardcodeado cliente
- **OWASP**: A07:2021 Identification and Authentication Failures
- **Vulnerabilidad**: Authorization code injection attack (RFC 6749 Section 10.12)
- **Estado**: Pendiente fix

#### ALTA-2: API URL hardcodeada HTTP
- **Archivo**: `src/index.ts:26`
- **Issue**: `http://localhost:3001` sin opción de config, transmite tokens en plaintext
- **OWASP**: A02:2021 Cryptographic Failures
- **Recomendación**: Forzar https:// para URLs remotas
- **Estado**: Pendiente fix

#### BAJA-1: Dependencias no usadas
- **Issue**: openid-client, jsonwebtoken, bcryptjs instalados pero no importados
- **Impacto**: Aumentan superficie de ataque sin beneficio
- **Estado**: Eliminar o implementar funcionalidad

## Areas Criticas

### 1. Gestion de tokens JWT
- **Riesgo**: Algoritmo debil, expiracion incorrecta, secreto predecible
- **Mitigacion**: Usar RS256/ES256 en produccion, validar exp/iat/nbf
- **Estado**: Por revisar

### 2. OAuth flow
- **Riesgo**: State parameter faltante, redirect URI abierto
- **Mitigacion**: Validar state, whitelist de redirect URIs
- **Estado**: Por revisar

### 3. Password hashing (bcryptjs)
- **Riesgo**: Cost factor bajo, bcryptjs es JS puro (mas lento que native)
- **Mitigacion**: Usar cost factor >= 12, considerar argon2 para futuro
- **Estado**: Por revisar

### 4. Almacenamiento de secretos
- **Riesgo**: Tokens/keys en texto plano en config files
- **Mitigacion**: Cifrar at-rest, permisos restrictivos en archivos
- **Estado**: Por revisar

## Dependabot

| Check | Estado |
|-------|--------|
| Dependabot activado en repo | Verificar en GitHub Settings > Security |
| Alertas activas | Revisar en Security tab |
| openid-client v6 disponible | Evaluar migracion (breaking changes) |

## Plan de Revision Semanal

### Checklist (cada lunes)

- [ ] Revisar alertas de Dependabot en GitHub Security tab
- [ ] Ejecutar audit de dependencias para detectar CVEs
- [ ] Verificar que jsonwebtoken no tiene CVEs conocidos
- [ ] Comprobar que bcryptjs usa cost factor adecuado (>= 12)
- [ ] Revisar que no hay tokens/secretos hardcodeados en codigo
- [ ] Verificar rotacion de secretos si aplica
- [ ] Actualizar este documento con hallazgos

### Proceso de actualizacion

1. **Patch/Minor**: Merge directo si tests pasan
2. **Major** (openid-client v6): Planificar migracion, revisar breaking changes
3. **CVE critico**: Actualizar inmediatamente

## Historial de Revisiones

| Fecha | Revisor | Hallazgos | Acciones |
|-------|---------|-----------|----------|
| 2026-02-16 | Agente | Audit inicial | Pendiente resultados |
