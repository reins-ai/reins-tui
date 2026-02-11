import { describe, expect, test } from "bun:test";

import {
  GLYPH_REINS,
  GLYPH_USER,
  GLYPH_TOOL_RUNNING,
  GLYPH_TOOL_DONE,
  GLYPH_TOOL_ERROR,
  getRoleGlyph,
  getRoleColor,
  getToolGlyph,
  getToolGlyphColor,
} from "../../src/components/message";
import { EXCHANGE_SEPARATOR, shouldShowSeparator } from "../../src/components/conversation-panel";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import { THEME_TOKEN_NAMES } from "../../src/theme/theme-schema";

import hearthstoneSource from "../../src/theme/builtins/hearthstone.json";
import daylightSource from "../../src/theme/builtins/daylight.json";
import nordFrostSource from "../../src/theme/builtins/nord-frost.json";
import rosePineSource from "../../src/theme/builtins/rose-pine.json";
import solarizedWarmSource from "../../src/theme/builtins/solarized-warm.json";

// ---------------------------------------------------------------------------
// Glyph vocabulary definition and character assertions
// ---------------------------------------------------------------------------

describe("glyph vocabulary: character identity", () => {
  test("assistant marker is filled diamond ◆", () => {
    expect(GLYPH_REINS).toBe("◆");
  });

  test("user marker is open diamond ◇", () => {
    expect(GLYPH_USER).toBe("◇");
  });

  test("tool running marker is circled dot ◎", () => {
    expect(GLYPH_TOOL_RUNNING).toBe("◎");
  });

  test("tool done marker is four-pointed star ✦", () => {
    expect(GLYPH_TOOL_DONE).toBe("✦");
  });

  test("tool error marker is open four-pointed star ✧", () => {
    expect(GLYPH_TOOL_ERROR).toBe("✧");
  });

  test("exchange separator uses spaced dashes ─ ─ ─", () => {
    expect(EXCHANGE_SEPARATOR).toBe("─ ─ ─");
    expect(EXCHANGE_SEPARATOR).toContain("─");
  });
});

// ---------------------------------------------------------------------------
// Glyph width calculations: single-width Unicode
// ---------------------------------------------------------------------------

describe("glyph width calculations", () => {
  // All glyphs in the vocabulary should be single-width characters.
  // We verify by checking string length (each glyph is one codepoint).

  const SINGLE_CHAR_GLYPHS = [
    { name: "GLYPH_REINS (◆)", glyph: GLYPH_REINS },
    { name: "GLYPH_USER (◇)", glyph: GLYPH_USER },
    { name: "GLYPH_TOOL_RUNNING (◎)", glyph: GLYPH_TOOL_RUNNING },
    { name: "GLYPH_TOOL_DONE (✦)", glyph: GLYPH_TOOL_DONE },
    { name: "GLYPH_TOOL_ERROR (✧)", glyph: GLYPH_TOOL_ERROR },
  ];

  for (const { name, glyph } of SINGLE_CHAR_GLYPHS) {
    test(`${name} is a single codepoint`, () => {
      expect(glyph.length).toBe(1);
    });

    test(`${name} is not a surrogate pair (BMP character)`, () => {
      const codePoint = glyph.codePointAt(0)!;
      // BMP characters have code points <= 0xFFFF
      expect(codePoint).toBeLessThanOrEqual(0xffff);
    });

    test(`${name} is not a CJK/fullwidth character`, () => {
      const codePoint = glyph.codePointAt(0)!;
      // CJK Unified Ideographs: 0x4E00-0x9FFF
      // Fullwidth Forms: 0xFF01-0xFF60
      const isCJK = codePoint >= 0x4e00 && codePoint <= 0x9fff;
      const isFullwidth = codePoint >= 0xff01 && codePoint <= 0xff60;
      expect(isCJK || isFullwidth).toBe(false);
    });
  }

  test("separator characters are single-width box-drawing", () => {
    const dashChar = "─";
    expect(dashChar.length).toBe(1);
    const codePoint = dashChar.codePointAt(0)!;
    // Box Drawing block: 0x2500-0x257F
    expect(codePoint).toBeGreaterThanOrEqual(0x2500);
    expect(codePoint).toBeLessThanOrEqual(0x257f);
  });

  test("card border characters are single-width box-drawing", () => {
    const corners = ["╭", "╮", "╰", "╯"];
    for (const corner of corners) {
      expect(corner.length).toBe(1);
      const codePoint = corner.codePointAt(0)!;
      // Box Drawing block: 0x2500-0x257F
      expect(codePoint).toBeGreaterThanOrEqual(0x2500);
      expect(codePoint).toBeLessThanOrEqual(0x257f);
    }
  });

  test("navigation hint › is single-width", () => {
    const hint = "›";
    expect(hint.length).toBe(1);
    const codePoint = hint.codePointAt(0)!;
    expect(codePoint).toBeLessThanOrEqual(0xffff);
  });

  test("heartbeat dot · is single-width", () => {
    const dot = "·";
    expect(dot.length).toBe(1);
    const codePoint = dot.codePointAt(0)!;
    expect(codePoint).toBeLessThanOrEqual(0xffff);
  });
});

