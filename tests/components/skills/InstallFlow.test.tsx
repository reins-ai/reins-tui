import { describe, expect, test } from "bun:test";

import type {
  InstallResult,
  InstallStep,
  MarketplaceTrustLevel,
} from "@reins/core";

import {
  buildChecklist,
  getChecklistSymbol,
  getInstallFlowHelpActions,
  INITIAL_FLOW_STATE,
  INSTALL_STEP_LABELS,
  INSTALL_SUBSTEPS,
  installFlowReducer,
  type ChecklistItemStatus,
  type FlowState,
  type FlowStep,
} from "../../../src/components/skills/InstallFlow";

import {
  INITIAL_PANEL_STATE,
  skillPanelReducer,
  type PanelState,
} from "../../../src/components/skills/SkillPanel";

import type { MarketplaceSkillDetail } from "@reins/core";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_DETAIL: MarketplaceSkillDetail = {
  slug: "git-workflow",
  name: "Git Workflow",
  author: "reins-team",
  description: "Automate common git operations.",
  installCount: 4523,
  trustLevel: "verified",
  categories: ["development", "git"],
  version: "2.1.0",
  updatedAt: "2026-02-10T00:00:00Z",
  fullDescription: "A comprehensive skill for automating Git workflows.",
  requiredTools: ["git", "gh"],
  homepage: "https://github.com/reins-team/git-workflow",
  license: "MIT",
  versions: ["2.1.0", "2.0.0"],
};

const MOCK_INSTALL_RESULT: InstallResult = {
  slug: "git-workflow",
  version: "2.1.0",
  installedPath: "/home/user/.reins/skills/git-workflow",
  migrated: false,
};

const MOCK_MIGRATED_RESULT: InstallResult = {
  slug: "openclaw-skill",
  version: "1.0.0",
  installedPath: "/home/user/.reins/skills/openclaw-skill",
  migrated: true,
};

// ---------------------------------------------------------------------------
// installFlowReducer: ADVANCE_TO_CONFIRM
// ---------------------------------------------------------------------------

