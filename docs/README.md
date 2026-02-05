# WabiSabi Documentation

## Installation

```bash
git clone https://github.com/ascendwave/wabisabi
cd wabisabi/packages/terminal
bun install
bun build
```

## Usage

### Interactive Mode

```bash
./dist/index.js interactive
```

### Batch Mode

Create a task file:

```json
{
  "tasks": [
    {
      "name": "Create React Component",
      "prompt": "Generate a React component for user login form"
    },
    {
      "name": "Create API",
      "prompt": "Create a REST API endpoint for user authentication"
    }
  ]
}
```

Run batch:

```bash
./dist/index.js batch tasks.json
```

### Streaming Mode

```bash
./dist/index.js stream
```

### Agents

```bash
# Code generation
./dist/index.js agent build --task "Create a REST API"

# Planning
./dist/index.js agent plan --task "Build a complete web application"

# Research
./dist/index.js agent search --task "Latest AI trends in 2024"
```

## Configuration

### CLI Options

| Option         | Description        | Default                |
| -------------- | ------------------ | ---------------------- |
| `--substratum` | Substratum API URL | http://localhost:3001  |
| `--ollama`     | Ollama local URL   | http://localhost:11434 |
| `--model`      | Model name         | llama3.2               |

### Environment Variables

| Variable              | Description        |
| --------------------- | ------------------ |
| `WABISABI_SUBSTRATUM` | Substratum API URL |
| `WABISABI_OLLAMA`     | Ollama local URL   |
| `WABISABI_MODEL`      | Model name         |

## Architecture

```
┌─────────────────────────────────────────┐
│              WabiSabi CLI                │
├─────────────────────────────────────────┤
│  Modes:                                  │
│  - Interactive (readline)               │
│  - Batch (JSON tasks)                   │
│  - Streaming (WebSocket)                │
├─────────────────────────────────────────┤
│  Agents:                                │
│  - Build Agent (code generation)        │
│  - Plan Agent (task planning)           │
│  - Search Agent (research)             │
├─────────────────────────────────────────┤
│  Clients:                               │
│  - HTTP API Client (Substratum)         │
│  - Ollama Client (local)               │
│  - WebSocket Client (streaming)         │
└─────────────────────────────────────────┘
```

## Dependencies

- **Bun** - Runtime and package manager
- **commander** - CLI argument parsing
- **chalk** - Terminal colors
- **ws** - WebSocket client
- **hono** - Web framework (optional)

## Development

```bash
# Run in watch mode
bun run --watch src/index.ts

# Run tests
bun test

# Build
bun build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
