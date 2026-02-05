#!/usr/bin/env bun

import { auth } from "@wabisabi/auth";

interface AccountOptions {
  json: boolean;
}

export async function accountCommand(args: Record<string, any>) {
  const opts = args as AccountOptions;

  if (!auth.isAuthenticated()) {
    console.log("❌ Not authenticated. Please login first:");
    console.log("   wabisabi login google");
    return;
  }

  console.log("👤 WabiSabi Account");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const user = await auth.getUser();
  const billing = await auth.getBilling();

  if (user) {
    console.log(`\n📋 Profile:`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Provider: ${user.provider}`);
  }

  if (billing) {
    console.log(`\n🪙 Token Balance:`);
    console.log(`   Available: ${billing.available?.toLocaleString()}`);
    console.log(`   Used: ${billing.used?.toLocaleString()}`);
    console.log(`   Total: ${billing.total?.toLocaleString()}`);
  }

  console.log(`\n🔗 Connected to Substratum`);
  console.log(`   Use 'wabisabi account tokens' for detailed token history`);
  console.log(`   Use 'wabisabi account models' for available models`);
}

export async function accountTokens(args: Record<string, any>) {
  const opts = args as AccountOptions;

  if (!auth.isAuthenticated()) {
    console.log("❌ Not authenticated");
    return;
  }

  console.log("🪙 Token History");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const billing = await auth.getBilling();
    console.log(JSON.stringify(billing, null, 2));
  } catch (error) {
    console.error("Failed to get token history:", error);
  }
}

export async function accountModels(args: Record<string, any>) {
  const opts = args as AccountOptions;

  console.log("🧠 Available Models");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const response = await fetch("http://localhost:3001/v1/models");
    if (response.ok) {
      const data = await response.json();
      console.log(JSON.stringify(data, null, 2));
    }
  } catch {
    console.log(`
Available Models:
  - llama3.2 (Ollama)
  - codellama (Ollama)
  - mistral (Ollama)
  - gpt-4 (OpenAI)
  - claude-3 (Anthropic)

Connect to Substratum for full model list.`);
  }
}

export async function accountLogout() {
  await auth.logout();
  console.log("👋 Logged out successfully");
}
