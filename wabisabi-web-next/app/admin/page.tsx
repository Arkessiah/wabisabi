"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FriendlyBot } from "@/components/ui/logo";

interface Stats {
  totalUsers: number;
  activeUsers24h: number;
  totalProjects: number;
  totalAgents: number;
  errors24h: number;
  uptime: number;
}

interface Node {
  id: string;
  name: string;
  status: "online" | "offline" | "degraded";
  cpu: number;
  memory: number;
  load: number;
  lastChecked: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLogin: string;
}

const tabs = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "nodes", label: "Nodes", icon: "🖥️" },
  { id: "users", label: "Users", icon: "👥" },
  { id: "models", label: "Models", icon: "🤖" },
  { id: "system", label: "System", icon: "⚙️" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeUsers24h: 0,
    totalProjects: 0,
    totalAgents: 0,
    errors24h: 0,
    uptime: 99.9,
  });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const endpoints = [
        { url: "/api/admin/stats", key: "stats" },
        { url: "/api/admin/servers", key: "servers" },
        { url: "/api/admin/users?limit=10", key: "users" },
      ];

      const results: Record<string, any> = {};

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint.url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });

          if (res.status === 401 || res.status === 403) {
            router.push("/login");
            return;
          }

          if (res.ok) {
            results[endpoint.key] = await res.json();
          }
        } catch (err) {
          console.warn(`Failed to fetch ${endpoint.key}:`, err);
        }
      }

      if (results.stats) setStats(results.stats);
      if (results.servers?.servers) setNodes(results.servers.servers);
      if (results.users?.users) setUsers(results.users.users);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#6366f1] mx-auto mb-4" />
          <p className="text-slate-500">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FriendlyBot size="md" />
              <h1 className="text-xl font-bold text-[#1e293b]">
                Admin Console
              </h1>
              <span className="text-slate-400">|</span>
              <span className="text-sm text-slate-500">
                Platform Administration
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link
                href="/dashboard"
                className="text-slate-600 hover:text-[#1e293b] transition-colors text-sm font-medium"
              >
                User Dashboard
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem("auth_token");
                  router.push("/login");
                }}
                className="text-slate-600 hover:text-[#1e293b] transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-20">
        <div className="flex">
          <aside className="w-64 min-h-[calc(100vh-5rem)] border-r border-slate-200 p-4 bg-white">
            <ul className="space-y-1">
              {tabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                      activeTab === tab.id
                        ? "bg-[#6366f1]/10 text-[#6366f1] font-medium"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="flex-1 p-8">
            {activeTab === "overview" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-[#1e293b] mb-2">
                    Platform Overview
                  </h2>
                  <p className="text-slate-500">
                    Real-time metrics and system status
                  </p>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  {[
                    {
                      label: "Total Users",
                      value: stats.totalUsers,
                      icon: "👥",
                      gradient:
                        "from-blue-500/20 to-blue-600/20 border-blue-500/20",
                    },
                    {
                      label: "Active (24h)",
                      value: stats.activeUsers24h,
                      icon: "🟢",
                      gradient:
                        "from-green-500/20 to-green-600/20 border-green-500/20",
                    },
                    {
                      label: "Projects",
                      value: stats.totalProjects,
                      icon: "📁",
                      gradient:
                        "from-purple-500/20 to-purple-600/20 border-purple-500/20",
                    },
                    {
                      label: "Agents",
                      value: stats.totalAgents,
                      icon: "🤖",
                      gradient:
                        "from-orange-500/20 to-orange-600/20 border-orange-500/20",
                    },
                    {
                      label: "Errors (24h)",
                      value: stats.errors24h,
                      icon: "❌",
                      gradient:
                        "from-red-500/20 to-red-600/20 border-red-500/20",
                    },
                    {
                      label: "Uptime",
                      value: `${stats.uptime}%`,
                      icon: "⚡",
                      gradient:
                        "from-violet-500/20 to-violet-600/20 border-violet-500/20",
                    },
                  ].map((stat, idx) => (
                    <div
                      key={idx}
                      className={`p-5 rounded-2xl bg-white shadow-md border ${stat.gradient}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl">{stat.icon}</span>
                      </div>
                      <p className="text-sm text-slate-500">{stat.label}</p>
                      <p className="text-2xl font-bold text-[#1e293b] mt-1">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl bg-white shadow-md border border-slate-200">
                    <h3 className="text-lg font-semibold text-[#1e293b] mb-4">
                      System Health
                    </h3>
                    <div className="space-y-3">
                      {nodes.slice(0, 5).map((node) => (
                        <NodeHealth key={node.id} node={node} />
                      ))}
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-white shadow-md border border-slate-200">
                    <h3 className="text-lg font-semibold text-[#1e293b] mb-4">
                      Recent Users
                    </h3>
                    <div className="space-y-3">
                      {users.slice(0, 5).map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-medium">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-[#1e293b]">
                                {user.name}
                              </p>
                              <p className="text-sm text-slate-500">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 text-xs rounded-full ${
                              user.status === "active"
                                ? "bg-[#22c55e]/10 text-[#22c55e]"
                                : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {user.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "nodes" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#1e293b] mb-2">
                    Node Management
                  </h2>
                  <p className="text-slate-500">
                    Monitor and manage cluster nodes
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {nodes.map((node) => (
                    <div
                      key={node.id}
                      className="p-6 rounded-2xl bg-white shadow-md border border-slate-200"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                            <svg
                              className="w-5 h-5 text-slate-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                              />
                            </svg>
                          </div>
                          <h3 className="font-semibold text-[#1e293b]">
                            {node.name}
                          </h3>
                        </div>
                        <span
                          className={`px-3 py-1 text-xs rounded-full ${
                            node.status === "online"
                              ? "bg-[#22c55e]/10 text-[#22c55e]"
                              : node.status === "degraded"
                                ? "bg-yellow-500/10 text-yellow-500"
                                : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          {node.status}
                        </span>
                      </div>
                      <div className="space-y-3">
                        <MetricBar
                          label="CPU"
                          value={node.cpu}
                          gradient="from-[#6366f1] to-[#8b5cf6]"
                        />
                        <MetricBar
                          label="Memory"
                          value={node.memory}
                          gradient="from-purple-500 to-pink-500"
                        />
                        <MetricBar
                          label="Load"
                          value={node.load}
                          gradient="from-orange-500 to-red-500"
                        />
                      </div>
                      <p className="text-sm text-slate-500 mt-4">
                        Last checked:{" "}
                        {new Date(node.lastChecked).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#1e293b] mb-2">
                    User Management
                  </h2>
                  <p className="text-slate-500">
                    Manage platform users and permissions
                  </p>
                </div>
                <div className="rounded-2xl bg-white shadow-md border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-500">
                          User
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-500">
                          Email
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-500">
                          Role
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-500">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-500">
                          Last Login
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white text-sm font-medium">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-[#1e293b]">
                                {user.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {user.email}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 text-xs bg-[#6366f1]/10 text-[#6366f1] rounded-full">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-3 py-1 text-xs rounded-full ${
                                user.status === "active"
                                  ? "bg-[#22c55e]/10 text-[#22c55e]"
                                  : "bg-red-500/10 text-red-500"
                              }`}
                            >
                              {user.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {new Date(user.lastLogin).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <button className="text-[#6366f1] hover:text-[#4f46e5] text-sm font-medium transition-colors">
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "models" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#1e293b] mb-2">
                    Model Management
                  </h2>
                  <p className="text-slate-500">
                    Configure AI models and orchestration
                  </p>
                </div>
                <div className="p-12 rounded-2xl bg-white shadow-md border border-slate-200 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#6366f1]/20 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-[#6366f1]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      />
                    </svg>
                  </div>
                  <p className="text-slate-500">
                    Model management interface coming soon...
                  </p>
                </div>
              </div>
            )}

            {activeTab === "system" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-[#1e293b] mb-2">
                    System Configuration
                  </h2>
                  <p className="text-slate-500">
                    Platform settings and security options
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl bg-white shadow-md border border-slate-200">
                    <h3 className="text-lg font-semibold text-[#1e293b] mb-4">
                      General Settings
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Platform Name
                        </label>
                        <input
                          type="text"
                          defaultValue="2BrainDevCore"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#1e293b] placeholder-slate-400 focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                          />
                          <span className="text-sm text-slate-600">
                            Enable maintenance mode
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-white shadow-md border border-slate-200">
                    <h3 className="text-lg font-semibold text-[#1e293b] mb-4">
                      Security
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          JWT Secret
                        </label>
                        <input
                          type="password"
                          defaultValue="••••••••••••"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#1e293b] placeholder-slate-400 focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-600 mb-2">
                          Session Timeout (minutes)
                        </label>
                        <input
                          type="number"
                          defaultValue="15"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#1e293b] placeholder-slate-400 focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function NodeHealth({ node }: { node: Node }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
            />
          </svg>
        </div>
        <div>
          <p className="font-medium text-[#1e293b]">{node.name}</p>
          <p className="text-sm text-slate-500">Load: {node.load}%</p>
        </div>
      </div>
      <span
        className={`px-3 py-1 text-xs rounded-full ${
          node.status === "online"
            ? "bg-[#22c55e]/10 text-[#22c55e]"
            : node.status === "degraded"
              ? "bg-yellow-500/10 text-yellow-500"
              : "bg-red-500/10 text-red-500"
        }`}
      >
        {node.status}
      </span>
    </div>
  );
}

function MetricBar({
  label,
  value,
  gradient,
}: {
  label: string;
  value: number;
  gradient: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-slate-500">{label}</span>
        <span className="text-[#1e293b]">{value}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${gradient} transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
