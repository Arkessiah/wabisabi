/**
 * Ollama Cluster - Load Balancer with Health Checks & Circuit Breaker
 *
 * Manages multiple Ollama nodes (local, remote, mixed GPU types).
 * Ollama has no native clustering, so we implement:
 *   - Periodic health checks (GET /api/tags)
 *   - Circuit breaker (3 consecutive failures → disable 60s)
 *   - Weighted round-robin (priority-based selection)
 *   - Automatic model discovery per node
 */

import type { OllamaNode } from "../config/schema.js";

// ── Constants ──────────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 60_000;

// ── Types ──────────────────────────────────────────────────────

interface NodeState {
  node: OllamaNode;
  healthy: boolean;
  consecutiveFailures: number;
  lastCheck: number;
  lastUsed: number;
  availableModels: string[];
  disabledUntil: number;
}

export interface ClusterNodeStatus {
  name: string;
  url: string;
  healthy: boolean;
  models: string[];
  gpu?: string;
  priority: number;
  disabled: boolean;
}

// ── OllamaCluster ──────────────────────────────────────────────

export class OllamaCluster {
  private nodes: Map<string, NodeState> = new Map();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private roundRobinIndex = 0;

  constructor(nodes: OllamaNode[]) {
    for (const node of nodes) {
      this.nodes.set(node.name, {
        node,
        healthy: false,
        consecutiveFailures: 0,
        lastCheck: 0,
        lastUsed: 0,
        availableModels: [],
        disabledUntil: 0,
      });
    }
  }

  // ── Health Checks ────────────────────────────────────────────

  startHealthChecks(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.checkAllNodes().catch(() => {});
    }, HEALTH_CHECK_INTERVAL_MS);
    // Don't prevent process exit
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async checkNode(state: NodeState): Promise<boolean> {
    const now = Date.now();

    // Skip if circuit breaker is active
    if (state.disabledUntil > now) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

      const res = await fetch(`${state.node.url}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        state.healthy = true;
        state.consecutiveFailures = 0;
        state.lastCheck = now;
        state.availableModels = (data.models || []).map((m) => m.name);
        return true;
      }
    } catch {
      // Connection failed or timed out
    }

    state.healthy = false;
    state.consecutiveFailures++;
    state.lastCheck = now;

    if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      state.disabledUntil = now + CIRCUIT_BREAKER_RESET_MS;
    }

    return false;
  }

  async checkAllNodes(): Promise<void> {
    const checks = [...this.nodes.values()].map((state) => this.checkNode(state));
    await Promise.allSettled(checks);
  }

  // ── Node Selection ───────────────────────────────────────────

  getActiveNode(): OllamaNode | null {
    const now = Date.now();
    const candidates = [...this.nodes.values()]
      .filter((s) => s.healthy && s.disabledUntil < now)
      .sort((a, b) => b.node.priority - a.node.priority);

    if (candidates.length === 0) return null;

    // Round-robin among highest-priority candidates
    const topPriority = candidates[0].node.priority;
    const topCandidates = candidates.filter((c) => c.node.priority === topPriority);
    const selected = topCandidates[this.roundRobinIndex % topCandidates.length];
    this.roundRobinIndex++;
    selected.lastUsed = now;
    return selected.node;
  }

  hasHealthyNodes(): boolean {
    const now = Date.now();
    return [...this.nodes.values()].some((s) => s.healthy && s.disabledUntil < now);
  }

  // ── Failure Reporting ────────────────────────────────────────

  reportFailure(nodeName: string): void {
    const state = this.nodes.get(nodeName);
    if (!state) return;

    state.consecutiveFailures++;
    if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      state.healthy = false;
      state.disabledUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
    }
  }

  reportSuccess(nodeName: string): void {
    const state = this.nodes.get(nodeName);
    if (!state) return;

    state.healthy = true;
    state.consecutiveFailures = 0;
    state.disabledUntil = 0;
  }

  // ── Model Discovery ──────────────────────────────────────────

  getAllModels(): string[] {
    const models = new Set<string>();
    for (const state of this.nodes.values()) {
      if (state.healthy) {
        for (const model of state.availableModels) {
          models.add(model);
        }
      }
    }
    return [...models];
  }

  // ── Node Management ──────────────────────────────────────────

  addNode(node: OllamaNode): void {
    if (this.nodes.has(node.name)) return;
    this.nodes.set(node.name, {
      node,
      healthy: false,
      consecutiveFailures: 0,
      lastCheck: 0,
      lastUsed: 0,
      availableModels: [],
      disabledUntil: 0,
    });
  }

  removeNode(name: string): void {
    this.nodes.delete(name);
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  // ── Status ───────────────────────────────────────────────────

  getStatus(): ClusterNodeStatus[] {
    const now = Date.now();
    return [...this.nodes.values()].map((s) => ({
      name: s.node.name,
      url: s.node.url,
      healthy: s.healthy,
      models: [...s.availableModels],
      gpu: s.node.gpu,
      priority: s.node.priority,
      disabled: s.disabledUntil > now,
    }));
  }

  // ── Cleanup ──────────────────────────────────────────────────

  destroy(): void {
    this.stopHealthChecks();
    this.nodes.clear();
  }
}
