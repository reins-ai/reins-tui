import { describe, expect, test, beforeEach, afterEach, jest } from "bun:test";

import {
  getBreakpointBand,
  getAllowedModes,
  isModeAllowed,
  constrainMode,
  getPanelWidths,
  resolveBreakpointState,
  createResizeDebouncer,
  didBandChange,
  shouldAutoCollapseSidebar,
  BREAKPOINT_THRESHOLDS,
  BAND_LABELS,
  SIDEBAR_WIDTH,
  ACTIVITY_WIDTH,
  EXPANDED_WIDTH,
  MIN_CONVERSATION_WIDTH,
  PANEL_GAP,
  MIN_SIDEBAR_FIT_WIDTH,
  type BreakpointBand,
} from "../../src/layout/breakpoints";
import type { LayoutMode } from "../../src/state/layout-mode";
import {
  resolveStatusSegmentSet,
  deriveStatusSegments,
  resolveSegmentVisibility,
} from "../../src/state/status-machine";
import {
  SEGMENT_DROP_THRESHOLDS,
  type StatusSegmentSources,
} from "../../src/store/types";
import { groupSegments } from "../../src/components/status-bar";

describe("getBreakpointBand", () => {
  test("returns compact for widths below 60", () => {
    expect(getBreakpointBand(0)).toBe("compact");
    expect(getBreakpointBand(1)).toBe("compact");
    expect(getBreakpointBand(40)).toBe("compact");
    expect(getBreakpointBand(59)).toBe("compact");
  });

  test("returns narrow for widths 60-99", () => {
    expect(getBreakpointBand(60)).toBe("narrow");
    expect(getBreakpointBand(80)).toBe("narrow");
    expect(getBreakpointBand(99)).toBe("narrow");
  });

  test("returns standard for widths 100-160", () => {
    expect(getBreakpointBand(100)).toBe("standard");
    expect(getBreakpointBand(120)).toBe("standard");
    expect(getBreakpointBand(160)).toBe("standard");
  });

  test("returns wide for widths above 160", () => {
    expect(getBreakpointBand(161)).toBe("wide");
    expect(getBreakpointBand(200)).toBe("wide");
    expect(getBreakpointBand(300)).toBe("wide");
  });

  test("handles edge cases at exact thresholds", () => {
    expect(getBreakpointBand(BREAKPOINT_THRESHOLDS.compact - 1)).toBe("compact");
    expect(getBreakpointBand(BREAKPOINT_THRESHOLDS.compact)).toBe("narrow");
    expect(getBreakpointBand(BREAKPOINT_THRESHOLDS.narrow - 1)).toBe("narrow");
    expect(getBreakpointBand(BREAKPOINT_THRESHOLDS.narrow)).toBe("standard");
    expect(getBreakpointBand(BREAKPOINT_THRESHOLDS.standard - 1)).toBe("standard");
    expect(getBreakpointBand(BREAKPOINT_THRESHOLDS.standard)).toBe("wide");
  });

  test("treats negative widths as compact", () => {
    expect(getBreakpointBand(-1)).toBe("compact");
    expect(getBreakpointBand(-100)).toBe("compact");
  });
});

describe("getAllowedModes", () => {
  test("compact only allows zen", () => {
    expect(getAllowedModes("compact")).toEqual(["zen"]);
  });

  test("narrow allows normal and zen", () => {
    expect(getAllowedModes("narrow")).toEqual(["normal", "zen"]);
  });

  test("standard allows all modes", () => {
    expect(getAllowedModes("standard")).toEqual(["normal", "activity", "zen"]);
  });

  test("wide allows all modes", () => {
    expect(getAllowedModes("wide")).toEqual(["normal", "activity", "zen"]);
  });
});

describe("isModeAllowed", () => {
  test("compact rejects normal and activity", () => {
    expect(isModeAllowed("compact", "normal")).toBe(false);
    expect(isModeAllowed("compact", "activity")).toBe(false);
    expect(isModeAllowed("compact", "zen")).toBe(true);
  });

  test("narrow rejects activity", () => {
    expect(isModeAllowed("narrow", "normal")).toBe(true);
    expect(isModeAllowed("narrow", "activity")).toBe(false);
    expect(isModeAllowed("narrow", "zen")).toBe(true);
  });

  test("standard and wide accept all modes", () => {
    const modes: LayoutMode[] = ["normal", "activity", "zen"];
    for (const mode of modes) {
      expect(isModeAllowed("standard", mode)).toBe(true);
      expect(isModeAllowed("wide", mode)).toBe(true);
    }
  });
});

