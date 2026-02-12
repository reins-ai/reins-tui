/**
 * Layout state management for conversation-dominant layout with summoned panels.
 *
 * Default: full-screen conversation with no permanent sidebar.
 * Panels are summoned on demand and optionally pinned to persist.
 *
 * Panel types:
 * - drawer:  left-side conversation list (replaces permanent sidebar)
 * - today:   right-side activity/today panel
 * - modal:   center overlay for settings, pickers, etc.
 */

// --- Legacy layout mode support (consumed by breakpoints) ---

export type LayoutMode = "normal" | "activity" | "zen";

export const LAYOUT_MODES: readonly LayoutMode[] = ["normal", "activity", "zen"] as const;

export function isLayoutMode(value: unknown): value is LayoutMode {
  return value === "normal" || value === "activity" || value === "zen";
}

export function getLayoutModeLabel(mode: LayoutMode): string {
  switch (mode) {
    case "normal":
      return "Normal";
    case "activity":
      return "Activity";
    case "zen":
      return "Zen";
  }
}

export const DEFAULT_LAYOUT_MODE: LayoutMode = "zen";

// --- Summoned panel state model ---

export type PanelId = "drawer" | "today" | "modal";

export const PANEL_IDS: readonly PanelId[] = ["drawer", "today", "modal"] as const;

/**
 * Z-order priority for panel stacking. Higher number = on top.
 * Modal always renders above drawer/today panels.
 */
export const PANEL_Z_ORDER: Record<PanelId, number> = {
  drawer: 1,
  today: 1,
  modal: 2,
} as const;

export interface PanelEntry {
  visible: boolean;
  pinned: boolean;
}

export interface PanelState {
  drawer: PanelEntry;
  today: PanelEntry;
  modal: PanelEntry;
}

export type LayoutAction =
  | { type: "TOGGLE_PANEL"; payload: PanelId }
  | { type: "DISMISS_PANEL"; payload: PanelId }
  | { type: "PIN_PANEL"; payload: PanelId }
  | { type: "UNPIN_PANEL"; payload: PanelId }
  | { type: "DISMISS_ALL" }
  | { type: "DISMISS_TOPMOST" };

// Keep legacy actions for backward compatibility with breakpoint system
export type LayoutModeAction =
  | { type: "TOGGLE_ACTIVITY" }
  | { type: "TOGGLE_ZEN" }
  | { type: "SET_LAYOUT_MODE"; payload: LayoutMode }
  | LayoutAction;

export const DEFAULT_PANEL_ENTRY: PanelEntry = {
  visible: false,
  pinned: false,
};

export const DEFAULT_PANEL_STATE: PanelState = {
  drawer: { ...DEFAULT_PANEL_ENTRY },
  today: { ...DEFAULT_PANEL_ENTRY },
  modal: { ...DEFAULT_PANEL_ENTRY },
};

export function isPanelId(value: unknown): value is PanelId {
  return value === "drawer" || value === "today" || value === "modal";
}

/**
 * Get the topmost visible unpinned panel by z-order.
 * Returns null if no unpinned panels are visible.
 */
export function getTopmostUnpinnedPanel(panels: PanelState): PanelId | null {
  let topPanel: PanelId | null = null;
  let topZ = -1;

  for (const id of PANEL_IDS) {
    const entry = panels[id];
    if (entry.visible && !entry.pinned && PANEL_Z_ORDER[id] > topZ) {
      topPanel = id;
      topZ = PANEL_Z_ORDER[id];
    }
  }

  return topPanel;
}

/**
 * Get all currently visible panels sorted by z-order (ascending).
 */
export function getVisiblePanels(panels: PanelState): PanelId[] {
  return PANEL_IDS
    .filter((id) => panels[id].visible)
    .sort((a, b) => PANEL_Z_ORDER[a] - PANEL_Z_ORDER[b]);
}

/**
 * Check if any panel is currently visible.
 */
export function hasVisiblePanels(panels: PanelState): boolean {
  return PANEL_IDS.some((id) => panels[id].visible);
}

/**
 * Reduce panel state for summoned panel actions.
 */
