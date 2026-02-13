import { describe, expect, test } from "bun:test";

import {
  getBreakpointBand,
  getAllowedModes,
  constrainMode,
  getPanelWidths,
  resolveBreakpointState,
  didBandChange,
  SIDEBAR_WIDTH,
  ACTIVITY_WIDTH,
  EXPANDED_WIDTH,
  type BreakpointBand,
  type PanelWidths,
} from "../../src/layout/breakpoints";
import {
  reduceLayoutMode,
  getLayoutVisibility,
  type LayoutMode,
} from "../../src/state/layout-mode";

// ---------------------------------------------------------------------------
// Width band → layout structure snapshots
// ---------------------------------------------------------------------------

describe("compact band (<60) layout snapshots", () => {
  const COMPACT_WIDTHS = [20, 40, 50, 59];

  for (const width of COMPACT_WIDTHS) {
    test(`width ${width}: forced zen mode`, () => {
      const state = resolveBreakpointState(width, "normal");
      expect(state.band).toBe("compact");
      expect(state.constrainedMode).toBe("zen");
    });

    test(`width ${width}: no sidebar, no activity, no expanded`, () => {
      const widths = getPanelWidths("compact", width);
      expect(widths.sidebar).toBe(0);
      expect(widths.activity).toBe(0);
      expect(widths.expanded).toBe(0);
      expect(widths.conversation).toBe(width);
    });
  }

  test("compact rejects normal and activity modes", () => {
    expect(constrainMode("compact", "normal")).toBe("zen");
    expect(constrainMode("compact", "activity")).toBe("zen");
    expect(constrainMode("compact", "zen")).toBe("zen");
  });
});

describe("narrow band (60-99) layout snapshots", () => {
  const NARROW_WIDTHS = [60, 70, 80, 99];

  for (const width of NARROW_WIDTHS) {
    test(`width ${width}: sidebar + conversation, no activity`, () => {
      const widths = getPanelWidths("narrow", width);
      expect(widths.sidebar).toBe(SIDEBAR_WIDTH);
      expect(widths.conversation).toBeGreaterThan(0);
      expect(widths.activity).toBe(0);
      expect(widths.expanded).toBe(0);
    });
  }

  test("narrow allows normal and zen, rejects activity", () => {
    expect(constrainMode("narrow", "normal")).toBe("normal");
    expect(constrainMode("narrow", "zen")).toBe("zen");
    expect(constrainMode("narrow", "activity")).toBe("normal");
  });
});

describe("standard band (100-160) layout snapshots", () => {
  const STANDARD_WIDTHS = [100, 120, 140, 160];

  for (const width of STANDARD_WIDTHS) {
    test(`width ${width}: sidebar + conversation + activity`, () => {
      const widths = getPanelWidths("standard", width);
      expect(widths.sidebar).toBe(SIDEBAR_WIDTH);
      expect(widths.conversation).toBeGreaterThan(0);
      expect(widths.activity).toBe(ACTIVITY_WIDTH);
      expect(widths.expanded).toBe(0);
    });
  }

  test("standard allows all three modes", () => {
    const modes: LayoutMode[] = ["normal", "activity", "zen"];
    for (const mode of modes) {
      expect(constrainMode("standard", mode)).toBe(mode);
    }
  });
});

describe("wide band (>160) layout snapshots", () => {
  const WIDE_WIDTHS = [161, 180, 200, 300];

  for (const width of WIDE_WIDTHS) {
    test(`width ${width}: all four panels including expanded`, () => {
      const widths = getPanelWidths("wide", width);
      expect(widths.sidebar).toBe(SIDEBAR_WIDTH);
      expect(widths.conversation).toBeGreaterThan(0);
      expect(widths.activity).toBe(ACTIVITY_WIDTH);
      expect(widths.expanded).toBe(EXPANDED_WIDTH);
    });

    test(`width ${width}: showExpandedPanel is true`, () => {
      const state = resolveBreakpointState(width, "normal");
      expect(state.showExpandedPanel).toBe(true);
    });
  }

  test("wide allows all three modes", () => {
    const modes: LayoutMode[] = ["normal", "activity", "zen"];
    for (const mode of modes) {
      expect(constrainMode("wide", mode)).toBe(mode);
    }
  });
});

// ---------------------------------------------------------------------------
// Zone frame structural snapshots per band
// ---------------------------------------------------------------------------