describe("constrainMode", () => {
  test("compact always returns zen", () => {
    expect(constrainMode("compact", "normal")).toBe("zen");
    expect(constrainMode("compact", "activity")).toBe("zen");
    expect(constrainMode("compact", "zen")).toBe("zen");
  });

  test("narrow downgrades activity to normal", () => {
    expect(constrainMode("narrow", "activity")).toBe("normal");
  });

  test("narrow preserves normal and zen", () => {
    expect(constrainMode("narrow", "normal")).toBe("normal");
    expect(constrainMode("narrow", "zen")).toBe("zen");
  });

  test("standard preserves all modes", () => {
    expect(constrainMode("standard", "normal")).toBe("normal");
    expect(constrainMode("standard", "activity")).toBe("activity");
    expect(constrainMode("standard", "zen")).toBe("zen");
  });

  test("wide preserves all modes", () => {
    expect(constrainMode("wide", "normal")).toBe("normal");
    expect(constrainMode("wide", "activity")).toBe("activity");
    expect(constrainMode("wide", "zen")).toBe("zen");
  });
});

describe("getPanelWidths", () => {
  test("compact gives full width to conversation", () => {
    const widths = getPanelWidths("compact", 50);
    expect(widths.sidebar).toBe(0);
    expect(widths.conversation).toBe(50);
    expect(widths.activity).toBe(0);
    expect(widths.expanded).toBe(0);
  });

  test("narrow allocates sidebar and conversation", () => {
    const widths = getPanelWidths("narrow", 80);
    expect(widths.sidebar).toBe(SIDEBAR_WIDTH);
    expect(widths.conversation).toBe(80 - SIDEBAR_WIDTH - PANEL_GAP);
    expect(widths.activity).toBe(0);
    expect(widths.expanded).toBe(0);
  });

  test("standard allocates sidebar, conversation, and activity", () => {
    const widths = getPanelWidths("standard", 140);
    expect(widths.sidebar).toBe(SIDEBAR_WIDTH);
    expect(widths.activity).toBe(ACTIVITY_WIDTH);
    expect(widths.conversation).toBe(140 - SIDEBAR_WIDTH - ACTIVITY_WIDTH - PANEL_GAP * 2);
    expect(widths.expanded).toBe(0);
  });

  test("wide allocates all four panels", () => {
    const widths = getPanelWidths("wide", 200);
    expect(widths.sidebar).toBe(SIDEBAR_WIDTH);
    expect(widths.activity).toBe(ACTIVITY_WIDTH);
    expect(widths.expanded).toBe(EXPANDED_WIDTH);
    expect(widths.conversation).toBe(200 - SIDEBAR_WIDTH - ACTIVITY_WIDTH - EXPANDED_WIDTH - PANEL_GAP * 3);
  });

  test("narrow enforces minimum conversation width", () => {
    const widths = getPanelWidths("narrow", 60);
    expect(widths.conversation).toBeGreaterThanOrEqual(20);
  });

  test("standard enforces minimum conversation width", () => {
    const widths = getPanelWidths("standard", 100);
    expect(widths.conversation).toBeGreaterThanOrEqual(20);
  });

  test("wide enforces minimum conversation width", () => {
    const widths = getPanelWidths("wide", 161);
    expect(widths.conversation).toBeGreaterThanOrEqual(30);
  });

  test("panel widths are non-negative for all bands", () => {
    const bands: BreakpointBand[] = ["compact", "narrow", "standard", "wide"];
    const testWidths = [0, 30, 60, 80, 100, 140, 161, 200, 300];

    for (const band of bands) {
      for (const cols of testWidths) {
        const widths = getPanelWidths(band, cols);
        expect(widths.sidebar).toBeGreaterThanOrEqual(0);
        expect(widths.conversation).toBeGreaterThanOrEqual(0);
        expect(widths.activity).toBeGreaterThanOrEqual(0);
        expect(widths.expanded).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("sidebar width matches contextual panel constant (40 chars)", () => {
    expect(SIDEBAR_WIDTH).toBe(40);
  });
});

describe("resolveBreakpointState", () => {
  test("compact band forces zen mode and hides sidebar", () => {
    const state = resolveBreakpointState(40, "normal");
    expect(state.band).toBe("compact");
    expect(state.constrainedMode).toBe("zen");
    expect(state.showExpandedPanel).toBe(false);
    expect(state.sidebarVisible).toBe(false);
  });

  test("narrow band downgrades activity to normal", () => {
    const state = resolveBreakpointState(80, "activity");
    expect(state.band).toBe("narrow");
    expect(state.constrainedMode).toBe("normal");
    expect(state.showExpandedPanel).toBe(false);
  });

  test("narrow band hides sidebar by default", () => {
    const state = resolveBreakpointState(80, "normal");
    expect(state.sidebarVisible).toBe(false);
  });

  test("narrow band shows sidebar when user toggled and room available", () => {
    const state = resolveBreakpointState(80, "normal", true);
    expect(state.sidebarVisible).toBe(true);
  });

  test("standard band preserves all modes and shows sidebar", () => {
    const state = resolveBreakpointState(140, "activity");
    expect(state.band).toBe("standard");
    expect(state.constrainedMode).toBe("activity");
    expect(state.showExpandedPanel).toBe(false);
    expect(state.sidebarVisible).toBe(true);
  });

  test("wide band enables expanded panel and shows sidebar", () => {
    const state = resolveBreakpointState(200, "normal");
    expect(state.band).toBe("wide");
    expect(state.constrainedMode).toBe("normal");
    expect(state.showExpandedPanel).toBe(true);
    expect(state.sidebarVisible).toBe(true);
  });

  test("includes correct column count", () => {
    const state = resolveBreakpointState(120, "zen");
    expect(state.columns).toBe(120);
  });

  test("includes panel widths matching band", () => {
    const state = resolveBreakpointState(140, "normal");
    expect(state.panelWidths.sidebar).toBe(SIDEBAR_WIDTH);
    expect(state.panelWidths.activity).toBe(ACTIVITY_WIDTH);
  });
});

describe("didBandChange", () => {
  test("detects transition from compact to narrow", () => {
    expect(didBandChange(50, 70)).toBe(true);
  });

  test("detects transition from narrow to standard", () => {
    expect(didBandChange(80, 120)).toBe(true);
  });

  test("detects transition from standard to wide", () => {
    expect(didBandChange(140, 200)).toBe(true);
  });

  test("detects transition from wide to narrow", () => {
    expect(didBandChange(200, 80)).toBe(true);
  });

  test("returns false within same band", () => {
    expect(didBandChange(70, 80)).toBe(false);
    expect(didBandChange(110, 150)).toBe(false);
    expect(didBandChange(200, 250)).toBe(false);
    expect(didBandChange(30, 50)).toBe(false);
  });

  test("detects change at exact threshold boundaries", () => {
    expect(didBandChange(59, 60)).toBe(true);
    expect(didBandChange(99, 100)).toBe(true);
    expect(didBandChange(160, 161)).toBe(true);
  });
});

describe("createResizeDebouncer", () => {
  let originalSetTimeout: typeof globalThis.setTimeout;
  let originalClearTimeout: typeof globalThis.clearTimeout;

  beforeEach(() => {
    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  test("calls callback after delay", async () => {
    let receivedColumns = -1;
    const debouncer = createResizeDebouncer((cols) => {
      receivedColumns = cols;
    }, 50);

    debouncer.trigger(120);

    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    expect(receivedColumns).toBe(120);
  });

  test("coalesces rapid triggers into single callback", async () => {
    let callCount = 0;
    let lastColumns = -1;
    const debouncer = createResizeDebouncer((cols) => {
      callCount++;
      lastColumns = cols;
    }, 50);

    debouncer.trigger(80);
    debouncer.trigger(90);
    debouncer.trigger(100);
    debouncer.trigger(120);

    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    expect(callCount).toBe(1);
    expect(lastColumns).toBe(120);
  });

  test("cancel prevents pending callback", async () => {
    let called = false;
    const debouncer = createResizeDebouncer(() => {
      called = true;
    }, 50);

    debouncer.trigger(120);
    debouncer.cancel();

    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    expect(called).toBe(false);
  });

  test("fires again after previous debounce completes", async () => {
    const results: number[] = [];
    const debouncer = createResizeDebouncer((cols) => {
      results.push(cols);
    }, 30);

    debouncer.trigger(80);
    await new Promise((resolve) => originalSetTimeout(resolve, 50));
    expect(results).toEqual([80]);

    debouncer.trigger(120);
    await new Promise((resolve) => originalSetTimeout(resolve, 50));
    expect(results).toEqual([80, 120]);
  });

  test("uses default 150ms delay when not specified", async () => {
    let called = false;
    const debouncer = createResizeDebouncer(() => {
      called = true;
    });

    debouncer.trigger(100);

    await new Promise((resolve) => originalSetTimeout(resolve, 100));
    expect(called).toBe(false);

    await new Promise((resolve) => originalSetTimeout(resolve, 80));
    expect(called).toBe(true);
  });
});

describe("BAND_LABELS", () => {
  test("provides human-readable labels for all bands", () => {
    expect(BAND_LABELS.compact).toContain("<60");
    expect(BAND_LABELS.narrow).toContain("60");
    expect(BAND_LABELS.standard).toContain("100");
    expect(BAND_LABELS.wide).toContain(">160");
  });
});

describe("band transition stability", () => {
  test("rapid width oscillation around threshold settles correctly", () => {
    const widths = [59, 60, 59, 60, 61, 59, 60];
    const bands = widths.map(getBreakpointBand);

    expect(bands).toEqual(["compact", "narrow", "compact", "narrow", "narrow", "compact", "narrow"]);

    const finalBand = bands[bands.length - 1];
    expect(finalBand).toBe("narrow");
  });

  test("mode constraint is idempotent across repeated applications", () => {
    const mode: LayoutMode = "activity";
    const band: BreakpointBand = "narrow";

    const first = constrainMode(band, mode);
    const second = constrainMode(band, first);
    const third = constrainMode(band, second);

    expect(first).toBe("normal");
    expect(second).toBe("normal");
    expect(third).toBe("normal");
  });

  test("growing from compact to wide preserves zen mode throughout", () => {
    const widths = [40, 70, 120, 200];
    const results = widths.map((w) => resolveBreakpointState(w, "zen"));

    for (const result of results) {
      expect(result.constrainedMode).toBe("zen");
    }
  });

  test("shrinking from wide to compact forces zen at compact", () => {
    const widths = [200, 120, 70, 40];
    const results = widths.map((w) => resolveBreakpointState(w, "activity"));

    expect(results[0].constrainedMode).toBe("activity");
    expect(results[1].constrainedMode).toBe("activity");
    expect(results[2].constrainedMode).toBe("normal");
    expect(results[3].constrainedMode).toBe("zen");
  });
});

describe("BREAKPOINT_THRESHOLDS", () => {
  test("thresholds are in ascending order", () => {
    expect(BREAKPOINT_THRESHOLDS.compact).toBeLessThan(BREAKPOINT_THRESHOLDS.narrow);
    expect(BREAKPOINT_THRESHOLDS.narrow).toBeLessThan(BREAKPOINT_THRESHOLDS.standard);
  });

  test("threshold values match spec requirements", () => {
    expect(BREAKPOINT_THRESHOLDS.compact).toBe(60);
    expect(BREAKPOINT_THRESHOLDS.narrow).toBe(100);
    expect(BREAKPOINT_THRESHOLDS.standard).toBe(161);
  });
});

describe("panel width constants", () => {
  test("sidebar width is 40 chars for contextual panel", () => {
    expect(SIDEBAR_WIDTH).toBe(40);
  });

  test("activity width is 32 chars", () => {
    expect(ACTIVITY_WIDTH).toBe(32);
  });

  test("expanded width is 36 chars", () => {
    expect(EXPANDED_WIDTH).toBe(36);
  });

  test("minimum conversation width is 30 chars", () => {
    expect(MIN_CONVERSATION_WIDTH).toBe(30);
  });

  test("MIN_SIDEBAR_FIT_WIDTH equals sidebar + min conversation + gap", () => {
    expect(MIN_SIDEBAR_FIT_WIDTH).toBe(SIDEBAR_WIDTH + MIN_CONVERSATION_WIDTH + PANEL_GAP);
  });
});

describe("shouldAutoCollapseSidebar", () => {
  test("always collapses on compact band", () => {
    expect(shouldAutoCollapseSidebar(40, "compact")).toBe(true);
    expect(shouldAutoCollapseSidebar(59, "compact")).toBe(true);
    expect(shouldAutoCollapseSidebar(40, "compact", true)).toBe(true);
  });

  test("collapses on narrow band by default (user has not toggled)", () => {
    expect(shouldAutoCollapseSidebar(80, "narrow")).toBe(true);
    expect(shouldAutoCollapseSidebar(99, "narrow")).toBe(true);
    expect(shouldAutoCollapseSidebar(80, "narrow", false)).toBe(true);
  });

  test("shows on narrow band when user toggled and room available", () => {
    const widthWithRoom = SIDEBAR_WIDTH + MIN_CONVERSATION_WIDTH + PANEL_GAP;
    expect(shouldAutoCollapseSidebar(widthWithRoom, "narrow", true)).toBe(false);
    expect(shouldAutoCollapseSidebar(99, "narrow", true)).toBe(false);
  });

  test("collapses on narrow band when user toggled but not enough room", () => {
    const tooNarrow = SIDEBAR_WIDTH + MIN_CONVERSATION_WIDTH + PANEL_GAP - 1;
    expect(shouldAutoCollapseSidebar(tooNarrow, "narrow", true)).toBe(true);
  });

  test("shows on standard band by default", () => {
    expect(shouldAutoCollapseSidebar(120, "standard")).toBe(false);
    expect(shouldAutoCollapseSidebar(140, "standard")).toBe(false);
  });

  test("shows on wide band by default", () => {
    expect(shouldAutoCollapseSidebar(200, "wide")).toBe(false);
    expect(shouldAutoCollapseSidebar(300, "wide")).toBe(false);
  });

  test("collapse decision is deterministic for same inputs", () => {
    const inputs: [number, BreakpointBand, boolean][] = [
      [80, "narrow", true],
      [80, "narrow", false],
      [120, "standard", false],
      [40, "compact", true],
    ];

    for (const [cols, band, toggled] of inputs) {
      const first = shouldAutoCollapseSidebar(cols, band, toggled);
      const second = shouldAutoCollapseSidebar(cols, band, toggled);
      expect(first).toBe(second);
    }
  });
});

describe("sidebar collapse across band transitions", () => {
  test("sidebar visible on standard, collapses when shrinking to narrow", () => {
    const standard = resolveBreakpointState(120, "normal");
    expect(standard.sidebarVisible).toBe(true);

    const narrow = resolveBreakpointState(80, "normal");
    expect(narrow.sidebarVisible).toBe(false);
  });

  test("sidebar stays visible on narrow when user toggled and room available", () => {
    const narrow = resolveBreakpointState(80, "normal", true);
    expect(narrow.sidebarVisible).toBe(true);
  });

  test("sidebar collapses on compact regardless of user toggle", () => {
    const compact = resolveBreakpointState(40, "normal", true);
    expect(compact.sidebarVisible).toBe(false);
  });

  test("sidebar visible on wide band", () => {
    const wide = resolveBreakpointState(200, "normal");
    expect(wide.sidebarVisible).toBe(true);
  });

  test("growing from compact to standard restores sidebar visibility", () => {
    const compact = resolveBreakpointState(40, "zen");
    expect(compact.sidebarVisible).toBe(false);

    const standard = resolveBreakpointState(120, "zen");
    expect(standard.sidebarVisible).toBe(true);
  });

  test("zen mode fallback remains functional in compact band", () => {
    const compact = resolveBreakpointState(40, "activity");
    expect(compact.constrainedMode).toBe("zen");
    expect(compact.sidebarVisible).toBe(false);
    expect(compact.panelWidths.sidebar).toBe(0);
    expect(compact.panelWidths.conversation).toBe(40);
  });

  test("sidebar visibility at exact threshold boundaries", () => {
    const atNarrowStart = resolveBreakpointState(60, "normal");
    expect(atNarrowStart.band).toBe("narrow");
    expect(atNarrowStart.sidebarVisible).toBe(false);

    const atStandardStart = resolveBreakpointState(100, "normal");
    expect(atStandardStart.band).toBe("standard");
    expect(atStandardStart.sidebarVisible).toBe(true);
  });
});

// --- Cross-component responsive polish tests ---

function makeSegmentSources(overrides: Partial<StatusSegmentSources> = {}): StatusSegmentSources {
  return {
    connectionStatus: "connected",
    currentModel: "claude-3.5-sonnet",
    lifecycleStatus: "idle",
    activeToolName: null,
    tokenCount: 0,
    cost: null,
    compactionActive: false,
    terminalWidth: 120,
    ...overrides,
  };
}

describe("cross-component status hint visibility across breakpoints", () => {
  test("hints visible at standard width (120 cols)", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 120 }));
    const hasHints = result.visibleSegments.some((s) => s.id === "hints");
    expect(hasHints).toBe(true);
  });

  test("hints visible at wide width (200 cols)", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 200 }));
    const hasHints = result.visibleSegments.some((s) => s.id === "hints");
    expect(hasHints).toBe(true);
  });

  test("hints drop at narrow width below threshold", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 60 }));
    const hasHints = result.visibleSegments.some((s) => s.id === "hints");
    expect(hasHints).toBe(false);
  });

  test("hints drop at compact width", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 40 }));
    const hasHints = result.visibleSegments.some((s) => s.id === "hints");
    expect(hasHints).toBe(false);
  });

  test("connection segment survives at all breakpoint band widths", () => {
    const bandWidths = [40, 60, 100, 200];
    for (const width of bandWidths) {
      const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: width }));
      const hasConnection = result.visibleSegments.some((s) => s.id === "connection");
      expect(hasConnection).toBe(true);
    }
  });

  test("status bar content never exceeds terminal width at any band", () => {
    const bandWidths = [40, 59, 60, 80, 99, 100, 140, 160, 161, 200];
    for (const width of bandWidths) {
      const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: width }));
      expect(result.totalWidth).toBeLessThanOrEqual(width);
    }
  });
});

