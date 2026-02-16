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

If you discover a security vulnerability, please report it privately using GitHub's **Private Vulnerability Reporting** feature:

1. Go to the repository.
2. Click on the **Security** tab.
3. Select **Advisories**.
4. Click **Report a vulnerability**.

Please do not open a public issue for security vulnerabilities.

### What to include in your report

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)
- Your contact information

### What to expect

- **Initial Response**: Within 48 hours
- **Status Updates**: Every 72 hours
- **Fix Timeline**: Critical issues within 7 days, high priority within 14 days
- **Public Disclosure**: After fix is deployed (coordinated disclosure)

---

## Package-Specific Security

Each package maintains its own SECURITY.md with specific detections:

| Package | Risk | Dependencies | SECURITY.md |
|---------|------|-------------|-------------|
| @wabisabi/terminal | High | ws, zod, chalk, commander | [packages/terminal/SECURITY.md](packages/terminal/SECURITY.md) |
| @wabisabi/auth | High | openid-client, jsonwebtoken, bcryptjs | [packages/auth/SECURITY.md](packages/auth/SECURITY.md) |
| @wabisabi/plugins | Medium | None (risk in third-party plugins) | [packages/plugins/SECURITY.md](packages/plugins/SECURITY.md) |
| @wabisabi/admin | Low | None | [packages/admin/SECURITY.md](packages/admin/SECURITY.md) |

---

## Dependabot

GitHub Dependabot must be enabled for this repository:

1. **Settings > Code security and analysis > Dependabot alerts**: Enable
2. **Dependabot security updates**: Enable
3. **Dependabot version updates**: Configure in `.github/dependabot.yml`

Dependabot alerts are documented in each affected package's SECURITY.md.

---

## Weekly Security Review Plan

### Frequency: Every Monday

The WabiSabi security agent will automatically run a weekly review that includes:

### 1. Dependencies and CVEs
- Review Dependabot alerts in GitHub Security tab
- Run `bun audit` / `npm audit` on each package
- Check current versions vs latest stable
- Merge Dependabot PRs that pass tests (patch/minor)
- Evaluate major updates with breaking changes

### 2. Code
- Scan for exposed secrets (API keys, tokens, passwords)
- Review new files for common vulnerabilities
- Check permissions on sensitive files (auth, config)
- Verify input sanitization in tools and endpoints

### 3. Infrastructure
- Verify web server only listens on localhost
- Check credential encryption at rest
- Review access logs if available
- Verify integrity of installed plugins

### 4. Documentation
- Update each package's SECURITY.md with findings
- Record actions taken in review history
- Notify user of pending issues

### Notifications

The agent will notify the user every Monday with:
- Summary of active Dependabot alerts
- Outdated dependencies
- Vulnerabilities detected in code
- Recommended actions prioritized by severity

---

## Global Review History

| Date | Packages Reviewed | Findings | Actions |
|------|-------------------|----------|---------|
| 2026-02-16 | All (terminal, auth, plugins, admin) | **2 CRITICAL**, 5 HIGH, 5 MEDIUM, 7 LOW | See each package's SECURITY.md for details |

---

## Initial Audit Executive Summary (2026-02-16)

### Critical Findings (Immediate Action Required)

1. ✅ **@wabisabi/plugins** - Arbitrary code execution via `import(pluginPath)` without sandboxing
   - **Risk**: Malicious code executed with full privileges
   - **Action**: Bun Worker sandboxing + permission enforcement
   - **Status**: ✅ RESOLVED (2026-02-16)

2. ✅ **@wabisabi/auth** - Session tokens with weak encryption key derivation
   - **Risk**: Predictable encryption keys via machine-id, missing atomic writes
   - **Action**: OS keychain integration + atomic writes
   - **Status**: ✅ RESOLVED (2026-02-16)

### Top 7 Fix Priorities (CRITICAL + HIGH)

1. ✅ **Plugin sandboxing** (packages/plugins) - Bun Workers + permission enforcement - RESOLVED (CRITICAL-2)
2. ✅ **Auth encryption** (packages/auth + terminal) - OS keychain + atomic writes - RESOLVED (CRITICAL-1)
3. ✅ **Web server hardening** (packages/terminal) - Localhost binding, token auth, Origin validation, API key via env - RESOLVED (HIGH-3, 2026-02-16)
4. ✅ **Bash execution restrictions** (packages/terminal) - Env allowlist, command blocklist, destructive operation blocking - RESOLVED (HIGH-4)
5. ✅ **Encryption key derivation** (packages/terminal/auth) - OS keychain with PBKDF2 fallback - RESOLVED (HIGH-5)
6. ✅ **File tool containment** (packages/terminal) - Path validation within projectRoot - RESOLVED (MEDIUM)
7. ✅ **Grep shell injection** (packages/terminal) - execFileSync instead of execSync - RESOLVED (MEDIUM)

### Dependencies with CVEs

- **ws ^8.16.0** (terminal) - CVE-2024-37890 (DoS) → Update to >=8.17.1

### Statistics

- **Files audited**: 20+ critical code files
- **Severity RESOLVED**: 2/2 CRITICAL ✅, 5/5 HIGH ✅, 5/5 MEDIUM ✅, 5/5 LOW ✅
- **OWASP Frameworks**: A01 (Access Control) ✅, A02 (Crypto) ✅, A03 (Injection) ✅, A07 (Auth), A08 (Integrity) ✅
