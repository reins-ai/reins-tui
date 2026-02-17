import { describe, expect, test } from "bun:test";

import {
  getHelpActions,
  INITIAL_PANEL_STATE,
  skillPanelReducer,
  type PanelState,
} from "../../../src/components/skills/SkillPanel";
import type { SkillDetailData } from "../../../src/components/skills/SkillDetailView";
import type { SkillListItem } from "../../../src/components/skills/SkillListPanel";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_SKILLS: SkillListItem[] = [
  {
    name: "git-workflow",
    description: "Automate common git operations and branch management.",
    enabled: true,
    trustLevel: "trusted",
    hasIntegration: false,
  },
  {
    name: "docker-compose",
    description: "Manage Docker containers and compose stacks.",
    enabled: true,
    trustLevel: "verified",
    hasIntegration: true,
  },
  {
    name: "code-review",
    description: "Automated code review with style and security checks.",
    enabled: false,
    trustLevel: "untrusted",
    hasIntegration: false,
  },
];

const FULL_DETAIL: SkillDetailData = {
  name: "git-workflow",
  description: "Automate common Git workflows with branch management and PR creation.",
  version: "1.2.0",
  enabled: true,
  trustLevel: "trusted",
  categories: ["development", "git", "automation"],
  triggers: ["git", "branch", "pull request", "merge"],
  requiredTools: ["git", "gh"],
  scripts: ["create-branch.sh", "open-pr.sh"],
  integrationStatus: "not_required",
  body: "# Git Workflow\n\nThis skill automates common Git operations.",
};

const DISABLED_DETAIL: SkillDetailData = {
  ...FULL_DETAIL,
  enabled: false,
};

const TOGGLED_DETAIL: SkillDetailData = {
  ...FULL_DETAIL,
  enabled: false,
};

// Suppress unused variable warnings for fixtures used in type-checking tests
void MOCK_SKILLS;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("SkillPanel initial state", () => {
  test("starts in list view", () => {
    expect(INITIAL_PANEL_STATE.view).toBe("list");
  });

  test("has no selected skill name", () => {
    expect(INITIAL_PANEL_STATE.selectedSkillName).toBeNull();
  });

  test("has no selected detail", () => {
    expect(INITIAL_PANEL_STATE.selectedDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// skillPanelReducer: SELECT_SKILL
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SELECT_SKILL", () => {
  test("transitions to detail view with skill data", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });

    expect(state.view).toBe("detail");
    expect(state.selectedSkillName).toBe("git-workflow");
    expect(state.selectedDetail).toBe(FULL_DETAIL);
  });

  test("handles null detail gracefully", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_SKILL",
      name: "unknown-skill",
      detail: null,
    });

    expect(state.view).toBe("detail");
    expect(state.selectedSkillName).toBe("unknown-skill");
    expect(state.selectedDetail).toBeNull();
  });

  test("replaces previous selection when selecting a different skill", () => {
    const first = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });

    const second = skillPanelReducer(first, {
      type: "SELECT_SKILL",
      name: "docker-compose",
      detail: DISABLED_DETAIL,
    });

    expect(second.view).toBe("detail");
    expect(second.selectedSkillName).toBe("docker-compose");
    expect(second.selectedDetail).toBe(DISABLED_DETAIL);
  });
});

// ---------------------------------------------------------------------------
// skillPanelReducer: GO_BACK
// ---------------------------------------------------------------------------

describe("SkillPanel reducer GO_BACK", () => {
  test("transitions from detail to list view", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, { type: "GO_BACK" });

    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedDetail).toBeNull();
  });

  test("is a no-op when already in list view (returns to list state)", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, { type: "GO_BACK" });

    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// skillPanelReducer: TOGGLE_ENABLED
// ---------------------------------------------------------------------------

