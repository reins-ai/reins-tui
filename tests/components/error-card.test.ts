import { describe, expect, it } from "bun:test";

import {
  extractErrorMessage,
  truncateErrorMessage,
  formatErrorToolName,
  buildErrorCardHeader,
  buildErrorDetailLine,
  buildActionHints,
  getErrorCardStyle,
  isErrorCardCandidate,
} from "../../src/components/cards/error-card";
import type { DisplayToolCall } from "../../src/store/types";
import type { ThemeTokens } from "../../src/theme/theme-schema";

// --- Test fixtures ---

function makeToolCall(overrides: Partial<DisplayToolCall> = {}): DisplayToolCall {
  return {
    id: "tc-1",
    name: "bash",
    status: "error",
    isError: true,
    result: "Permission denied",
    ...overrides,
  };
}

function makeTokens(overrides: Partial<Record<string, string>> = {}): Readonly<ThemeTokens> {
  const base: Record<string, string> = {
    "status.error": "#ff0000",
    "glyph.tool.error": "#cc0000",
    "glyph.tool.running": "#ffaa00",
    "surface.secondary": "#1a1a1a",
    "accent.primary": "#0088ff",
    "text.muted": "#666666",
    ...overrides,
  };
  return base as unknown as ThemeTokens;
}

// --- extractErrorMessage ---

describe("extractErrorMessage", () => {
  it("returns result when isError is true and result is present", () => {
    const tc = makeToolCall({ isError: true, result: "File not found" });
    expect(extractErrorMessage(tc)).toBe("File not found");
  });

  it("returns 'Unknown error' when result is empty", () => {
    const tc = makeToolCall({ isError: true, result: "" });
    expect(extractErrorMessage(tc)).toBe("Unknown error");
  });

  it("returns 'Unknown error' when result is undefined", () => {
    const tc = makeToolCall({ isError: true, result: undefined });
    expect(extractErrorMessage(tc)).toBe("Unknown error");
  });

  it("returns 'Unknown error' when isError is false", () => {
    const tc = makeToolCall({ isError: false, result: "some result" });
    expect(extractErrorMessage(tc)).toBe("Unknown error");
  });

  it("returns result when isError is true with long message", () => {
    const longMsg = "x".repeat(500);
    const tc = makeToolCall({ isError: true, result: longMsg });
    expect(extractErrorMessage(tc)).toBe(longMsg);
  });
});

// --- truncateErrorMessage ---

