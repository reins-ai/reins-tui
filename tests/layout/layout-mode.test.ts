import { describe, expect, test } from "bun:test";

import {
  reduceLayoutMode,
  reducePanelState,
  getLayoutVisibility,
  getLayoutModeLabel,
  isLayoutMode,
  isPanelId,
  deriveLayoutMode,
  getTopmostUnpinnedPanel,
  getVisiblePanels,
  hasVisiblePanels,
  toPinPreferences,
  applyPinPreferences,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_PANEL_STATE,
  DEFAULT_PIN_PREFERENCES,
  LAYOUT_MODES,
  PANEL_IDS,
  type LayoutMode,
  type LayoutModeAction,
  type PanelState,
  type LayoutAction,
} from "../../src/state/layout-mode";
import { appReducer, DEFAULT_STATE, type AppAction } from "../../src/store";

// --- Legacy layout mode reducer tests ---

describe("layout-mode reducer (legacy)", () => {
  test("default mode is zen (conversation-only)", () => {
    expect(DEFAULT_LAYOUT_MODE).toBe("zen");
  });

  test("LAYOUT_MODES contains all three modes", () => {
    expect(LAYOUT_MODES).toEqual(["normal", "activity", "zen"]);
  });

  describe("isLayoutMode", () => {
    test("returns true for valid modes", () => {
      expect(isLayoutMode("normal")).toBe(true);
      expect(isLayoutMode("activity")).toBe(true);
      expect(isLayoutMode("zen")).toBe(true);
    });

    test("returns false for invalid values", () => {
      expect(isLayoutMode("invalid")).toBe(false);
      expect(isLayoutMode("")).toBe(false);
      expect(isLayoutMode(null)).toBe(false);
      expect(isLayoutMode(undefined)).toBe(false);
      expect(isLayoutMode(42)).toBe(false);
    });
  });

  describe("TOGGLE_ACTIVITY", () => {
    const action: LayoutModeAction = { type: "TOGGLE_ACTIVITY" };

    test("zen → activity", () => {
      expect(reduceLayoutMode("zen", action)).toBe("activity");
    });

    test("activity → zen", () => {
      expect(reduceLayoutMode("activity", action)).toBe("zen");
    });

    test("normal → activity", () => {
      expect(reduceLayoutMode("normal", action)).toBe("activity");
    });
  });

  describe("TOGGLE_ZEN", () => {
    const action: LayoutModeAction = { type: "TOGGLE_ZEN" };

    test("normal → zen", () => {
      expect(reduceLayoutMode("normal", action)).toBe("zen");
    });

    test("zen → zen (stays zen)", () => {
      expect(reduceLayoutMode("zen", action)).toBe("zen");
    });

    test("activity → zen", () => {
      expect(reduceLayoutMode("activity", action)).toBe("zen");
    });
  });

  describe("SET_LAYOUT_MODE", () => {
    test("sets to valid mode", () => {
      expect(reduceLayoutMode("normal", { type: "SET_LAYOUT_MODE", payload: "zen" })).toBe("zen");
      expect(reduceLayoutMode("zen", { type: "SET_LAYOUT_MODE", payload: "activity" })).toBe("activity");
      expect(reduceLayoutMode("activity", { type: "SET_LAYOUT_MODE", payload: "normal" })).toBe("normal");
    });

    test("ignores invalid payload", () => {
      expect(reduceLayoutMode("normal", { type: "SET_LAYOUT_MODE", payload: "invalid" as LayoutMode })).toBe("normal");
    });
  });
});

// --- Panel state reducer tests ---

