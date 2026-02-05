import { CLIOptions } from "../../clients/api-client.js";
import { ApiClient } from "../../clients/api-client.js";

export class PlanAgent {
  private client: ApiClient;
  private opts: CLIOptions;

  constructor(opts: CLIOptions) {
    this.opts = opts;
    this.client = new ApiClient(opts);
  }

  async run(): Promise<void> {
    console.log("📊 Plan Agent - Task Planning Mode");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Describe the task you want to plan...\n");

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

    let task = await askQuestion("📋 What do you want to plan? ");

    if (task.trim() === "exit") {
      rl.close();
      return;
    }

    console.log("\n📈 Planning...");

    try {
      const response = await this.client.chat(`
You are a planning agent. Create a detailed plan for:
${task}

Include:
1. High-level overview
2. Step-by-step tasks
3. Dependencies between tasks
4. Estimated effort for each step
5. Potential risks and mitigations

Format as a structured plan with numbered steps.
      `);

      console.log("\n📋 Generated Plan:\n");
      console.log(response);
      console.log("\n✅ Planning complete!");
    } catch (error) {
      console.error("❌ Planning failed:", error);
    }

    rl.close();
  }
}
