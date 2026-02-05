# WabiSabi Admin Tools

Admin commands for WabiSabi system management.

## Usage

```bash
cd wabisabi/packages/admin
bun build
./dist/index.js help
```

## Commands

| Command   | Description           |
| --------- | --------------------- |
| `status`  | Show system status    |
| `config`  | Edit configuration    |
| `users`   | Manage users          |
| `models`  | List available models |
| `logs`    | View system logs      |
| `backup`  | Create backup         |
| `restore` | Restore from backup   |

## Examples

```bash
# Show status
./dist/index.js status

# List models
./dist/index.js models

# JSON output
./dist/index.js status --json
```