// ---------------------------------------------------------------------------
// ASCII fallback mapping
// ---------------------------------------------------------------------------

describe("ASCII fallback mapping", () => {
  // Define the expected ASCII fallback for each glyph.
  // This documents the intended mapping even if not yet implemented
  // as a runtime function — the test serves as a specification.

  const ASCII_FALLBACK_MAP: Record<string, string> = {
    "◆": "*",
    "◇": ">",
    "◎": "@",
    "✦": "+",
    "✧": "x",
    "╭": "+",
    "╮": "+",
    "╰": "+",
    "╯": "+",
    "─": "-",
    "·": ".",
    "›": ">",
  };

  for (const [unicode, ascii] of Object.entries(ASCII_FALLBACK_MAP)) {
    test(`${unicode} → ${ascii} (single ASCII character)`, () => {
      expect(ascii.length).toBe(1);
      // ASCII characters are in 0x20-0x7E range
      const code = ascii.charCodeAt(0);
      expect(code).toBeGreaterThanOrEqual(0x20);
      expect(code).toBeLessThanOrEqual(0x7e);
    });
  }

  test("all ASCII fallbacks are printable ASCII", () => {
    for (const ascii of Object.values(ASCII_FALLBACK_MAP)) {
      expect(/^[\x20-\x7E]$/.test(ascii)).toBe(true);
    }
  });

  test("ASCII fallbacks preserve width parity (1:1 character mapping)", () => {
    for (const [unicode, ascii] of Object.entries(ASCII_FALLBACK_MAP)) {
      // Each Unicode glyph maps to exactly one ASCII character
      expect(unicode.length).toBe(1);
      expect(ascii.length).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Glyph consistency across themes: same glyphs regardless of theme
// ---------------------------------------------------------------------------

describe("glyph consistency across themes", () => {
  const ALL_THEMES = [
    { name: "hearthstone", source: hearthstoneSource },
    { name: "daylight", source: daylightSource },
    { name: "solarized-warm", source: solarizedWarmSource },
    { name: "nord-frost", source: nordFrostSource },
    { name: "rose-pine", source: rosePineSource },
  ];

  test("role glyphs are theme-independent", () => {
    // Glyphs are constants, not derived from theme tokens
    const roles = ["assistant", "user", "system", "tool"] as const;

    for (const role of roles) {
      const glyph = getRoleGlyph(role);
      expect(typeof glyph).toBe("string");
      expect(glyph.length).toBeGreaterThan(0);
    }

    // Verify same glyph regardless of which theme is "active"
    expect(getRoleGlyph("assistant")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("user")).toBe(GLYPH_USER);
  });

  test("tool glyphs are theme-independent", () => {
    const statuses = ["pending", "running", "complete", "error"] as const;

    for (const status of statuses) {
      const glyph = getToolGlyph(status);
      expect(typeof glyph).toBe("string");
      expect(glyph.length).toBeGreaterThan(0);
    }
  });

  test("theme only affects glyph colors, not glyph characters", () => {
    for (const { name, source } of ALL_THEMES) {
      const tokens = source as unknown as Readonly<ThemeTokens>;

      // Colors change per theme
      const reinsColor = getRoleColor("assistant", tokens);
      const userColor = getRoleColor("user", tokens);
      expect(typeof reinsColor).toBe("string");
      expect(typeof userColor).toBe("string");

      // But glyphs stay the same
      expect(getRoleGlyph("assistant")).toBe("◆");
      expect(getRoleGlyph("user")).toBe("◇");
    }
  });

  test("glyph color tokens exist in all themes", () => {
    const glyphTokenNames = [
      "glyph.reins",
      "glyph.user",
      "glyph.tool.running",
      "glyph.tool.done",
      "glyph.tool.error",
      "glyph.heartbeat",
    ] as const;

    for (const { name, source } of ALL_THEMES) {
      const tokens = source as Record<string, string>;
      for (const tokenName of glyphTokenNames) {
        expect(tokens[tokenName]).toBeDefined();
        expect(typeof tokens[tokenName]).toBe("string");
        expect(/^#[0-9a-fA-F]{6}$/.test(tokens[tokenName])).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Card border completeness
// ---------------------------------------------------------------------------

describe("card border completeness", () => {
  const CARD_CORNERS = {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
  };

  const CARD_EDGES = {
    horizontal: "─",
  };

  test("all four corner characters are distinct", () => {
    const corners = Object.values(CARD_CORNERS);
    const unique = new Set(corners);
    expect(unique.size).toBe(4);
  });

  test("corner characters are from box-drawing Unicode block", () => {
    for (const [position, char] of Object.entries(CARD_CORNERS)) {
      const codePoint = char.codePointAt(0)!;
      // Box Drawing: U+2500 to U+257F
      // Light Arc variants: ╭ U+256D, ╮ U+256E, ╰ U+2570, ╯ U+256F
      expect(codePoint).toBeGreaterThanOrEqual(0x2500);
      expect(codePoint).toBeLessThanOrEqual(0x257f);
    }
  });

  test("horizontal edge character is box-drawing dash", () => {
    const codePoint = CARD_EDGES.horizontal.codePointAt(0)!;
    // ─ is U+2500 (BOX DRAWINGS LIGHT HORIZONTAL)
    expect(codePoint).toBe(0x2500);
  });

  test("corners form a complete box when combined", () => {
    const { topLeft, topRight, bottomLeft, bottomRight } = CARD_CORNERS;
    const h = CARD_EDGES.horizontal;

    // Construct a minimal 3-wide box
    const topRow = `${topLeft}${h}${topRight}`;
    const bottomRow = `${bottomLeft}${h}${bottomRight}`;

    expect(topRow).toBe("╭─╮");
    expect(bottomRow).toBe("╰─╯");

    // Verify string lengths are consistent
    expect(topRow.length).toBe(3);
    expect(bottomRow.length).toBe(3);
  });

  test("box-drawing characters are all single-width", () => {
    const allChars = [
      ...Object.values(CARD_CORNERS),
      CARD_EDGES.horizontal,
    ];

    for (const char of allChars) {
      expect(char.length).toBe(1);
      const codePoint = char.codePointAt(0)!;
      // Not in CJK or fullwidth ranges
      expect(codePoint).toBeLessThan(0x4e00);
    }
  });
});

// ---------------------------------------------------------------------------
// Exchange separator rendering
// ---------------------------------------------------------------------------

describe("exchange separator rendering", () => {
  test("separator contains box-drawing horizontal dash", () => {
    expect(EXCHANGE_SEPARATOR).toContain("─");
  });

  test("separator is visually distinct from content text", () => {
    // Separator uses box-drawing characters, not regular ASCII dashes
    expect(EXCHANGE_SEPARATOR).not.toContain("-");
  });

  test("shouldShowSeparator returns false for first message", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "hello", isStreaming: false },
    ];
    expect(shouldShowSeparator(messages, 0)).toBe(false);
  });

  test("shouldShowSeparator returns true for user after assistant", () => {
    const messages = [
      { id: "1", role: "assistant" as const, content: "hi", isStreaming: false },
      { id: "2", role: "user" as const, content: "hello", isStreaming: false },
    ];
    expect(shouldShowSeparator(messages, 1)).toBe(true);
  });

  test("shouldShowSeparator returns false for assistant after user", () => {
    const messages = [
      { id: "1", role: "user" as const, content: "hello", isStreaming: false },
      { id: "2", role: "assistant" as const, content: "hi", isStreaming: false },
    ];
    expect(shouldShowSeparator(messages, 1)).toBe(false);
  });

  test("shouldShowSeparator returns true for user after tool", () => {
    const messages = [
      { id: "1", role: "tool" as const, content: "result", isStreaming: false },
      { id: "2", role: "user" as const, content: "thanks", isStreaming: false },
    ];
    expect(shouldShowSeparator(messages, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tool glyph color mapping per theme
// ---------------------------------------------------------------------------

describe("tool glyph color mapping per theme", () => {
  const ALL_THEMES = [
    { name: "hearthstone", source: hearthstoneSource },
    { name: "daylight", source: daylightSource },
    { name: "solarized-warm", source: solarizedWarmSource },
    { name: "nord-frost", source: nordFrostSource },
    { name: "rose-pine", source: rosePineSource },
  ];

  for (const { name, source } of ALL_THEMES) {
    describe(`theme: ${name}`, () => {
      const tokens = source as unknown as Readonly<ThemeTokens>;

      test("running tool uses glyph.tool.running token", () => {
        expect(getToolGlyphColor("running", tokens)).toBe(tokens["glyph.tool.running"]);
      });

      test("pending tool uses glyph.tool.running token", () => {
        expect(getToolGlyphColor("pending", tokens)).toBe(tokens["glyph.tool.running"]);
      });

      test("complete tool uses glyph.tool.done token", () => {
        expect(getToolGlyphColor("complete", tokens)).toBe(tokens["glyph.tool.done"]);
      });

      test("error tool uses glyph.tool.error token", () => {
        expect(getToolGlyphColor("error", tokens)).toBe(tokens["glyph.tool.error"]);
      });

      test("role colors use correct theme tokens", () => {
        expect(getRoleColor("assistant", tokens)).toBe(tokens["glyph.reins"]);
        expect(getRoleColor("user", tokens)).toBe(tokens["glyph.user"]);
        expect(getRoleColor("system", tokens)).toBe(tokens["text.muted"]);
        expect(getRoleColor("tool", tokens)).toBe(tokens["glyph.tool.running"]);
      });
    });
  }
});
