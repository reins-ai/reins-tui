import { useMemo } from "react";

import { type AppAction, type FocusedPanel, useApp } from "../store";

const FOCUS_ORDER: FocusedPanel[] = ["sidebar", "conversation", "input"];

export interface FocusManager {
  focusedPanel: FocusedPanel;
  focusNext(): void;
  focusPrev(): void;
  focusPanel(panel: FocusedPanel): void;
  isFocused(panel: FocusedPanel): boolean;
}

export function getNextPanel(panel: FocusedPanel): FocusedPanel {
  const currentIndex = FOCUS_ORDER.indexOf(panel);
  const nextIndex = (currentIndex + 1) % FOCUS_ORDER.length;
  return FOCUS_ORDER[nextIndex];
}

export function getPreviousPanel(panel: FocusedPanel): FocusedPanel {
  const currentIndex = FOCUS_ORDER.indexOf(panel);
  const previousIndex = (currentIndex - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length;
  return FOCUS_ORDER[previousIndex];
}

interface FocusManagerOptions {
  getFocusedPanel(): FocusedPanel;
  dispatch(action: AppAction): void;
}

export function createFocusManager(options: FocusManagerOptions): FocusManager {
  return {
    get focusedPanel() {
      return options.getFocusedPanel();
    },
    focusNext() {
      options.dispatch({ type: "FOCUS_NEXT" });
    },
    focusPrev() {
      options.dispatch({ type: "FOCUS_PREV" });
    },
    focusPanel(panel: FocusedPanel) {
      options.dispatch({ type: "SET_FOCUSED_PANEL", payload: panel });
    },
    isFocused(panel: FocusedPanel) {
      return options.getFocusedPanel() === panel;
    },
  };
}

export function useFocus(): FocusManager {
  const { state, dispatch } = useApp();

  return useMemo(
    () =>
      createFocusManager({
        getFocusedPanel: () => state.focusedPanel,
        dispatch,
      }),
    [dispatch, state.focusedPanel],
  );
}