describe("SkillPanel reducer TOGGLE_ENABLED", () => {
  test("updates selected detail with toggled state", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, {
      type: "TOGGLE_ENABLED",
      updatedDetail: TOGGLED_DETAIL,
    });

    expect(state.view).toBe("detail");
    expect(state.selectedSkillName).toBe("git-workflow");
    expect(state.selectedDetail).toBe(TOGGLED_DETAIL);
    expect(state.selectedDetail!.enabled).toBe(false);
  });

  test("handles null updated detail", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, {
      type: "TOGGLE_ENABLED",
      updatedDetail: null,
    });

    expect(state.selectedDetail).toBeNull();
  });

  test("preserves view and skill name when toggling", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, {
      type: "TOGGLE_ENABLED",
      updatedDetail: TOGGLED_DETAIL,
    });

    expect(state.view).toBe("detail");
    expect(state.selectedSkillName).toBe("git-workflow");
  });
});

// ---------------------------------------------------------------------------
// skillPanelReducer: CLOSE
// ---------------------------------------------------------------------------

describe("SkillPanel reducer CLOSE", () => {
  test("resets to initial state from list view", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, { type: "CLOSE" });
    expect(state).toEqual(INITIAL_PANEL_STATE);
  });

  test("resets to initial state from detail view", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, { type: "CLOSE" });

    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedDetail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full navigation flow
// ---------------------------------------------------------------------------

describe("SkillPanel navigation flow", () => {
  test("list → select → detail → back → list", () => {
    // Start in list view
    let state = INITIAL_PANEL_STATE;
    expect(state.view).toBe("list");

    // Select a skill
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });
    expect(state.view).toBe("detail");
    expect(state.selectedSkillName).toBe("git-workflow");
    expect(state.selectedDetail).toBe(FULL_DETAIL);

    // Go back to list
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedDetail).toBeNull();
  });

  test("list → select → toggle → back → list", () => {
    let state = INITIAL_PANEL_STATE;

    // Select a skill
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });
    expect(state.view).toBe("detail");
    expect(state.selectedDetail!.enabled).toBe(true);

    // Toggle enabled state
    state = skillPanelReducer(state, {
      type: "TOGGLE_ENABLED",
      updatedDetail: TOGGLED_DETAIL,
    });
    expect(state.view).toBe("detail");
    expect(state.selectedDetail!.enabled).toBe(false);

    // Go back to list
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
  });

  test("list → select → close resets everything", () => {
    let state = INITIAL_PANEL_STATE;

    // Select a skill
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });
    expect(state.view).toBe("detail");

    // Close the panel
    state = skillPanelReducer(state, { type: "CLOSE" });
    expect(state).toEqual(INITIAL_PANEL_STATE);
  });

  test("multiple select → back cycles work correctly", () => {
    let state = INITIAL_PANEL_STATE;

    // First cycle
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");

    // Second cycle with different skill
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "docker-compose",
      detail: DISABLED_DETAIL,
    });
    expect(state.selectedSkillName).toBe("docker-compose");
    expect(state.selectedDetail).toBe(DISABLED_DETAIL);

    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Enable/disable toggle state transitions
// ---------------------------------------------------------------------------

