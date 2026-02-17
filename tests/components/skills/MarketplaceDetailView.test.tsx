import { describe, expect, test } from "bun:test";

import {
  detailViewReducer,
  formatDate,
  formatDetailMetadataRows,
  formatInstallCount,
  getDetailHelpActions,
  INITIAL_DETAIL_STATE,
  type DetailViewState,
} from "../../../src/components/skills/MarketplaceDetailView";

import {
  getTrustBadgeConfig,
  TRUST_BADGE_CONFIG,
} from "../../../src/components/skills/TrustBadge";

import {
  INITIAL_PANEL_STATE,
  skillPanelReducer,
  type PanelState,
} from "../../../src/components/skills/SkillPanel";

import type {
  MarketplaceSkillDetail,
  MarketplaceTrustLevel,
} from "@reins/core";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FULL_DETAIL: MarketplaceSkillDetail = {
  slug: "git-workflow",
  name: "Git Workflow",
  author: "reins-team",
  description: "Automate common git operations and branch management.",
  installCount: 4523,
  trustLevel: "verified",
  categories: ["development", "git", "automation"],
  version: "2.1.0",
  updatedAt: "2026-02-10T00:00:00Z",
  fullDescription: "A comprehensive skill for automating Git workflows including branch management, PR creation, and merge conflict resolution.",
  requiredTools: ["git", "gh"],
  homepage: "https://github.com/reins-team/git-workflow",
  license: "MIT",
  versions: ["2.1.0", "2.0.0", "1.5.0", "1.0.0"],
  readme: "# Git Workflow\n\nAutomate your Git operations.",
};

const MINIMAL_DETAIL: MarketplaceSkillDetail = {
  slug: "simple-note",
  name: "Simple Note",
  author: "community-dev",
  description: "A minimal note-taking skill.",
  installCount: 42,
  trustLevel: "community",
  categories: [],
  version: "0.1.0",
  updatedAt: "2026-01-15T00:00:00Z",
  fullDescription: "",
  requiredTools: [],
  versions: [],
};

// ---------------------------------------------------------------------------
// TrustBadge: all 4 trust levels
// ---------------------------------------------------------------------------

