import { describe, expect, test } from "bun:test";

import { DEFAULT_STATE, appReducer, type AppAction } from "../../src/store";

describe("appReducer", () => {
  test("returns initial defaults", () => {
    expect(DEFAULT_STATE.status).toBe("Ready");
    expect(DEFAULT_STATE.isStreaming).toBe(false);
    expect(DEFAULT_STATE.isCommandPaletteOpen).toBe(false);
    expect(DEFAULT_STATE.focusedPanel).toBe("conversation");
    expect(DEFAULT_STATE.conversations).toHaveLength(0);
  });

  test("handles SET_STATUS", () => {
    const action: AppAction = { type: "SET_STATUS", payload: "Working" };
    const next = appReducer(DEFAULT_STATE, action);

    expect(next.status).toBe("Working");
  });

  test("handles SET_FOCUSED_PANEL", () => {
    const action: AppAction = { type: "SET_FOCUSED_PANEL", payload: "sidebar" };
    const next = appReducer(DEFAULT_STATE, action);

    expect(next.focusedPanel).toBe("sidebar");
  });

  test("handles FOCUS_NEXT in cycle order", () => {
    const sidebarState = { ...DEFAULT_STATE, focusedPanel: "sidebar" as const };
    const conversationState = appReducer(sidebarState, { type: "FOCUS_NEXT" });
    const inputState = appReducer(conversationState, { type: "FOCUS_NEXT" });
    const wrappedState = appReducer(inputState, { type: "FOCUS_NEXT" });

    expect(conversationState.focusedPanel).toBe("conversation");
    expect(inputState.focusedPanel).toBe("input");
    expect(wrappedState.focusedPanel).toBe("sidebar");
  });

  test("handles FOCUS_PREV in reverse cycle order", () => {
    const inputState = { ...DEFAULT_STATE, focusedPanel: "input" as const };
    const conversationState = appReducer(inputState, { type: "FOCUS_PREV" });
    const sidebarState = appReducer(conversationState, { type: "FOCUS_PREV" });
    const wrappedState = appReducer(sidebarState, { type: "FOCUS_PREV" });

    expect(conversationState.focusedPanel).toBe("conversation");
    expect(sidebarState.focusedPanel).toBe("sidebar");
    expect(wrappedState.focusedPanel).toBe("input");
  });

  test("handles SET_STREAMING", () => {
    const action: AppAction = { type: "SET_STREAMING", payload: true };
    const next = appReducer(DEFAULT_STATE, action);

    expect(next.isStreaming).toBe(true);
  });

  test("handles SET_COMMAND_PALETTE_OPEN", () => {
    const action: AppAction = { type: "SET_COMMAND_PALETTE_OPEN", payload: true };
    const next = appReducer(DEFAULT_STATE, action);

    expect(next.isCommandPaletteOpen).toBe(true);
  });

  test("handles SET_MODEL", () => {
    const action: AppAction = { type: "SET_MODEL", payload: "claude-sonnet-4" };
    const next = appReducer(DEFAULT_STATE, action);

    expect(next.currentModel).toBe("claude-sonnet-4");
  });

  test("returns same state for unknown actions", () => {
    const unknown = { type: "UNKNOWN_ACTION" };
    const next = appReducer(DEFAULT_STATE, unknown);

    expect(next).toBe(DEFAULT_STATE);
  });
});
