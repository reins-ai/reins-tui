/**
 * Layout mode state management for three-mode layout orchestration.
 *
 * Modes:
 * - normal:   sidebar + conversation panel
 * - activity: sidebar + conversation + activity panel
 * - zen:      conversation panel only (full width)
 */

export type LayoutMode = "normal" | "activity" | "zen";

export const LAYOUT_MODES: readonly LayoutMode[] = ["normal", "activity", "zen"] as const;

export type LayoutModeAction =
  | { type: "TOGGLE_ACTIVITY" }
  | { type: "TOGGLE_ZEN" }
  | { type: "SET_LAYOUT_MODE"; payload: LayoutMode };

export function isLayoutMode(value: unknown): value is LayoutMode {
  return value === "normal" || value === "activity" || value === "zen";
}

/**
 * Toggle activity mode:
 * - normal   → activity
 * - activity → normal
 * - zen      → activity
 */
function toggleActivity(current: LayoutMode): LayoutMode {
  return current === "activity" ? "normal" : "activity";
}

/**
 * Toggle zen mode:
 * - normal   → zen
 * - zen      → normal
 * - activity → zen
 */
function toggleZen(current: LayoutMode): LayoutMode {
  return current === "zen" ? "normal" : "zen";
}

export function reduceLayoutMode(current: LayoutMode, action: LayoutModeAction): LayoutMode {
  switch (action.type) {
    case "TOGGLE_ACTIVITY":
      return toggleActivity(current);
    case "TOGGLE_ZEN":
      return toggleZen(current);
    case "SET_LAYOUT_MODE":
      return isLayoutMode(action.payload) ? action.payload : current;
    default:
      return current;
  }
}

export interface LayoutModeVisibility {
  showSidebar: boolean;
  showConversation: boolean;
  showActivityPanel: boolean;
}

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

export const DEFAULT_LAYOUT_MODE: LayoutMode = "normal";
