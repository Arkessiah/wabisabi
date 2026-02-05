# WabiSabi Plugin System

WabiSabi supports a plugin system compatible with Claude Code and OpenCode plugins.

## Plugin Structure

```typescript
import { Plugin, PluginContext } from "@wabisabi/plugins";

export default {
  name: "my-plugin",
  version: "1.0.0",
  description: "My custom plugin",
  author: "Your Name",

  commands: [
    {
      name: "my-command",
      description: "Does something cool",
      handler: async (args) => {
        console.log("Running my command!");
      },
    },
  ],

  tools: [],

  onLoad: async (ctx: PluginContext) => {
    ctx.logger.info("Plugin loaded!");
  },

  onUnload: async (ctx: PluginContext) => {
    ctx.logger.info("Plugin unloaded!");
  },
} satisfies Plugin;
```

## Loading Plugins

```typescript
import { PluginManager } from "@wabisabi/plugins";

const manager = new PluginManager();
await manager.loadPlugin("./plugins/my-plugin.js");
```

## Compatibility

Plugins are designed to be compatible with:

- Claude Code plugins
- OpenCode plugins

## Example Commands

See `src/examples/` for complete examples.
