# Production Roadmap - WabiSabi Terminal IDE

**Estado actual**: Desarrollo completo (P0-P3) | 176 tests ✓ | 501KB build ✓
**Objetivo**: Production-ready release con seguridad hardened

---

## Fase 1: Security Fixes (BLOQUEANTE) - 3-5 días

### 🔴 CRITICO - Acción inmediata (Día 1-2)

#### 1.1 Auth Session Encryption (`packages/auth`)
- **Issue**: `session.json` en plaintext sin permisos
- **Impacto**: Tokens accesibles por cualquier proceso local
- **Fix**:
  ```typescript
  // Implementar cifrado AES-256-GCM como en packages/terminal/src/auth/index.ts
  - Generar key via PBKDF2 (mejorado con OS entropy)
  - Cifrar accessToken + refreshToken antes de write
  - writeFileSync con mode 0o600
  ```
- **Test**: Verificar que session.json es ilegible sin decrypt
- **Estimado**: 4-6 horas

#### 1.2 Plugin Sandboxing (`packages/plugins`)
- **Issue**: `import(pluginPath)` ejecuta código arbitrario
- **Impacto**: RCE completo con privilegios del proceso
- **Fix**:
  ```typescript
  1. Validar pluginPath contra allowlist (~/.wabisabi/plugins/)
  2. Leer manifest.json ANTES de import(), validar con Zod
  3. Verificar checksum SHA-256 del plugin vs manifest
  4. Ejecutar en Bun Worker con permisos limitados:
     - Sin network access (excepto allowlist)
     - Sin filesystem write (excepto temp dir)
     - Sin spawn de procesos
  5. PluginContext: API surface mínima (solo registerTool con schema Zod)
  ```
- **Test**: Plugin malicioso debe ser rechazado en cada capa
- **Estimado**: 1-2 días

### 🟠 ALTA - Antes de release (Día 3-4)

#### 1.3 Web Server Hardening (`packages/terminal/src/modes/web.ts`)
- **Fix**:
  ```typescript
  - hostname: "127.0.0.1" (no 0.0.0.0)
  - Token de sesión random en startup (32 bytes crypto.randomBytes)
  - Validar Origin header en WebSocket upgrade
  - Security headers: X-Frame-Options, CSP, X-Content-Type-Options
  - SRI hashes para xterm.js CDN
  - API key vía env var (no CLI args)
  ```
- **Estimado**: 4-6 horas

#### 1.4 Bash Execution Restrictions (`packages/terminal/src/tools/bash.ts`)
- **Fix**:
  ```typescript
  - Env allowlist: ["PATH", "HOME", "TERM", "LANG", "USER", "SHELL"]
  - Command blocklist regex: /rm\s+-rf\s+\/|mkfs|dd\s+if=|curl.*\|.*sh/
  - Advertencia al usuario si comando es potencialmente destructivo
  ```
- **Estimado**: 3-4 horas

#### 1.5 Encryption Key Derivation (`packages/terminal/src/auth/index.ts`)
- **Fix**:
  ```typescript
  - Intentar OS keychain (keytar o @buttercup/secure-cache)
  - Fallback: Random salt (32 bytes) + PBKDF2 150k iterations
  - Salt stored en auth.json (no hardcoded)
  ```
- **Estimado**: 4-6 horas

### 🟡 MEDIA - Post-release patch (Día 5)

- **CVE ws**: `bun update ws` a >=8.17.1
- **Path traversal**: Validar `resolved.startsWith(projectRoot)`
- **Grep injection**: `execFileSync("rg", args)` en vez de `execSync`
- **ReDoS glob**: Usar `minimatch` library
- **Estimado**: 4-6 horas total

---

## Fase 2: Production Infrastructure - 2-3 días

### 2.1 CI/CD Pipeline (`.github/workflows/`)

**`ci.yml`** - Test & Build en cada push
```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
      - run: bun build src/index.ts --outfile dist/index.js --target bun
```

**`security.yml`** - Audit semanal
```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # Lunes 9 AM
jobs:
  audit:
    - run: bun audit
    - uses: github/codeql-action/init@v3
    - uses: github/codeql-action/analyze@v3
```

**`release.yml`** - Publish a npm/GitHub releases
```yaml
on:
  push:
    tags: ['v*']
jobs:
  release:
    - run: bun build
    - run: bun test
    - uses: actions/create-release@v1
    - run: npm publish (packages/terminal)
```

**Estimado**: 6-8 horas

### 2.2 Docker Configuration

**`Dockerfile`**
```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY packages/terminal/package.json .
RUN bun install --production
COPY packages/terminal/src ./src
RUN bun build src/index.ts --outfile dist/index.js --target bun
USER nobody
CMD ["bun", "dist/index.js", "interactive"]
```

**`docker-compose.yml`** (con Ollama)
```yaml
services:
  wabisabi:
    build: .
    volumes:
      - ~/.wabisabi:/root/.wabisabi
    environment:
      - OLLAMA_URL=http://ollama:11434
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
```

**Estimado**: 4-6 horas

### 2.3 Production Config Template

