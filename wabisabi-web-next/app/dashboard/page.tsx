"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Settings,
  LogOut,
  Menu,
  ChevronRight,
  Clock,
  Zap,
  Cpu,
  Terminal,
  CreditCard,
  Download,
  Key,
  LayoutDashboard,
  Receipt,
  User,
  Monitor,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { FriendlyBot } from "@/components/ui/logo";
import {
  getMe,
  getBillingAccount,
  getBillingUsage,
  getBillingTransactions,
  getBillingPlans,
  changePlan,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  listModels,
  logout,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  name?: string;
  role: string;
}

interface BillingAccount {
  plan?: string;
  balanceCents?: number;
  totalTokensUsed?: number;
  monthlyTokenLimit?: number;
}

interface Transaction {
  id: string;
  type: string;
  amountCents: number;
  description?: string;
  createdAt: string;
}

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string;
}

interface ModelItem {
  id: string;
  name?: string;
  provider?: string;
  status?: string;
}

interface UsageDay {
  date: string;
  tokens: number;
}

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  tokensMonthly: number;
  features?: string[];
}

// ── Sidebar Nav ───────────────────────────────────────

const tabs = [
  { id: "overview", icon: LayoutDashboard, label: "Overview" },
  { id: "billing", icon: Receipt, label: "Billing" },
  { id: "keys", icon: Key, label: "API Keys" },
  { id: "downloads", icon: Download, label: "Downloads" },
  { id: "account", icon: User, label: "Account" },
] as const;

type TabId = (typeof tabs)[number]["id"];

// ── Helpers ───────────────────────────────────────────

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-md hover:shadow-lg hover:border-[#F97316]/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200" style={{ borderColor: color }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
  );
}

