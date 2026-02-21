import { describe, expect, test } from "bun:test";

import {
  getStatusColor,
  formatDetailSection,
  formatToolBlockArgs,
  formatToolBlockDetail,
  getToolBlockStatusSuffix,
  getToolBlockStyle,
} from "../../src/components/tool-inline";
import {
  toolCallToVisualState,
  streamToolCallToVisualState,
  displayToolCallToVisualState,
  getToolColorToken,
  getToolGlyph,
} from "../../src/tools/tool-lifecycle";
import type { ToolCall, ToolVisualState, StreamToolCallLike, DisplayToolCallLike } from "../../src/tools/tool-lifecycle";
import {
  shouldAutoCollapse,
  shouldAutoExpand,
} from "../../src/components/conversation-panel";
import type { DisplayToolCall } from "../../src/store/types";

// --- Mock theme tokens ---

const MOCK_TOKENS = {
  "glyph.tool.running": "#888888",
  "glyph.tool.done": "#00ff00",
  "glyph.tool.error": "#ff0000",
  "surface.secondary": "#1a1a1a",
  "text.muted": "#666666",
  "text.secondary": "#aaaaaa",
} as const;

// --- Test data factories ---

function makeToolCall(overrides?: Partial<ToolCall>): ToolCall {
  return {
    id: "tc-001",
    toolName: "brave_search",
    status: "running",
    args: { query: "test" },
    ...overrides,
  };
}

function makeDisplayToolCall(overrides?: Partial<DisplayToolCall>): DisplayToolCall {
  return {
    id: "dtc-001",
    name: "brave_search",
    status: "running",
    args: { query: "test" },
    ...overrides,
  };
}

function makeStreamToolCall(overrides?: Partial<StreamToolCallLike>): StreamToolCallLike {
  return {
    id: "stc-001",
    name: "brave_search",
    status: "running",
    args: { query: "test" },
    ...overrides,
  };
}

function makeVisualState(overrides?: Partial<ToolVisualState>): ToolVisualState {
  return {
    id: "vs-001",
    toolName: "brave_search",
    status: "running",
    glyph: "◎",
    label: "Running Brave search...",
    colorToken: "glyph.tool.running",
    detail: undefined,
    expanded: false,
    hasDetail: false,
    duration: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getStatusColor
// ---------------------------------------------------------------------------

describe("getStatusColor", () => {
  test("returns running color for queued status", () => {
    expect(getStatusColor("queued", MOCK_TOKENS as any)).toBe("#888888");
  });

  test("returns running color for running status", () => {
    expect(getStatusColor("running", MOCK_TOKENS as any)).toBe("#888888");
  });

  test("returns done color for success status", () => {
    expect(getStatusColor("success", MOCK_TOKENS as any)).toBe("#00ff00");
  });

  test("returns error color for error status", () => {
    expect(getStatusColor("error", MOCK_TOKENS as any)).toBe("#ff0000");
  });
});

// ---------------------------------------------------------------------------
// getToolColorToken
// ---------------------------------------------------------------------------

describe("getToolColorToken", () => {
  test("returns glyph.tool.running for queued", () => {
    expect(getToolColorToken("queued")).toBe("glyph.tool.running");
  });

  test("returns glyph.tool.running for running", () => {
    expect(getToolColorToken("running")).toBe("glyph.tool.running");
  });

  test("returns glyph.tool.done for success", () => {
    expect(getToolColorToken("success")).toBe("glyph.tool.done");
  });

  test("returns glyph.tool.error for error", () => {
    expect(getToolColorToken("error")).toBe("glyph.tool.error");
  });
});

// ---------------------------------------------------------------------------
// getToolGlyph
// ---------------------------------------------------------------------------

describe("getToolGlyph", () => {
  test("returns ◎ for queued", () => {
    expect(getToolGlyph("queued")).toBe("◎");
  });

  test("returns ◎ for running", () => {
    expect(getToolGlyph("running")).toBe("◎");
  });

  test("returns ✦ for success", () => {
    expect(getToolGlyph("success")).toBe("✦");
  });

  test("returns ✧ for error", () => {
    expect(getToolGlyph("error")).toBe("✧");
  });
});

// ---------------------------------------------------------------------------
// formatDetailSection
// ---------------------------------------------------------------------------

describe("formatDetailSection", () => {
  test("returns undefined when no args, result, or error", () => {
    const call = makeToolCall({ args: undefined, result: undefined, error: undefined });
    expect(formatDetailSection(call)).toBeUndefined();
  });

  test("includes args when present", () => {
    const call = makeToolCall({ args: { query: "hello" } });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail!).toContain("Args:");
    expect(detail!).toContain("hello");
  });

  test("includes result when present", () => {
    const call = makeToolCall({ result: "Found 10 results" });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail!).toContain("Result:");
    expect(detail!).toContain("Found 10 results");
  });

  test("uses string result directly without re-escaping", () => {
    const call = makeToolCall({ result: "line1\nline2" });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail!).toContain("line1\nline2");
  });

  test("includes error when present", () => {
    const call = makeToolCall({ error: "Connection refused" });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail!).toContain("Error:");
    expect(detail!).toContain("Connection refused");
  });

  test("ignores empty error string", () => {
    const call = makeToolCall({ args: undefined, result: undefined, error: "" });
    expect(formatDetailSection(call)).toBeUndefined();
  });

  test("truncates long content with ellipsis", () => {
    const call = makeToolCall({ result: "a".repeat(300) });
    const detail = formatDetailSection(call, 50);
    expect(detail).toBeDefined();
    expect(detail!.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(detail!).toContain("...");
  });

  test("does not truncate short content", () => {
    const call = makeToolCall({ result: "short" });
    const detail = formatDetailSection(call, 200);
    expect(detail).toBeDefined();
    expect(detail!).not.toContain("...");
  });
});

