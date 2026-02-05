import { CLIOptions } from "../../clients/api-client.js";
import { ApiClient } from "../../clients/api-client.js";

export class BuildAgent {
  private client: ApiClient;
  private opts: CLIOptions;

  constructor(opts: CLIOptions) {
    this.opts = opts;
    this.client = new ApiClient(opts);
  }

  async run(): Promise<void> {
    console.log("🛠️ Build Agent - Code Execution Mode");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Describe what you want to build...\n");

    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer);
        });
      });
    };

    let task = await askQuestion("📝 What do you want to build? ");

    if (task.trim() === "exit") {
      rl.close();
      return;
    }

    console.log("\n🔨 Building...");

    try {
      const response = await this.client.chat(`
You are a code generation agent. Generate complete, working code for:
${task}

Include:
- Full implementation
- Necessary imports
- Error handling
- Comments explaining key parts

Return only the code with brief explanation.
      `);

      console.log("\n📦 Generated Code:\n");
      console.log(response);
      console.log("\n✅ Build complete!");
    } catch (error) {
      console.error("❌ Build failed:", error);
    }

    rl.close();
  }
}