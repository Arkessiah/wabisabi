/**
 * VS Code Onboarding
 *
 * Mirrors the CLI onboarding flow using VS Code native UI.
 * Account registration is mandatory.
 */

import * as vscode from "vscode";
import { existsSync } from "fs";
import { ONBOARDING_MARKER, PROVIDER_STRATEGIES, type ProviderStrategy } from "@wabisabi/core";
import type { WabiSabiConfig } from "./config";

export function checkFirstRun(context: vscode.ExtensionContext, config: WabiSabiConfig) {
  if (!existsSync(ONBOARDING_MARKER)) {
    vscode.window
      .showInformationMessage(
        "Welcome to WabiSabi! Set up your account and providers to get started.",
        "Run Setup",
        "Later"
      )
      .then((choice) => {
        if (choice === "Run Setup") {
          vscode.commands.executeCommand("wabisabi.onboarding");
        }
      });
  }
}

export async function runOnboardingVSCode(config: WabiSabiConfig): Promise<void> {
  // Step 1: Account
  const accountChoice = await vscode.window.showQuickPick(
    [
      { label: "Register in browser", description: "Open wabisabi.dev/register" },
      { label: "I already have an account", description: "Continue to login" },
    ],
    { placeHolder: "WabiSabi Account (required)" }
  );

  if (accountChoice?.label === "Register in browser") {
    vscode.env.openExternal(vscode.Uri.parse("https://wabisabi.dev/register"));
    vscode.window.showInformationMessage("After registering, run this setup again.");
    return;
  }

  // Step 2: Provider strategy
  const strategyItems = PROVIDER_STRATEGIES.map((s: ProviderStrategy) => ({
    label: s.label,
    description: s.desc,
    id: s.id,
  }));

  const strategy = await vscode.window.showQuickPick(strategyItems, {
    placeHolder: "Select provider strategy",
  });

  if (strategy) {
    config.setStrategy((strategy as any).id);
  }

  // Step 3: Model
  const model = await vscode.window.showInputBox({
    prompt: "Default AI model",
    value: config.model,
    placeHolder: "llama3.2",
  });

  if (model) {
    config.setModel(model);
  }

  vscode.window.showInformationMessage("WabiSabi setup complete!");
}
