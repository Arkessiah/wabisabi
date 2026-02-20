/**
 * WabiSabi Services Index
 *
 * Core services for the WabiSabi CLI.
 */

export {
  AgentSwitcher,
  AGENTS,
  agentSwitcher,
  type AgentType,
  type AgentInfo,
} from "./agent-switcher.js";
export {
  PrivacyManager,
  PrivacyLevel,
  privacyManager,
  type PrivacyConfig,
  type AuditResult,
} from "./privacy-manager.js";
export {
  MenuSystem,
  menuSystem,
  type MenuCategory,
  type MenuItem,
  type MenuState,
} from "./menu-system.js";
export {
  PluginManager,
  pluginManager,
  type PluginManifest,
  type PluginInfo,
  type PluginSource,
} from "./plugin-manager.js";

// ── New services (Phase 1) ─────────────────────────────────────

export {
  ConfigManager,
  configManager,
} from "../config/index.js";
export type {
  GlobalConfig,
  ProjectConfig,
  MergedConfig,
  ToolPermissions,
} from "../config/schema.js";

export {
  ToolRegistry,
  toolRegistry,
  defineTool,
  truncateOutput,
  addLineNumbers,
} from "../tools/index.js";
export type {
  ToolResult,
  ToolContext,
  ToolDefinition,
  ToolSpec,
} from "../tools/index.js";

export {
  ProjectContext,
  projectContext,
} from "../context/index.js";
export type { ProjectStack } from "../context/detector.js";

export {
  SessionManager,
  sessionManager,
} from "../session/index.js";
export type {
  SessionInfo,
  SessionMessage,
  SessionSummary,
} from "../session/index.js";

export {
  SoulManager,
  soulManager,
} from "../soul/index.js";
export type {
  Soul,
  UserPreferences,
} from "../soul/schema.js";

export {
  RamManager,
  ramManager,
  classifyComplexity,
  scoreMessageImportance,
} from "../ram/index.js";
export type {
  Ram,
  PinnedItem,
  DeviceProfile,
  ComplexityLevel,
} from "../ram/schema.js";

export {
  AuthManager,
  authManager,
} from "../auth/index.js";
export type {
  AuthConfig,
  AuthProvider,
  DeviceCodeResponse,
} from "../auth/schema.js";
export {
  decodeJwt,
  isExpired,
  needsRefresh,
} from "../auth/token.js";
export type { JwtPayload } from "../auth/token.js";

export {
  DatabaseManager,
  dbManager,
} from "../db/index.js";
export type {
  ConversationRecord,
  EmbeddingRecord,
  CacheRecord,
} from "../db/schema.js";

export {
  ModelRouter,
  modelRouter,
} from "../routing/index.js";

export {
  renderMarkdown,
  hasMarkdown,
} from "../rendering/index.js";

export {
  workspaceTrust,
} from "./workspace-trust.js";