function TerminalWindow({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-[#1e293b] border border-slate-700 overflow-hidden shadow-lg ${className}`}>
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

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 transition-colors text-xs font-medium">
          Retry
        </button>
      )}
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────

function OverviewTab({ account, models, usage }: { account: BillingAccount | null; models: ModelItem[]; usage: UsageDay[] }) {
  const maxTokens = Math.max(...usage.map((d) => d.tokens), 1);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Tokens" value={formatNumber(account?.totalTokensUsed ?? 0)} icon={Terminal} color="#8B5CF6" />
        <StatCard label="Credits Left" value={formatCents(account?.balanceCents ?? 0)} icon={CreditCard} color="#F97316" />
        <StatCard label="Plan" value={account?.plan ?? "Free"} icon={Zap} color="#64748b" />
        <StatCard label="Models Available" value={String(models.length)} icon={Cpu} color="#22c55e" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <TerminalWindow title="Available Models">
          <div className="space-y-3">
            {models.length === 0 && <p className="text-sm text-slate-500">No models available</p>}
            {models.slice(0, 6).map((model) => (
              <div key={model.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0f172a] border border-slate-700 hover:border-[#F97316]/50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-[#22c55e]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{model.name || model.id}</p>
                    <p className="text-xs text-slate-500">{model.provider ?? "Unknown"}</p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${model.status === "online" ? "bg-[#22c55e]" : "bg-slate-500"}`} />
              </div>
            ))}
          </div>
        </TerminalWindow>

        <TerminalWindow title="Weekly Token Usage">
          {usage.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No usage data yet</p>
          ) : (
            <>
              <div className="h-40 flex items-end justify-between gap-2">
                {usage.slice(-7).map((item, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-[#F97316] rounded-t-sm transition-all hover:bg-[#ea580c]"
                      style={{ height: `${(item.tokens / maxTokens) * 100}%`, minHeight: "4px" }}
                    />
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(item.date).toLocaleDateString("en", { weekday: "short" }).slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-mono">Total this week</span>
                  <span className="font-semibold text-white font-mono">
                    {formatNumber(usage.slice(-7).reduce((s, d) => s + d.tokens, 0))} tokens
                  </span>
                </div>
              </div>
            </>
          )}
        </TerminalWindow>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Download, label: "Download CLI", desc: "Install terminal agent", color: "#F97316", href: "/#install" },
            { icon: Monitor, label: "VS Code Extension", desc: "Install plugin", color: "#8B5CF6", href: "https://marketplace.visualstudio.com/items?itemName=wabisabi.wabisabi-ai" },
            { icon: CreditCard, label: "Buy Credits", desc: "Add funds to account", color: "#22c55e", href: "/dashboard?tab=billing" },
            { icon: Key, label: "API Keys", desc: "Manage access tokens", color: "#64748b", href: "/dashboard?tab=keys" },
          ].map((action, i) => (
            <a
              key={i}
              href={action.href}
              target={action.href.startsWith("http") ? "_blank" : undefined}
              rel={action.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="p-4 rounded-xl bg-white border border-slate-200 hover:shadow-lg hover:border-[#F97316]/30 transition-all text-left group block"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mb-3 border border-slate-200" style={{ borderColor: action.color }}>
                <action.icon className="w-4 h-4" style={{ color: action.color }} />
              </div>
              <p className="text-sm font-medium text-slate-800 group-hover:text-[#F97316] transition-colors">{action.label}</p>
              <p className="text-xs text-slate-400 mt-1">{action.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Tab: Billing ──────────────────────────────────────

function BillingTab({ account, transactions, plans }: { account: BillingAccount | null; transactions: Transaction[]; plans: Plan[] }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Balance</p>
          <p className="text-3xl font-bold text-[#F97316]">{formatCents(account?.balanceCents ?? 0)}</p>
        </div>
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Plan</p>
          <p className="text-3xl font-bold text-slate-800">{account?.plan ?? "Free"}</p>
        </div>
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tokens Used</p>
          <p className="text-3xl font-bold text-[#8B5CF6]">{formatNumber(account?.totalTokensUsed ?? 0)}</p>
        </div>
      </div>

      {plans.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Available Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div key={plan.id} className={`p-6 rounded-xl border ${account?.plan === plan.name ? "border-[#F97316] bg-orange-50" : "border-slate-200 bg-white"} shadow-md`}>
                <h4 className="font-semibold text-slate-800">{plan.name}</h4>
                <p className="text-2xl font-bold text-slate-800 mt-2">
                  {plan.priceCents === 0 ? "Free" : `${formatCents(plan.priceCents)}/mo`}
                </p>
                <p className="text-xs text-slate-500 mt-1">{formatNumber(plan.tokensMonthly)} tokens/month</p>
                {account?.plan !== plan.name && (
                  <button
                    onClick={() => changePlan(plan.id)}
                    className="mt-4 w-full py-2 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#ea580c] transition-colors"
                  >
                    Switch to {plan.name}
                  </button>
                )}
                {account?.plan === plan.name && (
                  <p className="mt-4 text-center text-xs text-[#F97316] font-medium">Current Plan</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <TerminalWindow title="Transaction History">
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0f172a] border border-slate-700">
                <div>
                  <p className="text-sm text-white">{tx.description || tx.type}</p>
                  <p className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-sm font-mono font-medium ${tx.amountCents >= 0 ? "text-[#22c55e]" : "text-red-400"}`}>
                  {tx.amountCents >= 0 ? "+" : ""}{formatCents(tx.amountCents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </TerminalWindow>
    </>
  );
}

// ── Tab: API Keys ─────────────────────────────────────

function ApiKeysTab({ apiKeys, onRefresh }: { apiKeys: ApiKeyItem[]; onRefresh: () => void }) {
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await createApiKey(newKeyName.trim());
      setCreatedKey(result.key || result.apiKey || result.rawKey);
      setNewKeyName("");
      onRefresh();
    } catch {
      alert("Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key?")) return;
    try {
      await revokeApiKey(id);
      onRefresh();
    } catch {
      alert("Failed to revoke API key");
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="mb-6 p-6 rounded-xl bg-white border border-slate-200 shadow-md">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Create New API Key</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. my-app)"
            className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] focus:border-transparent"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
            className="px-6 py-2 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#ea580c] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create
          </button>
        </div>

        {createdKey && (
          <div className="mt-4 p-4 rounded-lg bg-[#0f172a] border border-[#F97316]/30">
            <p className="text-xs text-[#F97316] mb-2 font-medium">Copy this key now — it won't be shown again:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-white font-mono break-all">{createdKey}</code>
              <button onClick={() => copyKey(createdKey)} className="text-slate-400 hover:text-[#F97316] transition-colors flex-shrink-0">
                {copied ? <Check className="w-4 h-4 text-[#22c55e]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      <TerminalWindow title="Your API Keys">
        {apiKeys.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No API keys created yet</p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0f172a] border border-slate-700">
                <div>
                  <p className="text-sm text-white font-medium">{key.name}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    {key.prefix}... &bull; Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.expiresAt && ` &bull; Expires ${new Date(key.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => handleRevoke(key.id)} className="p-2 rounded-lg hover:bg-red-900/30 transition-colors" title="Revoke">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </TerminalWindow>
    </>
  );
}

// ── Tab: Downloads ────────────────────────────────────

function DownloadsTab() {
  return (
    <div className="space-y-6">
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md">
        <div className="flex items-center gap-3 mb-4">
          <Terminal className="w-6 h-6 text-[#F97316]" />
          <h3 className="text-lg font-semibold text-slate-800">Terminal CLI</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">AI coding agent for your terminal. Supports macOS, Linux, and Windows.</p>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-4">
          <p className="text-xs text-slate-500 font-mono mb-2">macOS / Linux</p>
          <code className="text-sm text-slate-800 font-mono">curl -fsSL https://wabisabi.dev/install.sh | bash</code>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-4">
          <p className="text-xs text-slate-500 font-mono mb-2">Windows (PowerShell)</p>
          <code className="text-sm text-slate-800 font-mono">iwr https://wabisabi.dev/install.ps1 -useb | iex</code>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-xs text-slate-500 font-mono mb-2">npm (all platforms)</p>
          <code className="text-sm text-slate-800 font-mono">npm install -g @wabisabi/cli</code>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md">
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="w-6 h-6 text-[#8B5CF6]" />
          <h3 className="text-lg font-semibold text-slate-800">VS Code Extension</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">AI chat sidebar, inline completions, and task tracking inside VS Code.</p>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-4">
          <code className="text-sm text-slate-800 font-mono">ext install wabisabi.wabisabi-ai</code>
        </div>
        <a
          href="https://marketplace.visualstudio.com/items?itemName=wabisabi.wabisabi-ai"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#8B5CF6] text-white text-sm font-medium hover:bg-[#7c3aed] transition-colors"
        >
          <Monitor className="w-4 h-4" />
          Open in Marketplace
        </a>
      </div>
    </div>
  );
}

// ── Tab: Account ──────────────────────────────────────

function AccountTab({ user }: { user: UserProfile | null }) {
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-md">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Profile</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Email</label>
            <p className="text-sm text-slate-800 mt-1">{user?.email ?? "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Name</label>
            <p className="text-sm text-slate-800 mt-1">{user?.name ?? "—"}</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Role</label>
            <p className="text-sm text-slate-800 mt-1 capitalize">{user?.role ?? "user"}</p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-white border border-red-200 shadow-md">
        <h3 className="text-lg font-semibold text-red-600 mb-2">Sign Out</h3>
        <p className="text-sm text-slate-500 mb-4">Sign out of your WabiSabi account on this device.</p>
        <button
          onClick={handleLogout}
          className="px-6 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabId) || "overview";

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  // Data state
  const [user, setUser] = useState<UserProfile | null>(null);
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [usage, setUsage] = useState<UsageDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRes, accountRes, modelsRes] = await Promise.all([
        getMe().catch(() => null),
        getBillingAccount().catch(() => null),
        listModels().catch(() => ({ data: [] })),
      ]);

      if (userRes) setUser(userRes);
      if (accountRes) setAccount(accountRes);
      setModels(Array.isArray(modelsRes) ? modelsRes : modelsRes?.data ?? []);

      // Fetch secondary data in parallel
      const [usageRes, txRes, plansRes, keysRes] = await Promise.all([
        getBillingUsage(7).catch(() => []),
        getBillingTransactions(20).catch(() => []),
        getBillingPlans().catch(() => []),
        listApiKeys().catch(() => []),
      ]);

      setUsage(Array.isArray(usageRes) ? usageRes : usageRes?.data ?? []);
      setTransactions(Array.isArray(txRes) ? txRes : txRes?.data ?? []);
      setPlans(Array.isArray(plansRes) ? plansRes : plansRes?.data ?? []);
      setApiKeys(Array.isArray(keysRes) ? keysRes : keysRes?.data ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString("en-US", { hour12: false }));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshKeys = async () => {
    const res = await listApiKeys().catch(() => []);
    setApiKeys(Array.isArray(res) ? res : res?.data ?? []);
  };

  const initials = user?.name ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : user?.email?.slice(0, 2).toUpperCase() ?? "WS";

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#1e293b] border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FriendlyBot size="sm" />
            <span className="font-bold text-white">Wabi-Sabi</span>
          </div>
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">
            <Menu className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 bottom-0 z-40 bg-[#1e293b] border-r border-slate-700 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-20"} ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-700">
            <Link href="/" className="flex items-center gap-3">
              <FriendlyBot size="md" />
              {sidebarOpen && <span className="font-bold text-white">Wabi-Sabi</span>}
            </Link>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {sidebarOpen && <p className="text-xs font-medium text-slate-500 uppercase mb-3 font-mono">Dashboard</p>}
            {tabs.map((item) => (
              <Link
                key={item.id}
                href={item.id === "overview" ? "/dashboard" : `/dashboard?tab=${item.id}`}
                className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors group ${!sidebarOpen ? "justify-center" : ""} ${activeTab === item.id ? "bg-slate-700 text-white" : "hover:bg-slate-700 text-slate-400"}`}
              >
                <item.icon className={`w-4 h-4 ${activeTab === item.id ? "text-[#F97316]" : "text-slate-400 group-hover:text-[#F97316]"}`} />
                {sidebarOpen && (
                  <span className={`text-sm ${activeTab === item.id ? "text-white font-medium" : "text-slate-300 group-hover:text-white"}`}>{item.label}</span>
                )}
              </Link>
            ))}

            {sidebarOpen && (
              <>
                <div className="my-4 border-t border-slate-700" />
                <p className="text-xs font-medium text-slate-500 uppercase mb-3 font-mono">Quick Links</p>
              </>
            )}
            <a href="/#install" className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700 transition-colors group ${!sidebarOpen ? "justify-center" : ""}`}>
              <Terminal className="w-4 h-4 text-slate-400 group-hover:text-[#F97316]" />
              {sidebarOpen && <span className="text-sm text-slate-300 group-hover:text-white">Download CLI</span>}
            </a>
            <a href="https://marketplace.visualstudio.com/items?itemName=wabisabi.wabisabi-ai" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-700 transition-colors group ${!sidebarOpen ? "justify-center" : ""}`}>
              <Monitor className="w-4 h-4 text-slate-400 group-hover:text-[#8B5CF6]" />
              {sidebarOpen && <span className="text-sm text-slate-300 group-hover:text-white">VS Code Extension</span>}
            </a>
          </nav>

          <div className="p-4 border-t border-slate-700">
            <div className={`flex items-center gap-3 ${!sidebarOpen ? "justify-center" : ""}`}>
              <div className="w-8 h-8 rounded-lg bg-[#F97316] flex items-center justify-center text-white font-mono text-sm font-bold">{initials}</div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{user?.name || user?.email || "..."}</p>
                  <p className="text-xs text-slate-500">{account?.plan ?? "Free"} Plan</p>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <div className="flex gap-2 mt-4">
                <Link href="/dashboard?tab=account" className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Settings</span>
                </Link>
                <button onClick={() => { logout(); router.push("/login"); }} className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-red-900/50 transition-colors flex items-center justify-center gap-2">
                  <LogOut className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-300">Sign Out</span>
                </button>
              </div>
            )}
          </div>

          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1e293b] border border-slate-600 shadow-md items-center justify-center hover:bg-slate-700 transition-colors">
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </aside>

      {mobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

      {/* Main Content */}
      <main className={`pt-16 lg:pt-0 min-h-screen transition-all duration-300 ${sidebarOpen ? "lg:ml-64" : "lg:ml-20"}`}>
        <div className="p-6 lg:p-8">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-400 font-mono">{currentTime}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">
              Welcome back, <span className="text-[#F97316]">{user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "..."}</span>
            </h1>
            <p className="text-slate-500 mt-1 font-mono text-sm">
              {account?.plan ?? "Free"} Plan &bull; {formatCents(account?.balanceCents ?? 0)} credits remaining
            </p>
          </div>

          {error && <div className="mb-6"><ErrorBanner message={error} onRetry={fetchData} /></div>}

          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {activeTab === "overview" && <OverviewTab account={account} models={models} usage={usage} />}
              {activeTab === "billing" && <BillingTab account={account} transactions={transactions} plans={plans} />}
              {activeTab === "keys" && <ApiKeysTab apiKeys={apiKeys} onRefresh={refreshKeys} />}
              {activeTab === "downloads" && <DownloadsTab />}
              {activeTab === "account" && <AccountTab user={user} />}
            </>
          )}
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
            <RefreshCw className="w-6 h-6 text-[#F97316] animate-spin" />
            <span className="text-slate-400 font-mono">Loading...</span>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
