/**
 * 🔒 WabiSabi Privacy Manager
 *
 * Manages privacy levels and audit functionality.
 */

export enum PrivacyLevel {
  LEVEL_1_LOCAL_ONLY = "LEVEL_1_LOCAL_ONLY",
  LEVEL_2_HYBRID = "LEVEL_2_HYBRID",
  LEVEL_3_SEMI_REMOTE = "LEVEL_3_SEMI_REMOTE",
  LEVEL_4_FULL_REMOTE = "LEVEL_4_FULL_REMOTE",
}

export interface PrivacyConfig {
  level: PrivacyLevel;
  allowNetwork: boolean;
  allowRemoteModels: boolean;
  allowExternalSkills: boolean;
  allowTelemetry: boolean;
  localModels: string[];
  remoteFallback: string[];
  auditEnabled: boolean;
}

export interface AuditResult {
  level: PrivacyLevel;
  score: number;
  violations: string[];
  recommendations: string[];
  timestamp: Date;
}

// Privacy configurations for each level
export const PRIVACY_CONFIGS: Record<PrivacyLevel, PrivacyConfig> = {
  [PrivacyLevel.LEVEL_1_LOCAL_ONLY]: {
    level: PrivacyLevel.LEVEL_1_LOCAL_ONLY,
    allowNetwork: false,
    allowRemoteModels: false,
    allowExternalSkills: false,
    allowTelemetry: false,
    localModels: ["llama3.2", "codellama", "mistral", "deepseek-coder"],
    remoteFallback: [],
    auditEnabled: true,
  },
  [PrivacyLevel.LEVEL_2_HYBRID]: {
    level: PrivacyLevel.LEVEL_2_HYBRID,
    allowNetwork: true,
    allowRemoteModels: true,
    allowExternalSkills: false,
    allowTelemetry: false,
    localModels: ["llama3.2", "codellama"],
    remoteFallback: ["substratum:localhost"],
    auditEnabled: true,
  },
  [PrivacyLevel.LEVEL_3_SEMI_REMOTE]: {
    level: PrivacyLevel.LEVEL_3_SEMI_REMOTE,
    allowNetwork: true,
    allowRemoteModels: true,
    allowExternalSkills: true,
    allowTelemetry: true,
    localModels: ["llama3.2"],
    remoteFallback: ["substratum:localhost", "openai", "anthropic"],
    auditEnabled: true,
  },
  [PrivacyLevel.LEVEL_4_FULL_REMOTE]: {
    level: PrivacyLevel.LEVEL_4_FULL_REMOTE,
    allowNetwork: true,
    allowRemoteModels: true,
    allowExternalSkills: true,
    allowTelemetry: true,
    localModels: [],
    remoteFallback: ["any"],
    auditEnabled: false,
  },
};

export class PrivacyManager {
  private config: PrivacyConfig;
  private auditLog: AuditResult[] = [];

  constructor(level: PrivacyLevel = PrivacyLevel.LEVEL_2_HYBRID) {
    this.config = { ...PRIVACY_CONFIGS[level] };
  }

  /**
   * 📊 Get current configuration
   */
  getConfig(): PrivacyConfig {
    return { ...this.config };
  }

  /**
   * 🔄 Change privacy level
   */
  setLevel(level: PrivacyLevel): void {
    this.config = { ...PRIVACY_CONFIGS[level] };
    console.log(`🔒 Privacy level set to: ${level}`);
  }

  /**
   * 📈 Get current level
   */
  getLevel(): PrivacyLevel {
    return this.config.level;
  }

  /**
   * 🔍 Check if an action is allowed
   */
  isAllowed(
    action: "network" | "remoteModel" | "externalSkill" | "telemetry",
  ): boolean {
    switch (action) {
      case "network":
        return this.config.allowNetwork;
      case "remoteModel":
        return this.config.allowRemoteModels;
      case "externalSkill":
        return this.config.allowExternalSkills;
      case "telemetry":
        return this.config.allowTelemetry;
    }
  }

  /**
   * ✅ Audit current configuration
   */
  audit(): AuditResult {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Check remote fallback
    if (
      this.config.allowRemoteModels &&
      this.config.remoteFallback.includes("any")
    ) {
      violations.push('Using "any" as remote fallback is not recommended');
      recommendations.push("Consider using specific model providers");
    }

    // Check telemetry
    if (this.config.allowTelemetry) {
      recommendations.push(
        "Telemetry is enabled - review privacy implications",
      );
    }

    // Check external skills
    if (this.config.allowExternalSkills) {
      recommendations.push("External skills may access external services");
    }

    // Calculate score
    const score = Math.max(
      0,
      100 - violations.length * 20 - recommendations.length * 5,
    );

    const result: AuditResult = {
      level: this.config.level,
      score,
      violations,
      recommendations,
      timestamp: new Date(),
    };

    this.auditLog.push(result);
    return result;
  }

  /**
   * 📋 Print audit result
   */
  printAudit(result: AuditResult): void {
    console.log("\n🔒 Privacy Audit Report");
    console.log("═".repeat(40));
    console.log(`Level: ${result.level}`);
    console.log(`Score: ${result.score}/100`);

    if (result.violations.length > 0) {
      console.log("\n❌ Violations:");
      result.violations.forEach((v) => console.log(`  - ${v}`));
    }

    if (result.recommendations.length > 0) {
      console.log("\n⚠️ Recommendations:");
      result.recommendations.forEach((r) => console.log(`  - ${r}`));
    }

    console.log(`\nTimestamp: ${result.timestamp.toISOString()}`);
  }

  /**
   * 📜 Get audit history
   */
  getAuditLog(): AuditResult[] {
    return [...this.auditLog];
  }

  /**
   * 💾 Export configuration
   */
  export(): object {
    return {
      config: this.config,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * 📥 Import configuration
   */
  import(data: Partial<PrivacyConfig>): void {
    this.config = { ...this.config, ...data };
    console.log("📥 Privacy configuration imported");
  }

  /**
   * 🎨 Format for display
   */
  formatDisplay(): string {
    const levelLabels: Record<PrivacyLevel, string> = {
      [PrivacyLevel.LEVEL_1_LOCAL_ONLY]: "🛡️ LOCAL ONLY",
      [PrivacyLevel.LEVEL_2_HYBRID]: "🔶 HYBRID",
      [PrivacyLevel.LEVEL_3_SEMI_REMOTE]: "🔷 SEMI-REMOTE",
      [PrivacyLevel.LEVEL_4_FULL_REMOTE]: "🔴 FULL REMOTE",
    };

    return levelLabels[this.config.level];
  }
}

// Singleton instance
export const privacyManager = new PrivacyManager();