describe("SkillPanel enable/disable toggle", () => {
  test("toggling enabled skill produces disabled detail", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    // Simulate: parent calls onToggleEnabled, reloads detail with enabled=false
    const state = skillPanelReducer(detailState, {
      type: "TOGGLE_ENABLED",
      updatedDetail: { ...FULL_DETAIL, enabled: false },
    });

    expect(state.selectedDetail!.enabled).toBe(false);
  });

  test("toggling disabled skill produces enabled detail", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "code-review",
      selectedDetail: DISABLED_DETAIL,
    };

    const state = skillPanelReducer(detailState, {
      type: "TOGGLE_ENABLED",
      updatedDetail: { ...DISABLED_DETAIL, enabled: true },
    });

    expect(state.selectedDetail!.enabled).toBe(true);
  });

  test("multiple toggles alternate enabled state", () => {
    let state: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    // Toggle off
    state = skillPanelReducer(state, {
      type: "TOGGLE_ENABLED",
      updatedDetail: { ...FULL_DETAIL, enabled: false },
    });
    expect(state.selectedDetail!.enabled).toBe(false);

    // Toggle on
    state = skillPanelReducer(state, {
      type: "TOGGLE_ENABLED",
      updatedDetail: { ...FULL_DETAIL, enabled: true },
    });
    expect(state.selectedDetail!.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getHelpActions
// ---------------------------------------------------------------------------

describe("SkillPanel getHelpActions", () => {
  test("installed tab list view shows tab switch, navigation, select, search, toggle, and close", () => {
    const actions = getHelpActions("list", 0);
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("Tab");
    expect(keys).toContain("j/k");
    expect(keys).toContain("Enter");
    expect(keys).toContain("/");
    expect(keys).toContain("e");
    expect(keys).toContain("Esc");
  });

  test("detail view shows toggle and back actions", () => {
    const actions = getHelpActions("detail");
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("e");
    expect(keys).toContain("Esc");
  });

  test("installed tab list view has 6 actions", () => {
    expect(getHelpActions("list", 0).length).toBe(6);
  });

  test("detail view has 2 actions", () => {
    expect(getHelpActions("detail").length).toBe(2);
  });

  test("list view Esc label is Close", () => {
    const actions = getHelpActions("list", 0);
    const escAction = actions.find((a) => a.key === "Esc");
    expect(escAction).toBeDefined();
    expect(escAction!.label).toBe("Close");
  });

  test("detail view Esc label is Back", () => {
    const actions = getHelpActions("detail");
    const escAction = actions.find((a) => a.key === "Esc");
    expect(escAction).toBeDefined();
    expect(escAction!.label).toBe("Back");
  });

  test("detail view e label is Toggle", () => {
    const actions = getHelpActions("detail");
    const toggleAction = actions.find((a) => a.key === "e");
    expect(toggleAction).toBeDefined();
    expect(toggleAction!.label).toBe("Toggle");
  });

  test("clawhub tab list view includes sort action", () => {
    const actions = getHelpActions("list", 1);
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("Tab");
    expect(keys).toContain("j/k");
    expect(keys).toContain("Enter");
    expect(keys).toContain("/");
    expect(keys).toContain("s");
    expect(keys).toContain("Esc");
  });

  test("clawhub tab list view has 6 actions", () => {
    expect(getHelpActions("list", 1).length).toBe(6);
  });

  test("reins marketplace tab shows only tab switch and close", () => {
    const actions = getHelpActions("list", 2);
    const keys = actions.map((a) => a.key);

    expect(keys).toEqual(["Tab", "Esc"]);
  });

  test("reins marketplace tab has 2 actions", () => {
    expect(getHelpActions("list", 2).length).toBe(2);
  });

  test("install view returns empty actions (InstallFlow manages its own)", () => {
    expect(getHelpActions("install").length).toBe(0);
  });

  test("list view without tab index defaults to installed tab actions", () => {
    const actions = getHelpActions("list");
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("Tab");
    expect(keys).toContain("j/k");
    expect(keys).toContain("Enter");
    expect(keys).toContain("/");
    expect(keys).toContain("e");
    expect(keys).toContain("Esc");
  });
});

// ---------------------------------------------------------------------------
// Unknown action type (default case)
// ---------------------------------------------------------------------------

describe("SkillPanel reducer unknown action", () => {
  test("returns state unchanged for unknown action type", () => {
    const state = skillPanelReducer(
      INITIAL_PANEL_STATE,
      // @ts-expect-error — testing unknown action type
      { type: "UNKNOWN_ACTION" },
    );
    expect(state).toEqual(INITIAL_PANEL_STATE);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("SkillPanel edge cases", () => {
  test("selecting same skill twice updates detail", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });

    // Select same skill again with updated detail
    const updatedDetail = { ...FULL_DETAIL, enabled: false };
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: updatedDetail,
    });

    expect(state.view).toBe("detail");
    expect(state.selectedSkillName).toBe("git-workflow");
    expect(state.selectedDetail!.enabled).toBe(false);
  });

  test("close from list view returns initial state", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, { type: "CLOSE" });
    expect(state).toEqual(INITIAL_PANEL_STATE);
  });

  test("toggle without being in detail view still updates detail field", () => {
    // This is an edge case — toggle dispatched while in list view
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "TOGGLE_ENABLED",
      updatedDetail: FULL_DETAIL,
    });

    // State machine doesn't guard against this — it just updates the field
    expect(state.view).toBe("list");
    expect(state.selectedDetail).toBe(FULL_DETAIL);
  });
});