describe("TrustBadge config", () => {
  test("verified has checkmark symbol and green color", () => {
    const config = getTrustBadgeConfig("verified");
    expect(config.symbol).toBe("✓");
    expect(config.label).toBe("Verified");
    expect(config.colorToken).toBe("status.success");
  });

  test("trusted has bullet symbol and blue color", () => {
    const config = getTrustBadgeConfig("trusted");
    expect(config.symbol).toBe("●");
    expect(config.label).toBe("Trusted");
    expect(config.colorToken).toBe("status.info");
  });

  test("community has diamond symbol and yellow color", () => {
    const config = getTrustBadgeConfig("community");
    expect(config.symbol).toBe("◆");
    expect(config.label).toBe("Community");
    expect(config.colorToken).toBe("status.warning");
  });

  test("untrusted has warning symbol and red color", () => {
    const config = getTrustBadgeConfig("untrusted");
    expect(config.symbol).toBe("⚠");
    expect(config.label).toBe("Untrusted");
    expect(config.colorToken).toBe("status.error");
  });

  test("TRUST_BADGE_CONFIG has entries for all 4 levels", () => {
    const levels: MarketplaceTrustLevel[] = ["verified", "trusted", "community", "untrusted"];
    for (const level of levels) {
      expect(TRUST_BADGE_CONFIG[level]).toBeDefined();
      expect(TRUST_BADGE_CONFIG[level].symbol.length).toBeGreaterThan(0);
      expect(TRUST_BADGE_CONFIG[level].label.length).toBeGreaterThan(0);
      expect(TRUST_BADGE_CONFIG[level].colorToken.length).toBeGreaterThan(0);
    }
  });

  test("each trust level has a unique symbol", () => {
    const symbols = Object.values(TRUST_BADGE_CONFIG).map((c) => c.symbol);
    const unique = new Set(symbols);
    expect(unique.size).toBe(4);
  });

  test("each trust level has a unique label", () => {
    const labels = Object.values(TRUST_BADGE_CONFIG).map((c) => c.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// formatInstallCount
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView formatInstallCount", () => {
  test("returns raw number for counts under 1000", () => {
    expect(formatInstallCount(0)).toBe("0");
    expect(formatInstallCount(1)).toBe("1");
    expect(formatInstallCount(999)).toBe("999");
  });

  test("formats thousands with one decimal for 1k-10k", () => {
    expect(formatInstallCount(1000)).toBe("1.0k");
    expect(formatInstallCount(1234)).toBe("1.2k");
    expect(formatInstallCount(4523)).toBe("4.5k");
    expect(formatInstallCount(9999)).toBe("10.0k");
  });

  test("formats thousands as rounded integer for 10k-1M", () => {
    expect(formatInstallCount(10000)).toBe("10k");
    expect(formatInstallCount(12340)).toBe("12k");
    expect(formatInstallCount(999999)).toBe("1000k");
  });

  test("formats millions with one decimal", () => {
    expect(formatInstallCount(1000000)).toBe("1.0M");
    expect(formatInstallCount(2500000)).toBe("2.5M");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView formatDate", () => {
  test("formats ISO date to short form", () => {
    const result = formatDate("2026-02-10T00:00:00Z");
    expect(result).toContain("Feb");
    expect(result).toContain("10");
    expect(result).toContain("2026");
  });

  test("returns original string for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  test("handles date-only ISO strings", () => {
    const result = formatDate("2026-01-15T00:00:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });
});

// ---------------------------------------------------------------------------
// formatDetailMetadataRows
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView formatDetailMetadataRows", () => {
  test("includes author, version, installs, and updated for full detail", () => {
    const rows = formatDetailMetadataRows(FULL_DETAIL);
    const labels = rows.map((r) => r.label);

    expect(labels).toContain("Author");
    expect(labels).toContain("Version");
    expect(labels).toContain("Installs");
    expect(labels).toContain("Updated");
  });

  test("includes license when present", () => {
    const rows = formatDetailMetadataRows(FULL_DETAIL);
    const licenseRow = rows.find((r) => r.label === "License");
    expect(licenseRow).toBeDefined();
    expect(licenseRow!.value).toBe("MIT");
  });

  test("omits license when not present", () => {
    const rows = formatDetailMetadataRows(MINIMAL_DETAIL);
    const licenseRow = rows.find((r) => r.label === "License");
    expect(licenseRow).toBeUndefined();
  });

  test("author row contains the author name", () => {
    const rows = formatDetailMetadataRows(FULL_DETAIL);
    const authorRow = rows.find((r) => r.label === "Author");
    expect(authorRow).toBeDefined();
    expect(authorRow!.value).toBe("reins-team");
  });

  test("version row contains the version string", () => {
    const rows = formatDetailMetadataRows(FULL_DETAIL);
    const versionRow = rows.find((r) => r.label === "Version");
    expect(versionRow).toBeDefined();
    expect(versionRow!.value).toBe("2.1.0");
  });

  test("installs row formats the count", () => {
    const rows = formatDetailMetadataRows(FULL_DETAIL);
    const installsRow = rows.find((r) => r.label === "Installs");
    expect(installsRow).toBeDefined();
    expect(installsRow!.value).toBe("4.5k");
  });

  test("updated row formats the date", () => {
    const rows = formatDetailMetadataRows(FULL_DETAIL);
    const updatedRow = rows.find((r) => r.label === "Updated");
    expect(updatedRow).toBeDefined();
    expect(updatedRow!.value).toContain("Feb");
    expect(updatedRow!.value).toContain("2026");
  });

  test("minimal detail still has author, version, installs, updated", () => {
    const rows = formatDetailMetadataRows(MINIMAL_DETAIL);
    const labels = rows.map((r) => r.label);

    expect(labels).toContain("Author");
    expect(labels).toContain("Version");
    expect(labels).toContain("Installs");
    expect(labels).toContain("Updated");
    expect(rows.length).toBe(4); // No license
  });
});

// ---------------------------------------------------------------------------
// getDetailHelpActions
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView getDetailHelpActions", () => {
  test("loading state shows only Esc/Back", () => {
    const actions = getDetailHelpActions("loading");
    expect(actions.length).toBe(1);
    expect(actions[0].key).toBe("Esc");
    expect(actions[0].label).toBe("Back");
  });

  test("error state shows Retry and Back", () => {
    const actions = getDetailHelpActions("error");
    expect(actions.length).toBe(2);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain("r");
    expect(keys).toContain("Esc");
  });

  test("loaded state shows Install and Back", () => {
    const actions = getDetailHelpActions("loaded");
    expect(actions.length).toBe(2);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain("Enter");
    expect(keys).toContain("Esc");
  });

  test("loaded state Enter label is Install", () => {
    const actions = getDetailHelpActions("loaded");
    const installAction = actions.find((a) => a.key === "Enter");
    expect(installAction).toBeDefined();
    expect(installAction!.label).toBe("Install");
  });

  test("error state r label is Retry", () => {
    const actions = getDetailHelpActions("error");
    const retryAction = actions.find((a) => a.key === "r");
    expect(retryAction).toBeDefined();
    expect(retryAction!.label).toBe("Retry");
  });
});

// ---------------------------------------------------------------------------
// detailViewReducer: SET_LOADING
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView reducer SET_LOADING", () => {
  test("transitions to loading state", () => {
    const state = detailViewReducer(INITIAL_DETAIL_STATE, { type: "SET_LOADING" });
    expect(state.status).toBe("loading");
    expect(state.detail).toBeNull();
    expect(state.error).toBeNull();
  });

  test("clears previous detail when loading", () => {
    const loadedState: DetailViewState = {
      status: "loaded",
      detail: FULL_DETAIL,
      error: null,
    };
    const state = detailViewReducer(loadedState, { type: "SET_LOADING" });
    expect(state.status).toBe("loading");
    expect(state.detail).toBeNull();
  });

  test("clears previous error when loading", () => {
    const errorState: DetailViewState = {
      status: "error",
      detail: null,
      error: "Network error",
    };
    const state = detailViewReducer(errorState, { type: "SET_LOADING" });
    expect(state.status).toBe("loading");
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detailViewReducer: SET_LOADED
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView reducer SET_LOADED", () => {
  test("transitions to loaded state with detail", () => {
    const state = detailViewReducer(INITIAL_DETAIL_STATE, {
      type: "SET_LOADED",
      detail: FULL_DETAIL,
    });
    expect(state.status).toBe("loaded");
    expect(state.detail).toBe(FULL_DETAIL);
    expect(state.error).toBeNull();
  });

  test("replaces previous detail", () => {
    const loadedState: DetailViewState = {
      status: "loaded",
      detail: MINIMAL_DETAIL,
      error: null,
    };
    const state = detailViewReducer(loadedState, {
      type: "SET_LOADED",
      detail: FULL_DETAIL,
    });
    expect(state.detail).toBe(FULL_DETAIL);
  });
});

// ---------------------------------------------------------------------------
// detailViewReducer: SET_ERROR
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView reducer SET_ERROR", () => {
  test("transitions to error state with message", () => {
    const state = detailViewReducer(INITIAL_DETAIL_STATE, {
      type: "SET_ERROR",
      error: "Network error",
    });
    expect(state.status).toBe("error");
    expect(state.error).toBe("Network error");
    expect(state.detail).toBeNull();
  });

  test("clears previous detail on error", () => {
    const loadedState: DetailViewState = {
      status: "loaded",
      detail: FULL_DETAIL,
      error: null,
    };
    const state = detailViewReducer(loadedState, {
      type: "SET_ERROR",
      error: "Server error",
    });
    expect(state.status).toBe("error");
    expect(state.detail).toBeNull();
    expect(state.error).toBe("Server error");
  });
});

// ---------------------------------------------------------------------------
// detailViewReducer: unknown action
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView reducer unknown action", () => {
  test("returns state unchanged for unknown action type", () => {
    const state = detailViewReducer(
      INITIAL_DETAIL_STATE,
      // @ts-expect-error — testing unknown action type
      { type: "UNKNOWN_ACTION" },
    );
    expect(state).toEqual(INITIAL_DETAIL_STATE);
  });
});

