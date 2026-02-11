import { describe, expect, test } from "bun:test";

import {
  getPanelBorderColors,
  resolvePanelBorderColor,
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
