import { describe, expect, test } from "bun:test";

import {
  getPanelBorderColors,
  resolvePanelBorderColor,
  LAYOUT_ZONES,
  type LayoutZoneName,
  resolveInputFrameState,
  getInputBlockStyle,
  getInputBorderChars,
  formatCharCount,
  type InputFrameState,
} from "../../src/components";
import { ACCENT_BORDER_CHARS, SUBTLE_BORDER_CHARS } from "../../src/ui/primitives";

const TEST_FOCUS_COLOR = "#e8976c";
const TEST_DEFAULT_COLOR = "#2b2b42";

describe("layout focus border colors", () => {
  test("resolves focused and default border colors from token arguments", () => {
    expect(resolvePanelBorderColor(true, TEST_FOCUS_COLOR, TEST_DEFAULT_COLOR)).toBe(TEST_FOCUS_COLOR);
    expect(resolvePanelBorderColor(false, TEST_FOCUS_COLOR, TEST_DEFAULT_COLOR)).toBe(TEST_DEFAULT_COLOR);
  });

  test("applies focused border to sidebar", () => {
    const colors = getPanelBorderColors("sidebar", TEST_FOCUS_COLOR, TEST_DEFAULT_COLOR);

    expect(colors.sidebar).toBe(TEST_FOCUS_COLOR);
    expect(colors.conversation).toBe(TEST_DEFAULT_COLOR);
    expect(colors.input).toBe(TEST_DEFAULT_COLOR);
  });

  test("applies focused border to conversation", () => {
    const colors = getPanelBorderColors("conversation", TEST_FOCUS_COLOR, TEST_DEFAULT_COLOR);

    expect(colors.sidebar).toBe(TEST_DEFAULT_COLOR);
    expect(colors.conversation).toBe(TEST_FOCUS_COLOR);
    expect(colors.input).toBe(TEST_DEFAULT_COLOR);
  });

  test("applies focused border to input", () => {
    const colors = getPanelBorderColors("input", TEST_FOCUS_COLOR, TEST_DEFAULT_COLOR);

    expect(colors.sidebar).toBe(TEST_DEFAULT_COLOR);
    expect(colors.conversation).toBe(TEST_DEFAULT_COLOR);
    expect(colors.input).toBe(TEST_FOCUS_COLOR);
  });
});

describe("layout zone structure", () => {
  const EXPECTED_ZONES: LayoutZoneName[] = ["conversation", "input", "sidebar", "status"];

  test("defines all four required layout zones", () => {
    for (const zone of EXPECTED_ZONES) {
      expect(LAYOUT_ZONES).toHaveProperty(zone);
    }
  });

  test("each zone has a surface token reference", () => {
    for (const zone of EXPECTED_ZONES) {
      const config = LAYOUT_ZONES[zone];
      expect(typeof config.surfaceToken).toBe("string");
      expect(config.surfaceToken.length).toBeGreaterThan(0);
    }
  });

  test("conversation zone uses primary surface for maximum content area", () => {
    expect(LAYOUT_ZONES.conversation.surfaceToken).toBe("surface.primary");
    expect(LAYOUT_ZONES.conversation.borderSides).toBeUndefined();
  });

  test("input zone uses secondary surface with top border separator", () => {
    expect(LAYOUT_ZONES.input.surfaceToken).toBe("surface.secondary");
    expect(LAYOUT_ZONES.input.borderSides).toContain("top");
  });

  test("sidebar zone uses secondary surface with left border", () => {
    expect(LAYOUT_ZONES.sidebar.surfaceToken).toBe("surface.secondary");
    expect(LAYOUT_ZONES.sidebar.borderSides).toContain("left");
  });

  test("status zone uses secondary surface with top border", () => {
    expect(LAYOUT_ZONES.status.surfaceToken).toBe("surface.secondary");
    expect(LAYOUT_ZONES.status.borderSides).toContain("top");
  });

  test("zone names are exhaustive against expected set", () => {
    const zoneNames = Object.keys(LAYOUT_ZONES) as LayoutZoneName[];
    expect(zoneNames.sort()).toEqual([...EXPECTED_ZONES].sort());
  });
});

