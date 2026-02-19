/**
 * Tests for OllamaCluster - Load Balancer with Health Checks & Circuit Breaker
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { OllamaCluster } from "../clients/ollama-cluster.js";
import type { OllamaNode } from "../config/schema.js";

const makeNode = (name: string, url: string, priority = 5): OllamaNode => ({
  name,
  url,
  priority,
});

describe("OllamaCluster", () => {
  let cluster: OllamaCluster;

  beforeEach(() => {
    cluster = new OllamaCluster([
      makeNode("local", "http://localhost:11434", 5),
      makeNode("remote-gpu", "http://192.168.1.100:11434", 8),
      makeNode("cloud", "http://gpu.example.com:11434", 3),
    ]);
  });

  describe("constructor", () => {
    test("initializes with given nodes", () => {
      expect(cluster.getNodeCount()).toBe(3);
    });

    test("all nodes start as unhealthy", () => {
      const status = cluster.getStatus();
      expect(status.every((s) => !s.healthy)).toBe(true);
    });

    test("no nodes are disabled at start", () => {
      const status = cluster.getStatus();
      expect(status.every((s) => !s.disabled)).toBe(true);
    });
  });

  describe("getActiveNode", () => {
    test("returns null when no healthy nodes", () => {
      expect(cluster.getActiveNode()).toBeNull();
    });

    test("returns healthy node after reportSuccess", () => {
      cluster.reportSuccess("local");
      const node = cluster.getActiveNode();
      expect(node).not.toBeNull();
      expect(node!.name).toBe("local");
    });

    test("prefers higher priority nodes", () => {
      cluster.reportSuccess("local"); // priority 5
      cluster.reportSuccess("remote-gpu"); // priority 8
      cluster.reportSuccess("cloud"); // priority 3

      const node = cluster.getActiveNode();
      expect(node!.name).toBe("remote-gpu");
    });

    test("round-robins among same-priority nodes", () => {
      // Create cluster with two same-priority nodes
      const c = new OllamaCluster([
        makeNode("a", "http://a:11434", 5),
        makeNode("b", "http://b:11434", 5),
      ]);
      c.reportSuccess("a");
      c.reportSuccess("b");

      const first = c.getActiveNode()!.name;
      const second = c.getActiveNode()!.name;
      expect(first).not.toBe(second);
    });
  });

  describe("hasHealthyNodes", () => {
    test("returns false with no healthy nodes", () => {
      expect(cluster.hasHealthyNodes()).toBe(false);
    });

    test("returns true after reportSuccess", () => {
      cluster.reportSuccess("local");
      expect(cluster.hasHealthyNodes()).toBe(true);
    });
  });

  describe("reportFailure / circuit breaker", () => {
    test("marks node unhealthy after threshold failures", () => {
      cluster.reportSuccess("local");
      expect(cluster.getStatus().find((s) => s.name === "local")!.healthy).toBe(true);

      // 3 consecutive failures should trip the circuit breaker
      cluster.reportFailure("local");
      cluster.reportFailure("local");
      cluster.reportFailure("local");

      const status = cluster.getStatus().find((s) => s.name === "local")!;
      expect(status.healthy).toBe(false);
      expect(status.disabled).toBe(true);
    });

    test("does not disable before threshold", () => {
      cluster.reportSuccess("local");
      cluster.reportFailure("local");
      cluster.reportFailure("local");

      const status = cluster.getStatus().find((s) => s.name === "local")!;
      expect(status.disabled).toBe(false);
    });

    test("ignores unknown node names", () => {
      // Should not throw
      cluster.reportFailure("nonexistent");
      cluster.reportSuccess("nonexistent");
    });
  });

  describe("reportSuccess", () => {
    test("resets failure count and re-enables node", () => {
      // Trip circuit breaker
      cluster.reportFailure("local");
      cluster.reportFailure("local");
      cluster.reportFailure("local");

      // Reset
      cluster.reportSuccess("local");
      const status = cluster.getStatus().find((s) => s.name === "local")!;
      expect(status.healthy).toBe(true);
      expect(status.disabled).toBe(false);
    });
  });

  describe("getAllModels", () => {
    test("returns empty when no healthy nodes", () => {
      expect(cluster.getAllModels()).toEqual([]);
    });

    test("returns models from healthy nodes only", () => {
      // Since we can't set availableModels directly via public API,
      // and checkNode requires real network, we test the empty case
      cluster.reportSuccess("local");
      const models = cluster.getAllModels();
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe("addNode / removeNode", () => {
    test("adds a new node", () => {
      cluster.addNode(makeNode("new-node", "http://new:11434", 7));
      expect(cluster.getNodeCount()).toBe(4);
    });

    test("does not duplicate existing node", () => {
      cluster.addNode(makeNode("local", "http://different:11434", 9));
      expect(cluster.getNodeCount()).toBe(3);
    });

    test("removes a node", () => {
      cluster.removeNode("cloud");
      expect(cluster.getNodeCount()).toBe(2);
      expect(cluster.getStatus().find((s) => s.name === "cloud")).toBeUndefined();
    });

    test("removing nonexistent node is no-op", () => {
      cluster.removeNode("nonexistent");
      expect(cluster.getNodeCount()).toBe(3);
    });
  });

  describe("getStatus", () => {
    test("returns status for all nodes", () => {
      const status = cluster.getStatus();
      expect(status).toHaveLength(3);
      expect(status.map((s) => s.name).sort()).toEqual(["cloud", "local", "remote-gpu"]);
    });

    test("includes priority and URL", () => {
      const status = cluster.getStatus();
      const remote = status.find((s) => s.name === "remote-gpu")!;
      expect(remote.url).toBe("http://192.168.1.100:11434");
      expect(remote.priority).toBe(8);
    });
  });

  describe("health checks lifecycle", () => {
    test("startHealthChecks and stopHealthChecks without error", () => {
      cluster.startHealthChecks();
      cluster.stopHealthChecks();
    });

    test("multiple startHealthChecks is idempotent", () => {
      cluster.startHealthChecks();
      cluster.startHealthChecks();
      cluster.stopHealthChecks();
    });
  });

  describe("destroy", () => {
    test("clears all nodes and stops checks", () => {
      cluster.startHealthChecks();
      cluster.destroy();
      expect(cluster.getNodeCount()).toBe(0);
      expect(cluster.getStatus()).toEqual([]);
    });
  });
});
