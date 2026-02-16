# Security - @wabisabi/plugins

## Resumen

Sistema de plugins que carga y ejecuta codigo de terceros. Riesgo alto por ejecucion de codigo no confiable. Requiere sandboxing y validacion estricta.

## Dependencias

Sin dependencias externas. El riesgo principal es el codigo de los plugins cargados.

## Detecciones del Agente de Seguridad

### Audit inicial - 2026-02-16

**Severidad global: CRITICA** - 1 CRITICA detectada

#### CRITICA-1: Arbitrary Code Execution via plugin loading ✅ FIXED
- **Archivo**: `src/index.ts`, `src/worker.ts`, `src/sandbox.ts`
- **Issue**: `await import(pluginPath)` ejecutaba plugins con privilegios completos sin aislamiento
- **OWASP**: A01:2021 Broken Access Control, A03:2021 Injection, A08:2021 Software and Data Integrity Failures
- **Fix aplicado (2026-02-16 - Fase 2 con Bun Worker Sandboxing)**:

  **Validaciones (Fase 1)**:
  - ✅ Path validation: `validatePluginPath()` rechaza URLs remotas y valida contra allowlist
  - ✅ Allowlist: Solo `~/.wabisabi/plugins/` y `.wabisabi/plugins/` permitidos
  - ✅ Manifest validation: `PluginManifestSchema` (Zod) valida ANTES de import()
  - ✅ Checksum SHA-256: Verificación de integridad con `verifyChecksum()` antes de importar
  - ✅ Name/version matching: Valida que plugin export coincida con manifest

  **Sandboxing (Fase 2 - NEW)**:
  - ✅ **Bun Worker isolation**: Plugins ejecutan en Worker process separado
  - ✅ **Permission enforcement**: network, filesystem, process controls
  - ✅ **Static code analysis**: Detecta eval(), Function(), process manipulation
  - ✅ **Restricted PluginContext**: Sin acceso a global config, logs via postMessage
  - ✅ **Worker timeouts**: 10s load, 5s unload, auto-termination
  - ✅ **No shared state**: Aislamiento completo entre plugins y main process

- **Archivos creados**:
  - `src/schemas.ts`: Zod schemas para manifest y tool inputs
  - `src/security.ts`: Path validation, checksum computation/verification
  - `src/sandbox.ts`: createSandboxContext(), validatePluginCode(), permission enforcement
  - `src/worker.ts`: Worker runtime, message handling, plugin execution
  - `src/__tests__/plugin-security.test.ts`: 7 tests de validations
  - `src/__tests__/sandbox-enforcement.test.ts`: 8 tests de sandboxing (NEW)

- **Tests**: 15 tests (0 failures) - network/filesystem/process blocking, eval detection, worker isolation

- **Estado**: **RESUELTO** - Sistema de plugins con sandboxing completo, listo para producción

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
| 2026-02-16 | Agente | CRITICA-1 Fixed Fase 1 | Validaciones (path, manifest, checksum) |
| 2026-02-16 | Agente | CRITICA-1 Fixed Fase 2 | Bun Worker sandboxing + permission enforcement completo |
