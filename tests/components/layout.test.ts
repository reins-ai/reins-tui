import { describe, expect, test } from "bun:test";

import {
  getPanelBorderColors,
  resolvePanelBorderColor,
  LAYOUT_ZONES,
  type LayoutZoneName,
} from "../../src/components";

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
