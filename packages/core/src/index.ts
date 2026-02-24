/**
 * @wabisabi/core
 *
 * Shared core package for the WabiSabi AI coding agent ecosystem.
 * Provides stable type definitions and constants consumed by:
 *   - @wabisabi/terminal  (CLI)
 *   - @wabisabi/vscode    (VS Code extension)
 */

export type {
  ToolResult,
  ToolContext,
  AgentType,
  AgentInfo,
  OllamaNode,
  OllamaProviderConfig,
  SubstratumProviderConfig,
  ProvidersConfig,
  AuthProvider,
  AuthConfig,
  PaletteSection,
  PaletteItem,
  PaletteResult,
} from "./types.js";

export {
  WABISABI_DIR,
  CONFIG_FILE,
  ONBOARDING_MARKER,
  WEB_URL,
  REGISTER_URL,
  LOGIN_URL,
  SUBSTRATUM_API_URL,
  DEFAULT_MODEL,
  PROVIDER_STRATEGIES,
} from "./constants.js";

export type { ProviderStrategy } from "./constants.js";
