import { describe, expect, test } from "bun:test";

import {
  reduceLayoutMode,
  getLayoutVisibility,
  getLayoutModeLabel,
  isLayoutMode,
  DEFAULT_LAYOUT_MODE,
  LAYOUT_MODES,
  type LayoutMode,
  type LayoutModeAction,
} from "../../src/state/layout-mode";
import { appReducer, DEFAULT_STATE, type AppAction } from "../../src/store";

describe("layout-mode reducer", () => {
  test("default mode is normal", () => {
    expect(DEFAULT_LAYOUT_MODE).toBe("normal");
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

    test("normal → activity", () => {
      expect(reduceLayoutMode("normal", action)).toBe("activity");
    });

    test("activity → normal", () => {
      expect(reduceLayoutMode("activity", action)).toBe("normal");
    });

    test("zen → activity", () => {
      expect(reduceLayoutMode("zen", action)).toBe("activity");
    });
  });

  describe("TOGGLE_ZEN", () => {
    const action: LayoutModeAction = { type: "TOGGLE_ZEN" };

    test("normal → zen", () => {
      expect(reduceLayoutMode("normal", action)).toBe("zen");
    });

    test("zen → normal", () => {
      expect(reduceLayoutMode("zen", action)).toBe("normal");
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

  describe("round-trip transitions", () => {
    test("normal → activity → zen → normal", () => {
      let mode: LayoutMode = "normal";
      mode = reduceLayoutMode(mode, { type: "TOGGLE_ACTIVITY" });
      expect(mode).toBe("activity");

      mode = reduceLayoutMode(mode, { type: "TOGGLE_ZEN" });
      expect(mode).toBe("zen");

      mode = reduceLayoutMode(mode, { type: "TOGGLE_ZEN" });
      expect(mode).toBe("normal");
    });

    test("normal → zen → activity → normal", () => {
      let mode: LayoutMode = "normal";
      mode = reduceLayoutMode(mode, { type: "TOGGLE_ZEN" });
      expect(mode).toBe("zen");

      mode = reduceLayoutMode(mode, { type: "TOGGLE_ACTIVITY" });
      expect(mode).toBe("activity");

      mode = reduceLayoutMode(mode, { type: "TOGGLE_ACTIVITY" });
      expect(mode).toBe("normal");
    });
  });
});

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

describe("appReducer layout mode integration", () => {
  test("default state has normal layout mode", () => {
    expect(DEFAULT_STATE.layoutMode).toBe("normal");
  });

  test("TOGGLE_ACTIVITY changes layout mode", () => {
    const action: AppAction = { type: "TOGGLE_ACTIVITY" };
    const next = appReducer(DEFAULT_STATE, action);
    expect(next.layoutMode).toBe("activity");
  });

  test("TOGGLE_ZEN changes layout mode", () => {
    const action: AppAction = { type: "TOGGLE_ZEN" };
    const next = appReducer(DEFAULT_STATE, action);
    expect(next.layoutMode).toBe("zen");
  });

  test("SET_LAYOUT_MODE sets specific mode", () => {
    const action: AppAction = { type: "SET_LAYOUT_MODE", payload: "zen" };
    const next = appReducer(DEFAULT_STATE, action);
    expect(next.layoutMode).toBe("zen");
  });

  test("switching to zen moves focus from sidebar to conversation", () => {
    const sidebarFocused = { ...DEFAULT_STATE, focusedPanel: "sidebar" as const };
    const next = appReducer(sidebarFocused, { type: "TOGGLE_ZEN" });
    expect(next.layoutMode).toBe("zen");
    expect(next.focusedPanel).toBe("conversation");
  });

  test("switching to zen preserves conversation focus", () => {
    const conversationFocused = { ...DEFAULT_STATE, focusedPanel: "conversation" as const };
    const next = appReducer(conversationFocused, { type: "TOGGLE_ZEN" });
    expect(next.layoutMode).toBe("zen");
    expect(next.focusedPanel).toBe("conversation");
  });

  test("switching to zen preserves input focus", () => {
    const inputFocused = { ...DEFAULT_STATE, focusedPanel: "input" as const };
    const next = appReducer(inputFocused, { type: "TOGGLE_ZEN" });
    expect(next.layoutMode).toBe("zen");
    expect(next.focusedPanel).toBe("input");
  });

  test("switching to activity preserves current focus", () => {
    const conversationFocused = { ...DEFAULT_STATE, focusedPanel: "conversation" as const };
    const next = appReducer(conversationFocused, { type: "TOGGLE_ACTIVITY" });
    expect(next.layoutMode).toBe("activity");
    expect(next.focusedPanel).toBe("conversation");
  });

  test("FOCUS_NEXT skips sidebar in zen mode", () => {
    const zenInput = { ...DEFAULT_STATE, layoutMode: "zen" as const, focusedPanel: "input" as const };
    const next = appReducer(zenInput, { type: "FOCUS_NEXT" });
    expect(next.focusedPanel).toBe("conversation");
  });

  test("FOCUS_PREV skips sidebar in zen mode", () => {
    const zenConversation = { ...DEFAULT_STATE, layoutMode: "zen" as const, focusedPanel: "conversation" as const };
    const next = appReducer(zenConversation, { type: "FOCUS_PREV" });
    expect(next.focusedPanel).toBe("input");
  });

  test("FOCUS_NEXT cycles through all panels in normal mode", () => {
    const sidebarState = { ...DEFAULT_STATE, focusedPanel: "sidebar" as const };
    const step1 = appReducer(sidebarState, { type: "FOCUS_NEXT" });
    expect(step1.focusedPanel).toBe("conversation");

    const step2 = appReducer(step1, { type: "FOCUS_NEXT" });
    expect(step2.focusedPanel).toBe("input");

    const step3 = appReducer(step2, { type: "FOCUS_NEXT" });
    expect(step3.focusedPanel).toBe("sidebar");
  });

  test("zen mode focus cycle is conversation → input → conversation", () => {
    const zenConversation = { ...DEFAULT_STATE, layoutMode: "zen" as const, focusedPanel: "conversation" as const };
    const step1 = appReducer(zenConversation, { type: "FOCUS_NEXT" });
    expect(step1.focusedPanel).toBe("input");

    const step2 = appReducer(step1, { type: "FOCUS_NEXT" });
    expect(step2.focusedPanel).toBe("conversation");
  });

  test("no-op when toggling to same mode (activity → activity toggle returns normal)", () => {
    const activityState = { ...DEFAULT_STATE, layoutMode: "activity" as const };
    const next = appReducer(activityState, { type: "TOGGLE_ACTIVITY" });
    expect(next.layoutMode).toBe("normal");
  });
});
