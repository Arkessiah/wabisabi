/**
 * WabiSabi Menu System
 *
 * Interactive menu style OpenCode with Ctrl+P.
 * Supports fuzzy search and keyboard navigation.
 */

import { AgentType, AGENTS, agentSwitcher } from "./agent-switcher.js";
import { PrivacyLevel, privacyManager } from "./privacy-manager.js";
import {
  THINKING_HATS,
  TECHNICAL_PROFILES,
  COMMUNICATION_STYLES,
  PROFILE_PRESETS,
  setHat,
  setProfile,
  setStyle,
  setPreset,
  resetProfile,
  getActiveProfile,
} from "../profiles/index.js";

export type MenuCategory =
  | "models"
  | "profiles"
  | "skills"
  | "plugins"
  | "privacy"
  | "settings"
  | "project";

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  checked?: boolean;
  selectable?: boolean;
  action?: () => void;
  submenu?: MenuItem[];
  category: MenuCategory;
}

export interface MenuState {
  isOpen: boolean;
  category: MenuCategory;
  searchQuery: string;
  selectedIndex: number;
  filteredItems: MenuItem[];
}

export class MenuSystem {
  private state: MenuState;
  private listeners: ((state: MenuState) => void)[] = [];
  private items: MenuItem[] = [];

  constructor() {
    this.state = {
      isOpen: false,
      category: "models",
      searchQuery: "",
      selectedIndex: 0,
      filteredItems: [],
    };
    this.initializeItems();
  }