**`config.production.jsonc`**
```jsonc
{
  "model": "llama3.2",
  "substratum": "${SUBSTRATUM_URL}",  // env var
  "ollama": "http://localhost:11434",
  "privacy": "hybrid",
  "tools": {
    "allowFileRead": true,
    "allowFileWrite": false,  // Requiere confirmación
    "allowBash": false        // Requiere confirmación
  },
  "web": {
    "enabled": false,  // Deshabilitado por defecto
    "hostname": "127.0.0.1",
    "port": 3333
  },
  "plugins": {
    "enabled": false,  // Deshabilitar hasta sandbox completo
    "allowedPlugins": []  // Whitelist
  }
}
```

**Estimado**: 2-3 horas

---

## Fase 3: Documentation & Testing - 2 días

### 3.1 Production Deployment Guide

**`docs/DEPLOYMENT.md`**
- System requirements (Bun 1.0+, Node 18+ fallback)
- Installation (npm, Docker, source)
- Configuration (env vars, config files)
- Security hardening checklist
- Monitoring setup (logs, metrics)
- Troubleshooting common issues

**Estimado**: 4-6 horas

### 3.2 Performance Benchmarking

**Métricas clave**:
- Cold start time: < 500ms
- Tool execution overhead: < 50ms
- Memory footprint: < 150MB idle, < 500MB peak
- Context compaction: < 2s para 50k tokens
- Test suite: < 10s total

**Script**: `benchmarks/run.ts`
```typescript
// Medir cold start, tool calls, memory, compaction speed
// Generar report.json con resultados
```

**Estimado**: 6-8 horas

### 3.3 Integration Tests

**`__tests__/integration/`**
- End-to-end flow: onboarding → interactive → tool use → session save
- Multi-agent workflow completo
- Web UI connection + command execution
- Plugin install + execution (sandboxed)
- Auth flow: login → token refresh → logout

**Estimado**: 8-10 horas

---

## Fase 4: Pre-Release Validation - 1 día

### 4.1 Checklist Final

- [ ] Todos los tests pasan (176+ tests)
- [ ] Build exitoso sin warnings
- [ ] Vulnerabilidades CRITICAS resueltas (0/2)
- [ ] Vulnerabilidades ALTAS resueltas (0/5)
- [ ] CVE ws actualizado
- [ ] Docker image funcional
- [ ] CI/CD pipeline verde
- [ ] Benchmarks dentro de targets
- [ ] Docs completas (README, DEPLOYMENT, SECURITY)
- [ ] Dependabot activo y configurado
- [ ] GitHub repo: Issues templates, PR template, Contributing guide

### 4.2 Release Notes Draft

**v1.0.0 - Production Release**
```markdown
## Features
- Terminal IDE con 3 agentes (Build, Plan, Search)
- 11 tools integrados + plugin system
- Multi-provider (Substratum, Ollama, OpenAI-compatible)
- Web UI (xterm.js)
- Soul & RAM memory systems
- Six Hats thinking profiles

## Security
- AES-256-GCM encrypted credentials
- OAuth device-code flow
- Sandboxed plugin execution
- Dependabot integration
- Weekly security audits

## Performance
- 176 tests, 0 failures
- Cold start < 500ms
- Memory footprint < 150MB idle

## Breaking Changes
- Plugin system requiere manifest con checksum
- Web UI deshabilitado por defecto (security)
```

---

## Timeline Estimado

| Fase | Duración | Dependencias | Bloqueante |
|------|----------|--------------|------------|
| **Fase 1: Security Fixes** | 3-5 días | - | ✅ SÍ |
| **Fase 2: Infrastructure** | 2-3 días | Fase 1 | ⚠️ Parcial |
| **Fase 3: Docs & Testing** | 2 días | Fase 1, 2 | ⚠️ Parcial |
| **Fase 4: Validation** | 1 día | Todas | ✅ SÍ |
| **TOTAL** | **8-11 días** | | |

## Priorización de Trabajo

### Sprint 1 (Días 1-5): **Security Hardening**
1. Auth encryption (CRITICO)
2. Plugin sandboxing (CRITICO)
3. Web server hardening (ALTA)
4. Bash restrictions (ALTA)
5. Key derivation (ALTA)
6. CVE updates + medium fixes

### Sprint 2 (Días 6-8): **Production Ready**
7. CI/CD pipeline
8. Docker setup
9. Production config
10. Deployment docs
11. Performance benchmarks

### Sprint 3 (Días 9-11): **Release Prep**
12. Integration tests
13. Final validation
14. Release notes
15. GitHub repo polish

---

## Post-Release (Roadmap futuro)

Del TODO.md pendiente (no bloqueante):
- Backend Substratum integration (cuando backend esté listo)
- Remote plugin marketplace (registry HTTP)
- Vector similarity search for embeddings
- Cloud sync between devices

---

## Notas

- **Bloqueantes**: Fase 1 es CRITICA, no se puede ir a producción con las 2 vulnerabilidades CRITICAS sin resolver
- **Tests**: Cada fix debe incluir test que verifique la vulnerabilidad está cerrada
- **Docs**: Actualizar SECURITY.md con "Fixed" + fecha en cada issue resuelto
- **Versioning**: Seguir semver (1.0.0 = production-ready)
