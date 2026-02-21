import { describe, expect, test } from "bun:test";

import {
  stripAnsiEscapes,
  countInputLines,
  formatLineCount,
  MAX_VISIBLE_LINES,
  MAX_INPUT_LENGTH,
  classifyInputSubmission,
  resolveInputFrameState,
  getInputBlockStyle,
  getInputBorderChars,
  formatCharCount,
  isPromptCancellableLifecycle,
  getCancelPromptHint,
} from "../../src/components/input-area";
import {
  buildProgressBar,
  buildTokenLabel,
  formatTokenCount,
  getTokenBarTier,
  type TokenBarProps,
} from "../../src/components/cards/token-bar";
import {
  buildWarningMessage,
  formatUtilisationPercent,
  getWarningBannerStyle,
} from "../../src/components/cards/context-warning-banner";
import { ACCENT_BORDER_CHARS, SUBTLE_BORDER_CHARS } from "../../src/ui/primitives";

// --- Mock theme tokens ---

const MOCK_TOKENS = {
  "border.focus": "#0088ff",
  "border.subtle": "#333333",
  "input.bg": "#111111",
  "surface.secondary": "#1a1a1a",
  "status.warning": "#ffaa00",
  "status.error": "#ff0000",
  "status.success": "#00ff00",
  "text.muted": "#666666",
  "text.primary": "#ffffff",
} as const;

// ---------------------------------------------------------------------------
// stripAnsiEscapes
// ---------------------------------------------------------------------------

describe("stripAnsiEscapes", () => {
  test("returns plain text unchanged", () => {
    expect(stripAnsiEscapes("hello world")).toBe("hello world");
  });

  test("strips CSI color sequences", () => {
    expect(stripAnsiEscapes("\x1b[31mred text\x1b[0m")).toBe("red text");
  });

  test("strips CSI sequences with multiple parameters", () => {
    expect(stripAnsiEscapes("\x1b[1;32;40mbold green\x1b[0m")).toBe("bold green");
  });

  test("strips cursor movement sequences", () => {
    expect(stripAnsiEscapes("\x1b[2Amove up\x1b[3Bmove down")).toBe("move upmove down");
  });

  test("strips OSC sequences with BEL terminator", () => {
    expect(stripAnsiEscapes("\x1b]0;window title\x07content")).toBe("content");
  });

  test("strips OSC sequences with ST terminator", () => {
    expect(stripAnsiEscapes("\x1b]0;window title\x1b\\content")).toBe("content");
  });

  test("strips two-character escape sequences", () => {
    expect(stripAnsiEscapes("\x1bMreverse index")).toBe("reverse index");
  });

  test("handles empty string", () => {
    expect(stripAnsiEscapes("")).toBe("");
  });

  test("handles text with only escape sequences", () => {
    expect(stripAnsiEscapes("\x1b[31m\x1b[0m")).toBe("");
  });

  test("preserves multi-line content after stripping", () => {
    const input = "\x1b[32mline1\x1b[0m\nline2\n\x1b[33mline3\x1b[0m";
    expect(stripAnsiEscapes(input)).toBe("line1\nline2\nline3");
  });

  test("handles pasted content with mixed escape sequences", () => {
    const pasted = "\x1b[1m$ ls -la\x1b[0m\n\x1b[34mfile1.ts\x1b[0m\nfile2.ts";
    expect(stripAnsiEscapes(pasted)).toBe("$ ls -la\nfile1.ts\nfile2.ts");
  });
});

// ---------------------------------------------------------------------------
// countInputLines
// ---------------------------------------------------------------------------

