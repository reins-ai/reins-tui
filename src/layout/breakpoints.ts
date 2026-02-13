/**
 * Responsive breakpoint engine for terminal layout adaptation.
 *
 * Defines four viewport bands based on column width and enforces
 * layout mode constraints per band. Includes debounced resize
 * handling to prevent transition flicker.
 *
 * Bands:
 *   compact  (<60 cols)  — conversation only, forced zen-like
 *   narrow   (60-99)     — normal/zen only, sidebar auto-collapses
 *   standard (100-160)   — all modes available, sidebar visible
 *   wide     (>160)      — all modes + optional expanded panel
 *
 * Sidebar collapse rules:
 *   The contextual sidebar (40 chars) is visible by default on standard
 *   and wide bands. On narrow, it auto-collapses unless the user has
 *   explicitly toggled it and there is enough room for a minimum
 *   conversation area. On compact, the sidebar is always hidden.
 */

import type { LayoutMode } from "../state/layout-mode";

export type BreakpointBand = "compact" | "narrow" | "standard" | "wide";

/**
 * Fixed panel width constants.
 * SIDEBAR_WIDTH matches SIDEBAR_CONTEXT_WIDTH from the contextual info panel.
 */
export const SIDEBAR_WIDTH = 40;
export const ACTIVITY_WIDTH = 32;
export const EXPANDED_WIDTH = 36;
export const MIN_CONVERSATION_WIDTH = 30;
export const PANEL_GAP = 1;

export const BREAKPOINT_THRESHOLDS = {
  compact: 60,
  narrow: 100,
  standard: 161,
} as const;

/**
 * Determine the breakpoint band for a given column width.
 * Widths below 1 are treated as compact (defensive).
 */
export function getBreakpointBand(columns: number): BreakpointBand {
  if (columns < BREAKPOINT_THRESHOLDS.compact) return "compact";
  if (columns < BREAKPOINT_THRESHOLDS.narrow) return "narrow";
  if (columns < BREAKPOINT_THRESHOLDS.standard) return "standard";
  return "wide";
}

/**
 * Layout modes permitted within each breakpoint band.
 *
 * compact:  only zen (conversation-only view)
 * narrow:   normal or zen (no room for activity panel)
 * standard: all three modes
 * wide:     all three modes (plus optional expanded view)
 */
const ALLOWED_MODES: Record<BreakpointBand, readonly LayoutMode[]> = {
  compact: ["zen"],
  narrow: ["normal", "zen"],
  standard: ["normal", "activity", "zen"],
  wide: ["normal", "activity", "zen"],
};

export function getAllowedModes(band: BreakpointBand): readonly LayoutMode[] {
  return ALLOWED_MODES[band];
}

export function isModeAllowed(band: BreakpointBand, mode: LayoutMode): boolean {
  return ALLOWED_MODES[band].includes(mode);
}

/**
 * Constrain a layout mode to the nearest valid mode for the given band.
 * Returns the current mode if already valid, otherwise falls back:
 *   - compact always returns "zen"
 *   - narrow returns "normal" when activity is requested
 */
export function constrainMode(band: BreakpointBand, currentMode: LayoutMode): LayoutMode {
  if (isModeAllowed(band, currentMode)) return currentMode;

  if (band === "compact") return "zen";
  if (band === "narrow" && currentMode === "activity") return "normal";

  return ALLOWED_MODES[band][0];
}

export interface PanelWidths {
  sidebar: number;
  conversation: number;
  activity: number;
  expanded: number;
}

/**
 * Determine whether the sidebar should auto-collapse for a given width.
 *
 * The sidebar is visible when there is enough room for both the sidebar
 * and a minimum conversation area. On compact, it is always collapsed.
 * On narrow, it collapses unless the user has explicitly toggled it open
 * AND there is enough room. On standard and wide, it defaults to visible.
 *
 * @param columns - Terminal width in columns
 * @param band - Current breakpoint band
 * @param userToggledOpen - Whether the user has explicitly opened the sidebar
 */
export function shouldAutoCollapseSidebar(
  columns: number,
  band: BreakpointBand,
  userToggledOpen: boolean = false,
): boolean {
  if (band === "compact") return true;

  const availableForConversation = columns - SIDEBAR_WIDTH - PANEL_GAP;

  if (band === "narrow") {
    if (!userToggledOpen) return true;
    return availableForConversation < MIN_CONVERSATION_WIDTH;
  }

  return availableForConversation < MIN_CONVERSATION_WIDTH;
}

