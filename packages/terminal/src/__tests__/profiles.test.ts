/**
 * Tests for Six Hats / Technical Profiles system
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  THINKING_HATS,
  TECHNICAL_PROFILES,
  COMMUNICATION_STYLES,
  setHat,
  setProfile,
  setStyle,
  resetProfile,
  loadProfile,
  buildProfilePrompt,
  getProfileSummary,
  getActiveProfile,
} from "../profiles/index.js";

beforeEach(() => {
  resetProfile();
});

// ── Thinking Hats ────────────────────────────────────────────

describe("Thinking Hats", () => {
  test("has 6 defined hats", () => {
    const hatIds = Object.keys(THINKING_HATS);
    expect(hatIds).toHaveLength(6);
    expect(hatIds).toContain("white");
    expect(hatIds).toContain("red");
    expect(hatIds).toContain("black");
    expect(hatIds).toContain("yellow");
    expect(hatIds).toContain("green");
    expect(hatIds).toContain("blue");
  });

  test("each hat has required fields", () => {
    for (const hat of Object.values(THINKING_HATS)) {
      expect(hat.id).toBeDefined();
      expect(hat.name).toBeDefined();
      expect(hat.emoji).toBeDefined();
      expect(hat.description).toBeDefined();
      expect(hat.systemPrompt.length).toBeGreaterThan(50);
    }
  });

  test("setHat accepts valid hat", () => {
    expect(setHat("white")).toBe(true);
    expect(getActiveProfile().hat).toBe("white");
  });

  test("setHat rejects invalid hat", () => {
    expect(setHat("purple")).toBe(false);
    expect(getActiveProfile().hat).toBeNull();
  });

  test("setHat(null) removes hat", () => {
    setHat("red");
    expect(getActiveProfile().hat).toBe("red");
    setHat(null);
    expect(getActiveProfile().hat).toBeNull();
  });
});

// ── Technical Profiles ──────────────────────────────────────

describe("Technical Profiles", () => {
  test("has 7 profiles", () => {
    const profileIds = Object.keys(TECHNICAL_PROFILES);
    expect(profileIds).toHaveLength(7);
    expect(profileIds).toContain("security");
    expect(profileIds).toContain("devops");
    expect(profileIds).toContain("frontend");
    expect(profileIds).toContain("backend");
    expect(profileIds).toContain("fullstack");
    expect(profileIds).toContain("auditor");
    expect(profileIds).toContain("architect");
  });

  test("each profile has preferred tools", () => {
    for (const profile of Object.values(TECHNICAL_PROFILES)) {
      expect(profile.preferredTools.length).toBeGreaterThan(0);
    }
  });

  test("setProfile accepts valid profile", () => {
    expect(setProfile("security")).toBe(true);
    expect(getActiveProfile().profile).toBe("security");
  });

  test("setProfile rejects invalid profile", () => {
    expect(setProfile("hacker")).toBe(false);
  });
});

// ── Communication Styles ────────────────────────────────────

describe("Communication Styles", () => {
  test("has 4 styles", () => {
    const styleIds = Object.keys(COMMUNICATION_STYLES);
    expect(styleIds).toHaveLength(4);
    expect(styleIds).toContain("formal");
    expect(styleIds).toContain("technical");
    expect(styleIds).toContain("colloquial");
    expect(styleIds).toContain("mentor");
  });

  test("setStyle accepts valid style", () => {
    expect(setStyle("formal")).toBe(true);
    expect(getActiveProfile().style).toBe("formal");
  });
});

// ── Profile Composition ─────────────────────────────────────

describe("Profile Composition", () => {
  test("buildProfilePrompt returns empty when no profile active", () => {
    expect(buildProfilePrompt()).toBe("");
  });

  test("buildProfilePrompt includes hat prompt", () => {
    setHat("black");
    const prompt = buildProfilePrompt();
    expect(prompt).toContain("Black Hat");
    expect(prompt).toContain("Caution");
  });

  test("buildProfilePrompt includes profile prompt", () => {
    setProfile("security");
    const prompt = buildProfilePrompt();
    expect(prompt).toContain("Security Engineer");
    expect(prompt).toContain("OWASP");
  });

  test("buildProfilePrompt combines all three", () => {
    setHat("black");
    setProfile("security");
    setStyle("formal");
    const prompt = buildProfilePrompt();
    expect(prompt).toContain("Black Hat");
    expect(prompt).toContain("Security Engineer");
    expect(prompt).toContain("Formal");
    expect(prompt).toContain("ACTIVE PROFILE");
  });

  test("getProfileSummary shows combined profile", () => {
    setHat("green");
    setProfile("frontend");
    setStyle("colloquial");
    const summary = getProfileSummary();
    expect(summary).toContain("Green Hat");
    expect(summary).toContain("Frontend");
    expect(summary).toContain("Colloquial");
  });

  test("getProfileSummary returns default when nothing active", () => {
    expect(getProfileSummary()).toBe("Default (no profile)");
  });
});

// ── Reset & Load ────────────────────────────────────────────

describe("Reset & Load", () => {
  test("resetProfile clears everything", () => {
    setHat("white");
    setProfile("backend");
    setStyle("mentor");
    resetProfile();
    const profile = getActiveProfile();
    expect(profile.hat).toBeNull();
    expect(profile.profile).toBeNull();
    expect(profile.style).toBeNull();
  });

  test("loadProfile restores from saved state", () => {
    loadProfile({ hat: "blue", profile: "architect", style: "formal" });
    const profile = getActiveProfile();
    expect(profile.hat).toBe("blue");
    expect(profile.profile).toBe("architect");
    expect(profile.style).toBe("formal");
  });

  test("loadProfile ignores invalid values", () => {
    loadProfile({ hat: "invalid", profile: "fake", style: "wrong" });
    const profile = getActiveProfile();
    expect(profile.hat).toBeNull();
    expect(profile.profile).toBeNull();
    expect(profile.style).toBeNull();
  });
});