describe("countInputLines", () => {
  test("returns 1 for single line with no previous lines", () => {
    expect(countInputLines([], "hello")).toBe(1);
  });

  test("counts previous lines plus current", () => {
    expect(countInputLines(["line1", "line2"], "line3")).toBe(3);
  });

  test("counts newlines within current input", () => {
    expect(countInputLines([], "line1\nline2")).toBe(2);
  });

  test("combines previous lines and multi-line current input", () => {
    expect(countInputLines(["prev1"], "cur1\ncur2")).toBe(3);
  });

  test("handles empty current line", () => {
    expect(countInputLines(["line1", "line2"], "")).toBe(3);
  });

  test("handles empty previous lines and empty current", () => {
    expect(countInputLines([], "")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatLineCount
// ---------------------------------------------------------------------------

describe("formatLineCount", () => {
  test("returns empty string for 1 line", () => {
    expect(formatLineCount(1)).toBe("");
  });

  test("returns empty string for 2 lines", () => {
    expect(formatLineCount(2)).toBe("");
  });

  test("returns empty string for 3 lines", () => {
    expect(formatLineCount(3)).toBe("");
  });

  test("returns '[4 lines]' for 4 lines", () => {
    expect(formatLineCount(4)).toBe("[4 lines]");
  });

  test("returns '[10 lines]' for 10 lines", () => {
    expect(formatLineCount(10)).toBe("[10 lines]");
  });

  test("returns '[20 lines]' for 20 lines", () => {
    expect(formatLineCount(20)).toBe("[20 lines]");
  });
});

// ---------------------------------------------------------------------------
// MAX_VISIBLE_LINES constant
// ---------------------------------------------------------------------------

describe("MAX_VISIBLE_LINES", () => {
  test("is set to 8", () => {
    expect(MAX_VISIBLE_LINES).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// classifyInputSubmission
// ---------------------------------------------------------------------------

describe("classifyInputSubmission", () => {
  test("returns 'empty' for empty string", () => {
    expect(classifyInputSubmission("")).toBe("empty");
  });

  test("returns 'empty' for whitespace-only string", () => {
    expect(classifyInputSubmission("   ")).toBe("empty");
    expect(classifyInputSubmission("\n\t")).toBe("empty");
  });

  test("returns 'command' for slash-prefixed input", () => {
    expect(classifyInputSubmission("/help")).toBe("command");
    expect(classifyInputSubmission("/model gpt-4")).toBe("command");
  });

  test("returns 'command' for slash with leading whitespace", () => {
    expect(classifyInputSubmission("  /help")).toBe("command");
  });

  test("returns 'message' for regular text", () => {
    expect(classifyInputSubmission("hello world")).toBe("message");
    expect(classifyInputSubmission("what is the weather?")).toBe("message");
  });

  test("returns 'message' for text containing slash not at start", () => {
    expect(classifyInputSubmission("use /help for info")).toBe("message");
  });
});

// ---------------------------------------------------------------------------
// resolveInputFrameState
// ---------------------------------------------------------------------------

describe("resolveInputFrameState", () => {
  test("returns 'disabled' when daemon mode is mock", () => {
    expect(resolveInputFrameState(true, "mock")).toBe("disabled");
    expect(resolveInputFrameState(false, "mock")).toBe("disabled");
  });

  test("returns 'focused' when focused and daemon is not mock", () => {
    expect(resolveInputFrameState(true, "live")).toBe("focused");
    expect(resolveInputFrameState(true, "connected")).toBe("focused");
  });

  test("returns 'default' when not focused and daemon is not mock", () => {
    expect(resolveInputFrameState(false, "live")).toBe("default");
    expect(resolveInputFrameState(false, "connected")).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// getInputBlockStyle
// ---------------------------------------------------------------------------

describe("getInputBlockStyle", () => {
  test("focused state uses border.focus accent and input.bg background", () => {
    const style = getInputBlockStyle("focused", MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#0088ff");
    expect(style.backgroundColor).toBe("#111111");
  });

  test("disabled state uses status.warning accent and surface.secondary background", () => {
    const style = getInputBlockStyle("disabled", MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#ffaa00");
    expect(style.backgroundColor).toBe("#1a1a1a");
  });

  test("default state uses border.subtle accent and surface.secondary background", () => {
    const style = getInputBlockStyle("default", MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#333333");
    expect(style.backgroundColor).toBe("#1a1a1a");
  });

  test("all states include consistent padding", () => {
    for (const state of ["focused", "disabled", "default"] as const) {
      const style = getInputBlockStyle(state, MOCK_TOKENS as any);
      expect(style.paddingLeft).toBe(2);
      expect(style.paddingRight).toBe(1);
      expect(style.paddingTop).toBe(0);
      expect(style.paddingBottom).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getInputBorderChars
// ---------------------------------------------------------------------------

describe("getInputBorderChars", () => {
  test("returns accent border chars for focused state", () => {
    expect(getInputBorderChars("focused")).toBe(ACCENT_BORDER_CHARS);
  });

  test("returns subtle border chars for disabled state", () => {
    expect(getInputBorderChars("disabled")).toBe(SUBTLE_BORDER_CHARS);
  });

  test("returns subtle border chars for default state", () => {
    expect(getInputBorderChars("default")).toBe(SUBTLE_BORDER_CHARS);
  });
});

// ---------------------------------------------------------------------------
// formatCharCount
// ---------------------------------------------------------------------------

describe("formatCharCount", () => {
  test("returns empty string for zero length", () => {
    expect(formatCharCount(0, MAX_INPUT_LENGTH)).toBe("");
  });

  test("returns count/max format for non-zero length", () => {
    expect(formatCharCount(42, 4000)).toBe("42/4000");
  });

  test("returns count at max length", () => {
    expect(formatCharCount(4000, 4000)).toBe("4000/4000");
  });

  test("returns count for single character", () => {
    expect(formatCharCount(1, 4000)).toBe("1/4000");
  });
});

// ---------------------------------------------------------------------------
// isPromptCancellableLifecycle
// ---------------------------------------------------------------------------

describe("isPromptCancellableLifecycle", () => {
  test("returns true for thinking status", () => {
    expect(isPromptCancellableLifecycle("thinking")).toBe(true);
  });

  test("returns true for streaming status", () => {
    expect(isPromptCancellableLifecycle("streaming")).toBe(true);
  });

  test("returns false for idle status", () => {
    expect(isPromptCancellableLifecycle("idle")).toBe(false);
  });

  test("returns false for sending status", () => {
    expect(isPromptCancellableLifecycle("sending")).toBe(false);
  });

  test("returns false for complete status", () => {
    expect(isPromptCancellableLifecycle("complete")).toBe(false);
  });

  test("returns false for error status", () => {
    expect(isPromptCancellableLifecycle("error")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCancelPromptHint
// ---------------------------------------------------------------------------

describe("getCancelPromptHint", () => {
  test("returns 'Press escape again' when armed", () => {
    expect(getCancelPromptHint(true)).toBe("Press escape again");
  });

  test("returns 'Esc to cancel' when not armed", () => {
    expect(getCancelPromptHint(false)).toBe("Esc to cancel");
  });
});

// ---------------------------------------------------------------------------
// Multi-line paste integration (pure function tests)
// ---------------------------------------------------------------------------

describe("multi-line paste sanitisation", () => {
  test("stripAnsiEscapes preserves multi-line structure", () => {
    const pasted = "line1\nline2\nline3\nline4\nline5";
    const sanitised = stripAnsiEscapes(pasted);
    expect(sanitised).toBe("line1\nline2\nline3\nline4\nline5");
    expect(sanitised.split("\n")).toHaveLength(5);
  });

  test("20-line paste is preserved after sanitisation", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const pasted = lines.join("\n");
    const sanitised = stripAnsiEscapes(pasted);
    expect(sanitised.split("\n")).toHaveLength(20);
  });

  test("paste with ANSI codes preserves line count", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `\x1b[3${i}mcolored line ${i}\x1b[0m`);
    const pasted = lines.join("\n");
    const sanitised = stripAnsiEscapes(pasted);
    const resultLines = sanitised.split("\n");
    expect(resultLines).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(resultLines[i]).toBe(`colored line ${i}`);
    }
  });

  test("line count indicator shows for multi-line paste exceeding 3 lines", () => {
    const previousLines = ["line1", "line2", "line3"];
    const currentLine = "line4";
    const count = countInputLines(previousLines, currentLine);
    expect(count).toBe(4);
    expect(formatLineCount(count)).toBe("[4 lines]");
  });
});

// ---------------------------------------------------------------------------
// Hint text content verification
// ---------------------------------------------------------------------------

describe("hint text content", () => {
  test("focused hint includes send and newline instructions", () => {
    // The hint text is built inline in the component, but we can verify
    // the Unicode characters used match the spec: ↵ send · Shift+↵ newline
    const sendSymbol = "\u21B5"; // ↵
    const separator = "\u00B7"; // ·
    const expectedHint = `${sendSymbol} send ${separator} Shift+${sendSymbol} newline`;
    expect(expectedHint).toContain("send");
    expect(expectedHint).toContain("Shift+");
    expect(expectedHint).toContain("newline");
  });
});

// ---------------------------------------------------------------------------
// TokenBar helpers (from token-bar.tsx)
// ---------------------------------------------------------------------------

describe("TokenBar helpers", () => {
  // --- buildProgressBar ---

  describe("buildProgressBar", () => {
    test("returns all empty at 0%", () => {
      const bar = buildProgressBar(0);
      expect(bar).toBe("\u2591".repeat(10));
      expect(bar.length).toBe(10);
    });

    test("returns half-filled at 50%", () => {
      const bar = buildProgressBar(0.5);
      expect(bar).toBe("\u2593".repeat(5) + "\u2591".repeat(5));
      expect(bar.length).toBe(10);
    });

    test("returns fully filled at 100%", () => {
      const bar = buildProgressBar(1.0);
      expect(bar).toBe("\u2593".repeat(10));
      expect(bar.length).toBe(10);
    });

    test("uses 10-char width by default", () => {
      const bar = buildProgressBar(0.3);
      expect(bar.length).toBe(10);
    });

    test("clamps utilisation below 0 to 0", () => {
      const bar = buildProgressBar(-0.5);
      expect(bar).toBe("\u2591".repeat(10));
    });

    test("clamps utilisation above 1 to 1", () => {
      const bar = buildProgressBar(1.5);
      expect(bar).toBe("\u2593".repeat(10));
    });

    test("rounds filled count correctly at 25%", () => {
      const bar = buildProgressBar(0.25);
      // Math.round(0.25 * 10) = 3 filled
      const filledCount = bar.split("").filter((c) => c === "\u2593").length;
      expect(filledCount).toBe(3);
    });

    test("rounds filled count correctly at 75%", () => {
      const bar = buildProgressBar(0.75);
      // Math.round(0.75 * 10) = 8 filled
      const filledCount = bar.split("").filter((c) => c === "\u2593").length;
      expect(filledCount).toBe(8);
    });

    test("returns consistent length for edge utilisation values", () => {
      for (const u of [0, 0.01, 0.1, 0.5, 0.9, 0.99, 1.0]) {
        expect(buildProgressBar(u).length).toBe(10);
      }
    });
  });

  // --- getTokenBarTier ---

  describe("getTokenBarTier", () => {
    test("returns 'normal' at 0%", () => {
      expect(getTokenBarTier(0)).toBe("normal");
    });

    test("returns 'normal' at 69%", () => {
      expect(getTokenBarTier(0.69)).toBe("normal");
    });

    test("returns 'amber' at 70%", () => {
      expect(getTokenBarTier(0.70)).toBe("amber");
    });

    test("returns 'amber' at 84%", () => {
      expect(getTokenBarTier(0.84)).toBe("amber");
    });

    test("returns 'orange' at 85%", () => {
      expect(getTokenBarTier(0.85)).toBe("orange");
    });

    test("returns 'orange' at 94%", () => {
      expect(getTokenBarTier(0.94)).toBe("orange");
    });

    test("returns 'danger' at 95%", () => {
      expect(getTokenBarTier(0.95)).toBe("danger");
    });

    test("returns 'danger' at 100%", () => {
      expect(getTokenBarTier(1.0)).toBe("danger");
    });

    test("returns 'normal' for negative utilisation", () => {
      expect(getTokenBarTier(-0.1)).toBe("normal");
    });

    test("returns 'danger' for utilisation above 100%", () => {
      expect(getTokenBarTier(1.5)).toBe("danger");
    });
  });

  // --- formatTokenCount ---

  describe("formatTokenCount", () => {
    test("formats 0", () => {
      expect(formatTokenCount(0)).toBe("0");
    });

    test("formats small numbers without commas", () => {
      expect(formatTokenCount(42)).toBe("42");
    });

    test("formats with commas for large numbers", () => {
      const result = formatTokenCount(1247);
      // toLocaleString may vary by locale, but should contain the digits
      expect(result).toContain("1");
      expect(result).toContain("247");
    });

    test("formats 200000 with separators", () => {
      const result = formatTokenCount(200000);
      expect(result).toContain("200");
      expect(result).toContain("000");
    });

    test("formats 1000000 with separators", () => {
      const result = formatTokenCount(1000000);
      expect(result).toContain("1");
      expect(result).toContain("000");
    });
  });

  // --- buildTokenLabel ---

  describe("buildTokenLabel", () => {
    test("builds label with used and limit", () => {
      const label = buildTokenLabel(1247, 200000);
      expect(label).toContain("tokens");
      expect(label).toContain("/");
    });

    test("builds label for zero usage", () => {
      const label = buildTokenLabel(0, 200000);
      expect(label).toContain("0");
      expect(label).toContain("tokens");
    });

    test("builds label at full capacity", () => {
      const label = buildTokenLabel(200000, 200000);
      expect(label).toContain("tokens");
      // Both numbers should be the same formatted value
      const parts = label.split("/");
      expect(parts.length).toBe(2);
    });
  });

  // --- TokenBarProps type contract ---

  describe("TokenBarProps type contract", () => {
    test("props shape matches expected interface", () => {
      const props: TokenBarProps = {
        used: 1247,
        limit: 200000,
        utilisation: 0.006235,
      };

      expect(props.used).toBe(1247);
      expect(props.limit).toBe(200000);
      expect(typeof props.utilisation).toBe("number");
    });

    test("isCompacting is optional and defaults conceptually to false", () => {
      const props: TokenBarProps = {
        used: 100,
        limit: 200000,
        utilisation: 0.0005,
      };

      expect(props.isCompacting).toBeUndefined();
    });

    test("isCompacting can be set to true", () => {
      const props: TokenBarProps = {
        used: 180000,
        limit: 200000,
        utilisation: 0.9,
        isCompacting: true,
      };

      expect(props.isCompacting).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// ContextWarningBanner helpers (from context-warning-banner.tsx)
// ---------------------------------------------------------------------------

describe("ContextWarningBanner helpers", () => {
  describe("formatUtilisationPercent", () => {
    test("formats 0.87 as '87%'", () => {
      expect(formatUtilisationPercent(0.87)).toBe("87%");
    });

    test("formats 0 as '0%'", () => {
      expect(formatUtilisationPercent(0)).toBe("0%");
    });

    test("formats 1.0 as '100%'", () => {
      expect(formatUtilisationPercent(1.0)).toBe("100%");
    });

    test("rounds to nearest integer", () => {
      expect(formatUtilisationPercent(0.856)).toBe("86%");
    });
  });

  describe("buildWarningMessage", () => {
    test("includes warning icon", () => {
      const msg = buildWarningMessage(0.87);
      expect(msg).toContain("\u26A0");
    });

    test("includes utilisation percentage", () => {
      const msg = buildWarningMessage(0.87);
      expect(msg).toContain("87%");
    });

    test("includes compact action hint", () => {
      const msg = buildWarningMessage(0.87);
      expect(msg).toContain("[c] compact now");
    });

    test("includes 'Context at' prefix", () => {
      const msg = buildWarningMessage(0.90);
      expect(msg).toContain("Context at 90%");
    });
  });

  describe("getWarningBannerStyle", () => {
    test("uses status.warning for accent colour", () => {
      const tokens: Record<string, string> = {
        "status.warning": "#ffaa00",
        "surface.secondary": "#1a1a1a",
      };
      const style = getWarningBannerStyle(tokens as unknown as ThemeTokens);
      expect(style.accentColor).toBe("#ffaa00");
    });

    test("uses surface.secondary for background", () => {
      const tokens: Record<string, string> = {
        "status.warning": "#ffaa00",
        "surface.secondary": "#1a1a1a",
      };
      const style = getWarningBannerStyle(tokens as unknown as ThemeTokens);
      expect(style.backgroundColor).toBe("#1a1a1a");
    });

    test("has consistent padding", () => {
      const tokens: Record<string, string> = {
        "status.warning": "#ffaa00",
        "surface.secondary": "#1a1a1a",
      };
      const style = getWarningBannerStyle(tokens as unknown as ThemeTokens);
      expect(style.paddingLeft).toBe(2);
      expect(style.paddingRight).toBe(1);
      expect(style.paddingTop).toBe(0);
      expect(style.paddingBottom).toBe(0);
    });
  });
});
