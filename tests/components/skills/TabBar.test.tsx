import { describe, expect, test } from "bun:test";

import {
  getNextTabIndex,
  getPrevTabIndex,
  SKILL_PANEL_TABS,
  type TabDefinition,
} from "../../../src/components/skills/TabBar";
import {
  INITIAL_PANEL_STATE,
  skillPanelReducer,
  type PanelState,
} from "../../../src/components/skills/SkillPanel";
import type { SkillDetailData } from "../../../src/components/skills/SkillDetailView";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FULL_DETAIL: SkillDetailData = {
  name: "git-workflow",
  description: "Automate common Git workflows.",
  version: "1.2.0",
  enabled: true,
  trustLevel: "trusted",
  categories: ["development"],
  triggers: ["git"],
  requiredTools: ["git"],
  scripts: [],
  integrationStatus: "not_required",
  body: "",
};

// ---------------------------------------------------------------------------
// getNextTabIndex
// ---------------------------------------------------------------------------

describe("getNextTabIndex", () => {
  test("cycles from 0 to 1 with 3 tabs", () => {
    expect(getNextTabIndex(0, 3)).toBe(1);
  });

  test("cycles from 1 to 2 with 3 tabs", () => {
    expect(getNextTabIndex(1, 3)).toBe(2);
  });

  test("wraps from last tab back to 0", () => {
    expect(getNextTabIndex(2, 3)).toBe(0);
  });

  test("returns 0 for single tab", () => {
    expect(getNextTabIndex(0, 1)).toBe(0);
  });

  test("returns 0 for zero tabs", () => {
    expect(getNextTabIndex(0, 0)).toBe(0);
  });

  test("cycles correctly with 2 tabs", () => {
    expect(getNextTabIndex(0, 2)).toBe(1);
    expect(getNextTabIndex(1, 2)).toBe(0);
  });

  test("handles large tab count", () => {
    expect(getNextTabIndex(9, 10)).toBe(0);
    expect(getNextTabIndex(4, 10)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getPrevTabIndex
// ---------------------------------------------------------------------------

describe("getPrevTabIndex", () => {
  test("cycles from 1 to 0 with 3 tabs", () => {
    expect(getPrevTabIndex(1, 3)).toBe(0);
  });

  test("cycles from 2 to 1 with 3 tabs", () => {
    expect(getPrevTabIndex(2, 3)).toBe(1);
  });

  test("wraps from 0 to last tab", () => {
    expect(getPrevTabIndex(0, 3)).toBe(2);
  });

  test("returns 0 for single tab", () => {
    expect(getPrevTabIndex(0, 1)).toBe(0);
  });

  test("returns 0 for zero tabs", () => {
    expect(getPrevTabIndex(0, 0)).toBe(0);
  });

  test("cycles correctly with 2 tabs", () => {
    expect(getPrevTabIndex(0, 2)).toBe(1);
    expect(getPrevTabIndex(1, 2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SKILL_PANEL_TABS constant
// ---------------------------------------------------------------------------

describe("SKILL_PANEL_TABS", () => {
  test("has exactly 3 tabs", () => {
    expect(SKILL_PANEL_TABS.length).toBe(3);
  });

  test("first tab is Installed", () => {
    expect(SKILL_PANEL_TABS[0].label).toBe("Installed");
    expect(SKILL_PANEL_TABS[0].id).toBe("installed");
  });

  test("second tab is Reins Marketplace", () => {
    expect(SKILL_PANEL_TABS[1].label).toBe("Reins Marketplace");
    expect(SKILL_PANEL_TABS[1].id).toBe("reins");
  });

  test("third tab is ClawHub", () => {
    expect(SKILL_PANEL_TABS[2].label).toBe("ClawHub");
    expect(SKILL_PANEL_TABS[2].id).toBe("clawhub");
  });

  test("all tabs have unique ids", () => {
    const ids = SKILL_PANEL_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all tabs have non-empty labels", () => {
    for (const tab of SKILL_PANEL_TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// TabDefinition type shape
// ---------------------------------------------------------------------------

describe("TabDefinition type", () => {
  test("accepts valid tab definition", () => {
    const tab: TabDefinition = { label: "Test", id: "test" };
    expect(tab.label).toBe("Test");
    expect(tab.id).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// Full tab cycling sequence
// ---------------------------------------------------------------------------

describe("tab cycling sequence", () => {
  test("cycles through all 3 tabs and wraps around", () => {
    const count = SKILL_PANEL_TABS.length;
    let index = 0;

    // Installed -> Reins Marketplace
    index = getNextTabIndex(index, count);
    expect(index).toBe(1);

    // Reins Marketplace -> ClawHub
    index = getNextTabIndex(index, count);
    expect(index).toBe(2);

    // ClawHub -> Installed (wrap)
    index = getNextTabIndex(index, count);
    expect(index).toBe(0);
  });

  test("reverse cycling wraps correctly", () => {
    const count = SKILL_PANEL_TABS.length;
    let index = 0;

    // Installed -> ClawHub (wrap backward)
    index = getPrevTabIndex(index, count);
    expect(index).toBe(2);

    // ClawHub -> Reins Marketplace
    index = getPrevTabIndex(index, count);
    expect(index).toBe(1);

    // Reins Marketplace -> Installed
    index = getPrevTabIndex(index, count);
    expect(index).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: SWITCH_TAB
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SWITCH_TAB", () => {
  test("switches from Installed to Reins Marketplace tab", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "SWITCH_TAB",
      index: 1,
    });

    expect(state.activeTabIndex).toBe(1);
    expect(state.view).toBe("list");
  });

  test("switches from Reins Marketplace to ClawHub tab", () => {
    const reinsState: PanelState = {
      ...INITIAL_PANEL_STATE,
      activeTabIndex: 1,
    };

    const state = skillPanelReducer(reinsState, {
      type: "SWITCH_TAB",
      index: 2,
    });

    expect(state.activeTabIndex).toBe(2);
    expect(state.view).toBe("list");
  });

  test("wraps from ClawHub back to Installed", () => {
    const clawHubState: PanelState = {
      ...INITIAL_PANEL_STATE,
      activeTabIndex: 2,
    };

    const state = skillPanelReducer(clawHubState, {
      type: "SWITCH_TAB",
      index: 0,
    });

    expect(state.activeTabIndex).toBe(0);
    expect(state.view).toBe("list");
  });

  test("resets detail view when switching tabs", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
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

  test("switching to same tab still resets detail", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 0,
      selectedSkillName: "git-workflow",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, {
      type: "SWITCH_TAB",
      index: 0,
    });

    expect(state.activeTabIndex).toBe(0);
    expect(state.view).toBe("list");
    expect(state.selectedSkillName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: CLOSE resets activeTabIndex
// ---------------------------------------------------------------------------

describe("SkillPanel reducer CLOSE with tabs", () => {
  test("CLOSE resets activeTabIndex to 0", () => {
    const clawHubState: PanelState = {
      ...INITIAL_PANEL_STATE,
      activeTabIndex: 2,
    };

    const state = skillPanelReducer(clawHubState, { type: "CLOSE" });

    expect(state.activeTabIndex).toBe(0);
    expect(state.view).toBe("list");
    expect(state).toEqual(INITIAL_PANEL_STATE);
  });

  test("CLOSE from detail on non-Installed tab resets everything", () => {
    const detailState: PanelState = {
      view: "detail",
      activeTabIndex: 1,
      selectedSkillName: "some-skill",
      selectedDetail: FULL_DETAIL,
    };

    const state = skillPanelReducer(detailState, { type: "CLOSE" });

    expect(state).toEqual(INITIAL_PANEL_STATE);
  });
});

// ---------------------------------------------------------------------------
// SkillPanel initial state includes activeTabIndex
// ---------------------------------------------------------------------------

describe("SkillPanel initial state with tabs", () => {
  test("starts on Installed tab (index 0)", () => {
    expect(INITIAL_PANEL_STATE.activeTabIndex).toBe(0);
  });

  test("initial state has all expected fields", () => {
    expect(INITIAL_PANEL_STATE).toEqual({
      view: "list",
      activeTabIndex: 0,
      selectedSkillName: null,
      selectedDetail: null,
      selectedMarketplaceSkill: null,
      installState: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Tab navigation flow integration
// ---------------------------------------------------------------------------

describe("tab navigation flow", () => {
  test("Installed → select skill → switch tab → back to list", () => {
    let state = INITIAL_PANEL_STATE;

    // Select a skill on Installed tab
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "git-workflow",
      detail: FULL_DETAIL,
    });
    expect(state.view).toBe("detail");
    expect(state.activeTabIndex).toBe(0);

    // Switch to Reins Marketplace tab — should reset detail
    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 1 });
    expect(state.view).toBe("list");
    expect(state.activeTabIndex).toBe(1);
    expect(state.selectedSkillName).toBeNull();
  });

  test("cycle through all tabs and back preserves list view", () => {
    let state = INITIAL_PANEL_STATE;
    const count = SKILL_PANEL_TABS.length;

    for (let i = 0; i < count + 1; i++) {
      const nextIndex = getNextTabIndex(state.activeTabIndex, count);
      state = skillPanelReducer(state, { type: "SWITCH_TAB", index: nextIndex });
      expect(state.view).toBe("list");
    }

    // After full cycle + 1, should be back at tab 1
    expect(state.activeTabIndex).toBe(1);
  });

  test("GO_BACK preserves active tab index", () => {
    // Start on Reins Marketplace tab
    let state: PanelState = {
      ...INITIAL_PANEL_STATE,
      activeTabIndex: 1,
    };

    // Simulate selecting a skill (hypothetical future behavior)
    state = skillPanelReducer(state, {
      type: "SELECT_SKILL",
      name: "some-skill",
      detail: FULL_DETAIL,
    });
    expect(state.view).toBe("detail");
    expect(state.activeTabIndex).toBe(1);

    // Go back — should stay on Reins Marketplace tab
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
    expect(state.activeTabIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getHelpActions with tabs
// ---------------------------------------------------------------------------

describe("getHelpActions with tab support", () => {
  // Import from SkillPanel since that's where getHelpActions lives
  // (already imported via SkillPanel module)

  test("list view includes Tab switch action", () => {
    const { getHelpActions } = require("../../../src/components/skills/SkillPanel");
    const actions = getHelpActions("list");
    const keys = actions.map((a: { key: string }) => a.key);

    expect(keys).toContain("Tab");
  });

  test("list view Tab action label is Switch Tab", () => {
    const { getHelpActions } = require("../../../src/components/skills/SkillPanel");
    const actions = getHelpActions("list");
    const tabAction = actions.find((a: { key: string }) => a.key === "Tab");

    expect(tabAction).toBeDefined();
    expect(tabAction.label).toBe("Switch Tab");
  });

  test("detail view does not include Tab action", () => {
    const { getHelpActions } = require("../../../src/components/skills/SkillPanel");
    const actions = getHelpActions("detail");
    const keys = actions.map((a: { key: string }) => a.key);

    expect(keys).not.toContain("Tab");
  });

  test("list view has 6 actions for installed tab (with Tab)", () => {
    const { getHelpActions } = require("../../../src/components/skills/SkillPanel");
    expect(getHelpActions("list", 0).length).toBe(6);
  });
});