// ---------------------------------------------------------------------------
// formatToolBlockArgs
// ---------------------------------------------------------------------------

describe("formatToolBlockArgs", () => {
  test("returns undefined for undefined args", () => {
    expect(formatToolBlockArgs(undefined)).toBeUndefined();
  });

  test("returns undefined for empty object", () => {
    expect(formatToolBlockArgs({})).toBeUndefined();
  });

  test("returns JSON string for small args", () => {
    const result = formatToolBlockArgs({ query: "test" });
    expect(result).toBe('{"query":"test"}');
  });

  test("truncates long args with ellipsis", () => {
    const longArgs = { data: "x".repeat(200) };
    const result = formatToolBlockArgs(longArgs, 50);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(51); // 50 + "…"
    expect(result!).toContain("…");
  });

  test("does not truncate args within limit", () => {
    const result = formatToolBlockArgs({ a: 1 }, 200);
    expect(result).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// formatToolBlockDetail
// ---------------------------------------------------------------------------

describe("formatToolBlockDetail", () => {
  test("returns undefined for undefined detail", () => {
    expect(formatToolBlockDetail(undefined)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(formatToolBlockDetail("")).toBeUndefined();
  });

  test("returns detail as-is when within limit", () => {
    expect(formatToolBlockDetail("short result")).toBe("short result");
  });

  test("truncates long detail with ellipsis", () => {
    const long = "x".repeat(600);
    const result = formatToolBlockDetail(long, 100);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(101); // 100 + "…"
    expect(result!).toContain("…");
  });
});

// ---------------------------------------------------------------------------
// getToolBlockStatusSuffix
// ---------------------------------------------------------------------------

describe("getToolBlockStatusSuffix", () => {
  test("returns 'queued...' for queued status", () => {
    const vs = makeVisualState({ status: "queued" });
    expect(getToolBlockStatusSuffix(vs)).toBe("queued...");
  });

  test("returns 'running...' for running status", () => {
    const vs = makeVisualState({ status: "running" });
    expect(getToolBlockStatusSuffix(vs)).toBe("running...");
  });

  test("returns 'done' for success without duration", () => {
    const vs = makeVisualState({ status: "success", duration: undefined });
    expect(getToolBlockStatusSuffix(vs)).toBe("done");
  });

  test("returns 'done (Nms)' for success with duration", () => {
    const vs = makeVisualState({ status: "success", duration: 42 });
    expect(getToolBlockStatusSuffix(vs)).toBe("done (42ms)");
  });

  test("returns 'failed' for error status", () => {
    const vs = makeVisualState({ status: "error" });
    expect(getToolBlockStatusSuffix(vs)).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// getToolBlockStyle
// ---------------------------------------------------------------------------

describe("getToolBlockStyle", () => {
  test("uses running accent for running status", () => {
    const vs = makeVisualState({ status: "running", colorToken: "glyph.tool.running" });
    const style = getToolBlockStyle(vs, MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#888888");
    expect(style.backgroundColor).toBe("#1a1a1a");
  });

  test("uses done accent for success status", () => {
    const vs = makeVisualState({ status: "success", colorToken: "glyph.tool.done" });
    const style = getToolBlockStyle(vs, MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#00ff00");
  });

  test("uses error accent for error status", () => {
    const vs = makeVisualState({ status: "error", colorToken: "glyph.tool.error" });
    const style = getToolBlockStyle(vs, MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#ff0000");
  });

  test("falls back to running accent for unknown color token", () => {
    const vs = makeVisualState({ colorToken: "nonexistent.token" });
    const style = getToolBlockStyle(vs, MOCK_TOKENS as any);
    expect(style.accentColor).toBe("#888888");
  });

  test("includes consistent padding values", () => {
    const vs = makeVisualState();
    const style = getToolBlockStyle(vs, MOCK_TOKENS as any);
    expect(style.paddingLeft).toBe(2);
    expect(style.paddingRight).toBe(1);
    expect(style.paddingTop).toBe(0);
    expect(style.paddingBottom).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toolCallToVisualState
// ---------------------------------------------------------------------------

describe("toolCallToVisualState", () => {
  test("maps running tool call to visual state", () => {
    const call = makeToolCall({ status: "running" });
    const vs = toolCallToVisualState(call, true);
    expect(vs.status).toBe("running");
    expect(vs.toolName).toBe("brave_search");
    expect(vs.colorToken).toBe("glyph.tool.running");
    expect(vs.glyph).toBe("◎");
  });

  test("maps success tool call with duration", () => {
    const call = makeToolCall({ status: "success", result: "done", duration: 150 });
    const vs = toolCallToVisualState(call, false);
    expect(vs.status).toBe("success");
    expect(vs.duration).toBe(150);
    expect(vs.colorToken).toBe("glyph.tool.done");
    expect(vs.glyph).toBe("✦");
  });

  test("maps error tool call", () => {
    const call = makeToolCall({ status: "error", error: "timeout" });
    const vs = toolCallToVisualState(call, true);
    expect(vs.status).toBe("error");
    expect(vs.colorToken).toBe("glyph.tool.error");
    expect(vs.glyph).toBe("✧");
    expect(vs.label).toContain("failed");
  });

  test("expanded is false when no detail exists", () => {
    const call = makeToolCall({ args: undefined, result: undefined, error: undefined });
    const vs = toolCallToVisualState(call, true);
    expect(vs.expanded).toBe(false);
    expect(vs.hasDetail).toBe(false);
  });

  test("expanded follows flag when detail exists", () => {
    const call = makeToolCall({ status: "success", result: "some result" });
    const vsExpanded = toolCallToVisualState(call, true);
    expect(vsExpanded.expanded).toBe(true);
    expect(vsExpanded.hasDetail).toBe(true);

    const vsCollapsed = toolCallToVisualState(call, false);
    expect(vsCollapsed.expanded).toBe(false);
    expect(vsCollapsed.hasDetail).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// streamToolCallToVisualState
// ---------------------------------------------------------------------------

describe("streamToolCallToVisualState", () => {
  test("normalizes 'complete' to 'success'", () => {
    const stc = makeStreamToolCall({ status: "complete" });
    const vs = streamToolCallToVisualState(stc, false);
    expect(vs.status).toBe("success");
  });

  test("computes duration from ISO timestamps", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-01T00:00:01.500Z");
    const stc = makeStreamToolCall({
      status: "complete",
      startedAt: start.toISOString(),
      completedAt: end.toISOString(),
    });
    const vs = streamToolCallToVisualState(stc, false);
    expect(vs.duration).toBe(1500);
  });

  test("duration is undefined when timestamps missing", () => {
    const stc = makeStreamToolCall({ status: "running" });
    const vs = streamToolCallToVisualState(stc, false);
    expect(vs.duration).toBeUndefined();
  });

  test("maps error status correctly", () => {
    const stc = makeStreamToolCall({ status: "error", error: "network failure" });
    const vs = streamToolCallToVisualState(stc, true);
    expect(vs.status).toBe("error");
    expect(vs.label).toContain("failed");
    expect(vs.label).toContain("network failure");
  });
});

// ---------------------------------------------------------------------------
// displayToolCallToVisualState
// ---------------------------------------------------------------------------

describe("displayToolCallToVisualState", () => {
  test("normalizes 'pending' to 'queued'", () => {
    const dtc: DisplayToolCallLike = {
      id: "d1",
      name: "bash",
      status: "pending",
    };
    const vs = displayToolCallToVisualState(dtc, false);
    expect(vs.status).toBe("queued");
  });

  test("normalizes 'complete' to 'success'", () => {
    const dtc: DisplayToolCallLike = {
      id: "d2",
      name: "bash",
      status: "complete",
      result: "output",
    };
    const vs = displayToolCallToVisualState(dtc, false);
    expect(vs.status).toBe("success");
  });

  test("includes duration from timestamps", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-01T00:00:02Z");
    const dtc: DisplayToolCallLike = {
      id: "d3",
      name: "bash",
      status: "complete",
      startedAt: start.toISOString(),
      completedAt: end.toISOString(),
    };
    const vs = displayToolCallToVisualState(dtc, false);
    expect(vs.duration).toBe(2000);
  });

  test("error label includes result when isError is true", () => {
    const dtc: DisplayToolCallLike = {
      id: "d4",
      name: "write_file",
      status: "error",
      result: "Permission denied",
      isError: true,
    };
    const vs = displayToolCallToVisualState(dtc, true);
    expect(vs.status).toBe("error");
    expect(vs.label).toContain("Permission denied");
  });
});

// ---------------------------------------------------------------------------
// shouldAutoCollapse
// ---------------------------------------------------------------------------

describe("shouldAutoCollapse", () => {
  test("returns false for running tool calls", () => {
    const dtc = makeDisplayToolCall({ status: "running" });
    expect(shouldAutoCollapse(dtc, new Set())).toBe(false);
  });

  test("returns false for pending tool calls", () => {
    const dtc = makeDisplayToolCall({ status: "pending" });
    expect(shouldAutoCollapse(dtc, new Set())).toBe(false);
  });

  test("returns true for completed tool calls not in expanded set", () => {
    const dtc = makeDisplayToolCall({ status: "complete" });
    expect(shouldAutoCollapse(dtc, new Set())).toBe(true);
  });

  test("returns false for completed tool calls in expanded set", () => {
    const dtc = makeDisplayToolCall({ id: "tc-expand", status: "complete" });
    expect(shouldAutoCollapse(dtc, new Set(["tc-expand"]))).toBe(false);
  });

  test("returns false for error tool calls (auto-expand overrides)", () => {
    const dtc = makeDisplayToolCall({ status: "error" });
    expect(shouldAutoCollapse(dtc, new Set())).toBe(false);
  });

  test("returns false for isError tool calls (auto-expand overrides)", () => {
    const dtc = makeDisplayToolCall({ status: "complete", isError: true });
    expect(shouldAutoCollapse(dtc, new Set())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAutoExpand
// ---------------------------------------------------------------------------

describe("shouldAutoExpand", () => {
  test("returns true for error status", () => {
    const dtc = makeDisplayToolCall({ status: "error" });
    expect(shouldAutoExpand(dtc)).toBe(true);
  });

  test("returns true when isError is true", () => {
    const dtc = makeDisplayToolCall({ status: "complete", isError: true });
    expect(shouldAutoExpand(dtc)).toBe(true);
  });

  test("returns false for running status", () => {
    const dtc = makeDisplayToolCall({ status: "running" });
    expect(shouldAutoExpand(dtc)).toBe(false);
  });

  test("returns false for successful completion", () => {
    const dtc = makeDisplayToolCall({ status: "complete" });
    expect(shouldAutoExpand(dtc)).toBe(false);
  });
});
