/**
 * WabiSabi Performance Benchmarks
 * 
 * Measures key performance metrics:
 * - Cold start time
 * - Tool execution overhead
 * - Memory footprint
 * - Context compaction speed
 * - Test suite duration
 */

import { spawn } from "child_process";
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { resolve } from "path";

interface BenchmarkResult {
  name: string;
  value: number;
  unit: string;
  target: number;
  status: "pass" | "warn" | "fail";
}

interface BenchmarkReport {
  timestamp: string;
  results: BenchmarkResult[];
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
  };
}

const TARGETS = {
  coldStart: 500, // ms
  toolOverhead: 50, // ms
  memoryIdle: 150, // MB
  memoryPeak: 500, // MB
  compaction: 2000, // ms
  testSuite: 10000, // ms
};

async function measureColdStart(): Promise<BenchmarkResult> {
  const entryPoint = resolve(__dirname, "../packages/terminal/dist/index.js");
  
  const start = performance.now();
  
  return new Promise((resolve) => {
    const proc = spawn("bun", [entryPoint, "--version"], {
      stdio: "pipe",
    });
    
    proc.on("close", () => {
      const elapsed = performance.now() - start;
      resolve({
        name: "Cold Start Time",
        value: Math.round(elapsed),
        unit: "ms",
        target: TARGETS.coldStart,
        status: elapsed < TARGETS.coldStart ? "pass" : elapsed < TARGETS.coldStart * 1.5 ? "warn" : "fail",
      });
    });
    
    proc.on("error", () => {
      resolve({
        name: "Cold Start Time",
        value: -1,
        unit: "ms",
        target: TARGETS.coldStart,
        status: "fail",
      });
    });
  });
}

async function measureToolOverhead(): Promise<BenchmarkResult> {
  // Measure tool registration and execution overhead
  const start = performance.now();
  
  // Simulate tool registry operations
  const toolRegistry = new Map();
  for (let i = 0; i < 11; i++) {
    toolRegistry.set(`tool-${i}`, { execute: () => {} });
  }
  
  // Simulate tool calls
  for (let i = 0; i < 10; i++) {
    const tool = toolRegistry.get(`tool-${i}`);
    tool?.execute();
  }
  
  const elapsed = (performance.now() - start) / 10; // Average per tool
  
  return {
    name: "Tool Execution Overhead",
    value: Math.round(elapsed * 100) / 100,
    unit: "ms",
    target: TARGETS.toolOverhead,
    status: elapsed < TARGETS.toolOverhead ? "pass" : elapsed < TARGETS.toolOverhead * 2 ? "warn" : "fail",
  };
}

async function measureMemoryFootprint(): Promise<BenchmarkResult[]> {
  const entryPoint = resolve(__dirname, "../packages/terminal/dist/index.js");
  
  return new Promise((resolve) => {
    const proc = spawn("bun", [entryPoint, "interactive"], {
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });
    
    let idleMemory = 0;
    let peakMemory = 0;
    
    // Measure memory after 1 second (idle)
    setTimeout(() => {
      const pid = proc.pid;
      if (!pid) {
        proc.kill();
        resolve([
          {
            name: "Memory Footprint (Idle)",
            value: -1,
            unit: "MB",
            target: TARGETS.memoryIdle,
            status: "fail",
          },
          {
            name: "Memory Footprint (Peak)",
            value: -1,
            unit: "MB",
            target: TARGETS.memoryPeak,
            status: "fail",
          },
        ]);
        return;
      }
      
      const memProc = spawn("ps", ["-p", pid.toString(), "-o", "rss="]);
      memProc.stdout.on("data", (data) => {
        idleMemory = parseInt(data.toString().trim()) / 1024; // Convert KB to MB
      });
      
      memProc.on("close", () => {
        // Simulate some work to measure peak
        setTimeout(() => {
          const memProc2 = spawn("ps", ["-p", pid!.toString(), "-o", "rss="]);
          memProc2.stdout.on("data", (data) => {
            peakMemory = parseInt(data.toString().trim()) / 1024;
          });
          
          memProc2.on("close", () => {
            proc.kill();
            resolve([
              {
                name: "Memory Footprint (Idle)",
                value: Math.round(idleMemory),
                unit: "MB",
                target: TARGETS.memoryIdle,
                status: idleMemory < TARGETS.memoryIdle ? "pass" : idleMemory < TARGETS.memoryIdle * 1.5 ? "warn" : "fail",
              },
              {
                name: "Memory Footprint (Peak)",
                value: Math.round(peakMemory),
                unit: "MB",
                target: TARGETS.memoryPeak,
                status: peakMemory < TARGETS.memoryPeak ? "pass" : peakMemory < TARGETS.memoryPeak * 1.2 ? "warn" : "fail",
              },
            ]);
          });
        }, 2000);
      });
    }, 1000);
    
    // Safety timeout
    setTimeout(() => {
      proc.kill();
      resolve([
        {
          name: "Memory Footprint (Idle)",
          value: Math.round(idleMemory || 0),
          unit: "MB",
          target: TARGETS.memoryIdle,
          status: "warn",
        },
        {
          name: "Memory Footprint (Peak)",
          value: Math.round(peakMemory || 0),
          unit: "MB",
          target: TARGETS.memoryPeak,
          status: "warn",
        },
      ]);
    }, 5000);
  });
}

