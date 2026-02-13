import { describe, expect, test } from "bun:test";

import {
  buildDrawerBorderStyle,
  resolveDrawerPosition,
} from "../../src/components/drawer-panel";
import {
  buildModalTitle,
} from "../../src/components/modal-panel";
import {
  buildCardTopBorder,
  buildCardBottomBorder,
  padCardLine,
  resolveVariantColor,
  type RichCardVariant,
} from "../../src/components/rich-card";
import {
  classifyInputSubmission,
  MAX_INPUT_LENGTH,
  type InputSubmissionKind,
} from "../../src/components/input-area";

// ---------------------------------------------------------------------------
// Mock tokens for testing
// ---------------------------------------------------------------------------

const MOCK_TOKENS: Record<string, string> = {
  "border.primary": "#444444",
  "border.focus": "#7aa2f7",
  "status.error": "#f7768e",
  "status.warning": "#e0af68",
  "status.success": "#9ece6a",
  "status.info": "#7dcfff",
  "text.primary": "#c0caf5",
  "text.muted": "#565f89",
};

// ---------------------------------------------------------------------------
// DrawerPanel
// ---------------------------------------------------------------------------

describe("DrawerPanel", () => {
  test("buildDrawerBorderStyle returns focus color when focused", () => {
    const result = buildDrawerBorderStyle(MOCK_TOKENS, true);
    expect(result).toBe(MOCK_TOKENS["border.focus"]);
  });

  test("buildDrawerBorderStyle returns primary color when not focused", () => {
    const result = buildDrawerBorderStyle(MOCK_TOKENS, false);
    expect(result).toBe(MOCK_TOKENS["border.primary"]);
  });

  test("buildDrawerBorderStyle returns primary color when focus is undefined", () => {
    const result = buildDrawerBorderStyle(MOCK_TOKENS);
    expect(result).toBe(MOCK_TOKENS["border.primary"]);
  });

  test("resolveDrawerPosition returns left for left side", () => {
    expect(resolveDrawerPosition("left")).toBe("left");
  });

  test("resolveDrawerPosition returns right for right side", () => {
    expect(resolveDrawerPosition("right")).toBe("right");
  });
});

// ---------------------------------------------------------------------------
// ModalPanel
// ---------------------------------------------------------------------------

describe("ModalPanel", () => {
  test("buildModalTitle prepends diamond glyph", () => {
    expect(buildModalTitle("Settings")).toBe("◆ Settings");
  });

  test("buildModalTitle handles empty title", () => {
    expect(buildModalTitle("")).toBe("◆ ");
  });

  test("buildModalTitle preserves special characters in title", () => {
    expect(buildModalTitle("Model / Provider")).toBe("◆ Model / Provider");
  });
});

// ---------------------------------------------------------------------------
// RichCard
// ---------------------------------------------------------------------------

describe("RichCard", () => {
  test("resolveVariantColor returns error token for error variant", () => {
    expect(resolveVariantColor("error", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.error"]);
  });

  test("resolveVariantColor returns warning token for warning variant", () => {
    expect(resolveVariantColor("warning", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("resolveVariantColor returns success token for success variant", () => {
    expect(resolveVariantColor("success", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.success"]);
  });

  test("resolveVariantColor returns info token for info variant", () => {
    expect(resolveVariantColor("info", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.info"]);
  });

  test("resolveVariantColor returns border.primary for default variant", () => {
    expect(resolveVariantColor("default", MOCK_TOKENS)).toBe(MOCK_TOKENS["border.primary"]);
  });

  test("all variant types resolve to a non-empty color", () => {
    const variants: RichCardVariant[] = ["default", "info", "warning", "error", "success"];
    for (const variant of variants) {
      const color = resolveVariantColor(variant, MOCK_TOKENS);
      expect(color.length).toBeGreaterThan(0);
    }
  });

  test("buildCardTopBorder without title produces clean border", () => {
    const border = buildCardTopBorder(20);
    expect(border.startsWith("\u256D")).toBe(true);
    expect(border.endsWith("\u256E")).toBe(true);
    expect(border.length).toBe(20);
  });

  test("buildCardTopBorder with title includes title text", () => {
    const border = buildCardTopBorder(34, "Calendar");
    expect(border).toContain("Calendar");
    expect(border.startsWith("\u256D")).toBe(true);
    expect(border.endsWith("\u256E")).toBe(true);
  });

  test("buildCardBottomBorder produces correct width", () => {
    const border = buildCardBottomBorder(20);
    expect(border.startsWith("\u2570")).toBe(true);
    expect(border.endsWith("\u256F")).toBe(true);
    expect(border.length).toBe(20);
  });

  test("padCardLine pads short content to fill width", () => {
    const line = padCardLine("Hello", 20);
    expect(line.startsWith("\u2502 ")).toBe(true);
    expect(line.endsWith(" \u2502")).toBe(true);
    // "│ " (2) + content + padding + " │" (2) = 20
    expect(line.length).toBe(20);
  });

  test("padCardLine truncates long content to fit width", () => {
    const longContent = "A".repeat(50);
    const line = padCardLine(longContent, 20);
    expect(line.startsWith("\u2502 ")).toBe(true);
    expect(line.endsWith(" \u2502")).toBe(true);
    // Should not exceed width
    expect(line.length).toBe(20);
  });

  test("padCardLine handles empty content", () => {
    const line = padCardLine("", 20);
    expect(line.startsWith("\u2502 ")).toBe(true);
    expect(line.endsWith(" \u2502")).toBe(true);
    expect(line.length).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// InputArea refinements
// ---------------------------------------------------------------------------

describe("InputArea exports", () => {
  test("MAX_INPUT_LENGTH is exported and equals 4000", () => {
    expect(MAX_INPUT_LENGTH).toBe(4000);
  });

  test("classifyInputSubmission returns empty for whitespace", () => {
    expect(classifyInputSubmission("")).toBe("empty");
    expect(classifyInputSubmission("   ")).toBe("empty");
  });

  test("classifyInputSubmission returns command for slash prefix", () => {
    expect(classifyInputSubmission("/help")).toBe("command");
    expect(classifyInputSubmission("  /model")).toBe("command");
  });

  test("classifyInputSubmission returns message for regular text", () => {
    expect(classifyInputSubmission("hello world")).toBe("message");
    expect(classifyInputSubmission("what is the weather?")).toBe("message");
  });

  test("InputSubmissionKind type covers all cases", () => {
    const kinds: InputSubmissionKind[] = ["empty", "command", "message"];
    expect(kinds.length).toBe(3);
  });
});
