# Security Weekly Review - Instrucciones para el Agente

Este documento guía al agente de seguridad de WabiSabi en la revisión semanal automatizada.

## Trigger: Cada lunes a las 9:00 AM

## Checklist de Ejecución

### 1. Verificación de Dependabot (GitHub API)

```bash
# Check Dependabot alerts
gh api repos/Arkessiah/wabisabi/dependabot/alerts

# Check open Dependabot PRs
gh pr list --label dependencies --state open
```

**Acciones**:
- Listar alertas activas por severidad
- Verificar PRs pendientes de merge
- Identificar CVEs críticos que requieren acción inmediata

### 2. Audit de Dependencias (por paquete)

```bash
cd packages/terminal && bun audit
cd packages/auth && bun audit
cd packages/admin && bun audit
cd packages/plugins && bun audit
```

**Acciones**:
- Ejecutar audit en cada paquete
- Comparar versiones actuales vs últimas estables
- Documentar dependencias desactualizadas

### 3. Scan de Código

**Archivos críticos a revisar**:
- `packages/terminal/src/auth/index.ts` - Encryption, key derivation
- `packages/terminal/src/tools/bash.ts` - Command execution
- `packages/terminal/src/modes/web.ts` - Web server, WebSocket
- `packages/auth/src/index.ts` - Session storage
- `packages/plugins/src/index.ts` - Plugin loading

**Buscar**:
- Secretos expuestos: API keys, tokens, passwords hardcodeados
- Nuevas vulnerabilidades en código modificado (git diff desde última semana)
- Permisos de archivos sensibles (auth.json, config.jsonc, session.json)

### 4. Verificaciones de Infraestructura

```bash
# Check file permissions
ls -la ~/.wabisabi/auth.json 2>/dev/null || echo "Not exists"
ls -la ~/.wabisabi/config.jsonc 2>/dev/null || echo "Not exists"

# Check for exposed secrets in git
git log --all --full-history --source -- '*password*' '*secret*' '*key*' '*.env'
```

### 5. Actualización de SECURITY.md

Para cada paquete con hallazgos:
1. Añadir nueva entrada en sección "Detecciones del Agente de Seguridad"
2. Actualizar "Historial de Revisiones" con fecha, hallazgos y acciones
3. Marcar issues resueltos como "Fixed" con fecha

### 6. Generación de Reporte

Crear mensaje para el usuario con formato:

```markdown
## 🔒 Security Review - [FECHA]

### ⚠️ Alertas Críticas (acción inmediata)
- [Lista de CVEs críticos]
- [Vulnerabilidades de código críticas]

### 📦 Dependabot
- **Alertas activas**: X (Y críticas, Z altas)
- **PRs pendientes**: X
- **Recomendación**: [Merge PR #123 (patch ws), Revisar PR #456 (major openid-client)]

### 🔍 Dependencias Desactualizadas
| Paquete | Actual | Latest | Tipo | Acción |
|---------|--------|--------|------|--------|
| ws | 8.16.0 | 8.18.0 | patch | Update inmediato |
| ... | ... | ... | ... | ... |

### 🐛 Vulnerabilidades de Código
- [Lista de issues detectados en scan]

### ✅ Acciones Completadas
- [Issues resueltos desde última revisión]

### 📋 Próximos Pasos
1. [Prioridad 1]
2. [Prioridad 2]
...

---
Próxima revisión: [FECHA + 7 días]
```

## Priorización de Issues

1. **CRITICO** - Fix inmediato (misma semana)
2. **ALTO** - Fix dentro de 2 semanas
3. **MEDIO** - Fix dentro de 1 mes
4. **BAJO** - Backlog, revisión en próximo sprint

## Automatización Futura

Cuando se implemente la automatización completa:

1. GitHub Action que ejecuta este script cada lunes
2. Notificación automática vía GitHub Issue o comentario
3. Auto-merge de PRs de Dependabot que pasen tests (solo patch/minor)
4. Dashboard de métricas de seguridad

## Notas

- Este proceso debe tomar ~15-30 minutos manual
- Automatizado: ~5 minutos de ejecución + revisión humana
- Los hallazgos se documentan en SECURITY.md de cada paquete
- El usuario recibe notificación consolidada, no individual por issue