/**
 * Calculate panel widths for a given band and total column count.
 * Returns 0 for panels that should not be rendered in the band.
 *
 * Sidebar: fixed 40 cols (matches contextual info panel).
 * Activity: fixed 32 cols (matches existing activity panel).
 * Expanded: only in wide band, takes remaining space after others.
 * Conversation: fills remaining space.
 */
export function getPanelWidths(band: BreakpointBand, columns: number): PanelWidths {
  switch (band) {
    case "compact":
      return {
        sidebar: 0,
        conversation: columns,
        activity: 0,
        expanded: 0,
      };

    case "narrow": {
      const conversationWidth = columns - SIDEBAR_WIDTH - PANEL_GAP;
      return {
        sidebar: SIDEBAR_WIDTH,
        conversation: Math.max(conversationWidth, 20),
        activity: 0,
        expanded: 0,
      };
    }

    case "standard": {
      const conversationWidth = columns - SIDEBAR_WIDTH - ACTIVITY_WIDTH - PANEL_GAP * 2;
      return {
        sidebar: SIDEBAR_WIDTH,
        conversation: Math.max(conversationWidth, 20),
        activity: ACTIVITY_WIDTH,
        expanded: 0,
      };
    }

    case "wide": {
      const conversationWidth = columns - SIDEBAR_WIDTH - ACTIVITY_WIDTH - EXPANDED_WIDTH - PANEL_GAP * 3;
      return {
        sidebar: SIDEBAR_WIDTH,
        conversation: Math.max(conversationWidth, 30),
        activity: ACTIVITY_WIDTH,
        expanded: EXPANDED_WIDTH,
      };
    }
  }
}

export interface BreakpointState {
  band: BreakpointBand;
  columns: number;
  constrainedMode: LayoutMode;
  panelWidths: PanelWidths;
  showExpandedPanel: boolean;
  sidebarVisible: boolean;
}

/**
 * Compute the full breakpoint state from terminal width and desired layout mode.
 *
 * @param columns - Terminal width in columns
 * @param desiredMode - The user's preferred layout mode
 * @param userToggledSidebar - Whether the user has explicitly toggled the sidebar open
 */
export function resolveBreakpointState(
  columns: number,
  desiredMode: LayoutMode,
  userToggledSidebar: boolean = false,
): BreakpointState {
  const band = getBreakpointBand(columns);
  const constrainedMode = constrainMode(band, desiredMode);
  const panelWidths = getPanelWidths(band, columns);
  const collapsed = shouldAutoCollapseSidebar(columns, band, userToggledSidebar);

  return {
    band,
    columns,
    constrainedMode,
    panelWidths,
    showExpandedPanel: band === "wide",
    sidebarVisible: !collapsed,
  };
}

/**
 * Create a debounced resize handler that fires after the specified delay.
 * Returns a trigger function and a cleanup function.
 *
 * The debounce prevents rapid resize events (e.g. terminal drag) from
 * causing layout flicker by coalescing into a single update.
 */
export function createResizeDebouncer(
  callback: (columns: number) => void,
  delayMs: number = 150,
): { trigger: (columns: number) => void; cancel: () => void } {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function trigger(columns: number): void {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      callback(columns);
    }, delayMs);
  }

  function cancel(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return { trigger, cancel };
}

/**
 * Detect whether a band transition occurred between two column widths.
 * Useful for determining if layout mode constraints need re-evaluation.
 */
export function didBandChange(previousColumns: number, currentColumns: number): boolean {
  return getBreakpointBand(previousColumns) !== getBreakpointBand(currentColumns);
}

export const BAND_LABELS: Record<BreakpointBand, string> = {
  compact: "Compact (<60)",
  narrow: "Narrow (60-99)",
  standard: "Standard (100-160)",
  wide: "Wide (>160)",
};

/**
 * Minimum terminal width required to show the sidebar alongside
 * a usable conversation area. Used by layout components to decide
 * whether to auto-dismiss the drawer panel on resize.
 */
export const MIN_SIDEBAR_FIT_WIDTH = SIDEBAR_WIDTH + MIN_CONVERSATION_WIDTH + PANEL_GAP;