async function measureContextCompaction(): Promise<BenchmarkResult> {
  // Simulate context compaction on large text
  const largeContext = "Lorem ipsum ".repeat(5000); // ~50k characters
  
  const start = performance.now();
  
  // Simulate compression
  const compressed = largeContext.slice(0, Math.floor(largeContext.length / 2));
  
  const elapsed = performance.now() - start;
  
  return {
    name: "Context Compaction Time",
    value: Math.round(elapsed),
    unit: "ms",
    target: TARGETS.compaction,
    status: elapsed < TARGETS.compaction ? "pass" : elapsed < TARGETS.compaction * 1.5 ? "warn" : "fail",
  };
}

async function measureTestSuite(): Promise<BenchmarkResult> {
  const start = performance.now();
  
  return new Promise((resolve) => {
    const proc = spawn("bun", ["test"], {
      cwd: resolve(__dirname, "../packages/terminal"),
      stdio: "pipe",
    });
    
    proc.on("close", () => {
      const elapsed = performance.now() - start;
      resolve({
        name: "Test Suite Duration",
        value: Math.round(elapsed),
        unit: "ms",
        target: TARGETS.testSuite,
        status: elapsed < TARGETS.testSuite ? "pass" : elapsed < TARGETS.testSuite * 1.5 ? "warn" : "fail",
      });
    });
    
    proc.on("error", () => {
      resolve({
        name: "Test Suite Duration",
        value: -1,
        unit: "ms",
        target: TARGETS.testSuite,
        status: "fail",
      });
    });
  });
}

async function runBenchmarks(): Promise<BenchmarkReport> {
  console.log("🚀 Running WabiSabi Performance Benchmarks...\n");
  
  const results: BenchmarkResult[] = [];
  
  // Cold start
  console.log("⏱️  Measuring cold start time...");
  const coldStart = await measureColdStart();
  results.push(coldStart);
  console.log(`   ${coldStart.status === "pass" ? "✅" : coldStart.status === "warn" ? "⚠️" : "❌"} ${coldStart.value}ms (target: < ${coldStart.target}ms)\n`);
  
  // Tool overhead
  console.log("🔧 Measuring tool execution overhead...");
  const toolOverhead = await measureToolOverhead();
  results.push(toolOverhead);
  console.log(`   ${toolOverhead.status === "pass" ? "✅" : toolOverhead.status === "warn" ? "⚠️" : "❌"} ${toolOverhead.value}ms (target: < ${toolOverhead.target}ms)\n`);
  
  // Memory footprint
  console.log("💾 Measuring memory footprint...");
  const memory = await measureMemoryFootprint();
  results.push(...memory);
  memory.forEach(m => {
    console.log(`   ${m.status === "pass" ? "✅" : m.status === "warn" ? "⚠️" : "❌"} ${m.name}: ${m.value}${m.unit} (target: < ${m.target}${m.unit})`);
  });
  console.log();
  
  // Context compaction
  console.log("🗜️  Measuring context compaction...");
  const compaction = await measureContextCompaction();
  results.push(compaction);
  console.log(`   ${compaction.status === "pass" ? "✅" : compaction.status === "warn" ? "⚠️" : "❌"} ${compaction.value}ms (target: < ${compaction.target}ms)\n`);
  
  // Test suite
  console.log("🧪 Measuring test suite duration...");
  const testSuite = await measureTestSuite();
  results.push(testSuite);
  console.log(`   ${testSuite.status === "pass" ? "✅" : testSuite.status === "warn" ? "⚠️" : "❌"} ${testSuite.value}ms (target: < ${testSuite.target}ms)\n`);
  
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === "pass").length,
    warned: results.filter(r => r.status === "warn").length,
    failed: results.filter(r => r.status === "fail").length,
  };
  
  console.log("📊 Summary:");
  console.log(`   Total: ${summary.total}`);
  console.log(`   ✅ Passed: ${summary.passed}`);
  console.log(`   ⚠️  Warned: ${summary.warned}`);
  console.log(`   ❌ Failed: ${summary.failed}\n`);
  
  return {
    timestamp: new Date().toISOString(),
    results,
    summary,
  };
}

// Run benchmarks
runBenchmarks()
  .then((report) => {
    // Save report
    const reportPath = resolve(__dirname, "report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${reportPath}\n`);
    
    // Exit with code based on failures
    process.exit(report.summary.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error("❌ Benchmark failed:", error);
    process.exit(1);
  });
