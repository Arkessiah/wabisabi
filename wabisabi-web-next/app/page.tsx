"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Terminal,
  Cpu,
  Shield,
  Globe,
  Zap,
  CreditCard,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Users,
  Lock,
  Zap as Lightning,
  Menu,
  X,
  Brain,
  Workflow,
  Database,
  Server,
  Network,
  Cuboid,
  Download,
  Monitor,
  Copy,
  Check,
} from "lucide-react";
import { FriendlyBot } from "@/components/ui/logo";

const features = [
  {
    icon: Terminal,
    title: "Vibe Code Assistant",
    description:
      "AI assistant in your terminal for fast, intelligent development. Code faster with contextual help.",
    gradient: "from-slate-400 to-slate-500",
  },
  {
    icon: Network,
    title: "Agents & Subagents",
    description:
      "Autonomous agents that delegate tasks to specialized subagents. Multi-level intelligence.",
    gradient: "from-slate-400 to-slate-500",
  },
  {
    icon: Workflow,
    title: "Workflows",
    description:
      "Create automated pipelines for repetitive tasks. Chain actions and trigger events.",
    gradient: "from-slate-400 to-slate-500",
  },
  {
    icon: Database,
    title: "Team & User Memory",
    description:
      "Persistent context per user and team. Learn from interactions and share knowledge.",
    gradient: "from-slate-400 to-slate-500",
  },
  {
    icon: Server,
    title: "Distributed Computing",
    description:
      "Run AI workloads across multiple nodes. Scale horizontally with zero configuration.",
    gradient: "from-slate-400 to-slate-500",
  },
  {
    icon: Brain,
    title: "LLM Oracle",
    description:
      "Smart routing to the best model. Local or cloud, open source or proprietary.",
    gradient: "from-slate-400 to-slate-500",
  },
];

const stats = [
  { value: "50K+", label: "Active Users" },
  { value: "99.9%", label: "Uptime" },
  { value: "100B+", label: "Tokens Processed" },
  { value: "500+", label: "Models Available" },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started",
    features: [
      "3 local models",
      "Community support",
      "1 project",
      "Basic inference",
    ],
    gradient: "from-slate-400 to-slate-500",
    popular: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "month",
    description: "For professional developers",
    features: [
      "50 models + API",
      "500K tokens included",
      "20 GPU hours",
      "Priority support",
      "Unlimited projects",
    ],
    gradient: "from-[#F97316] to-[#F97316]",
    popular: true,
  },
  {
    name: "Team",
    price: "$99",
    period: "month",
    description: "For development teams",
    features: [
      "200 models",
      "2M tokens included",
      "100 GPU hours",
      "Up to 10 team members",
      "Team analytics",
    ],
    gradient: "from-slate-400 to-slate-500",
    popular: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations",
    features: [
      "Unlimited models",
      "Dedicated GPU cluster",
      "SSO & SAML",
      "SLA guarantee",
      "24/7 support",
    ],
    gradient: "from-slate-400 to-slate-500",
    popular: false,
  },
];

const slides = [
  {
    title: "Welcome to Wabi-Sabi",
    subtitle: "The future of AI development",
    description: "Experience the perfect blend of power and simplicity",
  },
  {
    title: "Privacy First",
    subtitle: "Your data, your rules",
    description: "Complete control over your AI infrastructure",
  },
  {
    title: "Collaborative Economy",
    subtitle: "Earn while you build",
    description: "Contributors rewarded for GPU power",
  },
];

type Platform = "macOS" | "Linux" | "Windows";

const platformCommands: Record<Platform, { primary: string; secondary: string; secondaryLabel: string }> = {
  macOS: {
    primary: "curl -fsSL https://wabisabi.dev/install.sh | bash",
    secondary: "brew install wabisabi",
    secondaryLabel: "Option 2: Homebrew",
  },
  Linux: {
    primary: "curl -fsSL https://wabisabi.dev/install.sh | bash",
    secondary: "npm install -g @wabisabi/cli",
    secondaryLabel: "Option 2: npm / bun",
  },
  Windows: {
    primary: "npm install -g @wabisabi/cli",
    secondary: "iwr https://wabisabi.dev/install.ps1 -useb | iex",
    secondaryLabel: "Option 2: PowerShell script",
  },
};

