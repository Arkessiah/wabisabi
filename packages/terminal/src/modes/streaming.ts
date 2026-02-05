import { CLIOptions } from "../clients/api-client.js";
import { WebSocketClient } from "../clients/ws-client.js";

export async function streamingMode(opts: CLIOptions): Promise<void> {
  console.log("🌊 WabiSabi Streaming Mode");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Target: ${opts.substratum}`);
  console.log("Press Ctrl+C to exit\n");

  const wsClient = new WebSocketClient(opts);

  try {
    await wsClient.connect();
    console.log("📡 Connected to streaming endpoint");
  } catch (error) {
    console.error("❌ WebSocket error:", error);
  }
}
