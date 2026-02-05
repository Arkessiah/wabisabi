export interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  options?: Record<string, any>;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface CLIOptions {
  substratum: string;
  ollama: string;
  model: string;
}

export class ApiClient {
  private substratumUrl: string;
  private ollamaUrl: string;
  private model: string;

  constructor(options: CLIOptions) {
    this.substratumUrl = options?.substratum || "http://localhost:3001";
    this.ollamaUrl = options?.ollama || "http://localhost:11434";
    this.model = options?.model || "llama3.2";
  }

  async chat(prompt: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.substratumUrl}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ChatResponse = await response.json();
      return data.choices[0]?.message?.content || "No response";
    } catch (error) {
      console.error("❌ API Error:", error);
      throw error;
    }
  }

  async chatOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.response || "No response";
    } catch (error) {
      console.error("❌ Ollama Error:", error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.substratumUrl}/v1/models`);
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
    } catch {
      // Fallback to Ollama
    }

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [this.model];
    }
  }
}