export function reducePanelState(state: PanelState, action: LayoutAction): PanelState {
  switch (action.type) {
    case "TOGGLE_PANEL": {
      const id = action.payload;
      if (!isPanelId(id)) return state;
      const entry = state[id];
      return {
        ...state,
        [id]: { ...entry, visible: !entry.visible },
      };
    }

    case "DISMISS_PANEL": {
      const id = action.payload;
      if (!isPanelId(id)) return state;
      const entry = state[id];
      if (!entry.visible) return state;
      return {
        ...state,
        [id]: { ...entry, visible: false },
      };
    }

    case "PIN_PANEL": {
      const id = action.payload;
      if (!isPanelId(id)) return state;
      return {
        ...state,
        [id]: { ...state[id], pinned: true },
      };
    }

    case "UNPIN_PANEL": {
      const id = action.payload;
      if (!isPanelId(id)) return state;
      return {
        ...state,
        [id]: { ...state[id], pinned: false },
      };
    }

    case "DISMISS_ALL": {
      return {
        drawer: { ...state.drawer, visible: false },
        today: { ...state.today, visible: false },
        modal: { ...state.modal, visible: false },
      };
    }

    case "DISMISS_TOPMOST": {
      const topPanel = getTopmostUnpinnedPanel(state);
      if (!topPanel) return state;
      return {
        ...state,
        [topPanel]: { ...state[topPanel], visible: false },
      };
    }

    default:
      return state;
  }
}

/**
 * Derive the effective LayoutMode from panel state.
 * This bridges the new panel model to the legacy breakpoint system.
 *
 * - No panels visible → "zen" (conversation-only, the new default)
 * - Drawer visible → "normal" (sidebar-like)
 * - Today visible → "activity" (activity panel)
 * - Both drawer + today → "activity"
 */
export function deriveLayoutMode(panels: PanelState): LayoutMode {
  const drawerVisible = panels.drawer.visible;
  const todayVisible = panels.today.visible;

  if (todayVisible) return "activity";
  if (drawerVisible) return "normal";
  return "zen";
}

export interface LayoutModeVisibility {
  showSidebar: boolean;
  showConversation: boolean;
  showActivityPanel: boolean;
}

/**
 * Get visibility flags from a LayoutMode.
 * In the new model, sidebar visibility is driven by drawer panel state,
 * but this function is kept for breakpoint compatibility.
 */
export function getLayoutVisibility(mode: LayoutMode): LayoutModeVisibility {
  switch (mode) {
    case "normal":
      return { showSidebar: true, showConversation: true, showActivityPanel: false };
    case "activity":
      return { showSidebar: true, showConversation: true, showActivityPanel: true };
    case "zen":
      return { showSidebar: false, showConversation: true, showActivityPanel: false };
  }
}

// Legacy reducer kept for breakpoint constraint compatibility.
// In the new model, layout mode is derived from panel state.
// These legacy actions are kept for backward compatibility with
// breakpoint constraints and direct SET_LAYOUT_MODE calls.
export function reduceLayoutMode(current: LayoutMode, action: LayoutModeAction): LayoutMode {
  switch (action.type) {
    case "TOGGLE_ACTIVITY":
      return current === "activity" ? "zen" : "activity";
    case "TOGGLE_ZEN":
      return current === "zen" ? "zen" : "zen";
    case "SET_LAYOUT_MODE":
      return isLayoutMode(action.payload) ? action.payload : current;
    default:
      return current;
  }
}

// --- Pin persistence ---

export interface PinPreferences {
  drawer: boolean;
  today: boolean;
  modal: boolean;
}

export const DEFAULT_PIN_PREFERENCES: PinPreferences = {
  drawer: false,
  today: false,
  modal: false,
};

export function toPinPreferences(panels: PanelState): PinPreferences {
  return {
    drawer: panels.drawer.pinned,
    today: panels.today.pinned,
    modal: panels.modal.pinned,
  };
}

export function applyPinPreferences(panels: PanelState, prefs: PinPreferences): PanelState {
  return {
    drawer: { ...panels.drawer, pinned: prefs.drawer },
    today: { ...panels.today, pinned: prefs.today },
    modal: { ...panels.modal, pinned: prefs.modal },
  };
}
