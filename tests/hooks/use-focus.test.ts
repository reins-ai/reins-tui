import { describe, expect, test } from "bun:test";

import type { AppAction, FocusedPanel } from "../../src/store";
import { createFocusManager, getNextPanel, getPreviousPanel } from "../../src/hooks";

describe("use-focus", () => {
  test("cycles focus forward: sidebar -> conversation -> input -> sidebar", () => {
    let focusedPanel: FocusedPanel = "sidebar";

    const dispatch = (action: AppAction) => {
      if (action.type === "FOCUS_NEXT") {
        focusedPanel = getNextPanel(focusedPanel);
      }
    };

    const manager = createFocusManager({
      getFocusedPanel: () => focusedPanel,
      dispatch,
    });

    manager.focusNext();
    expect(manager.focusedPanel).toBe("conversation");

    manager.focusNext();
    expect(manager.focusedPanel).toBe("input");

    manager.focusNext();
    expect(manager.focusedPanel).toBe("sidebar");
  });

  test("cycles focus backward in reverse order", () => {
    let focusedPanel: FocusedPanel = "input";

    const dispatch = (action: AppAction) => {
      if (action.type === "FOCUS_PREV") {
        focusedPanel = getPreviousPanel(focusedPanel);
      }
    };

    const manager = createFocusManager({
      getFocusedPanel: () => focusedPanel,
      dispatch,
    });

    manager.focusPrev();
    expect(manager.focusedPanel).toBe("conversation");

    manager.focusPrev();
    expect(manager.focusedPanel).toBe("sidebar");

    manager.focusPrev();
    expect(manager.focusedPanel).toBe("input");
  });

  test("supports direct panel focus", () => {
    let focusedPanel: FocusedPanel = "conversation";

    const dispatch = (action: AppAction) => {
      if (action.type === "SET_FOCUSED_PANEL") {
        focusedPanel = action.payload;
      }
    };

    const manager = createFocusManager({
      getFocusedPanel: () => focusedPanel,
      dispatch,
    });

    manager.focusPanel("input");
    expect(manager.focusedPanel).toBe("input");
  });

  test("reports focused panel state", () => {
    let focusedPanel: FocusedPanel = "sidebar";

    const manager = createFocusManager({
      getFocusedPanel: () => focusedPanel,
      dispatch: () => {
        focusedPanel = "sidebar";
      },
    });

    expect(manager.isFocused("sidebar")).toBe(true);
    expect(manager.isFocused("conversation")).toBe(false);
    expect(manager.isFocused("input")).toBe(false);
  });
});