describe("InstallFlow reducer ADVANCE_TO_CONFIRM", () => {
  test("transitions from preview to confirm", () => {
    const state = installFlowReducer(INITIAL_FLOW_STATE, { type: "ADVANCE_TO_CONFIRM" });
    expect(state.step).toBe("confirm");
  });

  test("does not transition from confirm to confirm", () => {
    const confirmState: FlowState = { step: "confirm" };
    const state = installFlowReducer(confirmState, { type: "ADVANCE_TO_CONFIRM" });
    expect(state.step).toBe("confirm");
  });

  test("does not transition from progress to confirm", () => {
    const progressState: FlowState = { step: "progress" };
    const state = installFlowReducer(progressState, { type: "ADVANCE_TO_CONFIRM" });
    expect(state.step).toBe("progress");
  });

  test("does not transition from done to confirm", () => {
    const doneState: FlowState = { step: "done" };
    const state = installFlowReducer(doneState, { type: "ADVANCE_TO_CONFIRM" });
    expect(state.step).toBe("done");
  });

  test("does not transition from error to confirm", () => {
    const errorState: FlowState = { step: "error" };
    const state = installFlowReducer(errorState, { type: "ADVANCE_TO_CONFIRM" });
    expect(state.step).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// installFlowReducer: ADVANCE_TO_PROGRESS
// ---------------------------------------------------------------------------

describe("InstallFlow reducer ADVANCE_TO_PROGRESS", () => {
  test("transitions from confirm to progress", () => {
    const confirmState: FlowState = { step: "confirm" };
    const state = installFlowReducer(confirmState, { type: "ADVANCE_TO_PROGRESS" });
    expect(state.step).toBe("progress");
  });

  test("does not transition from preview to progress", () => {
    const state = installFlowReducer(INITIAL_FLOW_STATE, { type: "ADVANCE_TO_PROGRESS" });
    expect(state.step).toBe("preview");
  });

  test("does not transition from progress to progress", () => {
    const progressState: FlowState = { step: "progress" };
    const state = installFlowReducer(progressState, { type: "ADVANCE_TO_PROGRESS" });
    expect(state.step).toBe("progress");
  });
});

// ---------------------------------------------------------------------------
// installFlowReducer: ADVANCE_TO_DONE
// ---------------------------------------------------------------------------

describe("InstallFlow reducer ADVANCE_TO_DONE", () => {
  test("transitions from progress to done", () => {
    const progressState: FlowState = { step: "progress" };
    const state = installFlowReducer(progressState, { type: "ADVANCE_TO_DONE" });
    expect(state.step).toBe("done");
  });

  test("does not transition from confirm to done", () => {
    const confirmState: FlowState = { step: "confirm" };
    const state = installFlowReducer(confirmState, { type: "ADVANCE_TO_DONE" });
    expect(state.step).toBe("confirm");
  });

  test("does not transition from preview to done", () => {
    const state = installFlowReducer(INITIAL_FLOW_STATE, { type: "ADVANCE_TO_DONE" });
    expect(state.step).toBe("preview");
  });
});

// ---------------------------------------------------------------------------
// installFlowReducer: SET_ERROR
// ---------------------------------------------------------------------------

describe("InstallFlow reducer SET_ERROR", () => {
  test("transitions from progress to error", () => {
    const progressState: FlowState = { step: "progress" };
    const state = installFlowReducer(progressState, { type: "SET_ERROR" });
    expect(state.step).toBe("error");
  });

  test("does not transition from preview to error", () => {
    const state = installFlowReducer(INITIAL_FLOW_STATE, { type: "SET_ERROR" });
    expect(state.step).toBe("preview");
  });

  test("does not transition from confirm to error", () => {
    const confirmState: FlowState = { step: "confirm" };
    const state = installFlowReducer(confirmState, { type: "SET_ERROR" });
    expect(state.step).toBe("confirm");
  });

  test("does not transition from done to error", () => {
    const doneState: FlowState = { step: "done" };
    const state = installFlowReducer(doneState, { type: "SET_ERROR" });
    expect(state.step).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// installFlowReducer: RETRY
// ---------------------------------------------------------------------------

describe("InstallFlow reducer RETRY", () => {
  test("transitions from error back to confirm", () => {
    const errorState: FlowState = { step: "error" };
    const state = installFlowReducer(errorState, { type: "RETRY" });
    expect(state.step).toBe("confirm");
  });

  test("does not transition from preview on retry", () => {
    const state = installFlowReducer(INITIAL_FLOW_STATE, { type: "RETRY" });
    expect(state.step).toBe("preview");
  });

  test("does not transition from progress on retry", () => {
    const progressState: FlowState = { step: "progress" };
    const state = installFlowReducer(progressState, { type: "RETRY" });
    expect(state.step).toBe("progress");
  });

  test("does not transition from done on retry", () => {
    const doneState: FlowState = { step: "done" };
    const state = installFlowReducer(doneState, { type: "RETRY" });
    expect(state.step).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// installFlowReducer: unknown action
// ---------------------------------------------------------------------------

describe("InstallFlow reducer unknown action", () => {
  test("returns state unchanged for unknown action type", () => {
    const state = installFlowReducer(
      INITIAL_FLOW_STATE,
      // @ts-expect-error — testing unknown action type
      { type: "UNKNOWN_ACTION" },
    );
    expect(state).toEqual(INITIAL_FLOW_STATE);
  });
});

// ---------------------------------------------------------------------------
// installFlowReducer: full flow transitions
// ---------------------------------------------------------------------------

describe("InstallFlow full flow transitions", () => {
  test("preview → confirm → progress → done (happy path)", () => {
    let state: FlowState = INITIAL_FLOW_STATE;
    expect(state.step).toBe("preview");

    state = installFlowReducer(state, { type: "ADVANCE_TO_CONFIRM" });
    expect(state.step).toBe("confirm");

    state = installFlowReducer(state, { type: "ADVANCE_TO_PROGRESS" });
    expect(state.step).toBe("progress");

    state = installFlowReducer(state, { type: "ADVANCE_TO_DONE" });
    expect(state.step).toBe("done");
  });

  test("preview → confirm → progress → error → retry → confirm → progress → done", () => {
    let state: FlowState = INITIAL_FLOW_STATE;

    state = installFlowReducer(state, { type: "ADVANCE_TO_CONFIRM" });
    state = installFlowReducer(state, { type: "ADVANCE_TO_PROGRESS" });
    state = installFlowReducer(state, { type: "SET_ERROR" });
    expect(state.step).toBe("error");

    state = installFlowReducer(state, { type: "RETRY" });
    expect(state.step).toBe("confirm");

    state = installFlowReducer(state, { type: "ADVANCE_TO_PROGRESS" });
    state = installFlowReducer(state, { type: "ADVANCE_TO_DONE" });
    expect(state.step).toBe("done");
  });

  test("preview → confirm → progress → error → retry → confirm (multiple retries)", () => {
    let state: FlowState = INITIAL_FLOW_STATE;

    state = installFlowReducer(state, { type: "ADVANCE_TO_CONFIRM" });
    state = installFlowReducer(state, { type: "ADVANCE_TO_PROGRESS" });
    state = installFlowReducer(state, { type: "SET_ERROR" });
    state = installFlowReducer(state, { type: "RETRY" });
    expect(state.step).toBe("confirm");

    state = installFlowReducer(state, { type: "ADVANCE_TO_PROGRESS" });
    state = installFlowReducer(state, { type: "SET_ERROR" });
    state = installFlowReducer(state, { type: "RETRY" });
    expect(state.step).toBe("confirm");
  });
});

// ---------------------------------------------------------------------------
// INITIAL_FLOW_STATE
// ---------------------------------------------------------------------------

describe("InstallFlow initial state", () => {
  test("starts at preview step", () => {
    expect(INITIAL_FLOW_STATE.step).toBe("preview");
  });
});

// ---------------------------------------------------------------------------
// buildChecklist
// ---------------------------------------------------------------------------

describe("InstallFlow buildChecklist", () => {
  test("all pending when progress is null", () => {
    const checklist = buildChecklist(null);
    expect(checklist.length).toBe(5);
    for (const item of checklist) {
      expect(item.status).toBe("pending");
    }
  });

  test("downloading step marks first item active, rest pending", () => {
    const checklist = buildChecklist("downloading");
    expect(checklist[0].step).toBe("downloading");
    expect(checklist[0].status).toBe("active");
    expect(checklist[1].status).toBe("pending");
    expect(checklist[2].status).toBe("pending");
    expect(checklist[3].status).toBe("pending");
    expect(checklist[4].status).toBe("pending");
  });

  test("extracting step marks downloading complete, extracting active", () => {
    const checklist = buildChecklist("extracting");
    expect(checklist[0].status).toBe("complete");
    expect(checklist[1].status).toBe("active");
    expect(checklist[2].status).toBe("pending");
    expect(checklist[3].status).toBe("pending");
    expect(checklist[4].status).toBe("pending");
  });

  test("migrating step marks first two complete, migrating active", () => {
    const checklist = buildChecklist("migrating");
    expect(checklist[0].status).toBe("complete");
    expect(checklist[1].status).toBe("complete");
    expect(checklist[2].status).toBe("active");
    expect(checklist[3].status).toBe("pending");
    expect(checklist[4].status).toBe("pending");
  });

  test("validating step marks first three complete, validating active", () => {
    const checklist = buildChecklist("validating");
    expect(checklist[0].status).toBe("complete");
    expect(checklist[1].status).toBe("complete");
    expect(checklist[2].status).toBe("complete");
    expect(checklist[3].status).toBe("active");
    expect(checklist[4].status).toBe("pending");
  });

  test("installing step marks first four complete, installing active", () => {
    const checklist = buildChecklist("installing");
    expect(checklist[0].status).toBe("complete");
    expect(checklist[1].status).toBe("complete");
    expect(checklist[2].status).toBe("complete");
    expect(checklist[3].status).toBe("complete");
    expect(checklist[4].status).toBe("active");
  });

  test("complete step marks all items complete", () => {
    const checklist = buildChecklist("complete");
    expect(checklist.length).toBe(5);
    for (const item of checklist) {
      expect(item.status).toBe("complete");
    }
  });

  test("detecting step maps to extracting active", () => {
    const checklist = buildChecklist("detecting");
    expect(checklist[0].status).toBe("complete");
    expect(checklist[1].status).toBe("active");
    expect(checklist[2].status).toBe("pending");
  });

  test("checklist items have correct labels", () => {
    const checklist = buildChecklist(null);
    expect(checklist[0].label).toBe("Downloading");
    expect(checklist[1].label).toBe("Extracting");
    expect(checklist[2].label).toBe("Migrating");
    expect(checklist[3].label).toBe("Validating");
    expect(checklist[4].label).toBe("Installing");
  });

  test("checklist items have correct step identifiers", () => {
    const checklist = buildChecklist(null);
    expect(checklist[0].step).toBe("downloading");
    expect(checklist[1].step).toBe("extracting");
    expect(checklist[2].step).toBe("migrating");
    expect(checklist[3].step).toBe("validating");
    expect(checklist[4].step).toBe("installing");
  });
});

// ---------------------------------------------------------------------------
// INSTALL_SUBSTEPS and INSTALL_STEP_LABELS
// ---------------------------------------------------------------------------

describe("InstallFlow constants", () => {
  test("INSTALL_SUBSTEPS has 5 steps", () => {
    expect(INSTALL_SUBSTEPS.length).toBe(5);
  });

  test("INSTALL_SUBSTEPS are in correct order", () => {
    expect(INSTALL_SUBSTEPS[0]).toBe("downloading");
    expect(INSTALL_SUBSTEPS[1]).toBe("extracting");
    expect(INSTALL_SUBSTEPS[2]).toBe("migrating");
    expect(INSTALL_SUBSTEPS[3]).toBe("validating");
    expect(INSTALL_SUBSTEPS[4]).toBe("installing");
  });

  test("INSTALL_STEP_LABELS has a label for each substep", () => {
    for (const step of INSTALL_SUBSTEPS) {
      expect(INSTALL_STEP_LABELS[step]).toBeDefined();
      expect(INSTALL_STEP_LABELS[step].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getChecklistSymbol
// ---------------------------------------------------------------------------

describe("InstallFlow getChecklistSymbol", () => {
  test("pending returns empty checkbox", () => {
    expect(getChecklistSymbol("pending")).toBe("☐");
  });

  test("active returns filled circle", () => {
    expect(getChecklistSymbol("active")).toBe("◉");
  });

  test("complete returns checkmark", () => {
    expect(getChecklistSymbol("complete")).toBe("✓");
  });

  test("each status has a unique symbol", () => {
    const statuses: ChecklistItemStatus[] = ["pending", "active", "complete"];
    const symbols = statuses.map(getChecklistSymbol);
    const unique = new Set(symbols);
    expect(unique.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getInstallFlowHelpActions
// ---------------------------------------------------------------------------

describe("InstallFlow getInstallFlowHelpActions", () => {
  test("preview step shows Enter/Continue and Esc/Cancel", () => {
    const actions = getInstallFlowHelpActions("preview");
    expect(actions.length).toBe(2);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain("Enter");
    expect(keys).toContain("Esc");

    const enterAction = actions.find((a) => a.key === "Enter");
    expect(enterAction!.label).toBe("Continue");
  });

  test("confirm step shows Enter/Install and Esc/Cancel", () => {
    const actions = getInstallFlowHelpActions("confirm");
    expect(actions.length).toBe(2);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain("Enter");
    expect(keys).toContain("Esc");

    const enterAction = actions.find((a) => a.key === "Enter");
    expect(enterAction!.label).toBe("Install");
  });

  test("progress step shows no actions", () => {
    const actions = getInstallFlowHelpActions("progress");
    expect(actions.length).toBe(0);
  });

  test("done step shows Esc/Back", () => {
    const actions = getInstallFlowHelpActions("done");
    expect(actions.length).toBe(1);
    expect(actions[0].key).toBe("Esc");
    expect(actions[0].label).toBe("Back");
  });

  test("error step shows r/Retry and Esc/Cancel", () => {
    const actions = getInstallFlowHelpActions("error");
    expect(actions.length).toBe(2);

    const keys = actions.map((a) => a.key);
    expect(keys).toContain("r");
    expect(keys).toContain("Esc");

    const retryAction = actions.find((a) => a.key === "r");
    expect(retryAction!.label).toBe("Retry");
  });

  test("all flow steps return valid help actions", () => {
    const steps: FlowStep[] = ["preview", "confirm", "progress", "done", "error"];
    for (const step of steps) {
      const actions = getInstallFlowHelpActions(step);
      expect(Array.isArray(actions)).toBe(true);
      for (const action of actions) {
        expect(action.key.length).toBeGreaterThan(0);
        expect(action.label.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: START_INSTALL
// ---------------------------------------------------------------------------

describe("SkillPanel reducer START_INSTALL", () => {
  test("transitions to install view with install state", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    expect(state.view).toBe("install");
    expect(state.installState).not.toBeNull();
    expect(state.installState!.slug).toBe("git-workflow");
    expect(state.installState!.version).toBe("2.1.0");
    expect(state.installState!.detail).toBe(MOCK_DETAIL);
    expect(state.installState!.progress).toBeNull();
    expect(state.installState!.error).toBeNull();
    expect(state.installState!.result).toBeNull();
  });

  test("preserves active tab index", () => {
    const clawHubState: PanelState = {
      ...INITIAL_PANEL_STATE,
      activeTabIndex: 1,
    };

    const state = skillPanelReducer(clawHubState, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    expect(state.activeTabIndex).toBe(1);
    expect(state.view).toBe("install");
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: INSTALL_PROGRESS
// ---------------------------------------------------------------------------

describe("SkillPanel reducer INSTALL_PROGRESS", () => {
  test("updates progress step in install state", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });

    expect(state.installState!.progress).toBe("downloading");
  });

  test("updates progress through multiple steps", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    const steps: InstallStep[] = ["downloading", "extracting", "validating", "installing"];
    for (const step of steps) {
      state = skillPanelReducer(state, { type: "INSTALL_PROGRESS", step });
      expect(state.installState!.progress).toBe(step);
    }
  });

  test("does nothing when installState is null", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });

    expect(state.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: INSTALL_ERROR
// ---------------------------------------------------------------------------

describe("SkillPanel reducer INSTALL_ERROR", () => {
  test("sets error in install state", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_ERROR",
      error: "Network timeout",
    });

    expect(state.installState!.error).toBe("Network timeout");
  });

  test("does nothing when installState is null", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_ERROR",
      error: "Network timeout",
    });

    expect(state.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: INSTALL_COMPLETE
// ---------------------------------------------------------------------------

describe("SkillPanel reducer INSTALL_COMPLETE", () => {
  test("sets result in install state", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_COMPLETE",
      result: MOCK_INSTALL_RESULT,
    });

    expect(state.installState!.result).toBe(MOCK_INSTALL_RESULT);
  });

  test("does nothing when installState is null", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_COMPLETE",
      result: MOCK_INSTALL_RESULT,
    });

    expect(state.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: INSTALL_RESET
// ---------------------------------------------------------------------------

describe("SkillPanel reducer INSTALL_RESET", () => {
  test("resets progress, error, and result but keeps slug/version/detail", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
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

    expect(state.installState!.slug).toBe("git-workflow");
    expect(state.installState!.version).toBe("2.1.0");
    expect(state.installState!.detail).toBe(MOCK_DETAIL);
    expect(state.installState!.progress).toBeNull();
    expect(state.installState!.error).toBeNull();
    expect(state.installState!.result).toBeNull();
  });

  test("does nothing when installState is null", () => {
    const state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "INSTALL_RESET",
    });

    expect(state.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: GO_BACK clears install state
// ---------------------------------------------------------------------------

describe("SkillPanel reducer GO_BACK clears install state", () => {
  test("clears installState on GO_BACK from install view", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    expect(state.installState).not.toBeNull();

    state = skillPanelReducer(state, { type: "GO_BACK" });

    expect(state.view).toBe("list");
    expect(state.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: SWITCH_TAB clears install state
// ---------------------------------------------------------------------------

describe("SkillPanel reducer SWITCH_TAB clears install state", () => {
  test("clears installState on tab switch", () => {
    let state = skillPanelReducer(
      { ...INITIAL_PANEL_STATE, activeTabIndex: 1 },
      {
        type: "START_INSTALL",
        slug: "git-workflow",
        version: "2.1.0",
        detail: MOCK_DETAIL,
      },
    );

    state = skillPanelReducer(state, { type: "SWITCH_TAB", index: 0 });

    expect(state.installState).toBeNull();
    expect(state.view).toBe("list");
  });
});

// ---------------------------------------------------------------------------
// SkillPanel reducer: CLOSE clears install state
// ---------------------------------------------------------------------------

describe("SkillPanel reducer CLOSE clears install state", () => {
  test("resets installState on CLOSE", () => {
    let state = skillPanelReducer(INITIAL_PANEL_STATE, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, { type: "CLOSE" });

    expect(state).toEqual(INITIAL_PANEL_STATE);
    expect(state.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel install navigation flow
// ---------------------------------------------------------------------------

describe("SkillPanel install navigation flow", () => {
  test("detail → start install → go back → list", () => {
    let state: PanelState = { ...INITIAL_PANEL_STATE, activeTabIndex: 1 };

    // Select a marketplace skill
    state = skillPanelReducer(state, {
      type: "SELECT_MARKETPLACE_SKILL",
      slug: "git-workflow",
    });
    expect(state.view).toBe("detail");

    // Start install
    state = skillPanelReducer(state, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });
    expect(state.view).toBe("install");
    expect(state.installState).not.toBeNull();

    // Go back
    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
    expect(state.installState).toBeNull();
  });

  test("start install → progress → complete → go back", () => {
    let state: PanelState = { ...INITIAL_PANEL_STATE, activeTabIndex: 1 };

    state = skillPanelReducer(state, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });
    expect(state.installState!.progress).toBe("downloading");

    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "complete",
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_COMPLETE",
      result: MOCK_INSTALL_RESULT,
    });
    expect(state.installState!.result).toBe(MOCK_INSTALL_RESULT);

    state = skillPanelReducer(state, { type: "GO_BACK" });
    expect(state.view).toBe("list");
    expect(state.installState).toBeNull();
  });

  test("start install → error → reset → progress → complete", () => {
    let state: PanelState = { ...INITIAL_PANEL_STATE, activeTabIndex: 1 };

    state = skillPanelReducer(state, {
      type: "START_INSTALL",
      slug: "git-workflow",
      version: "2.1.0",
      detail: MOCK_DETAIL,
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });

    state = skillPanelReducer(state, {
      type: "INSTALL_ERROR",
      error: "Network error",
    });
    expect(state.installState!.error).toBe("Network error");

    // Reset for retry
    state = skillPanelReducer(state, { type: "INSTALL_RESET" });
    expect(state.installState!.progress).toBeNull();
    expect(state.installState!.error).toBeNull();

    // Retry succeeds
    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "downloading",
    });
    state = skillPanelReducer(state, {
      type: "INSTALL_PROGRESS",
      step: "complete",
    });
    state = skillPanelReducer(state, {
      type: "INSTALL_COMPLETE",
      result: MOCK_INSTALL_RESULT,
    });
    expect(state.installState!.result).toBe(MOCK_INSTALL_RESULT);
  });
});

// ---------------------------------------------------------------------------
// SkillPanel initial state includes installState
// ---------------------------------------------------------------------------

describe("SkillPanel initial state includes installState", () => {
  test("installState is null initially", () => {
    expect(INITIAL_PANEL_STATE.installState).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillPanel getHelpActions for install view
// ---------------------------------------------------------------------------

describe("SkillPanel getHelpActions for install view", () => {
  // Import getHelpActions from SkillPanel
  test("install view returns empty actions (InstallFlow manages its own)", async () => {
    const { getHelpActions } = await import("../../../src/components/skills/SkillPanel");
    const actions = getHelpActions("install");
    expect(actions.length).toBe(0);
  });
});
