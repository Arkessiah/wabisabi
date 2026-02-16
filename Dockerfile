# WabiSabi Terminal - Production Docker Image
# Multi-stage build for minimal image size

# ── Build Stage ──────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /build

# Copy package files
COPY package.json bun.lockb ./
COPY packages/terminal/package.json packages/terminal/
COPY packages/auth/package.json packages/auth/
COPY packages/plugins/package.json packages/plugins/

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production

# Copy source code
COPY packages/terminal/src packages/terminal/src
COPY packages/auth/src packages/auth/src
COPY packages/plugins/src packages/plugins/src

# Build all packages
RUN cd packages/terminal && bun build src/index.ts --outfile dist/index.js --target bun && \
    cd ../auth && bun build src/index.ts --outfile dist/index.js --target bun && \
    cd ../plugins && bun build src/index.ts --outfile dist/index.js --target bun

# ── Runtime Stage ────────────────────────────────────────────────
FROM oven/bun:1-alpine

# Security: Run as non-root user
RUN addgroup -g 1000 wabisabi && \
    adduser -D -u 1000 -G wabisabi wabisabi

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder --chown=wabisabi:wabisabi /build/node_modules ./node_modules
COPY --from=builder --chown=wabisabi:wabisabi /build/packages/terminal/dist ./packages/terminal/dist
COPY --from=builder --chown=wabisabi:wabisabi /build/packages/auth/dist ./packages/auth/dist
COPY --from=builder --chown=wabisabi:wabisabi /build/packages/plugins/dist ./packages/plugins/dist

# Create data directories
RUN mkdir -p /app/.wabisabi/sessions /app/.wabisabi/plugins /app/.wabisabi/db && \
    chown -R wabisabi:wabisabi /app/.wabisabi

# Switch to non-root user
USER wabisabi

# Environment variables
ENV NODE_ENV=production \
    HOME=/app \
    PATH="/app/node_modules/.bin:$PATH"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun run packages/terminal/dist/index.js --version || exit 1

# Default command: interactive mode
CMD ["bun", "run", "packages/terminal/dist/index.js", "interactive"]

# Metadata
LABEL org.opencontainers.image.title="WabiSabi Terminal IDE" \
      org.opencontainers.image.description="AI-powered terminal IDE with multi-provider LLM support" \
      org.opencontainers.image.vendor="Arkessiah" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/Arkessiah/wabisabi"
