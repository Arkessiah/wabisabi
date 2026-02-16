# Contributing to WabiSabi

Thank you for your interest in contributing to WabiSabi! This document provides guidelines for contributing.

## Code of Conduct

Be respectful, inclusive, and professional. We're building a welcoming community.

## Getting Started

### Prerequisites

- **Bun**: 1.0+ (recommended) or Node.js 18+
- **Git**: 2.30+
- **OS**: Linux, macOS, or Windows

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/Arkessiah/wabisabi.git
cd wabisabi

# Install dependencies
bun install

# Build packages
cd packages/terminal && bun build src/index.ts --outfile dist/index.js --target bun
cd ../auth && bun build src/index.ts --outfile dist/index.js --target bun
cd ../plugins && bun build src/index.ts --outfile dist/index.js --target bun

# Run tests
bun test
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Write code following project conventions
- Add/update tests for your changes
- Update documentation as needed
- Keep commits focused and atomic

### 3. Test Your Changes

```bash
# Run all tests
bun test

# Run specific package tests
cd packages/terminal && bun test

# Run security tests
bun test --grep security

# Run benchmarks
bun run benchmarks/run.ts
```

### 4. Commit Your Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat(terminal): add new feature

- Detailed description of change
- Why it was needed
- How it works"
```

**Commit Message Format**:
```
type(scope): subject

body (optional)

footer (optional)
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Build/tooling changes

**Scopes**: `terminal`, `auth`, `plugins`, `admin`, `ci`, `docker`

### 5. Push and Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create PR on GitHub
# Fill out PR template completely
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer interfaces over types
- Use Zod for schema validation

```typescript
// Good
interface Config {
  provider: string;
  model: string;
}

const ConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

// Avoid
type Config = {
  provider: any;
  model: any;
};
```

### Code Style

- Use Prettier for formatting (configured)
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### Error Handling

```typescript
// Good - Specific error messages
throw new Error(`Failed to load plugin: ${pluginName}. Checksum mismatch.`);

// Avoid - Generic errors
throw new Error("Error");
```

### Security

- Never commit secrets or API keys
- Use environment variables for sensitive data
- Validate all user inputs
- Follow OWASP guidelines
- Run security tests before submitting

### Testing

- Write tests for all new features
- Maintain 80%+ code coverage
- Use descriptive test names
- Test edge cases and error conditions

```typescript
// Good test structure
describe("Feature Name", () => {
  test("should handle normal case", () => {
    // Arrange
    const input = "test";
    
    // Act
    const result = processInput(input);
    
    // Assert
    expect(result).toBe("expected");
  });

  test("should handle edge case: empty input", () => {
    expect(() => processInput("")).toThrow();
  });
});
```

## Project Structure

```
wabisabi/
├── packages/
│   ├── terminal/      # Main CLI package
│   ├── auth/          # Authentication
│   ├── plugins/       # Plugin system
│   └── admin/         # Admin tools
├── .github/           # GitHub workflows, templates
├── benchmarks/        # Performance benchmarks
└── docs/              # Documentation (if public)
```

## Security Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead, use GitHub's Private Vulnerability Reporting:
1. Go to Security tab
2. Click "Report a vulnerability"
3. Provide details privately

See [SECURITY.md](../SECURITY.md) for more information.

## Pull Request Review Process

1. **Automated Checks**: CI must pass (tests, build, linting)
2. **Code Review**: At least one maintainer review required
3. **Security Review**: For changes to auth, permissions, or crypto
4. **Documentation**: Must be updated if API changes
5. **Merge**: Squash and merge (keeps history clean)

### Review Checklist

Reviewers will check:
- [ ] Code quality and style
- [ ] Test coverage
- [ ] Security implications
- [ ] Performance impact
- [ ] Documentation accuracy
- [ ] Breaking changes noted

## Release Process

Releases are managed by maintainers:

1. Version bump in package.json
2. Update CHANGELOG.md
3. Create git tag (v1.0.0)
4. GitHub Actions builds and publishes
5. Release notes on GitHub

## Questions?

- **General questions**: Open a Discussion on GitHub
- **Bug reports**: Create an Issue using bug template
- **Feature requests**: Create an Issue using feature template
- **Security**: Use private vulnerability reporting

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in package.json (for significant contributions)

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing to WabiSabi! 🙏