describe("zone frame structural snapshots", () => {
  /**
   * Verify that each breakpoint band produces a zone configuration
   * compatible with framed surfaces (bordered blocks, left-border accents).
   * These snapshots gate the redesign: if zone structure changes, these
   * tests catch regressions before visual review.
   */

  test("compact: single-zone frame (conversation only)", () => {
    const widths = getPanelWidths("compact", 50);
    const visibility = getLayoutVisibility(constrainMode("compact", "normal"));

    // Compact is a single framed zone: conversation fills everything
    expect(visibility.showSidebar).toBe(false);
    expect(visibility.showConversation).toBe(true);
    expect(visibility.showActivityPanel).toBe(false);
    expect(widths.conversation).toBe(50);

    // Framed content needs at least border + padding + minimal text
    expect(widths.conversation).toBeGreaterThanOrEqual(14);
  });

  test("narrow: two-zone frame (sidebar + conversation)", () => {
    const widths = getPanelWidths("narrow", 80);
    const visibility = getLayoutVisibility(constrainMode("narrow", "normal"));

    expect(visibility.showSidebar).toBe(true);
    expect(visibility.showConversation).toBe(true);
    expect(visibility.showActivityPanel).toBe(false);

    // Both zones must accommodate framed content
    expect(widths.sidebar).toBeGreaterThanOrEqual(12);
    expect(widths.conversation).toBeGreaterThanOrEqual(20);

    // Gap between zones is accounted for
    expect(widths.sidebar + widths.conversation).toBeLessThanOrEqual(80);
  });

  test("standard: three-zone frame (sidebar + conversation + activity)", () => {
    const widths = getPanelWidths("standard", 140);
    const visibility = getLayoutVisibility(constrainMode("standard", "activity"));

    expect(visibility.showSidebar).toBe(true);
    expect(visibility.showConversation).toBe(true);
    expect(visibility.showActivityPanel).toBe(true);

    // All three zones must accommodate framed content
    expect(widths.sidebar).toBeGreaterThanOrEqual(12);
    expect(widths.conversation).toBeGreaterThanOrEqual(20);
    expect(widths.activity).toBeGreaterThanOrEqual(12);

    // Total allocation respects terminal width
    const total = widths.sidebar + widths.conversation + widths.activity;
    expect(total).toBeLessThanOrEqual(140);
  });

  test("wide: four-zone frame (sidebar + conversation + activity + expanded)", () => {
    const widths = getPanelWidths("wide", 200);
    const state = resolveBreakpointState(200, "normal");

    expect(state.showExpandedPanel).toBe(true);

    // All four zones must accommodate framed content
    expect(widths.sidebar).toBeGreaterThanOrEqual(12);
    expect(widths.conversation).toBeGreaterThanOrEqual(30);
    expect(widths.activity).toBeGreaterThanOrEqual(12);
    expect(widths.expanded).toBeGreaterThanOrEqual(12);

    // Total allocation respects terminal width
    const total = widths.sidebar + widths.conversation + widths.activity + widths.expanded;
    expect(total).toBeLessThanOrEqual(200);
  });

  test("zone count increases monotonically with band progression", () => {
    const bandWidths: { band: BreakpointBand; width: number }[] = [
      { band: "compact", width: 40 },
      { band: "narrow", width: 80 },
      { band: "standard", width: 140 },
      { band: "wide", width: 200 },
    ];

    const zoneCounts = bandWidths.map(({ band, width }) => {
      const widths = getPanelWidths(band, width);
      return [widths.sidebar, widths.conversation, widths.activity, widths.expanded]
        .filter((w) => w > 0).length;
    });

    // compact=1, narrow=2, standard=3, wide=4
    expect(zoneCounts).toEqual([1, 2, 3, 4]);
  });

  test("conversation zone always has room for left-border framed message blocks", () => {
    // Left-border frame: 1 border char + 1 padding + text content
    // Minimum readable: 1 + 1 + 10 = 12 chars
    const MIN_FRAMED_WIDTH = 12;

    const testCases: { band: BreakpointBand; width: number }[] = [
      { band: "compact", width: 20 },
      { band: "compact", width: 59 },
      { band: "narrow", width: 60 },
      { band: "narrow", width: 99 },
      { band: "standard", width: 100 },
      { band: "standard", width: 160 },
      { band: "wide", width: 161 },
      { band: "wide", width: 300 },
    ];

    for (const { band, width } of testCases) {
      const widths = getPanelWidths(band, width);
      expect(widths.conversation).toBeGreaterThanOrEqual(MIN_FRAMED_WIDTH);
    }
  });
});

// ---------------------------------------------------------------------------
// Mode × breakpoint combination matrix
// ---------------------------------------------------------------------------

