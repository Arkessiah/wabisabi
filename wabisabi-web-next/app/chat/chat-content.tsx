"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Plus,
  Menu,
  Settings,
  Code,
  FileText,
  Search,
  Terminal,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { chatCompletion } from "@/lib/api";
import type { ChatMessage } from "@/types";

const mockModels = [
  { id: "llama3", name: "Llama 3", type: "free" },
  { id: "codellama", name: "CodeLlama", type: "free" },
  { id: "llama-70b", name: "Llama 3 70B", type: "gpu" },
  { id: "deepseek-coder", name: "DeepSeek Coder", type: "gpu" },
  { id: "deepseek-chat", name: "DeepSeek Chat", type: "api" },
  { id: "claude", name: "Claude 3.5", type: "api" },
];

export function ChatContent() {
  const searchParams = useSearchParams();
  const { setSelectedModel, selectedModel } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I'm ready to help you with your coding tasks. What would you like to work on?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedModelId = searchParams.get("model");
  useEffect(() => {
    if (selectedModelId) {
      const model = mockModels.find((m) => m.id === selectedModelId);
      if (model) setSelectedModel(model as any);
    }
  }, [selectedModelId, setSelectedModel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await chatCompletion(
        [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        selectedModel?.id || "llama3",
        false,
      );

      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content:
          response.choices?.[0]?.message?.content ||
          "I couldn't generate a response.",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={`${sidebarOpen ? "w-64" : "w-0"} border-r bg-card transition-all duration-300 overflow-hidden`}
      >
        <div className="p-4 border-b">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm">W</span>
            </div>
            <span className={sidebarOpen ? "inline" : "hidden"}>Wabi-Sabi</span>
          </Link>
        </div>

        <div className="p-4">
          <button className="btn btn-primary btn-sm btn-block mb-4">
            <Plus className="h-4 w-4 mr-2" />
            New Chat
          </button>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Recent Chats
            </h4>
            <Link
              href="/chat"
              className="block px-3 py-2 rounded-md bg-primary/10 text-sm"
            >
              Code review session
            </Link>
            <Link
              href="/chat"
              className="block px-3 py-2 rounded-md text-muted-foreground hover:bg-muted text-sm"
            >
              API integration help
            </Link>
            <Link
              href="/chat"
              className="block px-3 py-2 rounded-md text-muted-foreground hover:bg-muted text-sm"
            >
              Bug fix discussion
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-md hover:bg-muted"
            >
              <Menu className="h-4 w-4" />
            </button>
            <select
              className="input py-1 px-2 text-sm w-48"
              value={selectedModel?.id || ""}
              onChange={(e) => {
                const model = mockModels.find((m) => m.id === e.target.value);
                if (model) setSelectedModel(model as any);
              }}
            >
              {mockModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.type})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="p-2 rounded-md hover:bg-muted">
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.role === "user" ? "justify-end" : ""}`}
            >
              {message.role === "assistant" && (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground text-xs">AI</span>
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {message.content}
                </pre>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-primary-foreground text-xs">AI</span>
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-75" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-150" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t bg-card">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 mb-2">
              <button className="btn btn-sm btn-ghost">
                <Code className="h-4 w-4 mr-1" />
                Code
              </button>
              <button className="btn btn-sm btn-ghost">
                <FileText className="h-4 w-4 mr-1" />
                Files
              </button>
              <button className="btn btn-sm btn-ghost">
                <Search className="h-4 w-4 mr-1" />
                Search
              </button>
              <button className="btn btn-sm btn-ghost">
                <Terminal className="h-4 w-4 mr-1" />
                Terminal
              </button>
            </div>
            <div className="flex gap-2">
              <textarea
                className="input min-h-[60px] max-h-32 resize-none flex-1"
                placeholder="Send a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="btn btn-primary self-end"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
