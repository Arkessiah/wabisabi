# Security Policy

## Supported Versions

The following versions are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously.

If you discover a security vulnerability, please report it privately using GitHub’s **Private Vulnerability Reporting** feature:

1. Go to the repository.
2. Click on the **Security** tab.
3. Select **Advisories**.
4. Click **Report a vulnerability**.

Please do not open a public issue for security vulnerabilities.

### What to include in your report

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested mitigation (if available)

### Response timeline

- Initial acknowledgment: within 72 hours
- Status update: within 7 days
- Patch or mitigation timeline: depending on severity

If the report is accepted, we will:
- Prepare a fix
- Publish a security advisory
- Credit the reporter (if desired)

We appreciate responsible disclosure.

---

## Security por Paquete

Cada paquete mantiene su propio SECURITY.md con detecciones especificas:

| Paquete | Riesgo | Dependencias | SECURITY.md |
|---------|--------|-------------|-------------|
| @wabisabi/terminal | Alto | ws, zod, chalk, commander | [packages/terminal/SECURITY.md](packages/terminal/SECURITY.md) |
| @wabisabi/auth | Alto | openid-client, jsonwebtoken, bcryptjs | [packages/auth/SECURITY.md](packages/auth/SECURITY.md) |
| @wabisabi/plugins | Medio | Ninguna (riesgo en plugins de terceros) | [packages/plugins/SECURITY.md](packages/plugins/SECURITY.md) |
| @wabisabi/admin | Bajo | Ninguna | [packages/admin/SECURITY.md](packages/admin/SECURITY.md) |

## Dependabot

GitHub Dependabot debe estar activado para este repositorio:

1. **Settings > Code security and analysis > Dependabot alerts**: Activar
2. **Dependabot security updates**: Activar
3. **Dependabot version updates**: Configurar en `.github/dependabot.yml`

Las alertas de Dependabot se documentan en el SECURITY.md de cada paquete afectado.

## Plan de Revision Semanal de Seguridad

### Frecuencia: Cada lunes

El agente de seguridad de WabiSabi ejecutara automaticamente una revision semanal que incluye:

### 1. Dependencias y CVEs
- Revisar alertas de Dependabot en GitHub Security tab
- Ejecutar `bun audit` / `npm audit` en cada paquete
- Verificar versiones actuales vs ultimas estables
- Merge PRs de Dependabot que pasen tests (patch/minor)
- Evaluar major updates con breaking changes

### 2. Codigo
- Scan de secretos expuestos (API keys, tokens, passwords)
- Revision de nuevos archivos por vulnerabilidades comunes
- Verificar permisos de archivos sensibles (auth, config)
- Comprobar sanitizacion de inputs en tools y endpoints

### 3. Infraestructura
- Verificar que el servidor web solo escucha en localhost
- Comprobar cifrado de credenciales at-rest
- Revisar logs de acceso si disponibles
- Verificar integridad de plugins instalados

### 4. Documentacion
- Actualizar SECURITY.md de cada paquete con hallazgos
- Registrar acciones tomadas en historial de revisiones
- Notificar al usuario de issues pendientes

### Notificaciones

El agente avisara al usuario cada lunes con:
- Resumen de alertas de Dependabot activas
- Dependencias desactualizadas
- Vulnerabilidades detectadas en codigo
- Acciones recomendadas priorizadas por severidad

## Historial de Revisiones Globales

| Fecha | Paquetes revisados | Hallazgos | Acciones |
|-------|-------------------|-----------|----------|
| 2026-02-16 | Todos (terminal, auth, plugins, admin) | **2 CRITICAS**, 5 ALTAS, 5 MEDIAS, 7 BAJAS | Ver SECURITY.md de cada paquete para detalles |

## Resumen Ejecutivo del Audit Inicial (2026-02-16)

### Hallazgos Críticos (Acción Inmediata Requerida)

1. ✅ **@wabisabi/plugins** - Arbitrary code execution via `import(pluginPath)` sin sandboxing
   - **Riesgo**: Código malicioso ejecutado con privilegios completos
   - **Acción**: Bun Worker sandboxing + permission enforcement
   - **Estado**: ✅ RESUELTO (2026-02-16)

2. ✅ **@wabisabi/auth** - Session tokens con weak encryption key derivation
   - **Riesgo**: Encryption keys predecibles por machine-id, atomic writes faltantes
   - **Acción**: OS keychain integration + atomic writes
   - **Estado**: ✅ RESUELTO (2026-02-16)

### Top 5 Prioridades de Fix

1. ✅ **Plugin sandboxing** (packages/plugins) - Bun Workers + permission enforcement - RESUELTO
2. ✅ **Auth encryption** (packages/auth) - OS keychain + atomic writes - RESUELTO
3. **Web server hardening** (packages/terminal) - Bind 127.0.0.1, auth token, Origin validation - ⚠️ PENDIENTE
4. ✅ **File tool containment** (packages/terminal) - Validar paths dentro de projectRoot - RESUELTO
5. ✅ **Grep shell injection** (packages/terminal) - Usar execFileSync en vez de execSync - RESUELTO

### Dependencias con CVEs

- **ws ^8.16.0** (terminal) - CVE-2024-37890 (DoS) → Actualizar a >=8.17.1

### Estadísticas

- **Archivos auditados**: 20+ archivos de código crítico
- **Severidad RESUELTAS**: 2/2 CRITICAS ✅, 1/5 ALTAS, 5/5 MEDIAS ✅, 5/5 BAJAS ✅
- **Frameworks OWASP**: A01 (Access Control) ✅, A02 (Crypto) ✅, A03 (Injection) ✅, A07 (Auth), A08 (Integrity) ✅