export default function HomePage() {
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<Platform>("macOS");

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Super Header - Gray & White */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <FriendlyBot size="md" />
              <span className="text-xl font-bold text-slate-800">
                Wabi-Sabi
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link
                href="#install"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Install
              </Link>
              <Link
                href="#features"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Features
              </Link>
              <Link
                href="#economy"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Economy
              </Link>
              <Link
                href="#pricing"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Pricing
              </Link>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm text-slate-600 hover:text-[#1e293b] transition-colors font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-slate-600 hover:text-[#1e293b] transition-colors font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="#install"
                className="px-5 py-2.5 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#ea580c] transition-colors shadow-lg shadow-[#F97316]/30"
              >
                Download
              </Link>
            </div>

            <button
              className="md:hidden p-2 text-slate-600"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-6 py-4 flex flex-col gap-4">
              <Link
                href="#install"
                className="text-sm text-slate-600 font-medium"
              >
                Install
              </Link>
              <Link
                href="#features"
                className="text-sm text-slate-600 font-medium"
              >
                Features
              </Link>
              <Link
                href="#economy"
                className="text-sm text-slate-600 font-medium"
              >
                Economy
              </Link>
              <Link
                href="#pricing"
                className="text-sm text-slate-600 font-medium"
              >
                Pricing
              </Link>
              <Link
                href="#install"
                className="px-5 py-2.5 rounded-lg bg-[#F97316] text-white text-sm font-medium text-center"
              >
                Download
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Slider Section */}
      <section className="relative pt-52 pb-20 overflow-hidden bg-gradient-to-b from-slate-50 to-white">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#F97316]/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8B5CF6]/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-md border border-slate-200 mb-8">
                <span className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
                <span className="text-sm text-slate-600 font-medium">
                  Terminal CLI + VS Code Extension
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                <span className="text-slate-800">AI Coding Agent</span>
                <br />
                <span className="bg-gradient-to-r from-white via-[#F97316] to-[#F97316] bg-clip-text text-transparent">
                  for your IDE
                </span>
              </h1>

              <p className="text-xl text-slate-500 max-w-xl mx-auto lg:mx-0 mb-10">
                Install WabiSabi in your terminal or VS Code. Autonomous agents
                that read, write, and run code with local or cloud AI models.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link
                  href="#install"
                  className="group px-8 py-4 rounded-xl bg-[#F97316] text-white font-medium flex items-center gap-2 hover:bg-[#ea580c] transition-all shadow-lg shadow-[#F97316]/30"
                >
                  <Download className="w-5 h-5" />
                  Install CLI
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a
                  href="https://marketplace.visualstudio.com/items?itemName=wabisabi.wabisabi-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 rounded-xl bg-white text-slate-700 font-medium flex items-center gap-2 hover:bg-slate-50 transition-all shadow-md border border-slate-200"
                >
                  <Monitor className="w-5 h-5 text-[#8B5CF6]" />
                  VS Code Extension
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="flex justify-center">
                <FriendlyBot size="xl" />
              </div>

              <div className="mt-8 rounded-2xl bg-white shadow-2xl shadow-[#F97316]/10 overflow-hidden border border-slate-200">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                    <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                    <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
                  </div>
                  <span className="text-sm text-slate-500 ml-4">
                    wabi-sabi — bash
                  </span>
                </div>
                <div className="p-6 font-mono text-sm text-left bg-[#1e293b]">
                  <div className="flex gap-2 mb-2">
                    <span className="text-[#F97316]">$</span>
                    <span className="text-slate-100">
                      wabi-sabi init --project my-app
                    </span>
                  </div>
                  <div className="text-[#8B5CF6] mb-4">
                    ✓ Initializing Wabi-Sabi project...
                  </div>
                  <div className="flex gap-2 mb-2">
                    <span className="text-[#F97316]">$</span>
                    <span className="text-slate-100">
                      wabi-sabi use deepseek-coder
                    </span>
                  </div>
                  <div className="text-[#8B5CF6] mb-4">
                    ✓ Model loaded (DeepSeek Coder 33B)
                  </div>
                  <div className="flex gap-2 mb-2">
                    <span className="text-[#F97316]">$</span>
                    <span className="text-slate-100">
                      wabi-sabi chat --interactive
                    </span>
                  </div>
                  <div className="text-[#8B5CF6]">
                    ✓ Connected. Ready for input...
                  </div>
                  <div className="flex gap-2 mt-4">
                    <span className="text-[#8B5CF6]">❯</span>
                    <span className="animate-pulse text-slate-400">_</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-8">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-3 h-3 rounded-full transition-all ${
                  currentSlide === index
                    ? "bg-[#F97316] w-8"
                    : "bg-slate-300 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-[#F97316] bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install Section */}
      <section id="install" className="py-20 bg-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F97316]/20 border border-[#F97316]/30 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
              <span className="text-sm text-[#F97316] font-medium">
                Get Started in 30 seconds
              </span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Install WabiSabi
            </h2>
            <p className="text-slate-400">
              Choose your preferred way to use WabiSabi
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* CLI Install */}
            <div className="rounded-xl bg-[#1e293b] border border-slate-700 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
                <Terminal className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-lg font-semibold text-white">Terminal CLI</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-400 mb-4">
                  Full-featured AI coding agent in your terminal. Autonomous agents, 11 tools, memory system.
                </p>

                {/* Platform tabs */}
                <div className="flex gap-1 mb-4 bg-[#0f172a] rounded-lg p-1 border border-slate-700">
                  {(["macOS", "Linux", "Windows"] as Platform[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                        platform === p
                          ? "bg-[#F97316] text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="mb-4">
                  <p className="text-xs text-slate-500 font-mono mb-2">
                    {platform === "Windows" ? "Option 1: npm (requires Node.js)" : "Option 1: Quick install"}
                  </p>
                  <div className="flex items-center gap-2 bg-[#0f172a] rounded-lg px-4 py-3 border border-slate-700 group">
                    <span className="text-[#F97316] font-mono text-sm">{platform === "Windows" ? ">" : "$"}</span>
                    <code className="text-slate-300 text-sm font-mono flex-1 break-all">{platformCommands[platform].primary}</code>
                    <button
                      onClick={() => copyCmd(platformCommands[platform].primary)}
                      className="text-slate-500 hover:text-[#F97316] transition-colors flex-shrink-0"
                      title="Copy"
                    >
                      {copied ? <Check className="w-4 h-4 text-[#22c55e]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-slate-500 font-mono mb-2">{platformCommands[platform].secondaryLabel}</p>
                  <div className="flex items-center gap-2 bg-[#0f172a] rounded-lg px-4 py-3 border border-slate-700">
                    <span className="text-[#F97316] font-mono text-sm">{platform === "Windows" ? ">" : "$"}</span>
                    <code className="text-slate-300 text-sm font-mono flex-1 break-all">{platformCommands[platform].secondary}</code>
                    <button
                      onClick={() => copyCmd(platformCommands[platform].secondary)}
                      className="text-slate-500 hover:text-[#F97316] transition-colors flex-shrink-0"
                      title="Copy"
                    >
                      {copied ? <Check className="w-4 h-4 text-[#22c55e]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <a
                  href="https://github.com/Arkessiah/wabisabi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors border border-slate-600"
                >
                  View on GitHub
                </a>
              </div>
            </div>

            {/* VS Code Extension */}
            <div className="rounded-xl bg-[#1e293b] border border-slate-700 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
                <Monitor className="w-5 h-5 text-[#8B5CF6]" />
                <h3 className="text-lg font-semibold text-white">VS Code Extension</h3>
                <span className="ml-auto text-xs text-slate-500 font-mono">all platforms</span>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-400 mb-4">
                  AI chat sidebar, inline completions, task tracking, and markdown rendering inside VS Code.
                </p>

                <div className="mb-4">
                  <p className="text-xs text-slate-500 font-mono mb-2">From VS Code</p>
                  <div className="bg-[#0f172a] rounded-lg px-4 py-3 border border-slate-700">
                    <code className="text-slate-300 text-sm font-mono">ext install wabisabi.wabisabi-ai</code>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-slate-500 font-mono mb-2">Or search in Extensions panel</p>
                  <div className="bg-[#0f172a] rounded-lg px-4 py-3 border border-slate-700 flex items-center gap-3">
                    <span className="text-slate-500 text-sm">Search:</span>
                    <code className="text-[#8B5CF6] text-sm font-mono">WabiSabi AI</code>
                  </div>
                </div>

                <div className="bg-[#0f172a] rounded-lg p-4 border border-slate-700 mb-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#F97316] to-[#8B5CF6] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                      W
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">WabiSabi AI</p>
                      <p className="text-slate-500 text-xs">AI coding agent for VS Code</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-[#22c55e]">v0.1.0</span>
                        <span className="text-xs text-slate-600">|</span>
                        <span className="text-xs text-slate-500">wabisabi</span>
                      </div>
                    </div>
                  </div>
                </div>

                <a
                  href="https://marketplace.visualstudio.com/items?itemName=wabisabi.wabisabi-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-lg bg-[#8B5CF6] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#7c3aed] transition-colors"
                >
                  <Monitor className="w-4 h-4" />
                  Open in VS Code Marketplace
                </a>
              </div>
            </div>
          </div>

          {/* Requirements note */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              CLI requires <span className="text-slate-400">Bun</span> or <span className="text-slate-400">Node.js 18+</span>.
              VS Code extension requires <span className="text-slate-400">VS Code 1.85+</span>.
              Both need <span className="text-slate-400">Ollama</span> (local) or a <span className="text-slate-400">Substratum</span> account (cloud).
            </p>
          </div>
        </div>
      </section>

      {/* Features Section - Icons in grayscale with orange/purple accents */}
      <section id="features" className="py-32 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-800 mb-4">
              Powerful AI Development Platform
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              From vibe coding to distributed computing. Everything you need for
              next-gen development.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="group relative p-8 rounded-2xl bg-white border border-slate-200 hover:border-[#F97316]/30 transition-all cursor-pointer shadow-md hover:shadow-xl hover:shadow-[#F97316]/10"
                onMouseEnter={() => setHoveredFeature(index)}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                <div className="relative z-10">
                  <div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg border-2 border-slate-200 group-hover:border-[#F97316]`}
                  >
                    <feature.icon className="w-7 h-7 text-slate-600 group-hover:text-[#F97316] transition-colors" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-3 group-hover:text-[#8B5CF6] transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-slate-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Economy Section */}
      {/* Economy Section - Terminal Style */}
      <section id="economy" className="py-20 bg-[#1e293b]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0f172a] border border-slate-700 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#F97316]" />
              <span className="text-xs text-[#F97316] font-mono">
                module: token_economy
              </span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              Circular Economy
            </h2>
            <p className="text-slate-400 font-mono text-sm">
              $ buy_earn_sell("--transform", compute_power)
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                icon: "💳",
                title: "Buy Tokens",
                cmd: "$ tokens.buy()",
                description:
                  "Purchase tokens at market price. Use for AI inference, storage, and compute.",
                color: "#F97316",
              },
              {
                icon: "⚡",
                title: "Mine with Compute",
                cmd: "$ compute.mine()",
                description:
                  "Contribute CPU/GPU power and earn tokens. Turn idle resources into income.",
                color: "#8B5CF6",
              },
              {
                icon: "🏆",
                title: "Gold Tokens",
                cmd: "$ tokens.upgrade('gold')",
                description:
                  "Accumulate volume for Gold status. Premium perks and better rates.",
                color: "#F97316",
              },
              {
                icon: "💰",
                title: "Sell Tokens",
                cmd: "$ tokens.sell()",
                description:
                  "Sell unused tokens on the marketplace. Recover your investment.",
                color: "#64748b",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="p-4 rounded-xl bg-[#0f172a] border border-slate-700 hover:border-[#F97316]/50 transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-[#F97316] transition-colors">
                      {item.title}
                    </h3>
                    <code className="text-xs text-[#F97316] font-mono">
                      {item.cmd}
                    </code>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          {/* Economy Flow - Terminal Style */}
          <div className="rounded-xl bg-[#0f172a] border border-slate-700 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 bg-[#1e293b]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              </div>
              <span className="text-xs text-slate-400 ml-2 font-mono">
                economy_diagram.tsx
              </span>
            </div>
            <div className="p-6">
              <div className="flex flex-col lg:flex-row items-center gap-8">
                <div className="flex-1">
                  <div className="space-y-4">
                    {[
                      {
                        step: "01",
                        cmd: "$ tokens.acquire()",
                        title: "Buy or Earn",
                        description:
                          "Purchase tokens or mine them with your compute",
                        color: "#F97316",
                      },
                      {
                        step: "02",
                        cmd: "$ tokens.manage()",
                        title: "Use or Hold",
                        description:
                          "Spend tokens on services or accumulate for Gold status",
                        color: "#8B5CF6",
                      },
                      {
                        step: "03",
                        cmd: "$ tokens.exchange()",
                        title: "Sell or Trade",
                        description: "Sell unused tokens on the marketplace",
                        color: "#64748b",
                      },
                    ].map((item, index) => (
                      <div key={index} className="flex items-start gap-4">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold border"
                          style={{
                            backgroundColor: `${item.color}15`,
                            borderColor: item.color,
                            color: item.color,
                          }}
                        >
                          {item.step}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-xs text-[#F97316] font-mono">
                              {item.cmd}
                            </code>
                          </div>
                          <h4 className="text-sm font-medium text-white">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">
                            {item.description}
                          </p>
                        </div>
                        {index < 2 && (
                          <div className="hidden lg:block text-slate-600">
                            <svg
                              className="w-6 h-6"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-xl bg-[#0f172a] border border-slate-700 flex items-center justify-center">
                      <div className="text-center">
                        <span className="text-4xl">♻️</span>
                        <p className="text-xs text-slate-500 font-mono mt-2">
                          Circular Flow
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Token Stats - Terminal Style */}
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Market Cap",
                value: "$2.4M",
                change: "+12%",
                color: "#22c55e",
              },
              {
                label: "Daily Volume",
                value: "45K",
                change: "+8%",
                color: "#22c55e",
              },
              {
                label: "Active Miners",
                value: "1.2K",
                change: "+15%",
                color: "#22c55e",
              },
              {
                label: "Gold Holders",
                value: "342",
                change: "+5%",
                color: "#F97316",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-[#0f172a] border border-slate-700"
              >
                <p className="text-xs text-slate-500 font-mono mb-1">
                  {stat.label}
                </p>
                <div className="flex items-end justify-between">
                  <span className="text-xl font-bold text-white">
                    {stat.value}
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: stat.color }}
                  >
                    {stat.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section
        id="pricing"
        className="py-32 bg-white border-y border-slate-200"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-800 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Choose the plan that fits your needs. Upgrade or downgrade
              anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pricingPlans.map((plan, index) => (
              <div
                key={plan.name}
                className={`relative p-8 rounded-2xl bg-white border ${
                  plan.popular
                    ? "border-[#F97316] shadow-xl shadow-[#F97316]/20"
                    : "border-slate-200 shadow-md"
                } transition-all hover:shadow-lg`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#8B5CF6] text-xs font-medium text-white shadow-lg">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-slate-600 mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-800">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-slate-500">/{plan.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {plan.description}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-sm text-slate-600"
                    >
                      <div className="w-5 h-5 rounded-full bg-[#F97316]/10 flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-[#F97316]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="#install"
                  className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                    plan.popular
                      ? "bg-[#8B5CF6] text-white hover:opacity-90 shadow-lg"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  Get Started
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-[#f8fafc]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="relative p-12 rounded-3xl bg-white shadow-2xl shadow-[#F97316]/10 overflow-hidden border border-slate-200">
            <div className="absolute inset-0 bg-gradient-to-b from-white to-[#8B5CF6]/5" />
            <div className="relative z-10">
              <div className="flex justify-center mb-6">
                <FriendlyBot size="lg" />
              </div>
              <h2 className="text-4xl font-bold text-slate-800 mb-4">
                Ready to code with AI?
              </h2>
              <p className="text-slate-500 mb-8 max-w-xl mx-auto">
                Install WabiSabi in under 30 seconds. Works with Ollama (free, local)
                or Substratum (cloud). No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="#install"
                  className="px-8 py-4 rounded-xl bg-[#F97316] text-white font-medium hover:bg-[#ea580c] transition-colors shadow-lg shadow-[#F97316]/30 flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Install CLI
                </Link>
                <a
                  href="https://marketplace.visualstudio.com/items?itemName=wabisabi.wabisabi-ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 rounded-xl bg-[#8B5CF6] text-white font-medium hover:bg-[#7c3aed] transition-colors shadow-lg shadow-[#8B5CF6]/30 flex items-center gap-2"
                >
                  <Monitor className="w-5 h-5" />
                  VS Code Extension
                </a>
                <Link
                  href="/login"
                  className="px-8 py-4 rounded-xl bg-white text-slate-700 font-medium hover:bg-slate-50 transition-colors shadow-md border border-slate-200"
                >
                  Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <FriendlyBot size="sm" />
              <span className="text-xl font-bold text-slate-800">
                Wabi-Sabi
              </span>
            </div>
            <div className="flex items-center gap-8">
              <Link
                href="#install"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Install
              </Link>
              <Link
                href="#features"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Features
              </Link>
              <Link
                href="#pricing"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Pricing
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                Dashboard
              </Link>
              <a
                href="https://github.com/Arkessiah/wabisabi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-600 hover:text-[#F97316] transition-colors font-medium"
              >
                GitHub
              </a>
            </div>
            <p className="text-sm text-slate-500">
              © 2026 Wabi-Sabi. Built with simplicity in mind.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
