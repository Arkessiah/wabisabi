"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Plus,
  Settings,
  LogOut,
  Search,
  Menu,
  X,
  ChevronRight,
  Clock,
  Zap,
  Users,
  BarChart3,
  Cpu,
  Network,
  Activity,
  Terminal,
  Database,
  Cpu as Microchip,
  Globe,
  HardDrive,
  Zap as Lightning,
} from "lucide-react";
import { Logo, FriendlyBot } from "@/components/ui/logo";

const recentChats = [
  {
    id: "1",
    title: "Building REST API",
    model: "deepseek-coder",
    time: "2 hours ago",
    messages: 45,
  },
  {
    id: "2",
    title: "React Component Refactor",
    model: "claude-3-5-sonnet",
    time: "5 hours ago",
    messages: 23,
  },
  {
    id: "3",
    title: "Database Schema Design",
    model: "deepseek-coder",
    time: "Yesterday",
    messages: 67,
  },
  {
    id: "4",
    title: "Bug Fix: Authentication",
    model: "gpt-4o",
    time: "2 days ago",
    messages: 12,
  },
];

const models = [
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    provider: "Local",
    type: "Free",
    status: "online",
    speed: "Fast",
    context: "64K",
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    type: "API",
    status: "online",
    speed: "Medium",
    context: "200K",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    type: "API",
    status: "online",
    speed: "Fast",
    context: "128K",
  },
  {
    id: "llama-3-1-70b",
    name: "Llama 3.1 70B",
    provider: "Ollama",
    type: "GPU",
    status: "online",
    speed: "Very Fast",
    context: "128K",
  },
];

const stats = [
  {
    label: "Total Tokens",
    value: "2.4M",
    icon: Terminal,
    color: "#8B5CF6",
    change: "+12%",
  },
  {
    label: "Active Chats",
    value: "23",
    icon: MessageSquare,
    color: "#F97316",
    change: "+5%",
  },
  {
    label: "Models Used",
    value: "8",
    icon: Microchip,
    color: "#64748b",
    change: "+2",
  },
  {
    label: "Hours Saved",
    value: "156h",
    icon: Clock,
    color: "#22c55e",
    change: "+18%",
  },
];

const usageData = [
  { day: "Mon", value: 60 },
  { day: "Tue", value: 80 },
  { day: "Wed", value: 45 },
  { day: "Thu", value: 90 },
  { day: "Fri", value: 70 },
  { day: "Sat", value: 30 },
  { day: "Sun", value: 50 },
];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  change,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
  change: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-md hover:shadow-lg hover:border-[#F97316]/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200"
          style={{ borderColor: color }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <span
          className="text-xs font-medium px-2 py-1 rounded-full"
          style={{
            backgroundColor: `${color}15`,
            color,
          }}
        >
          {change}
        </span>
      </div>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
  );
}

