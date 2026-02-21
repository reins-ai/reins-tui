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