describe("panel state reducer", () => {
  test("default panel state has all panels hidden and unpinned", () => {
    expect(DEFAULT_PANEL_STATE.drawer.visible).toBe(false);
    expect(DEFAULT_PANEL_STATE.drawer.pinned).toBe(false);
    expect(DEFAULT_PANEL_STATE.today.visible).toBe(false);
    expect(DEFAULT_PANEL_STATE.today.pinned).toBe(false);
    expect(DEFAULT_PANEL_STATE.modal.visible).toBe(false);
    expect(DEFAULT_PANEL_STATE.modal.pinned).toBe(false);
  });

  describe("TOGGLE_PANEL", () => {
    test("toggles drawer from hidden to visible", () => {
      const next = reducePanelState(DEFAULT_PANEL_STATE, { type: "TOGGLE_PANEL", payload: "drawer" });
      expect(next.drawer.visible).toBe(true);
      expect(next.today.visible).toBe(false);
      expect(next.modal.visible).toBe(false);
    });

    test("toggles drawer from visible to hidden", () => {
      const visible: PanelState = {
        ...DEFAULT_PANEL_STATE,
        drawer: { visible: true, pinned: false },
      };
      const next = reducePanelState(visible, { type: "TOGGLE_PANEL", payload: "drawer" });
      expect(next.drawer.visible).toBe(false);
    });

    test("toggles today panel independently", () => {
      const next = reducePanelState(DEFAULT_PANEL_STATE, { type: "TOGGLE_PANEL", payload: "today" });
      expect(next.today.visible).toBe(true);
      expect(next.drawer.visible).toBe(false);
    });

    test("toggles modal independently", () => {
      const next = reducePanelState(DEFAULT_PANEL_STATE, { type: "TOGGLE_PANEL", payload: "modal" });
      expect(next.modal.visible).toBe(true);
    });

    test("preserves pin state when toggling", () => {
      const pinned: PanelState = {
        ...DEFAULT_PANEL_STATE,
        drawer: { visible: false, pinned: true },
      };
      const next = reducePanelState(pinned, { type: "TOGGLE_PANEL", payload: "drawer" });
      expect(next.drawer.visible).toBe(true);
      expect(next.drawer.pinned).toBe(true);
    });
  });

  describe("DISMISS_PANEL", () => {
    test("dismisses a visible panel", () => {
      const visible: PanelState = {
        ...DEFAULT_PANEL_STATE,
        drawer: { visible: true, pinned: false },
      };
      const next = reducePanelState(visible, { type: "DISMISS_PANEL", payload: "drawer" });
      expect(next.drawer.visible).toBe(false);
    });

    test("no-op when panel is already hidden", () => {
      const next = reducePanelState(DEFAULT_PANEL_STATE, { type: "DISMISS_PANEL", payload: "drawer" });
      expect(next).toBe(DEFAULT_PANEL_STATE);
    });
  });

  describe("PIN_PANEL / UNPIN_PANEL", () => {
    test("pins a panel", () => {
      const next = reducePanelState(DEFAULT_PANEL_STATE, { type: "PIN_PANEL", payload: "drawer" });
      expect(next.drawer.pinned).toBe(true);
    });

    test("unpins a panel", () => {
      const pinned: PanelState = {
        ...DEFAULT_PANEL_STATE,
        drawer: { visible: true, pinned: true },
      };
      const next = reducePanelState(pinned, { type: "UNPIN_PANEL", payload: "drawer" });
      expect(next.drawer.pinned).toBe(false);
      expect(next.drawer.visible).toBe(true);
    });
  });

  describe("DISMISS_ALL", () => {
    test("dismisses all visible panels", () => {
      const allVisible: PanelState = {
        drawer: { visible: true, pinned: false },
        today: { visible: true, pinned: false },
        modal: { visible: true, pinned: false },
      };
      const next = reducePanelState(allVisible, { type: "DISMISS_ALL" });
      expect(next.drawer.visible).toBe(false);
      expect(next.today.visible).toBe(false);
      expect(next.modal.visible).toBe(false);
    });

    test("preserves pin state when dismissing all", () => {
      const mixed: PanelState = {
        drawer: { visible: true, pinned: true },
        today: { visible: true, pinned: false },
        modal: { visible: false, pinned: false },
      };
      const next = reducePanelState(mixed, { type: "DISMISS_ALL" });
      expect(next.drawer.pinned).toBe(true);
      expect(next.today.pinned).toBe(false);
    });
  });

  describe("DISMISS_TOPMOST", () => {
    test("dismisses modal when modal and drawer are both visible", () => {
      const both: PanelState = {
        drawer: { visible: true, pinned: false },
        today: { visible: false, pinned: false },
        modal: { visible: true, pinned: false },
      };
      const next = reducePanelState(both, { type: "DISMISS_TOPMOST" });
      expect(next.modal.visible).toBe(false);
      expect(next.drawer.visible).toBe(true);
    });

    test("dismisses drawer when only drawer is visible", () => {
      const drawerOnly: PanelState = {
        ...DEFAULT_PANEL_STATE,
        drawer: { visible: true, pinned: false },
      };
      const next = reducePanelState(drawerOnly, { type: "DISMISS_TOPMOST" });
      expect(next.drawer.visible).toBe(false);
    });

    test("skips pinned panels", () => {
      const pinnedModal: PanelState = {
        drawer: { visible: true, pinned: false },
        today: { visible: false, pinned: false },
        modal: { visible: true, pinned: true },
      };
      const next = reducePanelState(pinnedModal, { type: "DISMISS_TOPMOST" });
      expect(next.modal.visible).toBe(true);
      expect(next.drawer.visible).toBe(false);
    });

    test("no-op when no unpinned panels are visible", () => {
      const allPinned: PanelState = {
        drawer: { visible: true, pinned: true },
        today: { visible: false, pinned: false },
        modal: { visible: true, pinned: true },
      };
      const next = reducePanelState(allPinned, { type: "DISMISS_TOPMOST" });
      expect(next).toBe(allPinned);
    });

    test("no-op when no panels are visible", () => {
      const next = reducePanelState(DEFAULT_PANEL_STATE, { type: "DISMISS_TOPMOST" });
      expect(next).toBe(DEFAULT_PANEL_STATE);
    });
  });
});