// ---------------------------------------------------------------------------
// detailViewReducer: state transitions
// ---------------------------------------------------------------------------

describe("MarketplaceDetailView state transitions", () => {
  test("loading → loaded → loading → loaded (refetch)", () => {
    let state = INITIAL_DETAIL_STATE;
    expect(state.status).toBe("loading");

    state = detailViewReducer(state, { type: "SET_LOADED", detail: FULL_DETAIL });
    expect(state.status).toBe("loaded");
    expect(state.detail).toBe(FULL_DETAIL);

    state = detailViewReducer(state, { type: "SET_LOADING" });
    expect(state.status).toBe("loading");
    expect(state.detail).toBeNull();

    state = detailViewReducer(state, { type: "SET_LOADED", detail: MINIMAL_DETAIL });
    expect(state.status).toBe("loaded");
    expect(state.detail).toBe(MINIMAL_DETAIL);
  });

  test("loading → error → loading → loaded (retry success)", () => {
    let state = INITIAL_DETAIL_STATE;

    state = detailViewReducer(state, { type: "SET_ERROR", error: "Timeout" });
    expect(state.status).toBe("error");
    expect(state.error).toBe("Timeout");

    state = detailViewReducer(state, { type: "SET_LOADING" });
    expect(state.status).toBe("loading");
    expect(state.error).toBeNull();

    state = detailViewReducer(state, { type: "SET_LOADED", detail: FULL_DETAIL });
    expect(state.status).toBe("loaded");
    expect(state.detail).toBe(FULL_DETAIL);
  });

  test("loading → error → loading → error (retry failure)", () => {
    let state = INITIAL_DETAIL_STATE;

    state = detailViewReducer(state, { type: "SET_ERROR", error: "First error" });
    expect(state.error).toBe("First error");

    state = detailViewReducer(state, { type: "SET_LOADING" });
    state = detailViewReducer(state, { type: "SET_ERROR", error: "Second error" });
    expect(state.error).toBe("Second error");
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: SELECT_MARKETPLACE_SKILL
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SELECT_MARKETPLACE_SKILL", () => {
  test("transitions to detail view with marketplace slug", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "git-workflow",
    });

    expect(state.view).toBe("detail");
    expect(state.selectedMarketplaceSkill).toBe("git-workflow");
  });

  test("preserves active tab index", () => {
    const clawHubState: PanelState = {
      ...INITIAL_PANEL_STATE,
      activeTabIndex: 1,
    };

    const state = skillPanelReducer(clawHubState, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "docker-compose",
    });

    expect(state.activeTabIndex).toBe(1);
    expect(state.selectedMarketplaceSkill).toBe("docker-compose");
  });

  test("does not affect installed skill selection fields", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "git-workflow",
    });

    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: GO_BACK clears marketplace selection