describe("cross-component sidebar toggle consistency across breakpoints", () => {
  test("sidebar auto-visible on standard band regardless of toggle state", () => {
    const withToggle = resolveBreakpointState(120, "normal", true);
    const withoutToggle = resolveBreakpointState(120, "normal", false);
    expect(withToggle.sidebarVisible).toBe(true);
    expect(withoutToggle.sidebarVisible).toBe(true);
  });

  test("sidebar auto-visible on wide band regardless of toggle state", () => {
    const withToggle = resolveBreakpointState(200, "normal", true);
    const withoutToggle = resolveBreakpointState(200, "normal", false);
    expect(withToggle.sidebarVisible).toBe(true);
    expect(withoutToggle.sidebarVisible).toBe(true);
  });

  test("sidebar toggle respected on narrow band when room available", () => {
    const toggled = resolveBreakpointState(80, "normal", true);
    const notToggled = resolveBreakpointState(80, "normal", false);
    expect(toggled.sidebarVisible).toBe(true);
    expect(notToggled.sidebarVisible).toBe(false);
  });

  test("sidebar toggle ignored on compact band", () => {
    const toggled = resolveBreakpointState(40, "normal", true);
    expect(toggled.sidebarVisible).toBe(false);
  });

  test("sidebar toggle at narrow-standard boundary is deterministic", () => {
    // Just below standard threshold
    const narrow = resolveBreakpointState(99, "normal", true);
    expect(narrow.band).toBe("narrow");
    expect(narrow.sidebarVisible).toBe(true);

    // At standard threshold
    const standard = resolveBreakpointState(100, "normal", false);
    expect(standard.band).toBe("standard");
    expect(standard.sidebarVisible).toBe(true);
  });
});