// --- Input frame styling tests ---

// Minimal token stubs for pure function testing
const STUB_TOKENS = {
  "border.focus": "#ff8800",
  "border.subtle": "#333333",
  "input.bg": "#1a1a2e",
  "surface.secondary": "#16162a",
  "status.warning": "#ffcc00",
} as Record<string, string>;

describe("input frame state resolution", () => {
  test("returns focused when input is focused and daemon is live", () => {
    expect(resolveInputFrameState(true, "live")).toBe("focused");
  });

  test("returns default when input is not focused and daemon is live", () => {
    expect(resolveInputFrameState(false, "live")).toBe("default");
  });

  test("returns disabled when daemon is mock regardless of focus", () => {
    expect(resolveInputFrameState(true, "mock")).toBe("disabled");
    expect(resolveInputFrameState(false, "mock")).toBe("disabled");
  });

  test("returns focused for non-mock daemon modes when focused", () => {
    expect(resolveInputFrameState(true, "remote")).toBe("focused");
  });
});

describe("input block style", () => {
  const FRAME_STATES: InputFrameState[] = ["focused", "disabled", "default"];

  test("all frame states produce a valid FramedBlockStyle", () => {
    for (const state of FRAME_STATES) {
      const style = getInputBlockStyle(state, STUB_TOKENS as never);
      expect(typeof style.accentColor).toBe("string");
      expect(typeof style.backgroundColor).toBe("string");
      expect(typeof style.paddingLeft).toBe("number");
      expect(typeof style.paddingRight).toBe("number");
    }
  });

  test("focused state uses focus border and input background", () => {
    const style = getInputBlockStyle("focused", STUB_TOKENS as never);
    expect(style.accentColor).toBe(STUB_TOKENS["border.focus"]);
    expect(style.backgroundColor).toBe(STUB_TOKENS["input.bg"]);
  });

  test("disabled state uses warning accent for offline visibility", () => {
    const style = getInputBlockStyle("disabled", STUB_TOKENS as never);
    expect(style.accentColor).toBe(STUB_TOKENS["status.warning"]);
    expect(style.backgroundColor).toBe(STUB_TOKENS["surface.secondary"]);
  });

  test("default state uses subtle border for passive appearance", () => {
    const style = getInputBlockStyle("default", STUB_TOKENS as never);
    expect(style.accentColor).toBe(STUB_TOKENS["border.subtle"]);
    expect(style.backgroundColor).toBe(STUB_TOKENS["surface.secondary"]);
  });

  test("all states share consistent padding values", () => {
    for (const state of FRAME_STATES) {
      const style = getInputBlockStyle(state, STUB_TOKENS as never);
      expect(style.paddingLeft).toBe(2);
      expect(style.paddingRight).toBe(1);
    }
  });
});

describe("input border chars", () => {
  test("focused input uses accent (heavy) border chars", () => {
    expect(getInputBorderChars("focused")).toBe(ACCENT_BORDER_CHARS);
  });

  test("default input uses subtle (light) border chars", () => {
    expect(getInputBorderChars("default")).toBe(SUBTLE_BORDER_CHARS);
  });

  test("disabled input uses subtle (light) border chars", () => {
    expect(getInputBorderChars("disabled")).toBe(SUBTLE_BORDER_CHARS);
  });
});

describe("character count formatting", () => {
  test("returns empty string when input is empty", () => {
    expect(formatCharCount(0, 4000)).toBe("");
  });

  test("returns count/max format when input has content", () => {
    expect(formatCharCount(42, 4000)).toBe("42/4000");
  });

  test("shows full count at maximum length", () => {
    expect(formatCharCount(4000, 4000)).toBe("4000/4000");
  });

  test("shows count for single character", () => {
    expect(formatCharCount(1, 4000)).toBe("1/4000");
  });
});