  private initializeItems(): void {
    this.items = [
      // Models Category
      {
        id: "model-llama3.2",
        label: "llama3.2",
        description: "Default model",
        shortcut: "1",
        checked: true,
        category: "models",
        action: () => console.log("Model: llama3.2"),
      },
      {
        id: "model-codellama",
        label: "codellama",
        description: "Code-specific model",
        shortcut: "2",
        checked: false,
        category: "models",
        action: () => console.log("Model: codellama"),
      },
      {
        id: "model-mistral",
        label: "mistral",
        description: "Fast and efficient",
        shortcut: "3",
        checked: false,
        category: "models",
        action: () => console.log("Model: mistral"),
      },
      {
        id: "model-custom",
        label: "+ Add custom model",
        description: "Add a new model",
        shortcut: "4",
        category: "models",
        action: () => console.log("Add custom model..."),
      },

      // Profiles Category — Presets
      ...Object.values(PROFILE_PRESETS).map((preset, i) => ({
        id: `preset-${preset.id}`,
        label: `${preset.emoji} ${preset.name}`,
        description: preset.description,
        shortcut: String(i + 1),
        checked: false,
        category: "profiles" as MenuCategory,
        action: () => {
          setPreset(preset.id);
          this.refreshItems();
        },
      })),

      // Profiles Category — Individual Hats
      ...Object.values(THINKING_HATS).map((hat) => ({
        id: `hat-${hat.id}`,
        label: `${hat.emoji} ${hat.name}`,
        description: hat.description,
        checked: false,
        category: "profiles" as MenuCategory,
        action: () => {
          setHat(hat.id);
          this.refreshItems();
        },
      })),

      // Profiles Category — Individual Technical Profiles
      ...Object.values(TECHNICAL_PROFILES).map((prof) => ({
        id: `profile-${prof.id}`,
        label: `${prof.emoji} ${prof.name}`,
        description: prof.description,
        checked: false,
        category: "profiles" as MenuCategory,
        action: () => {
          setProfile(prof.id);
          this.refreshItems();
        },
      })),

      // Profiles Category — Styles
      ...Object.values(COMMUNICATION_STYLES).map((s) => ({
        id: `style-${s.id}`,
        label: `📝 ${s.name}`,
        description: s.description,
        checked: false,
        category: "profiles" as MenuCategory,
        action: () => {
          setStyle(s.id);
          this.refreshItems();
        },
      })),

      // Profiles Category — Reset
      {
        id: "profile-reset",
        label: "Reset All Profiles",
        description: "Clear hat, profile, and style",
        category: "profiles",
        action: () => {
          resetProfile();
          this.refreshItems();
        },
      },

      // Skills Category
      {
        id: "skill-read",
        label: "Read",
        description: "Read files from filesystem",
        shortcut: "1",
        checked: true,
        category: "skills",
        action: () => console.log("Skill Read toggled"),
      },
      {
        id: "skill-write",
        label: "Write",
        description: "Write files to filesystem",
        shortcut: "2",
        checked: true,
        category: "skills",
        action: () => console.log("Skill Write toggled"),
      },
      {
        id: "skill-bash",
        label: "Bash",
        description: "Run bash commands",
        shortcut: "3",
        checked: false,
        category: "skills",
        action: () => console.log("Skill Bash toggled"),
      },
      {
        id: "skill-grep",
        label: "Grep",
        description: "Search text in files",
        shortcut: "4",
        checked: false,
        category: "skills",
        action: () => console.log("Skill Grep toggled"),
      },

      // Plugins Category
      {
        id: "plugin-claude",
        label: "Claude Code Plugins",
        description: "Enable Claude Code plugin compatibility",
        shortcut: "1",
        checked: true,
        category: "plugins",
        action: () => console.log("Claude Code Plugins toggled"),
      },
      {
        id: "plugin-opencode",
        label: "OpenCode Plugins",
        description: "Enable OpenCode plugin compatibility",
        shortcut: "2",
        checked: false,
        category: "plugins",
        action: () => console.log("OpenCode Plugins toggled"),
      },

      // Privacy Category
      {
        id: "privacy-local",
        label: "(•) LOCAL ONLY",
        description: "100% offline, no network access",
        shortcut: "1",
        checked: true,
        category: "privacy",
        action: () => {
          privacyManager.setLevel(PrivacyLevel.LEVEL_1_LOCAL_ONLY);
          this.refreshItems();
        },
      },
      {
        id: "privacy-hybrid",
        label: "( ) HYBRID",
        description: "Local models with controlled fallback",
        shortcut: "2",
        checked: false,
        category: "privacy",
        action: () => {
          privacyManager.setLevel(PrivacyLevel.LEVEL_2_HYBRID);
          this.refreshItems();
        },
      },
      {
        id: "privacy-semi",
        label: "( ) SEMI-REMOTE",
        description: "Substratum backend + shared RAG",
        shortcut: "3",
        checked: false,
        category: "privacy",
        action: () => {
          privacyManager.setLevel(PrivacyLevel.LEVEL_3_SEMI_REMOTE);
          this.refreshItems();
        },
      },
      {
        id: "privacy-full",
        label: "( ) FULL REMOTE",
        description: "All features enabled (not recommended)",
        shortcut: "4",
        checked: false,
        category: "privacy",
        action: () => {
          privacyManager.setLevel(PrivacyLevel.LEVEL_4_FULL_REMOTE);
          this.refreshItems();
        },
      },

      // Settings Category
      {
        id: "setting-temperature",
        label: "Temperature: 0.7",
        description: "Controls randomness (0.0 - 2.0)",
        shortcut: "1",
        category: "settings",
        action: () => console.log("Setting temperature..."),
      },
      {
        id: "setting-maxtokens",
        label: "Max tokens: 4096",
        description: "Maximum response length",
        shortcut: "2",
        category: "settings",
        action: () => console.log("Setting max tokens..."),
      },
      {
        id: "setting-streaming",
        label: "Streaming: Enabled",
        description: "Enable streaming responses",
        shortcut: "3",
        category: "settings",
        action: () => console.log("Setting streaming..."),
      },
    ];

    this.filterItems();
  }

  /**
   * Change category
   */
  setCategory(category: MenuCategory): void {
    this.state.category = category;
    this.state.selectedIndex = 0;
    this.filterItems();
    this.notifyListeners();
  }

  /**
   * Filter items by search query
   */
  setSearchQuery(query: string): void {
    this.state.searchQuery = query;
    this.filterItems();
    this.notifyListeners();
  }