// --- Helper function tests ---

describe("panel helper functions", () => {
  test("isPanelId validates panel identifiers", () => {
    expect(isPanelId("drawer")).toBe(true);
    expect(isPanelId("today")).toBe(true);
    expect(isPanelId("modal")).toBe(true);
    expect(isPanelId("sidebar")).toBe(false);
    expect(isPanelId("")).toBe(false);
    expect(isPanelId(null)).toBe(false);
  });

  test("getTopmostUnpinnedPanel returns highest z-order unpinned panel", () => {
    const both: PanelState = {
      drawer: { visible: true, pinned: false },
      today: { visible: false, pinned: false },
      modal: { visible: true, pinned: false },
    };
    expect(getTopmostUnpinnedPanel(both)).toBe("modal");
  });

  test("getTopmostUnpinnedPanel returns null when all visible are pinned", () => {
    const allPinned: PanelState = {
      drawer: { visible: true, pinned: true },
      today: { visible: false, pinned: false },
      modal: { visible: true, pinned: true },
    };
    expect(getTopmostUnpinnedPanel(allPinned)).toBe(null);
  });

  test("getTopmostUnpinnedPanel returns null when no panels visible", () => {
    expect(getTopmostUnpinnedPanel(DEFAULT_PANEL_STATE)).toBe(null);
  });

  test("getVisiblePanels returns visible panels sorted by z-order", () => {
    const mixed: PanelState = {
      drawer: { visible: true, pinned: false },
      today: { visible: false, pinned: false },
      modal: { visible: true, pinned: false },
    };
    expect(getVisiblePanels(mixed)).toEqual(["drawer", "modal"]);
  });

  test("getVisiblePanels returns empty array when none visible", () => {
    expect(getVisiblePanels(DEFAULT_PANEL_STATE)).toEqual([]);
  });

  test("hasVisiblePanels returns true when any panel is visible", () => {
    const one: PanelState = {
      ...DEFAULT_PANEL_STATE,
      drawer: { visible: true, pinned: false },
    };
    expect(hasVisiblePanels(one)).toBe(true);
  });

  test("hasVisiblePanels returns false when none visible", () => {
    expect(hasVisiblePanels(DEFAULT_PANEL_STATE)).toBe(false);
  });
});