describe("truncateErrorMessage", () => {
  it("returns message unchanged when under max length", () => {
    expect(truncateErrorMessage("short error")).toBe("short error");
  });

  it("truncates message at default max length with ellipsis", () => {
    const longMsg = "x".repeat(250);
    const result = truncateErrorMessage(longMsg);
    expect(result.length).toBe(201); // 200 chars + ellipsis
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("truncates at custom max length", () => {
    const result = truncateErrorMessage("hello world", 5);
    expect(result).toBe("hello\u2026");
  });

  it("returns exact-length message unchanged", () => {
    const msg = "x".repeat(200);
    expect(truncateErrorMessage(msg)).toBe(msg);
  });

  it("handles empty string", () => {
    expect(truncateErrorMessage("")).toBe("");
  });
});

// --- formatErrorToolName ---

describe("formatErrorToolName", () => {
  it("capitalises simple tool name", () => {
    expect(formatErrorToolName("bash")).toBe("Bash");
  });

  it("extracts last segment from dotted name", () => {
    expect(formatErrorToolName("mcp.bash")).toBe("Bash");
  });

  it("extracts last segment from slashed name", () => {
    expect(formatErrorToolName("tools/write")).toBe("Write");
  });

  it("replaces underscores and hyphens with spaces", () => {
    expect(formatErrorToolName("file_write")).toBe("File write");
  });

  it("returns 'Tool' for empty string", () => {
    expect(formatErrorToolName("")).toBe("Tool");
  });

  it("handles single character name", () => {
    expect(formatErrorToolName("x")).toBe("X");
  });

  it("handles name with multiple dots", () => {
    expect(formatErrorToolName("a.b.c.deep_tool")).toBe("Deep tool");
  });
});

// --- buildErrorCardHeader ---

describe("buildErrorCardHeader", () => {
  it("builds header with cross mark and formatted name", () => {
    expect(buildErrorCardHeader("bash")).toBe("\u2717 Bash failed");
  });

  it("builds header for dotted tool name", () => {
    expect(buildErrorCardHeader("mcp.file_write")).toBe("\u2717 File write failed");
  });
});

// --- buildErrorDetailLine ---

describe("buildErrorDetailLine", () => {
  it("prefixes error message with 'Error: '", () => {
    expect(buildErrorDetailLine("Permission denied")).toBe("Error: Permission denied");
  });

  it("truncates long error messages", () => {
    const longMsg = "x".repeat(300);
    const result = buildErrorDetailLine(longMsg);
    expect(result.startsWith("Error: ")).toBe(true);
    expect(result.length).toBe(7 + 201); // "Error: " + truncated
  });
});

// --- buildActionHints ---

describe("buildActionHints", () => {
  it("returns the retry and ignore hint string", () => {
    expect(buildActionHints()).toBe("[r] retry  [i] ignore");
  });
});

// --- getErrorCardStyle ---

describe("getErrorCardStyle", () => {
  it("uses error accent color from tokens", () => {
    const tokens = makeTokens();
    const style = getErrorCardStyle(tokens);
    expect(style.accentColor).toBe("#cc0000");
  });

  it("uses secondary surface background", () => {
    const tokens = makeTokens();
    const style = getErrorCardStyle(tokens);
    expect(style.backgroundColor).toBe("#1a1a1a");
  });

  it("has consistent padding values", () => {
    const tokens = makeTokens();
    const style = getErrorCardStyle(tokens);
    expect(style.paddingLeft).toBe(2);
    expect(style.paddingRight).toBe(1);
    expect(style.paddingTop).toBe(0);
    expect(style.paddingBottom).toBe(0);
  });

  it("has zero margins", () => {
    const tokens = makeTokens();
    const style = getErrorCardStyle(tokens);
    expect(style.marginTop).toBe(0);
    expect(style.marginBottom).toBe(0);
  });
});

// --- isErrorCardCandidate ---

describe("isErrorCardCandidate", () => {
  it("returns true for error status with isError flag", () => {
    const tc = makeToolCall({ status: "error", isError: true, result: "fail" });
    expect(isErrorCardCandidate(tc)).toBe(true);
  });

  it("returns true for error status with result but no isError flag", () => {
    const tc = makeToolCall({ status: "error", isError: false, result: "fail" });
    expect(isErrorCardCandidate(tc)).toBe(true);
  });

  it("returns false for non-error status", () => {
    const tc = makeToolCall({ status: "complete", isError: false });
    expect(isErrorCardCandidate(tc)).toBe(false);
  });

  it("returns false for running status", () => {
    const tc = makeToolCall({ status: "running" });
    expect(isErrorCardCandidate(tc)).toBe(false);
  });

  it("returns false for pending status", () => {
    const tc = makeToolCall({ status: "pending" });
    expect(isErrorCardCandidate(tc)).toBe(false);
  });

  it("returns true for error status with isError true and no result", () => {
    const tc = makeToolCall({ status: "error", isError: true, result: undefined });
    expect(isErrorCardCandidate(tc)).toBe(true);
  });

  it("returns false for error status with no isError and no result", () => {
    const tc = makeToolCall({ status: "error", isError: false, result: undefined });
    expect(isErrorCardCandidate(tc)).toBe(false);
  });

  it("returns false for error status with no isError and empty result", () => {
    const tc = makeToolCall({ status: "error", isError: false, result: "" });
    expect(isErrorCardCandidate(tc)).toBe(false);
  });
});
