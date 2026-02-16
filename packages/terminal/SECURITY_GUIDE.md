# Guía de Mantenimiento de Seguridad

## Estado Actual ✅

**Audit de Seguridad Completado: 13/13 vulnerabilidades resueltas**

- ✅ 2 CRÍTICO resueltos
- ✅ 3 ALTA resueltos
- ✅ 4 MEDIA resueltos
- ✅ 5 BAJA resueltos
- ✅ 259 tests pasando (73 tests de seguridad)
- ✅ Commits pusheados a main

## Próximos Pasos Recomendados

### 1. Configurar Dependabot (GitHub)

Dependabot detecta automáticamente vulnerabilidades en dependencias.

**Pasos**:
1. Ir a: `https://github.com/Arkessiah/wabisabi/settings/security_analysis`
2. Activar:
   - ✅ **Dependency graph**
   - ✅ **Dependabot alerts**
   - ✅ **Dependabot security updates**
3. Configurar archivo `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/packages/terminal"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    reviewers:
      - "Arkessiah"
    labels:
      - "dependencies"
      - "security"
```

### 2. CI/CD Pipeline (GitHub Actions)

Automatizar tests y security checks en cada PR.

**Crear**: `.github/workflows/security.yml`

```yaml
name: Security Checks

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.2.2

      - name: Install dependencies
        run: cd packages/terminal && bun install

      - name: Run tests
        run: cd packages/terminal && bun test

      - name: Security audit
        run: cd packages/terminal && bun audit

      - name: Check for secrets
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: cd packages/terminal && bun install
      - run: cd packages/terminal && bun build src/index.ts --outfile dist/index.js --target bun
```

### 3. Pre-commit Hooks

Prevenir commits con problemas de seguridad.

**Instalar husky**:
```bash
cd packages/terminal
bun add -D husky
bunx husky init
```

**Crear**: `.husky/pre-commit`
```bash
#!/usr/bin/env sh
cd packages/terminal

# Run security tests
bun test src/tools/__tests__/bash-security.test.ts
bun test src/tools/__tests__/path-traversal.test.ts
bun test src/tools/__tests__/grep-security.test.ts
bun test src/db/__tests__/collection-security.test.ts

# Check for secrets
grep -r "WABISABI_API_KEY\s*=\s*['\"]" . && echo "❌ API key detected!" && exit 1
grep -r "password\s*=\s*['\"]" . && echo "❌ Password detected!" && exit 1

echo "✅ Security checks passed"
```

### 4. Monitoreo de Seguridad

**Snyk** (alternativa a Dependabot):
```bash
npm install -g snyk
snyk auth
snyk test packages/terminal
snyk monitor packages/terminal
```

**OWASP Dependency Check**:
```bash
# Una vez al mes
docker run --rm -v $(pwd):/src owasp/dependency-check \
  --scan /src/packages/terminal \
  --format HTML \
  --out /src/dependency-check-report
```

### 5. Ciclo de Revisión Semanal

**Cada lunes** (automatizable con GitHub Actions):

```bash
#!/bin/bash
# weekly-security-check.sh

cd packages/terminal

echo "🔍 Security Weekly Review - $(date)"

# 1. Check for dependency updates
echo "\n📦 Checking dependencies..."
bun outdated

# 2. Run security audit
echo "\n🔐 Running security audit..."
bun audit

# 3. Run all security tests
echo "\n🧪 Running security tests..."
bun test --grep "Security|ALTA|MEDIA|BAJA"

# 4. Check for exposed secrets
echo "\n🔑 Checking for secrets..."
grep -r "api[_-]?key.*=" src/ && echo "⚠️ Potential API key found!"

# 5. Review SECURITY.md
echo "\n📄 Review SECURITY.md for pending issues"
cat SECURITY.md | grep "Pendiente\|TODO\|FIXME"

echo "\n✅ Weekly review complete"
```

**Crontab** (ejecutar automáticamente):
```bash
0 9 * * 1 cd /path/to/wabisabi && ./weekly-security-check.sh | mail -s "WabiSabi Security Report" dev@example.com
```

### 6. Configuración de Seguridad en package.json

Añadir scripts de seguridad:

```json
{
  "scripts": {
    "test": "bun test",
    "test:security": "bun test --grep 'Security|ALTA|MEDIA|BAJA'",
    "audit": "bun audit",
    "audit:fix": "bun audit --fix",
    "security:check": "bun test:security && bun audit",
    "security:weekly": "./scripts/weekly-security-check.sh"
  }
}
```

### 7. Production Deployment Checklist

Antes de deploy a producción:

- [ ] Todos los tests pasan (259/259)
- [ ] `bun audit` sin vulnerabilidades HIGH/CRITICAL
- [ ] Variables de entorno configuradas (NO usar --api-key)
- [ ] OS keychain disponible en servidor (macOS: security, Linux: secret-tool)
- [ ] Permisos de archivos correctos (config: 0o600)
- [ ] Servidor web bind solo a localhost (no 0.0.0.0)
- [ ] Logs no contienen secretos
- [ ] Rate limiting configurado si público
- [ ] HTTPS habilitado si acceso remoto
- [ ] Backups configurados

### 8. Incidentes de Seguridad

**Si se detecta una vulnerabilidad**:

1. **Evaluar severidad** (CRÍTICO/ALTA/MEDIA/BAJA)
2. **Documentar** en `SECURITY.md`
3. **Crear issue** privado en GitHub
4. **Fix inmediato** si CRÍTICO
5. **Tests** que reproduzcan el issue
6. **Commit** con formato: `fix(security): descripción (SEVERIDAD-N)`
7. **Deploy** prioritario
8. **Notificar** usuarios si fue explotado

**Contacto de seguridad**:
```
security@wabisabi.dev (o email del equipo)
```

### 9. Métricas de Seguridad

Track estas métricas mensualmente:

- Tiempo medio de resolución de vulnerabilidades
- Número de vulnerabilidades detectadas vs resueltas
- Cobertura de tests de seguridad (actualmente 73 tests)
- Dependencias desactualizadas
- Falsos positivos en scanners

### 10. Recursos y Documentación

**OWASP Resources**:
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Cheat Sheets](https://cheatsheetseries.owasp.org/)
- [Node.js Security Best Practices](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)

**Bun Security**:
- [Bun Security Policy](https://bun.sh/docs/project/security)
- [Bun.Glob documentation](https://bun.sh/docs/api/glob)

**Internal Docs**:
- `SECURITY.md` - Estado actual de seguridad
- `SECURITY_GUIDE.md` - Esta guía
- Test suites en `src/**/__tests__/*-security.test.ts`

## Contacto

Para reportar vulnerabilidades de seguridad:
- **Email**: security@wabisabi.dev
- **GitHub**: Issues privados
- **Respuesta**: < 48 horas para CRÍTICO, < 7 días para otros

---

**Última revisión**: 2026-02-16
**Próxima revisión**: 2026-02-23 (semanal)