// --- Layout mode derivation tests ---

describe("deriveLayoutMode", () => {
  test("no panels visible → zen", () => {
    expect(deriveLayoutMode(DEFAULT_PANEL_STATE)).toBe("zen");
  });

  test("drawer visible → normal", () => {
    const state: PanelState = {
      ...DEFAULT_PANEL_STATE,
      drawer: { visible: true, pinned: false },
    };
    expect(deriveLayoutMode(state)).toBe("normal");
  });

  test("today visible → activity", () => {
    const state: PanelState = {
      ...DEFAULT_PANEL_STATE,
      today: { visible: true, pinned: false },
    };
    expect(deriveLayoutMode(state)).toBe("activity");
  });

  test("drawer + today visible → activity", () => {
    const state: PanelState = {
      drawer: { visible: true, pinned: false },
      today: { visible: true, pinned: false },
      modal: { visible: false, pinned: false },
    };
    expect(deriveLayoutMode(state)).toBe("activity");
  });

  test("modal only does not change mode", () => {
    const state: PanelState = {
      ...DEFAULT_PANEL_STATE,
      modal: { visible: true, pinned: false },
    };
    expect(deriveLayoutMode(state)).toBe("zen");
  });
});

// --- Pin preferences tests ---

describe("pin preferences", () => {
  test("toPinPreferences extracts pin state", () => {
    const panels: PanelState = {
      drawer: { visible: true, pinned: true },
      today: { visible: false, pinned: false },
      modal: { visible: true, pinned: true },
    };
    const prefs = toPinPreferences(panels);
    expect(prefs.drawer).toBe(true);
    expect(prefs.today).toBe(false);
    expect(prefs.modal).toBe(true);
  });

  test("applyPinPreferences restores pin state", () => {
    const prefs = { drawer: true, today: false, modal: true };
    const result = applyPinPreferences(DEFAULT_PANEL_STATE, prefs);
    expect(result.drawer.pinned).toBe(true);
    expect(result.drawer.visible).toBe(false);
    expect(result.today.pinned).toBe(false);
    expect(result.modal.pinned).toBe(true);
    expect(result.modal.visible).toBe(false);
  });

  test("DEFAULT_PIN_PREFERENCES has all false", () => {
    expect(DEFAULT_PIN_PREFERENCES.drawer).toBe(false);
    expect(DEFAULT_PIN_PREFERENCES.today).toBe(false);
    expect(DEFAULT_PIN_PREFERENCES.modal).toBe(false);
  });
});

// --- Visibility tests ---

describe("getLayoutVisibility", () => {
  test("normal mode shows sidebar and conversation", () => {
    const visibility = getLayoutVisibility("normal");
    expect(visibility.showSidebar).toBe(true);
    expect(visibility.showConversation).toBe(true);
    expect(visibility.showActivityPanel).toBe(false);
  });

  test("activity mode shows all panels", () => {
    const visibility = getLayoutVisibility("activity");
    expect(visibility.showSidebar).toBe(true);
    expect(visibility.showConversation).toBe(true);
    expect(visibility.showActivityPanel).toBe(true);
  });

  test("zen mode shows only conversation", () => {
    const visibility = getLayoutVisibility("zen");
    expect(visibility.showSidebar).toBe(false);
    expect(visibility.showConversation).toBe(true);
    expect(visibility.showActivityPanel).toBe(false);
  });
});

describe("getLayoutModeLabel", () => {
  test("returns human-readable labels", () => {
    expect(getLayoutModeLabel("normal")).toBe("Normal");
    expect(getLayoutModeLabel("activity")).toBe("Activity");
    expect(getLayoutModeLabel("zen")).toBe("Zen");
  });
});

