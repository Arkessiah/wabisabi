/**
 * WabiSabi VS Code Extension
 *
 * Entry point: registers commands, views, and providers.
 * Shares core logic with @wabisabi/terminal via @wabisabi/core.
 */

import * as vscode from "vscode";
import { ChatProvider } from "./chat-provider";
import { AgentsProvider } from "./agents-provider";
import { StatusBarManager } from "./status-bar";
import { WabiSabiConfig } from "./config";
import { checkFirstRun } from "./onboarding";

let statusBar: StatusBarManager;

export function activate(context: vscode.ExtensionContext) {
  const config = new WabiSabiConfig();
  statusBar = new StatusBarManager(config);

  // Chat webview
  const chatProvider = new ChatProvider(context.extensionUri, config);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("wabisabi.chat", chatProvider)
  );

  // Agents tree
  const agentsProvider = new AgentsProvider(config);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("wabisabi.agents", agentsProvider)
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("wabisabi.open", () => {
      vscode.commands.executeCommand("wabisabi.chat.focus");
    }),

    vscode.commands.registerCommand("wabisabi.settings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "wabisabi");
    }),

    vscode.commands.registerCommand("wabisabi.switchAgent", async () => {
      const agents = [
        { label: "BUILD", description: "Write & edit code" },
        { label: "PLAN", description: "Architect & plan" },
        { label: "SEARCH", description: "Find & analyze" },
      ];
      const pick = await vscode.window.showQuickPick(agents, {
        placeHolder: "Select agent",
      });
      if (pick) {
        config.setAgent(pick.label.toLowerCase() as any);
        agentsProvider.refresh();
        statusBar.update();
      }
    }),

    vscode.commands.registerCommand("wabisabi.switchModel", async () => {
      const model = await vscode.window.showInputBox({
        prompt: "Enter model name",
        value: config.model,
      });
      if (model) {
        config.setModel(model);
        statusBar.update();
      }
    }),

    vscode.commands.registerCommand("wabisabi.switchStrategy", async () => {
      const strategies = [
        { label: "local", description: "Ollama only" },
        { label: "cluster", description: "Ollama cluster" },
        { label: "cloud", description: "Substratum cloud" },
        { label: "hybrid-local-first", description: "Local + cloud (recommended)" },
        { label: "hybrid-cloud-first", description: "Cloud + local" },
        { label: "hybrid-full", description: "All providers" },
      ];
      const pick = await vscode.window.showQuickPick(strategies, {
        placeHolder: "Select provider strategy",
      });
      if (pick) {
        config.setStrategy(pick.label);
        statusBar.update();
      }
    }),

    vscode.commands.registerCommand("wabisabi.onboarding", async () => {
      const { runOnboardingVSCode } = await import("./onboarding");
      await runOnboardingVSCode(config);
      agentsProvider.refresh();
      statusBar.update();
    }),

    vscode.commands.registerCommand("wabisabi.account", async () => {
      vscode.env.openExternal(vscode.Uri.parse("https://wabisabi.dev/login"));
    }),

    // Context menu commands
    vscode.commands.registerCommand("wabisabi.explain", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      chatProvider.sendMessage(`Explain this code:\n\`\`\`\n${selection}\n\`\`\``);
    }),

    vscode.commands.registerCommand("wabisabi.fix", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      chatProvider.sendMessage(`Fix this code:\n\`\`\`\n${selection}\n\`\`\``);
    }),

    vscode.commands.registerCommand("wabisabi.test", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      chatProvider.sendMessage(`Generate tests for:\n\`\`\`\n${selection}\n\`\`\``);
    }),

    vscode.commands.registerCommand("wabisabi.review", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.document.getText(editor.selection);
      chatProvider.sendMessage(`Review this code:\n\`\`\`\n${selection}\n\`\`\``);
    })
  );

  // Status bar
  context.subscriptions.push(statusBar);

  // First-run check
  checkFirstRun(context, config);
}

export function deactivate() {
  statusBar?.dispose();
}
