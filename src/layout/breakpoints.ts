/**
 * Responsive breakpoint engine for terminal layout adaptation.
 *
 * Defines four viewport bands based on column width and enforces
 * layout mode constraints per band. Includes debounced resize
 * handling to prevent transition flicker.
 *
 * Bands:
 *   compact  (<60 cols)  — conversation only, forced zen-like
 *   narrow   (60-99)     — normal/zen only, no activity panel
 *   standard (100-160)   — all modes available
 *   wide     (>160)      — all modes + optional expanded panel
 */

import type { LayoutMode } from "../state/layout-mode";

export type BreakpointBand = "compact" | "narrow" | "standard" | "wide";

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
 * Calculate panel widths for a given band and total column count.
 * Returns 0 for panels that should not be rendered in the band.
 *
 * Sidebar: fixed 28 cols (matches existing Sidebar component).
 * Activity: fixed 32 cols (matches existing activity panel).
 * Expanded: only in wide band, takes remaining space after others.
 * Conversation: fills remaining space.
 */
export function getPanelWidths(band: BreakpointBand, columns: number): PanelWidths {
  const SIDEBAR_WIDTH = 28;
  const ACTIVITY_WIDTH = 32;
  const GAP = 1;

  switch (band) {
    case "compact":
      return {
        sidebar: 0,
        conversation: columns,
        activity: 0,
        expanded: 0,
      };

    case "narrow": {
      const conversationWidth = columns - SIDEBAR_WIDTH - GAP;
      return {
        sidebar: SIDEBAR_WIDTH,
        conversation: Math.max(conversationWidth, 20),
        activity: 0,
        expanded: 0,
      };
    }

    case "standard": {
      const conversationWidth = columns - SIDEBAR_WIDTH - ACTIVITY_WIDTH - GAP * 2;
      return {
        sidebar: SIDEBAR_WIDTH,
        conversation: Math.max(conversationWidth, 20),
        activity: ACTIVITY_WIDTH,
        expanded: 0,
      };
    }

    case "wide": {
      const EXPANDED_WIDTH = 36;
      const conversationWidth = columns - SIDEBAR_WIDTH - ACTIVITY_WIDTH - EXPANDED_WIDTH - GAP * 3;
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
}

/**
 * Compute the full breakpoint state from terminal width and desired layout mode.
 */
export function resolveBreakpointState(columns: number, desiredMode: LayoutMode): BreakpointState {
  const band = getBreakpointBand(columns);
  const constrainedMode = constrainMode(band, desiredMode);
  const panelWidths = getPanelWidths(band, columns);

  return {
    band,
    columns,
    constrainedMode,
    panelWidths,
    showExpandedPanel: band === "wide",
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
