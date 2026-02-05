import { ApiClient, CLIOptions } from "../clients/api-client.js";
import { WebSocketClient } from "../clients/ws-client.js";
import { BuildAgent } from "../agents/build/index.js";
import { PlanAgent } from "../agents/plan/index.js";
import { SearchAgent } from "../agents/search/index.js";

const agents: Record<string, any> = {
  build: BuildAgent,
  plan: PlanAgent,
  search: SearchAgent,
};

const helpText = `
Available commands:
  - Just type your request naturally
  - 'build': Enter code generation mode
  - 'plan': Enter planning mode
  - 'search': Enter research mode
  - 'models': List available models
  - 'clear': Clear screen
  - 'exit': Quit
`;

export async function interactiveMode(opts: CLIOptions): Promise<void> {
  console.log("🌀 WabiSabi Interactive Mode");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Target: ${opts.substratum}`);
  console.log(`Model: ${opts.model}`);
  console.log(helpText);

  const client = new ApiClient(opts);
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  let input = "";

  while (true) {
    input = await askQuestion("🔮 ");

    if (input.trim() === "exit") {
      console.log("👋 Goodbye!");
      rl.close();
      break;
    }

    if (input.trim() === "help") {
      console.log(helpText);
      continue;
    }

    if (input.trim() === "models") {
      const models = await client.listModels();
      console.log("📦 Available models:", models.join(", "));
      continue;
    }

    if (input.trim() === "clear") {
      console.clear?.();
      continue;
    }

    if (["build", "plan", "search"].includes(input.trim())) {
      const agentClass = agents[input.trim()];
      if (agentClass) {
        const agent = new agentClass(opts);
        console.log(`🚀 Starting ${input.trim()} agent...`);
        await agent.run();
      }
      continue;
    }

    try {
      const response = await client.chat(input);
      console.log(`\n📝 Response:\n${response}\n`);
    } catch (error) {
      console.error("❌ Error:", error);
    }
  }
}
