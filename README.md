# 🌀 WabiSabi — Terminal IDE + VS Code extension for your AI cluster

WabiSabi is a Claude-Code-style coding assistant that runs **against your own
[Substratum](https://github.com/Arkessiah/substratum) backend** (or any
OpenAI-compatible endpoint). Same session in the terminal CLI and in the VS
Code extension — sign in once, work in either surface.

- **Local-first agents** (BUILD / PLAN / SEARCH) execute on your machine with
  your tools — file edits, bash, grep, web search.
- **Substratum bridge** authenticates against your gateway via JWT, refreshes
  silently, and routes model calls through your cluster.
- **Ollama / cluster fallback** when the cloud is offline.
- **Shared session** between the CLI and the VS Code extension — both read
  the same `~/.wabisabi/auth.json` (encrypted with the OS Keychain when
  available).

## Install — terminal CLI

```bash
# Clone the repo
git clone https://github.com/Arkessiah/wabisabi.git
cd wabisabi

# Install + build
bun install
cd packages/terminal && bun run build

# Make the binary available globally
ln -s "$PWD/dist/index.js" /usr/local/bin/wabisabi

# First run — opens the onboarding wizard
wabisabi interactive
```

Pick **"Sign in with email + password"** in the wizard, point it at your
Substratum (defaults to `https://api.substratum.dev`; override with
`SUBSTRATUM_URL=http://localhost:8080`), and you're in.

## Install — VS Code extension

### From the marketplace

```bash
code --install-extension wabisabi.wabisabi-ai
```

### From a release (.vsix sideload)

1. Grab `wabisabi-ai.vsix` from the latest
   [release](https://github.com/Arkessiah/wabisabi/releases).
2. In VS Code: Extensions panel → `...` menu → **Install from VSIX…**
3. Pick the downloaded file.

### Build locally from source

```bash
cd packages/vscode
bun install
bun run package        # produces wabisabi-ai.vsix
code --install-extension wabisabi-ai.vsix
```

Open VS Code, the extension prompts you to run the onboarding the first
time. Pick **"Sign in with email + password"** to share the CLI session.

## Commands (terminal)

```bash
wabisabi interactive             # Start interactive mode (default agent)
wabisabi agent build             # Code-generation agent
wabisabi agent plan              # Task-planning agent
wabisabi agent search            # Research agent
wabisabi login                   # Re-authenticate (email/password or --device)
wabisabi config --wizard         # Re-run the onboarding wizard
wabisabi menu                    # Ctrl+P-style configuration menu
wabisabi privacy                 # Manage privacy levels
wabisabi --help                  # Full command list
```

## Commands (VS Code)

| Command | Action |
|---|---|
| `WabiSabi: Open Chat` | Focus the chat webview. |
| `WabiSabi: Switch Agent` | BUILD / PLAN / SEARCH. |
| `WabiSabi: Switch Model` | Pick the default model. |
| `WabiSabi: Switch Strategy` | local / cluster / cloud / hybrid-*. |
| `WabiSabi: Run Onboarding` | Re-run the setup wizard. |
| `WabiSabi: Explain Selection` | Send the highlighted code to chat with an explain prompt. |
| `WabiSabi: Fix Selection` | Same but with a fix prompt. |
| `WabiSabi: Generate Test` | Same but generating tests. |

## Configure providers

`~/.wabisabi/config.jsonc` (created by the wizard, JSONC so you can comment
your hosts):

```jsonc
{
  "providerStrategy": "hybrid-local-first",
  "model": "llama3.2",
  "providers": {
    "ollama": {
      "enabled": true,
      "url": "http://localhost:11434",
      "nodes": []   // optional cluster of Ollama nodes
    },
    "substratum": {
      "enabled": true,
      "url": "http://localhost:8080",  // or your prod gateway
      "apiKey": ""                     // empty when using JWT login
    }
  }
}
```

VS Code reads from the same file and overrides via the settings
(`wabisabi.substratumUrl`, `wabisabi.ollamaUrl`, etc.).

## Architecture

```
wabisabi/
├── packages/
│   ├── core/          shared types, constants, strategies (consumed by terminal + vscode)
│   ├── terminal/      the CLI — ~/.wabisabi/auth.json owner, modes, agents, tools
│   ├── vscode/        VS Code extension — chat webview, inline completion, tools
│   ├── auth/          shared auth schemas
│   ├── admin/         admin surfaces
│   └── plugins/       plugin system (Claude Code / OpenCode compatible)
├── wabisabi-web-next/  Next.js companion (optional)
└── BASE/               brand assets
```

The terminal CLI and the VS Code extension share authentication via the
encrypted file the CLI writes — sign in once and both surfaces pick it up.
The extension mirrors the CLI's OS Keychain → machine-derived fallback
order so the file is decryptable from both.

## License

MIT
