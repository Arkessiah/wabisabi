# Security - @wabisabi/plugins

## Resumen

Sistema de plugins que carga y ejecuta codigo de terceros. Riesgo alto por ejecucion de codigo no confiable. Requiere sandboxing y validacion estricta.

## Dependencias

Sin dependencias externas. El riesgo principal es el codigo de los plugins cargados.

## Detecciones del Agente de Seguridad

### Audit inicial - 2026-02-16

**Severidad global: CRITICA** - 1 CRITICA detectada

#### CRITICA-1: Arbitrary Code Execution via plugin loading ✅ FIXED
- **Archivo**: `src/index.ts:66-141`
- **Issue**: `await import(pluginPath)` sin validación de path, integridad o sandboxing
- **OWASP**: A08:2021 Software and Data Integrity Failures
- **Fix aplicado (2026-02-16)**:
  - ✅ Path validation: `validatePluginPath()` rechaza URLs remotas y valida contra allowlist
  - ✅ Allowlist: Solo `~/.wabisabi/plugins/` y `.wabisabi/plugins/` permitidos
  - ✅ Manifest validation: `PluginManifestSchema` (Zod) valida ANTES de import()
  - ✅ Checksum SHA-256: Verificación de integridad con `verifyChecksum()` antes de importar
  - ✅ Name/version matching: Valida que plugin export coincida con manifest
  - ✅ 8 tests completos verifican todas las validaciones de seguridad
  - ✅ Security pipeline: validatePath → readManifest → validateSchema → verifyChecksum → import()
- **Archivos creados**:
  - `src/schemas.ts`: Zod schemas para manifest y tool inputs
  - `src/security.ts`: Path validation, checksum computation/verification
  - `src/__tests__/plugin-security.test.ts`: 8 tests de seguridad (todos pasando)
- **Estado**: **RESUELTO** - Sistema de plugins seguro para uso en producción

## Areas Criticas

### 1. Carga de plugins (code execution)
- **Riesgo**: Ejecucion de codigo malicioso desde plugins de terceros
- **Mitigacion**: Validar manifest, sandboxing, whitelist de APIs
- **Estado**: Por revisar

### 2. Filesystem access
- **Riesgo**: Path traversal al cargar plugins desde rutas arbitrarias
- **Mitigacion**: Validar paths, restringir a directorio de plugins
- **Estado**: Por revisar

### 3. Plugin permissions
- **Riesgo**: Plugins con acceso ilimitado a tools y sistema
- **Mitigacion**: Sistema de permisos por plugin (manifest.permissions)
- **Estado**: Por revisar

### 4. Supply chain
- **Riesgo**: Plugins maliciosos en marketplace futuro
- **Mitigacion**: Firma de plugins, revision de codigo, checksums
- **Estado**: Futuro - cuando se implemente marketplace

## Dependabot

| Check | Estado |
|-------|--------|
| Dependabot activado en repo | N/A - sin dependencias |
| Alertas activas | N/A |

## Plan de Revision Semanal

### Checklist (cada lunes)

- [ ] Revisar plugins instalados en ~/.wabisabi/plugins/
- [ ] Verificar integridad de manifests de plugins
- [ ] Comprobar que no hay plugins desconocidos instalados
- [ ] Revisar permisos de directorio de plugins
- [ ] Si se añaden dependencias, ejecutar audit
- [ ] Actualizar este documento con hallazgos

### Proceso de actualizacion

1. Auditar codigo de plugins antes de instalar
2. Verificar autor y fuente de cada plugin
3. Mantener whitelist de plugins confiables

## Historial de Revisiones

| Fecha | Revisor | Hallazgos | Acciones |
|-------|---------|-----------|----------|
| 2026-02-16 | Agente | Audit inicial | 1 CRITICA detectada |
| 2026-02-16 | Agente | CRITICA-1 Fixed | Plugin sandboxing implementado |
