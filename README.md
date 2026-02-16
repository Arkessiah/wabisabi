# 🌀 WabiSabi - Terminal IDE with Intelligent Agents

WabiSabi is a terminal-based AI coding assistant that connects to Substratum backend or runs with local Ollama.

## Features

- **🧠 Intelligent Agents**: Build, Plan, and Search agents
- **🔗 Substratum Ready**: Connect to central backend for models
- **🏠 Local Mode**: Run with local Ollama installation
- **📦 Plugins**: Compatible with Claude Code and OpenCode plugins

## Quick Start

```bash
# Clone and setup
git clone https://github.com/ascendwave/wabisabi
cd wabisabi/packages/terminal

# Install dependencies
bun install

# Build
bun build

# Run CLI
./dist/index.js --help
```

## Commands

```bash
wabisabi interactive      # Start interactive mode
wabisabi batch <file>     # Run batch tasks from JSON file
wabisabi stream           # Streaming mode
wabisabi agent build      # Code generation agent
wabisabi agent plan       # Task planning agent
wabisabi agent search     # Research agent
```

## Configuration

Set environment variables or use CLI options:

```bash
# CLI options
./dist/index.js --substratum http://localhost:3001 --model llama3.2

# Environment variables
export WABISABI_SUBSTRATUM=http://localhost:3001
export WABISABI_OLLAMA=http://localhost:11434
export WABISABI_MODEL=llama3.2
```

## Agents

### Build Agent

Generates complete, working code based on your requirements.

### Plan Agent

Creates detailed task plans with steps, dependencies, and risks.

### Search Agent

Researches topics and provides comprehensive information.

## Web Interface

A simple web interface is available in `wabisabi-web-next/`:

```bash
cd wabisabi-web-next
bun install
bun dev
```

## Project Structure

```
wabisabi/
├── packages/terminal/        # CLI Tool
│   ├── src/
│   │   ├── cli/              # Entry point
│   │   ├── modes/            # interactive, batch, streaming
│   │   ├── clients/          # API clients
│   │   ├── agents/           # Build, Plan, Search agents
│   │   └── plugins/          # Plugin system
│   └── dist/                 # Built binary
├── wabisabi-web-next/        # Web interface
├── BASE/                     # Brand assets
└── README.md
```

## License

MIT

---

Built with 🌀 by Arkessiah