// ---------------------------------------------------------------------------

describe("SkillPanel reducer GO_BACK clears marketplace selection", () => {
  test("clears selectedMarketplaceSkill on GO_BACK", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 1,
      selectedSkillName: null,
      selectedDetail: null,
      selectedMarketplaceSkill: "git-workflow",
    };

    const state = skillPanelReducer(detailState, { type: "GO_BACK" });

    expect(state.view).toBe("list");
    expect(state.selectedMarketplaceSkill).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: SWITCH_TAB clears marketplace selection
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SWITCH_TAB clears marketplace selection", () => {
  test("clears selectedMarketplaceSkill on tab switch", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 1,
      selectedSkillName: null,
      selectedDetail: null,
      selectedMarketplaceSkill: "git-workflow",
    };

    const state = skillPanelReducer(detailState, { type: "SWITCH_TAB", index: 0 });

    expect(state.view).toBe("list");
    expect(state.selectedMarketplaceSkill).toBeNull();
    expect(state.activeTabIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: CLOSE clears marketplace selection
// ---------------------------------------------------------------------------

describe("SkillPanel reducer CLOSE clears marketplace selection", () => {
  test("resets selectedMarketplaceSkill on CLOSE", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 1,
      selectedSkillName: null,
      selectedDetail: null,
      selectedMarketplaceSkill: "git-workflow",
    };

    const state = skillPanelReducer(detailState, { type: "CLOSE" });

    expect(state).toEqual(INITIAL_PANEL_STATE);
    expect(state.selectedMarketplaceSkill).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel marketplace navigation flow
// ---------------------------------------------------------------------------

describe("SkillPanel marketplace navigation flow", () => {
  test("list → select marketplace skill → detail → back → list", () => {
    let state: PanelState = { ...INITIAL_PANEL_STATE, activeTabIndex: 1 };

    // Select a marketplace skill
    state = skillPanelReducer(state, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "git-workflow",
    });
    expect(state.view).toBe("detail");
    expect(state.selectedMarketplaceSkill).toBe("git-workflow");

    // Go back to list
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
    expect(state.selectedMarketplaceSkill).toBeNull();
  });

  test("select marketplace skill → switch tab → clears selection", () => {
    let state: PanelState = { ...INITIAL_PANEL_STATE, activeTabIndex: 1 };

    state = skillPanelReducer(state, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "git-workflow",
    });
    expect(state.selectedMarketplaceSkill).toBe("git-workflow");

    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 0 });
    expect(state.selectedMarketplaceSkill).toBeNull();
    expect(state.view).toBe("list");
  });

  test("select marketplace skill → close → resets everything", () => {
    let state: PanelState = { ...INITIAL_PANEL_STATE, activeTabIndex: 1 };

    state = skillPanelReducer(state, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "git-workflow",
    });

    state = skillPanelReducer(state, { type: "CLOSE" });
    expect(state).toEqual(INITIAL_PANEL_STATE);
  });
});

// ---------------------------------------------------------------------------
// INITIAL_PANEL_STATE includes selectedMarketplaceSkill
// ---------------------------------------------------------------------------

describe("SkillPanel initial state includes marketplace field", () => {
  test("selectedMarketplaceSkill is null initially", () => {
    expect(INITIAL_PANEL_STATE.selectedMarketplaceSkill).toBeNull();
  });
});