// ---------------------------------------------------------------------------
// Tab switching (SWITCH_TAB)
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SWITCH_TAB", () => {
  test("switches from installed tab (0) to clawhub tab (1)", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SWITCH_TAB",
      index: 1,
    });

    expect(state.activeTabIndex).toBe(1);
    expect(state.view).toBe("list");
  });

  test("switches from installed tab (0) to reins marketplace tab (2)", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SWITCH_TAB",
      index: 2,
    });

    expect(state.activeTabIndex).toBe(2);
    expect(state.view).toBe("list");
  });

  test("switching tabs resets view to list", () => {
    // Start in detail view on installed tab
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
      selectedMarketplaceSkill: null,
      installState: null,
    };

    const state = skillPanelReducer(detailState, {
      type: "SWITCH_TAB",
      index: 1,
    });

    expect(state.activeTabIndex).toBe(1);
    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedDetail).toBeNull();
  });

  test("switching tabs clears marketplace skill selection", () => {
    const marketplaceDetailState: PanelState = {
      view: "detail",
      activeTabIndex: 1,
      selectedSkillName: null,
      selectedDetail: null,
      selectedMarketplaceSkill: "some-skill",
      installState: null,
    };

    const state = skillPanelReducer(marketplaceDetailState, {
      type: "SWITCH_TAB",
      index: 0,
    });

    expect(state.activeTabIndex).toBe(0);
    expect(state.selectedMarketplaceSkill).toBeNull();
  });

  test("switching tabs clears install state", () => {
    const installState: PanelState = {
      view: "install",
      activeTabIndex: 1,
      selectedSkillName: null,
      selectedDetail: null,
      selectedMarketplaceSkill: "some-skill",
      installState: {
        slug: "some-skill",
        version: "1.0.0",
        detail: {
          slug: "some-skill",
          name: "Some Skill",
          author: "author",
          description: "desc",
          installCount: 100,
          trustLevel: "community",
          categories: [],
          version: "1.0.0",
          updatedAt: "2026-01-01",
          fullDescription: "Full desc",
          requiredTools: [],
          versions: ["1.0.0"],
        },
        progress: "downloading",
        error: null,
        result: null,
      },
    };

    const state = skillPanelReducer(installState, {
      type: "SWITCH_TAB",
      index: 0,
    });

    expect(state.activeTabIndex).toBe(0);
    expect(state.installState).toBeNull();
    expect(state.view).toBe("list");
  });

  test("cycling through all three tabs works correctly", () => {
    let state = INITIAL_PANEL_STATE;
    expect(state.activeTabIndex).toBe(0);

    // Tab 0 → 1
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 1 });
    expect(state.activeTabIndex).toBe(1);

    // Tab 1 → 2
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 2 });
    expect(state.activeTabIndex).toBe(2);

    // Tab 2 → 0 (wrap around)
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 0 });
    expect(state.activeTabIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tab state isolation
// ---------------------------------------------------------------------------

describe("SkillPanel tab state isolation", () => {
  test("installed tab state is independent from clawhub tab", () => {
    // Select a skill on installed tab
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });
    expect(state.view).toBe("detail");
    expect(state.activeTabIndex).toBe(0);

    // Go back to list
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");

    // Switch to ClawHub tab
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 1 });
    expect(state.activeTabIndex).toBe(1);
    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();

    // Switch back to installed tab — should be in list view
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 0 });
    expect(state.activeTabIndex).toBe(0);
    expect(state.view).toBe("list");
  });

  test("marketplace skill selection on clawhub tab does not affect installed tab", () => {
    // Switch to ClawHub tab and select a marketplace skill
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SWITCH_TAB",
      index: 1,
    });
    state = skillPanelReducer(state, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "clawhub-skill",
    });
    expect(state.view).toBe("detail");
    expect(state.selectedMarketplaceSkill).toBe("clawhub-skill");

    // Switch to installed tab — marketplace selection is cleared
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 0 });
    expect(state.selectedMarketplaceSkill).toBeNull();
    expect(state.selectedSkillName).toBeNull();
    expect(state.view).toBe("list");
  });

  test("reins marketplace tab (placeholder) is navigable", () => {
    // Switch to Reins Marketplace tab
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SWITCH_TAB",
      index: 2,
    });

    expect(state.activeTabIndex).toBe(2);
    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
    expect(state.selectedMarketplaceSkill).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Marketplace skill selection (SELECT_MARKETPLACE_SKILL)
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SELECT_MARKETPLACE_SKILL", () => {
  test("transitions to detail view with marketplace skill slug", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "my-skill",
    });

    expect(state.view).toBe("detail");
    expect(state.selectedMarketplaceSkill).toBe("my-skill");
  });

  test("GO_BACK clears marketplace skill selection", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "my-skill",
    });

    state = skillPanelReducer(state, { type: "GO_BACK" });

    expect(state.view).toBe("list");
    expect(state.selectedMarketplaceSkill).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Install state machine