describe("mode × breakpoint combination matrix", () => {
  const BANDS: { band: BreakpointBand; width: number }[] = [
    { band: "compact", width: 40 },
    { band: "narrow", width: 80 },
    { band: "standard", width: 140 },
    { band: "wide", width: 200 },
  ];

  const MODES: LayoutMode[] = ["normal", "activity", "zen"];

  for (const { band, width } of BANDS) {
    for (const mode of MODES) {
      test(`${mode} mode at ${band} (${width} cols)`, () => {
        const state = resolveBreakpointState(width, mode);
        expect(state.band).toBe(band);

        // Constrained mode must be in allowed set
        const allowed = getAllowedModes(band);
        expect(allowed).toContain(state.constrainedMode);

        // Panel widths must be non-negative
        const { panelWidths } = state;
        expect(panelWidths.sidebar).toBeGreaterThanOrEqual(0);
        expect(panelWidths.conversation).toBeGreaterThanOrEqual(0);
        expect(panelWidths.activity).toBeGreaterThanOrEqual(0);
        expect(panelWidths.expanded).toBeGreaterThanOrEqual(0);
      });
    }
  }

  test("normal mode visibility at each band", () => {
    // compact forces zen
    expect(getLayoutVisibility(constrainMode("compact", "normal"))).toEqual({
      showSidebar: false,
      showConversation: true,
      showActivityPanel: false,
    });

    // narrow preserves normal
    expect(getLayoutVisibility(constrainMode("narrow", "normal"))).toEqual({
      showSidebar: true,
      showConversation: true,
      showActivityPanel: false,
    });

    // standard preserves normal
    expect(getLayoutVisibility(constrainMode("standard", "normal"))).toEqual({
      showSidebar: true,
      showConversation: true,
      showActivityPanel: false,
    });

    // wide preserves normal
    expect(getLayoutVisibility(constrainMode("wide", "normal"))).toEqual({
      showSidebar: true,
      showConversation: true,
      showActivityPanel: false,
    });
  });

  test("activity mode visibility at each band", () => {
    // compact forces zen
    expect(getLayoutVisibility(constrainMode("compact", "activity"))).toEqual({
      showSidebar: false,
      showConversation: true,
      showActivityPanel: false,
    });

    // narrow downgrades to normal
    expect(getLayoutVisibility(constrainMode("narrow", "activity"))).toEqual({
      showSidebar: true,
      showConversation: true,
      showActivityPanel: false,
    });

    // standard preserves activity
    expect(getLayoutVisibility(constrainMode("standard", "activity"))).toEqual({
      showSidebar: true,
      showConversation: true,
      showActivityPanel: true,
    });

    // wide preserves activity
    expect(getLayoutVisibility(constrainMode("wide", "activity"))).toEqual({
      showSidebar: true,
      showConversation: true,
      showActivityPanel: true,
    });
  });

  test("zen mode visibility at each band", () => {
    for (const band of ["compact", "narrow", "standard", "wide"] as BreakpointBand[]) {
      expect(getLayoutVisibility(constrainMode(band, "zen"))).toEqual({
        showSidebar: false,
        showConversation: true,
        showActivityPanel: false,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Resize transition stability
// ---------------------------------------------------------------------------

describe("resize transition stability", () => {
  test("standard → compact → standard preserves mode when allowed", () => {
    const desiredMode: LayoutMode = "activity";

    // Start at standard: activity is allowed
    const atStandard = resolveBreakpointState(140, desiredMode);
    expect(atStandard.constrainedMode).toBe("activity");

    // Shrink to compact: forced zen
    const atCompact = resolveBreakpointState(40, desiredMode);
    expect(atCompact.constrainedMode).toBe("zen");

    // Grow back to standard: activity is restored (desired mode unchanged)
    const backToStandard = resolveBreakpointState(140, desiredMode);
    expect(backToStandard.constrainedMode).toBe("activity");
  });

  test("wide → narrow → wide preserves mode when allowed", () => {
    const desiredMode: LayoutMode = "normal";

    const atWide = resolveBreakpointState(200, desiredMode);
    expect(atWide.constrainedMode).toBe("normal");
    expect(atWide.showExpandedPanel).toBe(true);

    const atNarrow = resolveBreakpointState(80, desiredMode);
    expect(atNarrow.constrainedMode).toBe("normal");
    expect(atNarrow.showExpandedPanel).toBe(false);

    const backToWide = resolveBreakpointState(200, desiredMode);
    expect(backToWide.constrainedMode).toBe("normal");
    expect(backToWide.showExpandedPanel).toBe(true);
  });

  test("no panel state corruption during rapid band transitions", () => {
    const desiredMode: LayoutMode = "activity";
    const widthSequence = [200, 80, 40, 80, 140, 200, 40, 200];

    for (const width of widthSequence) {
      const state = resolveBreakpointState(width, desiredMode);
      const allowed = getAllowedModes(state.band);

      // Constrained mode must always be in the allowed set
      expect(allowed).toContain(state.constrainedMode);

      // Panel widths must be non-negative
      expect(state.panelWidths.sidebar).toBeGreaterThanOrEqual(0);
      expect(state.panelWidths.conversation).toBeGreaterThanOrEqual(0);
      expect(state.panelWidths.activity).toBeGreaterThanOrEqual(0);
      expect(state.panelWidths.expanded).toBeGreaterThanOrEqual(0);

      // Expanded panel only in wide
      if (state.band === "wide") {
        expect(state.showExpandedPanel).toBe(true);
      } else {
        expect(state.showExpandedPanel).toBe(false);
      }
    }
  });

  test("band change detection across all threshold boundaries", () => {
    // compact → narrow
    expect(didBandChange(59, 60)).toBe(true);
    // narrow → standard
    expect(didBandChange(99, 100)).toBe(true);
    // standard → wide
    expect(didBandChange(160, 161)).toBe(true);

    // Reverse transitions
    expect(didBandChange(60, 59)).toBe(true);
    expect(didBandChange(100, 99)).toBe(true);
    expect(didBandChange(161, 160)).toBe(true);

    // No change within band
    expect(didBandChange(70, 80)).toBe(false);
    expect(didBandChange(110, 150)).toBe(false);
    expect(didBandChange(200, 250)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forced zen on compact: mode toggle behavior
// ---------------------------------------------------------------------------

describe("forced zen on compact: mode toggle behavior", () => {
  test("TOGGLE_ACTIVITY at compact is constrained to zen", () => {
    // User is in zen (forced by compact), presses Ctrl+A
    const toggled = reduceLayoutMode("zen", { type: "TOGGLE_ACTIVITY" });
    // Reducer returns activity, but breakpoint constrains it
    const constrained = constrainMode("compact", toggled);
    expect(constrained).toBe("zen");
  });

  test("TOGGLE_ZEN at compact stays zen", () => {
    // User is in zen (forced by compact), presses Ctrl+Z
    const toggled = reduceLayoutMode("zen", { type: "TOGGLE_ZEN" });
    // Reducer returns normal, but breakpoint constrains it
    const constrained = constrainMode("compact", toggled);
    expect(constrained).toBe("zen");
  });

  test("mode restores when width increases past compact threshold", () => {
    // User desired activity mode
    const desiredMode: LayoutMode = "activity";

    // At compact: forced zen
    expect(constrainMode("compact", desiredMode)).toBe("zen");

    // Width increases to narrow: activity downgrades to normal
    expect(constrainMode("narrow", desiredMode)).toBe("normal");

    // Width increases to standard: activity is allowed
    expect(constrainMode("standard", desiredMode)).toBe("activity");
  });

  test("SET_LAYOUT_MODE at compact is still constrained", () => {
    const set = reduceLayoutMode("zen", { type: "SET_LAYOUT_MODE", payload: "activity" });
    const constrained = constrainMode("compact", set);
    expect(constrained).toBe("zen");
  });
});

// ---------------------------------------------------------------------------
// Panel width consistency across all bands
// ---------------------------------------------------------------------------

describe("panel width consistency", () => {
  test("conversation panel always gets positive width", () => {
    const testCases: { band: BreakpointBand; width: number }[] = [
      { band: "compact", width: 20 },
      { band: "compact", width: 59 },
      { band: "narrow", width: 60 },
      { band: "narrow", width: 99 },
      { band: "standard", width: 100 },
      { band: "standard", width: 160 },
      { band: "wide", width: 161 },
      { band: "wide", width: 300 },
    ];

    for (const { band, width } of testCases) {
      const panels = getPanelWidths(band, width);
      expect(panels.conversation).toBeGreaterThan(0);
    }
  });

  test("total allocated width does not exceed terminal columns", () => {
    const testCases: { band: BreakpointBand; width: number }[] = [
      { band: "narrow", width: 80 },
      { band: "standard", width: 140 },
      { band: "wide", width: 200 },
    ];

    for (const { band, width } of testCases) {
      const panels = getPanelWidths(band, width);
      const total = panels.sidebar + panels.conversation + panels.activity + panels.expanded;
      // Total should not exceed columns (gaps are implicit)
      expect(total).toBeLessThanOrEqual(width);
    }
  });

  test("compact uses full width for conversation", () => {
    for (const width of [20, 40, 59]) {
      const panels = getPanelWidths("compact", width);
      expect(panels.conversation).toBe(width);
    }
  });
});