function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-[#1e293b] border border-slate-700 overflow-hidden shadow-lg ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-[#0f172a]">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
          <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
          <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
        </div>
        <span className="text-xs text-slate-400 ml-2 font-mono">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ChatContent() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Mobile Header - Terminal Style */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#1e293b] border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FriendlyBot size="sm" />
            <span className="font-bold text-white">Wabi-Sabi</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">
              {currentTime}
            </span>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
            >
              <Menu className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar - Terminal Style */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 bg-[#1e293b] border-r border-slate-700 transition-all duration-300 ${
          sidebarOpen ? "w-64" : "w-20"
        } ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <FriendlyBot size="md" />
              {sidebarOpen && (
                <span className="font-bold text-white">Wabi-Sabi</span>
              )}
            </div>
          </div>

          {/* New Chat Button */}
          <div className="p-4">
            <button
              onClick={() => router.push("/chat")}
              className={`w-full py-2.5 rounded-lg bg-[#F97316] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#ea580c] transition-all ${
                !sidebarOpen ? "px-0" : ""
              }`}
            >
              <Plus className="w-4 h-4" />
              {sidebarOpen && <span className="text-sm">New Chat</span>}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {sidebarOpen && (
              <p className="text-xs font-medium text-slate-500 uppercase mb-3 font-mono">
                ● Recent Sessions
              </p>
            )}
            {recentChats.map((chat) => (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700 transition-colors group ${
                  !sidebarOpen ? "justify-center" : ""
                }`}
              >
                <MessageSquare className="w-4 h-4 text-slate-400 group-hover:text-[#F97316]" />
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300 truncate group-hover:text-white">
                      {chat.title}
                    </p>
                    <p className="text-xs text-slate-500">{chat.time}</p>
                  </div>
                )}
              </Link>
            ))}
          </nav>

          {/* User Section - Terminal Style */}
          <div className="p-4 border-t border-slate-700">
            <div
              className={`flex items-center gap-3 ${
                !sidebarOpen ? "justify-center" : ""
              }`}
            >
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
                  <LogOut className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Exit</span>
                </button>
              </div>
            )}
          </div>

          {/* Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1e293b] border border-slate-600 shadow-md items-center justify-center hover:bg-slate-700 transition-colors"
          >
            <ChevronRight
              className={`w-4 h-4 text-slate-400 transition-transform ${
                sidebarOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main
        className={`pt-16 lg:pt-0 min-h-screen transition-all duration-300 ${
          sidebarOpen ? "lg:ml-64" : "lg:ml-20"
        }`}
      >
        <div className="p-6 lg:p-8">
          {/* Welcome Header - Terminal Style */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-400 font-mono">
                {currentTime}
              </span>
              <span className="text-xs text-slate-500 font-mono">●</span>
              <span className="text-xs text-slate-400 font-mono">
                wabi-sabi v2.1.0
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">
              Welcome back, <span className="text-[#F97316]">John</span>
            </h1>
            <p className="text-slate-500 mt-1 font-mono text-sm">
              $ system --status: ready
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, index) => (
              <StatCard key={index} {...stat} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Available Models - Terminal Style */}
            <TerminalWindow title="● Available Models">
              <div className="space-y-3">
                {models.slice(0, 4).map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#0f172a] border border-slate-700 hover:border-[#F97316]/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          model.status === "online"
                            ? "bg-[#22c55e]/10 border border-[#22c55e]/30"
                            : "bg-slate-800 border border-slate-700"
                        }`}
                      >
                        <Cpu
                          className={`w-4 h-4 ${
                            model.status === "online"
                              ? "text-[#22c55e]"
                              : "text-slate-500"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {model.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {model.provider} ● {model.context}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs rounded-md font-mono ${
                          model.type === "Free"
                            ? "bg-[#22c55e]/10 text-[#22c55e]"
                            : model.type === "GPU"
                              ? "bg-[#F97316]/10 text-[#F97316]"
                              : "bg-slate-700 text-slate-400"
                        }`}
                      >
                        {model.type}
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          model.status === "online"
                            ? "bg-[#22c55e]"
                            : "bg-slate-500"
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700 flex justify-center">
                <button className="text-xs text-[#F97316] hover:text-[#ea580c] font-mono">
                  → view_all_models
                </button>
              </div>
            </TerminalWindow>

            {/* Weekly Usage - Terminal Style */}
            <TerminalWindow title="● Weekly Token Usage">
              <div className="h-40 flex items-end justify-between gap-2">
                {usageData.map((item, index) => (
                  <div
                    key={index}
                    className="flex-1 flex flex-col items-center gap-2"
                  >
                    <div
                      className="w-full bg-[#F97316] rounded-t-sm transition-all hover:bg-[#ea580c]"
                      style={{ height: `${item.value}%`, minHeight: "8px" }}
                    />
                    <span className="text-xs text-slate-500 font-mono">
                      {item.day}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-mono">
                    $ total --week
                  </span>
                  <span className="font-semibold text-white font-mono">
                    425,000 tokens
                  </span>
                </div>
              </div>
            </TerminalWindow>
          </div>

          {/* Quick Actions - Terminal Style */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-slate-400 font-mono">$</span>
              <h2 className="text-lg font-semibold text-slate-800">
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  icon: Plus,
                  label: "New Project",
                  action: "init",
                  color: "#F97316",
                },
                {
                  icon: Network,
                  label: "Connect Node",
                  action: "connect",
                  color: "#8B5CF6",
                },
                {
                  icon: Database,
                  label: "Deploy DB",
                  action: "deploy",
                  color: "#64748b",
                },
                {
                  icon: Terminal,
                  label: "Shell",
                  action: "shell",
                  color: "#22c55e",
                },
              ].map((action, index) => (
                <button
                  key={index}
                  className="p-4 rounded-xl bg-white border border-slate-200 hover:shadow-lg hover:border-[#F97316]/30 transition-all text-left group"
                >
                  <div
                    className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mb-3 border border-slate-200 group-hover:border-[#F97316]/50 transition-colors"
                    style={{ borderColor: action.color }}
                  >
                    <action.icon
                      className="w-4 h-4"
                      style={{ color: action.color }}
                    />
                  </div>
                  <p className="text-sm font-medium text-slate-800 group-hover:text-[#F97316] transition-colors">
                    {action.label}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    $ {action.action}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* System Status - Terminal Style */}
          <TerminalWindow title="● System Status">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  icon: Microchip,
                  label: "CPU Usage",
                  value: "45%",
                  status: "normal",
                },
                {
                  icon: HardDrive,
                  label: "Memory",
                  value: "12.4 GB",
                  status: "normal",
                },
                {
                  icon: Globe,
                  label: "Network",
                  value: "Active",
                  status: "online",
                },
                {
                  icon: Lightning,
                  label: "GPU Status",
                  value: "Idle",
                  status: "standby",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-[#0f172a] border border-slate-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <item.icon className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-500">{item.label}</span>
                  </div>
                  <p
                    className="text-sm font-mono font-medium"
                    style={{
                      color:
                        item.status === "online"
                          ? "#22c55e"
                          : item.status === "normal"
                            ? "#F97316"
                            : "#8B5CF6",
                    }}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </TerminalWindow>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#1e293b] flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center">
              <span className="text-white font-mono font-bold">WS</span>
            </div>
            <span className="text-slate-400 font-mono">Loading...</span>
          </div>
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