// ---------------------------------------------------------------------------

describe("SkillPanel reducer install flow", () => {
  const MOCK_DETAIL = {
    slug: "test-skill",
    name: "Test Skill",
    author: "tester",
    description: "A test skill",
    installCount: 42,
    trustLevel: "community" as const,
    categories: ["testing"],
    version: "1.0.0",
    updatedAt: "2026-01-01",
    fullDescription: "Full description",
    requiredTools: [],
    versions: ["1.0.0"],
  };

  test("START_INSTALL transitions to install view", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "test-skill",
      version: "1.0.0",
      detail: MOCK_DETAIL,
    });

    expect(state.view).toBe("install");
    expect(state.installState).not.toBeNull();
    expect(state.installState!.slug).toBe("test-skill");
    expect(state.installState!.version).toBe("1.0.0");
    expect(state.installState!.progress).toBeNull();
    expect(state.installState!.error).toBeNull();
    expect(state.installState!.result).toBeNull();
  });

  test("INSTALL_PROGRESS updates progress step", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "test-skill",
      version: "1.0.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });

    expect(state.installState!.progress).toBe("downloading");
  });

  test("INSTALL_ERROR sets error message", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "test-skill",
      version: "1.0.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_ERROR",
      error: "Network timeout",
    });

    expect(state.installState!.error).toBe("Network timeout");
  });

  test("INSTALL_COMPLETE sets result", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "test-skill",
      version: "1.0.0",
      detail: MOCK_DETAIL,
    });

    const result = { skillName: "test-skill", version: "1.0.0", migrated: false, installPath: "/path" };
    state = skillPanelReducer(state, {
      type: "INSTALL_COMPLETE",
      result,
    });

    expect(state.installState!.result).toBe(result);
  });

  test("INSTALL_RESET clears progress, error, and result", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "test-skill",
      version: "1.0.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_ERROR",
      error: "Failed",
    });

    state = skillPanelReducer(state, { type: "INSTALL_RESET" });

    expect(state.installState!.progress).toBeNull();
    expect(state.installState!.error).toBeNull();
    expect(state.installState!.result).toBeNull();
    // Slug and version are preserved
    expect(state.installState!.slug).toBe("test-skill");
  });

  test("install actions are no-ops when installState is null", () => {
    const state1 = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });
    expect(state1).toEqual(INITIAL_PANEL_STATE);

    const state2 = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_ERROR",
      error: "fail",
    });
    expect(state2).toEqual(INITIAL_PANEL_STATE);

    const state3 = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_COMPLETE",
      result: { skillName: "x", version: "1", migrated: false, installPath: "/p" },
    });
    expect(state3).toEqual(INITIAL_PANEL_STATE);

    const state4 = skillPanelReducer(INITIAL_PANEL_STATE, { type: "INSTALL_RESET" });
    expect(state4).toEqual(INITIAL_PANEL_STATE);
  });
});
