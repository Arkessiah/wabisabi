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
import { FriendlyBot } from "@/components/ui/logo";

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
    <div className="min-h-screen bg-[#f8fafc]">
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 bg-[#1e293b] border-r border-slate-700 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-700">
            <Link href="/dashboard" className="flex items-center gap-3">
              <FriendlyBot size="md" />
              {sidebarOpen && (
                <span className="font-bold text-white">Wabi-Sabi</span>
              )}
            </Link>
          </div>

          <div className="p-4">
            <button className="w-full py-2.5 rounded-lg bg-[#F97316] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#ea580c] transition-all">
              <Plus className="w-4 h-4" />
              {sidebarOpen && <span className="text-sm">New Chat</span>}
            </button>
          </div>

          <div className="flex-1 p-4 space-y-1 overflow-y-auto">
            {sidebarOpen && (
              <p className="text-xs font-medium text-slate-500 uppercase mb-3 font-mono">
                ● Recent Chats
              </p>
            )}
            <Link
              href="/chat"
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700 transition-colors group"
            >
              <div className="h-2 w-2 rounded-full bg-[#22c55e]" />
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate group-hover:text-white">
                    Code review session
                  </p>
                  <p className="text-xs text-slate-500">Today</p>
                </div>
              )}
            </Link>
            <Link
              href="/chat"
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700 transition-colors group"
            >
              <div className="h-2 w-2 rounded-full bg-[#F97316]" />
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate group-hover:text-white">
                    API integration help
                  </p>
                  <p className="text-xs text-slate-500">Yesterday</p>
                </div>
              )}
            </Link>
            <Link
              href="/chat"
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700 transition-colors group"
            >
              <div className="h-2 w-2 rounded-full bg-slate-500" />
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate group-hover:text-white">
                    Bug fix discussion
                  </p>
                  <p className="text-xs text-slate-500">2 days ago</p>
                </div>
              )}
            </Link>
          </div>

          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center text-white font-mono text-sm font-bold">
                JD
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">John Doe</p>
                  <p className="text-xs text-slate-500">● Pro Plan</p>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <div className="flex gap-2 mt-4">
                <button className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Config</span>
                </button>
                <button className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-red-900/50 transition-colors flex items-center justify-center gap-2">
                  <span className="text-xs text-slate-300">Exit</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main
        className={`min-h-screen transition-all duration-300 ${
          sidebarOpen ? "lg:ml-64" : "lg:ml-20"
        }`}
      >
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors lg:hidden"
            >
              <Menu className="h-4 w-4 text-slate-600" />
            </button>
            <select
              className="py-1.5 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
              value={selectedModel?.id || ""}
              onChange={(e) => {
                const model = mockModels.find((m) => m.id === e.target.value);
                if (model) setSelectedModel(model as any);
              }}
            >
              {mockModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <Settings className="h-4 w-4 text-slate-600" />
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-4 max-w-5xl mx-auto">
          <div className="mb-6">
            <p className="text-xs text-slate-400 font-mono mb-2">
              $ session --start
            </p>
            <h1 className="text-xl font-bold text-slate-800">
              New Chat Session
            </h1>
          </div>

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.role === "user" ? "justify-end" : ""}`}
            >
              {message.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg bg-[#F97316] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-mono font-bold">AI</span>
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-lg px-4 py-3 ${
                  message.role === "user"
                    ? "bg-[#F97316] text-white"
                    : "bg-white border border-slate-200 shadow-sm"
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
              <div className="h-8 w-8 rounded-lg bg-[#F97316] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-mono font-bold">AI</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-[#F97316] animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-[#F97316] animate-bounce delay-75" />
                  <div className="h-2 w-2 rounded-full bg-[#F97316] animate-bounce delay-150" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 mb-3">
              <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                <Code className="h-3 w-3" />
                Code
              </button>
              <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                <FileText className="h-3 w-3" />
                Files
              </button>
              <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                <Search className="h-3 w-3" />
                Search
              </button>
              <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-2">
                <Terminal className="h-3 w-3" />
                Terminal
              </button>
            </div>
            <div className="flex gap-3">
              <textarea
                className="min-h-[60px] max-h-32 resize-none flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] placeholder:text-slate-400"
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
                className="self-end px-4 py-2 rounded-lg bg-[#F97316] text-white font-medium hover:bg-[#ea580c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 text-center mt-2 font-mono">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
