import { CLIOptions } from "./api-client.js";

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private opts: CLIOptions;

  constructor(opts: CLIOptions) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    const url = this.opts.substratum.replace("http", "ws") + "/v1/chat/stream";

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("🔌 WebSocket connected");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.choices?.[0]?.delta?.content) {
              process.stdout.write(data.choices[0].delta.content);
            }
          } catch {
            console.log(event.data);
          }
        };

        this.ws.onerror = (error) => {
          console.error("❌ WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("\n🔌 WebSocket closed");
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async send(message: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    this.ws.send(
      JSON.stringify({
        model: this.opts.model,
        messages: [{ role: "user", content: message }],
      }),
    );
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
    }
  }
}