describe("cross-component spacing coherence at band boundaries", () => {
  test("conversation width is positive at all band boundaries", () => {
    const boundaries = [
      BREAKPOINT_THRESHOLDS.compact,
      BREAKPOINT_THRESHOLDS.narrow,
      BREAKPOINT_THRESHOLDS.standard,
    ];

    for (const width of boundaries) {
      const band = getBreakpointBand(width);
      const widths = getPanelWidths(band, width);
      expect(widths.conversation).toBeGreaterThan(0);
    }
  });

  test("conversation width at narrow start is at least minimum", () => {
    const band = getBreakpointBand(60);
    const widths = getPanelWidths(band, 60);
    expect(widths.conversation).toBeGreaterThanOrEqual(20);
  });

  test("rendered panel widths respect terminal width when sidebar visibility is applied", () => {
    const testWidths = [40, 60, 80, 100, 120, 161, 200];
    for (const cols of testWidths) {
      const state = resolveBreakpointState(cols, "normal");
      const widths = state.panelWidths;
      const sidebarRendered = state.sidebarVisible ? widths.sidebar : 0;
      const total = sidebarRendered + widths.conversation
        + (widths.activity > 0 ? widths.activity + PANEL_GAP : 0)
        + (widths.expanded > 0 ? widths.expanded + PANEL_GAP : 0)
        + (sidebarRendered > 0 ? PANEL_GAP : 0);
      expect(total).toBeLessThanOrEqual(cols);
    }
  });

  test("status zone fits within terminal at all breakpoint widths", () => {
    const testWidths = [40, 60, 80, 100, 120, 161, 200];
    for (const width of testWidths) {
      const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: width }));
      // Status bar uses 2 padding (1 left + 1 right) plus segment content
      expect(result.totalWidth).toBeLessThanOrEqual(width);
    }
  });
});

