# Security - @wabisabi/plugins

## Resumen

Sistema de plugins que carga y ejecuta codigo de terceros. Riesgo alto por ejecucion de codigo no confiable. Requiere sandboxing y validacion estricta.

## Dependencias

Sin dependencias externas. El riesgo principal es el codigo de los plugins cargados.

## Detecciones del Agente de Seguridad

### Audit inicial - 2026-02-16

**Severidad global: CRITICA** - 1 CRITICA detectada

#### CRITICA-1: Arbitrary Code Execution via plugin loading
- **Archivo**: `src/index.ts:61-79`
- **Issue**: `await import(pluginPath)` sin validación de path, integridad o sandboxing
- **OWASP**: A08:2021 Software and Data Integrity Failures
- **Vectores de ataque**:
  - Path puede ser URL remota (Bun soporta `https://` en import)
  - Sin verificación de firma/checksum
  - Sin validación de manifest antes de import()
  - Plugin ejecuta con full privileges (filesystem, network, spawn)
  - PluginContext permite registro arbitrario de tools (handler: any)
- **Recomendación URGENTE**:
  1. Validar paths contra allowlist de directorios confiables (~/.wabisabi/plugins/)
  2. Implementar validación de manifest con Zod ANTES de import()
  3. Añadir verificación de firma o checksum de plugins
  4. Ejecutar plugins en Bun Workers con permisos limitados
  5. Limitar API surface de PluginContext
  6. Validar inputs de plugin tools con Zod antes de pasar a handlers
- **Estado**: **CRITICO - No usar sistema de plugins hasta fix**

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
| 2026-02-16 | Agente | Sin deps, riesgo en carga de plugins | Monitorear |
