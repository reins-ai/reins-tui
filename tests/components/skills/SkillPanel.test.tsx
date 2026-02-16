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
  test("list view shows navigation, select, search, and close actions", () => {
    const actions = getHelpActions("list");
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("j/k");
    expect(keys).toContain("Enter");
    expect(keys).toContain("/");
    expect(keys).toContain("Esc");
  });

  test("detail view shows toggle and back actions", () => {
    const actions = getHelpActions("detail");
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("e");
    expect(keys).toContain("Esc");
  });

  test("list view has 4 actions", () => {
    expect(getHelpActions("list").length).toBe(4);
  });

  test("detail view has 2 actions", () => {
    expect(getHelpActions("detail").length).toBe(2);
  });

  test("list view Esc label is Close", () => {
    const actions = getHelpActions("list");
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
