# Pre-Release Validation Checklist

Complete this checklist before each production release.

## 📋 Testing

- [x] **Unit Tests Pass**: 259/259 tests ✅
- [ ] **Integration Tests Pass**: 16 tests require manual setup (optional)
- [x] **Security Tests Pass**: All security test suites ✅
- [x] **No Flaky Tests**: Tests are deterministic ✅

```bash
# Run all tests
cd packages/terminal && bun test
cd packages/auth && bun test
cd packages/plugins && bun test

# Expected: 288 tests passing (259 terminal + 14 auth + 15 plugins)
```

## 🔨 Build

- [x] **Build Succeeds**: No errors or warnings ✅
- [x] **Build Size**: Terminal < 600KB ✅ (currently 513KB)
- [x] **All Packages Build**: terminal, auth, plugins ✅

```bash
# Build all packages
cd packages/terminal && bun build src/index.ts --outfile dist/index.js --target bun
cd packages/auth && bun build src/index.ts --outfile dist/index.js --target bun
cd packages/plugins && bun build src/index.ts --outfile dist/index.js --target bun
```

## 🔒 Security

- [x] **CRITICAL Vulnerabilities**: 2/2 resolved ✅
- [x] **HIGH Vulnerabilities**: 5/5 resolved ✅
- [x] **MEDIUM Vulnerabilities**: 5/5 resolved ✅
- [x] **LOW Vulnerabilities**: 5/5 resolved ✅
- [ ] **CVE-2024-37890 (ws)**: Update to ws >= 8.17.1 ⚠️ PENDING

```bash
# Check for vulnerabilities
bun audit

# Update ws package
cd packages/terminal
bun update ws@latest
```

## 🐳 Docker

- [ ] **Docker Build**: Image builds successfully
- [ ] **Docker Run**: Container starts and runs
- [ ] **Docker Compose**: Full stack with Ollama works
- [ ] **Health Checks**: All services healthy

```bash
# Test Docker
docker build -t wabisabi-test .
docker run -it --rm wabisabi-test --version

# Test Docker Compose
docker-compose up -d
docker-compose ps
docker-compose down
```

## 🚀 CI/CD

- [x] **CI Workflow**: Created and configured ✅
- [x] **Security Workflow**: Created and configured ✅
- [x] **Release Workflow**: Created and configured ✅
- [ ] **Workflows Pass**: Push to trigger CI (requires GitHub push)

```bash
# Verify workflows exist
ls -la .github/workflows/
# Should show: ci.yml, security.yml, release.yml
```

## 📊 Performance

- [ ] **Benchmarks Run**: Execute performance benchmarks
- [ ] **Cold Start**: < 500ms ⏱️
- [ ] **Tool Overhead**: < 50ms ⏱️
- [ ] **Memory Idle**: < 150MB 💾
- [ ] **Memory Peak**: < 500MB 💾
- [ ] **Test Suite**: < 10s 🧪

```bash
# Run benchmarks
bun run benchmarks/run.ts

# Check report
cat benchmarks/report.json
```

## 📚 Documentation

- [x] **README.md**: Updated and complete ✅
- [x] **SECURITY.md**: Updated with latest audit ✅
- [ ] **DEPLOYMENT.md**: Reviewed (private doc)
- [ ] **DOCKER.md**: Reviewed (private doc)
- [x] **config.production.jsonc**: Template ready ✅
- [ ] **CHANGELOG.md**: Created for this release

## 🔧 Configuration

- [x] **Dependabot**: Configured in .github/dependabot.yml
- [ ] **Branch Protection**: Configure on GitHub
  - Require PR reviews
  - Require status checks
  - No force push to main
- [ ] **Code Owners**: Create CODEOWNERS file (optional)

## 📝 GitHub Repository

- [ ] **Issue Templates**: Create bug/feature templates
- [ ] **PR Template**: Create pull request template
- [ ] **Contributing Guide**: Create CONTRIBUTING.md
- [ ] **Code of Conduct**: Create CODE_OF_CONDUCT.md (optional)
- [ ] **License**: Verify LICENSE file exists

## 🎯 Final Checks

- [ ] **Version Numbers**: Consistent across all packages
- [ ] **Git Tags**: No conflicts with existing tags
- [ ] **Release Notes**: Drafted and reviewed
- [ ] **Migration Guide**: Created if breaking changes
- [ ] **Rollback Plan**: Documented

## 📦 Release Process

1. **Update Version Numbers**
   ```bash
   # Update package.json in each package
   # Follow semver: MAJOR.MINOR.PATCH
   ```

2. **Create Git Tag**
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

3. **Trigger Release Workflow**
   - Push tag triggers .github/workflows/release.yml
   - Automated build, test, and GitHub release creation

4. **Publish to npm** (when ready)
   ```bash
   # Uncomment publish step in release.yml
   # Set NPM_TOKEN secret in GitHub
   ```

5. **Announce Release**
   - Post to GitHub Discussions
   - Update project website (if any)
   - Social media announcement (optional)

---

## ✅ Sign-Off

- [ ] Technical Lead reviewed
- [ ] Security audit completed
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] Ready for production

**Release Manager**: _________________

**Date**: _________________

**Version**: _________________
