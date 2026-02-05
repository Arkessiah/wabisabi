import { ApiClient, CLIOptions } from "../clients/api-client.js";
import { readFileSync } from "fs";

interface BatchTask {
  name: string;
  prompt: string;
  expected?: string;
}

interface BatchFile {
  version: string;
  tasks: BatchTask[];
}

export async function batchMode(
  filePath: string,
  opts: CLIOptions,
): Promise<void> {
  console.log("📦 WabiSabi Batch Mode");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`File: ${filePath}`);

  try {
    const content = readFileSync(filePath, "utf-8");
    const batch: BatchFile = JSON.parse(content);

    if (!Array.isArray(batch.tasks)) {
      throw new Error("Batch file must contain a 'tasks' array");
    }

    const client = new ApiClient(opts);
    let passed = 0;
    let failed = 0;

    for (const task of batch.tasks) {
      console.log(`\n▶️ Task: ${task.name}`);
      try {
        const response = await client.chat(task.prompt);
        console.log(response);
        passed++;
      } catch (error) {
        console.error(`❌ Failed: ${error}`);
        failed++;
      }
    }

    console.log(`\n✅ Batch complete: ${passed} passed, ${failed} failed`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}