// --- App reducer integration tests ---

describe("appReducer panel integration", () => {
  test("default state has zen layout mode (conversation-only)", () => {
    expect(DEFAULT_STATE.layoutMode).toBe("zen");
  });

  test("default state has all panels hidden", () => {
    expect(DEFAULT_STATE.panels.drawer.visible).toBe(false);
    expect(DEFAULT_STATE.panels.today.visible).toBe(false);
    expect(DEFAULT_STATE.panels.modal.visible).toBe(false);
  });

  test("TOGGLE_PANEL drawer opens drawer and derives normal mode", () => {
    const next = appReducer(DEFAULT_STATE, { type: "TOGGLE_PANEL", payload: "drawer" });
    expect(next.panels.drawer.visible).toBe(true);
    expect(next.layoutMode).toBe("normal");
  });

  test("TOGGLE_PANEL today opens today and derives activity mode", () => {
    const next = appReducer(DEFAULT_STATE, { type: "TOGGLE_PANEL", payload: "today" });
    expect(next.panels.today.visible).toBe(true);
    expect(next.layoutMode).toBe("activity");
  });

  test("DISMISS_PANEL returns to zen mode", () => {
    const withDrawer = appReducer(DEFAULT_STATE, { type: "TOGGLE_PANEL", payload: "drawer" });
    const next = appReducer(withDrawer, { type: "DISMISS_PANEL", payload: "drawer" });
    expect(next.panels.drawer.visible).toBe(false);
    expect(next.layoutMode).toBe("zen");
  });

  test("DISMISS_TOPMOST dismisses highest z-order unpinned panel", () => {
    let state = appReducer(DEFAULT_STATE, { type: "TOGGLE_PANEL", payload: "drawer" });
    state = appReducer(state, { type: "TOGGLE_PANEL", payload: "modal" });
    const next = appReducer(state, { type: "DISMISS_TOPMOST" });
    expect(next.panels.modal.visible).toBe(false);
    expect(next.panels.drawer.visible).toBe(true);
  });

  test("PIN_PANEL and UNPIN_PANEL work through app reducer", () => {
    const pinned = appReducer(DEFAULT_STATE, { type: "PIN_PANEL", payload: "drawer" });
    expect(pinned.panels.drawer.pinned).toBe(true);

    const unpinned = appReducer(pinned, { type: "UNPIN_PANEL", payload: "drawer" });
    expect(unpinned.panels.drawer.pinned).toBe(false);
  });

  test("focus moves from sidebar to conversation when all panels dismissed", () => {
    let state = appReducer(DEFAULT_STATE, { type: "TOGGLE_PANEL", payload: "drawer" });
    state = { ...state, focusedPanel: "sidebar" };
    const next = appReducer(state, { type: "DISMISS_PANEL", payload: "drawer" });
    expect(next.focusedPanel).toBe("conversation");
  });

  test("FOCUS_NEXT in zen mode cycles conversation → input → conversation", () => {
    const step1 = appReducer(DEFAULT_STATE, { type: "FOCUS_NEXT" });
    expect(step1.focusedPanel).toBe("input");

    const step2 = appReducer(step1, { type: "FOCUS_NEXT" });
    expect(step2.focusedPanel).toBe("conversation");
  });

  test("FOCUS_PREV in zen mode cycles conversation → input → conversation", () => {
    const step1 = appReducer(DEFAULT_STATE, { type: "FOCUS_PREV" });
    expect(step1.focusedPanel).toBe("input");

    const step2 = appReducer(step1, { type: "FOCUS_PREV" });
    expect(step2.focusedPanel).toBe("conversation");
  });

  test("legacy SET_LAYOUT_MODE still works", () => {
    const next = appReducer(DEFAULT_STATE, { type: "SET_LAYOUT_MODE", payload: "activity" });
    expect(next.layoutMode).toBe("activity");
  });
});