  private filterItems(): void {
    const categoryItems = this.items.filter(
      (item) => item.category === this.state.category,
    );

    if (!this.state.searchQuery) {
      this.state.filteredItems = categoryItems;
      return;
    }

    const query = this.state.searchQuery.toLowerCase();
    this.state.filteredItems = categoryItems.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    );
  }

  moveUp(): void {
    this.state.selectedIndex = Math.max(0, this.state.selectedIndex - 1);
    this.notifyListeners();
  }

  moveDown(): void {
    this.state.selectedIndex = Math.min(
      this.state.filteredItems.length - 1,
      this.state.selectedIndex + 1,
    );
    this.notifyListeners();
  }

  select(): void {
    const item = this.state.filteredItems[this.state.selectedIndex];
    if (item?.action) {
      item.action();
    }
    this.notifyListeners();
  }

  toggle(): void {
    const item = this.state.filteredItems[this.state.selectedIndex];
    if (item?.checked !== undefined) {
      item.checked = !item.checked;
      this.notifyListeners();
    }
  }

  getState(): MenuState {
    return { ...this.state };
  }

  open(): void {
    this.state.isOpen = true;
    this.refreshItems();
    this.notifyListeners();
  }

  close(): void {
    this.state.isOpen = false;
    this.notifyListeners();
  }

  toggleMenu(): void {
    if (this.state.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  onChange(callback: (state: MenuState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l(this.getState()));
  }

  private refreshItems(): void {
    // Update privacy checked states
    const privacyLevel = privacyManager.getLevel();
    this.items.find((i) => i.id === "privacy-local")!.checked =
      privacyLevel === PrivacyLevel.LEVEL_1_LOCAL_ONLY;
    this.items.find((i) => i.id === "privacy-hybrid")!.checked =
      privacyLevel === PrivacyLevel.LEVEL_2_HYBRID;
    this.items.find((i) => i.id === "privacy-semi")!.checked =
      privacyLevel === PrivacyLevel.LEVEL_3_SEMI_REMOTE;
    this.items.find((i) => i.id === "privacy-full")!.checked =
      privacyLevel === PrivacyLevel.LEVEL_4_FULL_REMOTE;

    // Update profile checked states
    const active = getActiveProfile();
    for (const item of this.items) {
      if (item.id.startsWith("hat-")) {
        item.checked = active.hat === item.id.replace("hat-", "");
      } else if (item.id.startsWith("profile-") && item.id !== "profile-reset") {
        item.checked = active.profile === item.id.replace("profile-", "");
      } else if (item.id.startsWith("style-")) {
        item.checked = active.style === item.id.replace("style-", "");
      } else if (item.id.startsWith("preset-")) {
        const presetId = item.id.replace("preset-", "");
        const preset = PROFILE_PRESETS[presetId];
        item.checked = preset
          ? active.hat === preset.hat && active.profile === preset.profile && active.style === preset.style
          : false;
      }
    }

    this.filterItems();
  }

  renderToText(): string {
    if (!this.state.isOpen) return "";

    const categoryLabels: Record<MenuCategory, string> = {
      models: "Models",
      profiles: "Profiles",
      skills: "Skills",
      plugins: "Plugins",
      privacy: "Privacy",
      settings: "Settings",
      project: "Project",
    };

    const categoryKeys = Object.keys(categoryLabels) as MenuCategory[];
    const header = `┌─────────────────────────────────────────────────────┐\n│  WabiSabi Configuration (Ctrl+P to close)           │\n├─────────────────────────────────────────────────────┤`;

    let result = header + "\n";

    // Show categories
    result += "│                                                     │\n│  ";
    categoryKeys.forEach((cat) => {
      const label = categoryLabels[cat];
      const marker = cat === this.state.category ? ">" : " ";
      result += `${marker} ${label}  `;
    });
    result =
      result.trimEnd() +
      "\n│                                                     │\n";

    // Show items
    result += "├─────────────────────────────────────────────────────┤\n";
    this.state.filteredItems.forEach((item, index) => {
      const marker = index === this.state.selectedIndex ? ">" : " ";
      const checkmark =
        item.checked === true ? "[*]" : item.checked === false ? "[ ]" : "   ";
      const label = item.label;
      const desc = item.description || "";

      const maxLen = 50;
      let displayLabel = label;
      if (displayLabel.length > maxLen) {
        displayLabel = displayLabel.substring(0, maxLen - 3) + "...";
      }

      result += `│  ${marker} ${checkmark} ${displayLabel.padEnd(28)} ${desc.substring(0, 20)}│\n`;
    });

    result += "│                                                     │\n";
    result += "├─────────────────────────────────────────────────────┤\n";
    result += "│  [Enter] Select  [Space] Toggle  [Esc] Close        │\n";
    result += "└─────────────────────────────────────────────────────┘";

    return result;
  }
}

// Singleton instance
export const menuSystem = new MenuSystem();
