import { CLIOptions } from "../../clients/api-client.js";
import { ApiClient } from "../../clients/api-client.js";

export class SearchAgent {
  private client: ApiClient;
  private opts: CLIOptions;

  constructor(opts: CLIOptions) {
    this.opts = opts;
    this.client = new ApiClient(opts);
  }

  async run(): Promise<void> {
    console.log("🔍 Search Agent - Research Mode");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("What do you want to research?\n");

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

    let query = await askQuestion("🔎 What to research? ");

    if (query.trim() === "exit") {
      rl.close();
      return;
    }

    console.log("\n🔬 Researching...");

    try {
      const response = await this.client.chat(`
You are a research agent. Find comprehensive information about:
${query}

Include:
1. Executive summary
2. Key concepts and definitions
3. Practical applications
4. Relevant tools and technologies
5. Best practices
6. Resources for further learning

Be thorough and informative.
      `);

      console.log("\n📚 Research Results:\n");
      console.log(response);
      console.log("\n✅ Research complete!");
    } catch (error) {
      console.error("❌ Research failed:", error);
    }

    rl.close();
  }
}
