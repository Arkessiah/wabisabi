# Security - @wabisabi/admin

## Resumen

Herramientas de administracion para WabiSabi. Sin dependencias externas actualmente. Bajo riesgo pero debe monitorearse conforme crece.

## Dependencias

Sin dependencias externas. Riesgo minimo por supply chain.

## Detecciones del Agente de Seguridad

### Audit inicial - 2026-02-16

**Severidad global: BAJA** - 1 BAJA, 1 INFO detectadas

#### BAJA-1: Admin operations sin autenticación
- **Archivo**: `src/index.ts` (stubs: users, backup, restore, config)
- **Issue**: Comandos admin planeados sin autenticación/autorización
- **Estado**: Implementar auth cuando se construyan features

#### INFO-1: URLs hardcodeadas sin TLS
- **Archivo**: `src/index.ts:96,102`
- **Issue**: `http://localhost:3001` y `http://localhost:11434` sin config
- **Recomendación**: Aceptar URLs desde env vars o config file
- **Estado**: Baja prioridad (solo localhost)

## Areas Criticas

### 1. Permisos de administracion
- **Riesgo**: Operaciones admin sin autorizacion adecuada
- **Mitigacion**: Validar permisos antes de cada operacion
- **Estado**: Por revisar

### 2. Inputs de usuario
- **Riesgo**: Inyeccion via parametros de admin tools
- **Mitigacion**: Sanitizar todos los inputs
- **Estado**: Por revisar

## Dependabot

| Check | Estado |
|-------|--------|
| Dependabot activado en repo | N/A - sin dependencias |
| Alertas activas | N/A |

## Plan de Revision Semanal

### Checklist (cada lunes)

- [ ] Verificar que no se han añadido dependencias sin audit
- [ ] Revisar cambios en codigo admin por vulnerabilidades
- [ ] Comprobar que permisos de archivos son correctos
- [ ] Actualizar este documento si se añaden dependencias

### Proceso de actualizacion

1. Al añadir dependencias, hacer audit de seguridad previo
2. Preferir paquetes con buen historial de seguridad
3. Documentar justificacion de cada nueva dependencia

## Historial de Revisiones

| Fecha | Revisor | Hallazgos | Acciones |
|-------|---------|-----------|----------|
| 2026-02-16 | Agente | Sin dependencias, riesgo bajo | Monitorear |
