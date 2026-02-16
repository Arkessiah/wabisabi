# Docker Deployment Guide

WabiSabi Terminal can run in Docker containers with Ollama for a complete local AI coding assistant.

## Quick Start

### 1. Using Docker Compose (Recommended)

Start WabiSabi with Ollama in one command:

```bash
docker-compose up -d
```

This will:
- Pull and start Ollama with llama3.2 model
- Build and start WabiSabi Terminal
- Set up persistent volumes for data

### 2. Access the Terminal

**Interactive Mode:**
```bash
docker-compose exec wabisabi bun run packages/terminal/dist/index.js interactive
```

**Web UI Mode:**
```bash
docker-compose up wabisabi-web -d
```
Then open http://localhost:3333 in your browser.

### 3. Pull Ollama Models

```bash
docker-compose exec ollama ollama pull llama3.2
docker-compose exec ollama ollama pull codestral
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# LLM Provider
OLLAMA_URL=http://ollama:11434
MODEL=llama3.2

# Optional: Substratum API
SUBSTRATUM_URL=https://api.substratum.ai
WABISABI_API_KEY=your-api-key-here

# Privacy
PRIVACY_MODE=local
```

### Custom Configuration

Mount a custom config file:

```yaml
# docker-compose.override.yml
services:
  wabisabi:
    volumes:
      - ./config.production.jsonc:/app/.wabisabi/config.jsonc:ro
```

## Standalone Docker

### Build the Image

```bash
docker build -t wabisabi-terminal .
```

### Run Interactive Mode

```bash
docker run -it --rm \
  -v wabisabi_data:/app/.wabisabi \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  wabisabi-terminal
```

### Run Web UI

```bash
docker run -d \
  --name wabisabi-web \
  -p 3333:3333 \
  -v wabisabi_data:/app/.wabisabi \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  wabisabi-terminal \
  bun run packages/terminal/dist/index.js web --port 3333
```

## Production Deployment

### Security Hardening

1. **Use specific image tags** (not `latest`):
```yaml
services:
  ollama:
    image: ollama/ollama:0.1.26  # Pin version
```

2. **Set resource limits**:
```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      cpus: '2'
      memory: 4G
```

3. **Run as non-root** (already configured in Dockerfile)

4. **Use secrets for API keys**:
```bash
echo "your-api-key" | docker secret create wabisabi_api_key -
```

### Health Monitoring

Check container health:
```bash
docker-compose ps
docker-compose logs wabisabi
```

Ollama health check:
```bash
curl http://localhost:11434/api/tags
```

### Backup Data

```bash
# Backup volumes
docker run --rm \
  -v wabisabi_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/wabisabi-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Update Images

```bash
docker-compose pull
docker-compose up -d
```

## Performance Tuning

### Ollama GPU Support

For NVIDIA GPUs:
```yaml
services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Memory Optimization

For low-memory environments, use smaller models:
```bash
docker-compose exec ollama ollama pull phi
```

Then update `MODEL=phi` in environment.

## Troubleshooting

### Ollama Connection Issues

```bash
# Check Ollama is running
docker-compose exec ollama curl http://localhost:11434/api/tags

# Check network connectivity
docker-compose exec wabisabi ping ollama
```

### Permission Issues

```bash
# Fix volume permissions
docker-compose down
docker volume rm wabisabi_data
docker-compose up -d
```

### Build Failures

```bash
# Clean build
docker-compose build --no-cache wabisabi
```

## Development

### Live Code Mounting

```yaml
services:
  wabisabi:
    volumes:
      - ./packages:/app/packages
    command: ["bun", "--watch", "run", "packages/terminal/src/index.ts", "interactive"]
```

### Debug Mode

```bash
docker-compose exec wabisabi sh
cd packages/terminal
bun test
```

## Further Reading

- [WabiSabi Documentation](./README.md)
- [Security Policy](./SECURITY.md)
- [Production Config](./config.production.jsonc)
- [Ollama Documentation](https://ollama.ai/docs)