describe("shortcut hint parity", () => {
  test("status bar hints include Ctrl+K palette shortcut", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints).toBeDefined();
    expect(hints!.content).toContain("Ctrl+K");
  });

  test("status bar hints include Ctrl+M model shortcut", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints!.content).toContain("Ctrl+M");
  });

  test("status bar hints include Ctrl+1 context shortcut", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints!.content).toContain("Ctrl+1");
  });

  test("status bar hints contain at least three keyboard shortcuts", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints).toBeDefined();
    const ctrlMatches = hints!.content.match(/Ctrl\+/g);
    expect(ctrlMatches).not.toBeNull();
    expect(ctrlMatches!.length).toBeGreaterThanOrEqual(3);
  });

  test("hints use consistent separator format", () => {
    const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints).toBeDefined();
    // Hints use middle dot separator between shortcuts
    expect(hints!.content).toContain(" · ");
  });

  test("left and right groups are stable across all widths", () => {
    const testWidths = [40, 60, 80, 100, 120, 200];
    for (const width of testWidths) {
      const result = resolveStatusSegmentSet(makeSegmentSources({ terminalWidth: width }));
      const { left, right } = groupSegments(result.visibleSegments);

      // Left group never contains hints
      for (const seg of left) {
        expect(seg.id).not.toBe("hints");
      }

      // Right group only contains hints
      for (const seg of right) {
        expect(seg.id).toBe("hints");
      }
    }
  });

  test("segment drop thresholds align with breakpoint bands", () => {
    // Hints drop at 80 — within narrow band (60-99)
    expect(SEGMENT_DROP_THRESHOLDS.hints).toBeGreaterThanOrEqual(BREAKPOINT_THRESHOLDS.compact);
    expect(SEGMENT_DROP_THRESHOLDS.hints).toBeLessThan(BREAKPOINT_THRESHOLDS.narrow);

    // Lifecycle drops at 50 — within compact band (<60)
    expect(SEGMENT_DROP_THRESHOLDS.lifecycle).toBeLessThan(BREAKPOINT_THRESHOLDS.compact);

    // Model drops at 30 — deep compact
    expect(SEGMENT_DROP_THRESHOLDS.model).toBeLessThan(SEGMENT_DROP_THRESHOLDS.lifecycle);

    // Connection never drops
    expect(SEGMENT_DROP_THRESHOLDS.connection).toBe(0);
  });
});
