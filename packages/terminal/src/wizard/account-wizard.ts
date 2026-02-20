/**
 * Account Management Wizard
 *
 * Register, profile, billing, subscriptions, and payment methods.
 * Integrates with Substratum web platform.
 */

import chalk from "chalk";
import { askChoice, askInput, askConfirm } from "./prompts.js";

const WEB_BASE = "https://wabisabi.dev";

// ── Browser Helper ──────────────────────────────────────────

async function openBrowser(url: string): Promise<boolean> {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : null;

  if (!cmd) {
    console.log(chalk.yellow(`  Cannot open browser. Visit manually:`));
    console.log(chalk.cyan(`  ${url}\n`));
    return false;
  }

  try {
    const proc = Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
    proc.unref();
    console.log(chalk.green(`  ✓ Opening ${url}`));
    return true;
  } catch {
    console.log(chalk.yellow(`  Cannot open browser. Visit manually:`));
    console.log(chalk.cyan(`  ${url}\n`));
    return false;
  }
}

// ── Register ────────────────────────────────────────────────

export async function accountRegister(): Promise<void> {
  console.log(chalk.bold("\n  Create WabiSabi Account\n"));

  const method = await askChoice("How would you like to register?", [
    { value: "browser", label: "Open registration page in browser (recommended)" },
    { value: "terminal", label: "Register from terminal (email + password)" },
  ]);

  if (method === "browser") {
    await openBrowser(`${WEB_BASE}/register`);
    console.log(chalk.dim("\n  After registering, run: ") + chalk.bold("wabi login\n"));
    return;
  }

  // Terminal registration
  const email = await askInput("Email");
  if (!email || !email.includes("@")) {
    console.log(chalk.red("  Invalid email."));
    return;
  }

  // Note: Password input should be hidden in production
  const password = await askInput("Password (min 8 chars)");
  if (!password || password.length < 8) {
    console.log(chalk.red("  Password must be at least 8 characters."));
    return;
  }

  const confirmPw = await askInput("Confirm password");
  if (password !== confirmPw) {
    console.log(chalk.red("  Passwords don't match."));
    return;
  }

  console.log(chalk.cyan("\n  Creating account..."));

  try {
    const res = await fetch(`${WEB_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      console.log(chalk.green("  ✓ Account created!"));
      console.log(chalk.dim("  Run: ") + chalk.bold("wabi login") + chalk.dim(" to authenticate.\n"));
    } else {
      const data = await res.json().catch(() => ({})) as Record<string, string>;
      console.log(chalk.red(`  ✗ Registration failed: ${data.message || res.statusText}`));
    }
  } catch {
    console.log(chalk.red("  ✗ Could not connect to server."));
    console.log(chalk.dim("  Try registering in browser: ") + chalk.cyan(`${WEB_BASE}/register\n`));
  }
}

// ── Profile ─────────────────────────────────────────────────

export async function accountProfile(): Promise<void> {
  console.log(chalk.bold("\n  Account Profile\n"));

  try {
    const { authManager } = await import("../auth/index.js");
    const headers = authManager.getAuthHeaders();

    if (!headers.Authorization && !headers["X-API-Key"]) {
      console.log(chalk.yellow("  Not logged in. Run: wabi login"));
      return;
    }

    const res = await fetch(`${WEB_BASE}/api/v1/profile`, {
      headers: headers as Record<string, string>,
    });

    if (res.ok) {
      const profile = await res.json() as Record<string, any>;
      console.log(`  ${chalk.bold("Email:")}    ${profile.email || "---"}`);
      console.log(`  ${chalk.bold("Name:")}     ${profile.name || "---"}`);
      console.log(`  ${chalk.bold("Plan:")}     ${profile.plan || "free"}`);
      console.log(`  ${chalk.bold("Avatar:")}   ${profile.avatar || "default"}`);
      console.log(`  ${chalk.bold("Joined:")}   ${profile.createdAt || "---"}`);
    } else {
      console.log(chalk.yellow("  Could not fetch profile. Are you logged in?"));
    }
  } catch {
    console.log(chalk.red("  Connection error."));
  }

  console.log();
}

// ── Billing ─────────────────────────────────────────────────

export async function accountBilling(): Promise<void> {
  console.log(chalk.bold("\n  Billing & Tokens\n"));

  try {
    const { authManager } = await import("../auth/index.js");
    const headers = authManager.getAuthHeaders();

    if (!headers.Authorization && !headers["X-API-Key"]) {
      console.log(chalk.yellow("  Not logged in. Run: wabi login"));
      return;
    }

    const res = await fetch(`${WEB_BASE}/api/v1/billing`, {
      headers: headers as Record<string, string>,
    });

    if (res.ok) {
      const billing = await res.json() as Record<string, any>;
      const pct = billing.dailyLimit > 0
        ? ((billing.tokensUsed / billing.dailyLimit) * 100).toFixed(1)
        : "0";

      console.log(chalk.dim("  " + "─".repeat(40)));
      console.log(`  ${chalk.bold("Tokens used:")}      ${chalk.yellow(String(billing.tokensUsed || 0))}`);
      console.log(`  ${chalk.bold("Tokens remaining:")} ${chalk.green(String(billing.tokensRemaining || 0))}`);
      console.log(`  ${chalk.bold("Daily limit:")}      ${billing.dailyLimit || "unlimited"}`);
      console.log(`  ${chalk.bold("Usage:")}             ${pct}%`);
      console.log(`  ${chalk.bold("Plan:")}              ${billing.plan || "free"}`);
      console.log(chalk.dim("  " + "─".repeat(40)));
    } else {
      console.log(chalk.yellow("  Could not fetch billing info."));
    }
  } catch {
    console.log(chalk.red("  Connection error."));
  }

  console.log();

  const action = await askChoice("What would you like to do?", [
    { value: "tokens", label: "Buy extra tokens" },
    { value: "subscribe", label: "Manage subscription" },
    { value: "contribute", label: "Contribute tokens to community pool" },
    { value: "done", label: "Done" },
  ]);

  if (action === "tokens") {
    await openBrowser(`${WEB_BASE}/billing/tokens`);
  } else if (action === "subscribe") {
    await openBrowser(`${WEB_BASE}/billing/subscription`);
  } else if (action === "contribute") {
    await contributeTokens();
  }
}

// ── Contribute Tokens ───────────────────────────────────────

async function contributeTokens(): Promise<void> {
  console.log(chalk.bold("\n  Contribute to Community Pool\n"));
  console.log(chalk.dim("  Your donated tokens help other developers use WabiSabi."));
  console.log(chalk.dim("  Contributors get a badge and priority support.\n"));

  const amount = await askInput("Tokens to contribute", "1000");
  const numAmount = parseInt(amount, 10);

  if (!numAmount || numAmount <= 0) {
    console.log(chalk.red("  Invalid amount."));
    return;
  }

  const confirm = await askConfirm(`Contribute ${numAmount.toLocaleString()} tokens?`, true);
  if (!confirm) return;

  try {
    const { authManager } = await import("../auth/index.js");
    const headers = authManager.getAuthHeaders();

    const res = await fetch(`${WEB_BASE}/api/v1/billing/contribute`, {
      method: "POST",
      headers: { ...headers as Record<string, string>, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: numAmount }),
    });

    if (res.ok) {
      console.log(chalk.green(`  ✓ Contributed ${numAmount.toLocaleString()} tokens. Thank you!`));
    } else {
      console.log(chalk.red("  ✗ Contribution failed. Check your balance."));
    }
  } catch {
    console.log(chalk.red("  Connection error."));
  }
}

// ── Subscribe ───────────────────────────────────────────────

export async function accountSubscribe(): Promise<void> {
  console.log(chalk.bold("\n  Subscription Management\n"));

  const action = await askChoice("Select option:", [
    { value: "view", label: "View current plan" },
    { value: "upgrade", label: "Upgrade plan (opens browser)" },
    { value: "cards", label: "Manage payment methods (opens browser)" },
    { value: "done", label: "Done" },
  ]);

  if (action === "view") {
    await accountProfile();
  } else if (action === "upgrade") {
    await openBrowser(`${WEB_BASE}/billing/subscription`);
  } else if (action === "cards") {
    await openBrowser(`${WEB_BASE}/billing/payment-methods`);
  }
}

// ── Main Menu ───────────────────────────────────────────────

export async function accountMenu(): Promise<void> {
  console.log(chalk.bold("\n  Account Management\n"));

  const action = await askChoice("What would you like to do?", [
    { value: "profile", label: "View profile" },
    { value: "billing", label: "Billing & tokens" },
    { value: "subscribe", label: "Manage subscription" },
    { value: "register", label: "Create new account" },
  ]);

  switch (action) {
    case "profile":
      await accountProfile();
      break;
    case "billing":
      await accountBilling();
      break;
    case "subscribe":
      await accountSubscribe();
      break;
    case "register":
      await accountRegister();
      break;
  }
}
