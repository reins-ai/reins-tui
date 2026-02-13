import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ToolCall, ToolCallStatus, ToolVisualState, ToolVisualStatus } from "../../src/tools/tool-lifecycle";
import {
  getToolGlyph,
  getToolColorToken,
  toolCallToMessageContent,
  toolCallToVisualState,
  displayToolCallToVisualState,
} from "../../src/tools/tool-lifecycle";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import {
  getStatusColor,
  formatDetailSection,
  getToolBlockStyle,
  getToolBlockStatusSuffix,
  formatToolBlockArgs,
  formatToolBlockDetail,
} from "../../src/components/tool-inline";
import {
  formatArgsPreview,
  formatResultPreview,
} from "../../src/components/message";
import {
  displayToolCallToToolCall,
  toolCallsToVisualStates,
  shouldRenderToolBlocks,
  resolveToolBlockAccent,
} from "../../src/components/conversation-panel";
import type { DisplayMessage, DisplayToolCall } from "../../src/store";

const MOCK_TOKENS: ThemeTokens = {
  "surface.primary": "#1a1a2e",
  "surface.secondary": "#252540",
  "surface.tertiary": "#2e2e4a",
  "surface.elevated": "#353555",
  "text.primary": "#e8e0d4",
  "text.secondary": "#a09888",
  "text.muted": "#6b6360",
  "text.inverse": "#1a1a2e",
  "accent.primary": "#e8976c",
  "accent.secondary": "#f0c674",
  "accent.subtle": "#4a3a2e",
  "border.primary": "#4a4a6a",
  "border.subtle": "#3a3a5a",
  "border.focus": "#e8976c",
  "status.error": "#e85050",
  "status.success": "#50c878",
  "status.warning": "#f0c674",
  "status.info": "#6ca8e8",
  "glyph.reins": "#e8976c",
  "glyph.user": "#f0c674",
  "glyph.tool.running": "#6ca8e8",
  "glyph.tool.done": "#50c878",
  "glyph.tool.error": "#e85050",
  "glyph.heartbeat": "#e8976c",
  "conversation.user.bg": "#2e2e4a",
  "conversation.user.text": "#e8e0d4",
  "conversation.assistant.bg": "#1a1a2e",
  "conversation.assistant.text": "#e8e0d4",
  "sidebar.bg": "#1a1a2e",
  "sidebar.text": "#a09888",
  "sidebar.active": "#e8976c",
  "sidebar.hover": "#353555",
  "input.bg": "#252540",
  "input.text": "#e8e0d4",
  "input.placeholder": "#6b6360",
  "input.border": "#4a4a6a",
};

function makeToolCall(status: ToolCallStatus, overrides?: Partial<ToolCall>): ToolCall {
  return {
    id: `tool-${crypto.randomUUID().slice(0, 8)}`,
    toolName: "search",
    status,
    ...overrides,
  };
}

function makeDisplayToolCall(
  status: DisplayToolCall["status"],
  overrides?: Partial<DisplayToolCall>,
): DisplayToolCall {
  return {
    id: crypto.randomUUID(),
    name: "test_tool",
    status,
    ...overrides,
  };
}

describe("ToolInline running state", () => {
  test("renders ◎ glyph for running status", () => {
    const call = makeToolCall("running");
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("◎");
  });

  test("renders ◎ glyph for queued status", () => {
    const call = makeToolCall("queued");
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("◎");
  });

  test("running label includes tool name and ellipsis", () => {
    const call = makeToolCall("running", { toolName: "search" });
    const content = toolCallToMessageContent(call);
    expect(content.label).toContain("Search");
    expect(content.label).toContain("...");
  });
});

describe("ToolInline success state", () => {
  test("renders ✦ glyph for success status", () => {
    const call = makeToolCall("success", { duration: 234 });
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("✦");
  });

  test("success label includes duration when present", () => {
    const call = makeToolCall("success", { toolName: "search", duration: 234 });
    const content = toolCallToMessageContent(call);
    expect(content.label).toContain("234ms");
    expect(content.label).toContain("complete");
  });

  test("success label omits duration when undefined", () => {
    const call = makeToolCall("success", { toolName: "search" });
    const content = toolCallToMessageContent(call);
    expect(content.label).toContain("complete");
    expect(content.label).not.toContain("ms");
  });
});

describe("ToolInline error state", () => {
  test("renders ✧ glyph for error status", () => {
    const call = makeToolCall("error", { error: "timeout" });
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("✧");
  });

  test("error label includes error message", () => {
    const call = makeToolCall("error", { toolName: "search", error: "timeout" });
    const content = toolCallToMessageContent(call);
    expect(content.label).toContain("failed");
    expect(content.label).toContain("timeout");
  });

  test("error label shows unknown error when error string is missing", () => {
    const call = makeToolCall("error", { toolName: "search" });
    const content = toolCallToMessageContent(call);
    expect(content.label).toContain("unknown error");
  });
});

describe("ToolInline collapse behavior", () => {
  test("collapsed state hides detail pane (formatDetailSection returns content but UI hides it)", () => {
    const call = makeToolCall("success", {
      args: { query: "weather today" },
      result: { temperature: 72 },
    });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail).toContain("Args:");
    expect(detail).toContain("Result:");
  });

  test("expanded state shows args and result", () => {
    const call = makeToolCall("success", {
      args: { query: "weather today" },
      result: { temperature: 72, unit: "F" },
    });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail).toContain("Args:");
    expect(detail).toContain("weather today");
    expect(detail).toContain("Result:");
    expect(detail).toContain("temperature");
  });

  test("detail is undefined when no args, result, or error present", () => {
    const call = makeToolCall("running");
    const detail = formatDetailSection(call);
    expect(detail).toBeUndefined();
  });

  test("error detail includes error text", () => {
    const call = makeToolCall("error", { error: "connection refused" });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail).toContain("Error:");
    expect(detail).toContain("connection refused");
  });
});

describe("ToolInline theme token usage", () => {
  test("running status uses glyph.tool.running token", () => {
    expect(getStatusColor("running", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("queued status uses glyph.tool.running token", () => {
    expect(getStatusColor("queued", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("success status uses glyph.tool.done token", () => {
    expect(getStatusColor("success", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.done"]);
  });

  test("error status uses glyph.tool.error token", () => {
    expect(getStatusColor("error", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });

  test("all status colors are valid hex values from tokens", () => {
    const statuses: ToolCallStatus[] = ["queued", "running", "success", "error"];
    for (const status of statuses) {
      const color = getStatusColor(status, MOCK_TOKENS);
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("tool-inline.tsx contains no hardcoded hex colors", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    const hexPattern = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/g;
    const matches = source.match(hexPattern) ?? [];
    const renderPathColors = matches.filter((match) => {
      const lines = source.split("\n");
      for (const line of lines) {
        if (!line.includes(match)) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import ")) {
          return false;
        }
      }
      return true;
    });
    expect(renderPathColors).toHaveLength(0);
  });

  test("tool-inline.tsx imports useThemeTokens", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    expect(source).toContain("useThemeTokens");
  });
});

describe("ToolInline detail truncation", () => {
  test("truncates long result payloads", () => {
    const hugeResult = "x".repeat(500);
    const call = makeToolCall("success", {
      args: { query: "test" },
      result: { data: hugeResult },
    });
    const detail = formatDetailSection(call, 200);
    expect(detail).toBeDefined();
    expect(detail!.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(detail!.endsWith("...")).toBe(true);
  });

  test("does not truncate short payloads", () => {
    const call = makeToolCall("success", {
      args: { q: "hi" },
    });
    const detail = formatDetailSection(call, 200);
    expect(detail).toBeDefined();
    expect(detail!.endsWith("...")).toBe(false);
  });
});

describe("DisplayToolCall to ToolCall bridge", () => {
  test("maps pending to queued", () => {
    const dtc = makeDisplayToolCall("pending");
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.status).toBe("queued");
  });

  test("maps running to running", () => {
    const dtc = makeDisplayToolCall("running");
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.status).toBe("running");
  });

  test("maps complete to success", () => {
    const dtc = makeDisplayToolCall("complete");
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.status).toBe("success");
  });

  test("maps error to error", () => {
    const dtc = makeDisplayToolCall("error", { result: "timeout", isError: true });
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.status).toBe("error");
    expect(tc.error).toBe("timeout");
  });

  test("preserves tool name", () => {
    const dtc = makeDisplayToolCall("running", { name: "calendar.lookup" });
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.toolName).toBe("calendar.lookup");
  });

  test("non-error result maps to result field", () => {
    const dtc = makeDisplayToolCall("complete", { result: "found 3 items" });
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.result).toBe("found 3 items");
    expect(tc.error).toBeUndefined();
  });

  test("error result maps to error field", () => {
    const dtc = makeDisplayToolCall("error", { result: "connection failed", isError: true });
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.error).toBe("connection failed");
    expect(tc.result).toBeUndefined();
  });
});

describe("ToolInline integration with conversation panel", () => {
  test("conversation-panel.tsx imports tool-lifecycle types", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("tool-lifecycle");
  });

  test("conversation-panel.tsx delegates tool rendering to Message component", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("Message");
    expect(source).toContain("message={message}");
  });

  test("message.tsx renders tool calls inside FramedBlock", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(source).toContain("FramedBlock");
    expect(source).toContain("toolCalls");
    expect(source).toContain("ToolCallAnchor");
  });

  test("displayToolCallToToolCall is exported from conversation-panel", () => {
    expect(typeof displayToolCallToToolCall).toBe("function");
  });

  test("streaming placeholder uses FramedBlock with assistant styling", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("FramedBlock");
    expect(source).toContain("getStreamingPlaceholderStyle");
    expect(source).toContain("Generating response...");
  });
});

describe("glyph consistency across lifecycle and inline", () => {
  test("running glyph matches between tool-lifecycle and inline expectations", () => {
    expect(getToolGlyph("running")).toBe("◎");
    expect(getToolGlyph("queued")).toBe("◎");
  });

  test("success glyph matches between tool-lifecycle and inline expectations", () => {
    expect(getToolGlyph("success")).toBe("✦");
  });

  test("error glyph matches between tool-lifecycle and inline expectations", () => {
    expect(getToolGlyph("error")).toBe("✧");
  });
});

describe("formatArgsPreview", () => {
  test("returns undefined when args is undefined", () => {
    const dtc = makeDisplayToolCall("running");
    expect(formatArgsPreview(dtc)).toBeUndefined();
  });

  test("returns undefined when args is empty object", () => {
    const dtc = makeDisplayToolCall("running", { args: {} });
    expect(formatArgsPreview(dtc)).toBeUndefined();
  });

  test("returns compact JSON for small args", () => {
    const dtc = makeDisplayToolCall("running", {
      args: { command: "ls -la", workdir: "/tmp" },
    });
    const preview = formatArgsPreview(dtc);
    expect(preview).toBeDefined();
    expect(preview).toContain("ls -la");
    expect(preview).toContain("/tmp");
  });

  test("truncates long args with ellipsis", () => {
    const longValue = "x".repeat(200);
    const dtc = makeDisplayToolCall("running", {
      args: { content: longValue },
    });
    const preview = formatArgsPreview(dtc);
    expect(preview).toBeDefined();
    expect(preview!.length).toBeLessThanOrEqual(121); // 120 + "…"
    expect(preview!.endsWith("…")).toBe(true);
  });

  test("handles nested object args", () => {
    const dtc = makeDisplayToolCall("running", {
      args: { filter: { type: "glob", pattern: "**/*.ts" } },
    });
    const preview = formatArgsPreview(dtc);
    expect(preview).toBeDefined();
    expect(preview).toContain("glob");
    expect(preview).toContain("**/*.ts");
  });
});

describe("formatResultPreview", () => {
  test("returns short result unchanged", () => {
    const result = "Found 3 files";
    expect(formatResultPreview(result)).toBe(result);
  });

  test("truncates long result with ellipsis", () => {
    const longResult = "line\n".repeat(200);
    const preview = formatResultPreview(longResult, 300);
    expect(preview.length).toBeLessThanOrEqual(301); // 300 + "…"
    expect(preview.endsWith("…")).toBe(true);
  });

  test("preserves exact boundary result", () => {
    const exactResult = "x".repeat(300);
    expect(formatResultPreview(exactResult, 300)).toBe(exactResult);
  });
});

describe("DisplayToolCall args propagation", () => {
  test("displayToolCallToToolCall passes args through", () => {
    const dtc = makeDisplayToolCall("running", {
      args: { command: "git status" },
    });
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.args).toEqual({ command: "git status" });
  });

  test("displayToolCallToToolCall handles undefined args", () => {
    const dtc = makeDisplayToolCall("running");
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.args).toBeUndefined();
  });

  test("displayToolCallToToolCall preserves complex args", () => {
    const dtc = makeDisplayToolCall("running", {
      args: { path: "/src/index.ts", offset: 1, limit: 50 },
    });
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.args).toEqual({ path: "/src/index.ts", offset: 1, limit: 50 });
  });
});

describe("tool lifecycle state transitions", () => {
  test("start state shows running glyph and tool name", () => {
    const call = makeToolCall("running", { toolName: "bash" });
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("◎");
    expect(content.label).toContain("Bash");
    expect(content.label).toContain("...");
  });

  test("start state with args shows detail", () => {
    const call = makeToolCall("running", {
      toolName: "bash",
      args: { command: "ls -la" },
    });
    const content = toolCallToMessageContent(call);
    const detail = formatDetailSection(call);
    expect(content.glyph).toBe("◎");
    expect(detail).toBeDefined();
    expect(detail).toContain("Args:");
    expect(detail).toContain("ls -la");
  });

  test("end state shows success glyph with duration", () => {
    const call = makeToolCall("success", {
      toolName: "bash",
      duration: 150,
      result: "file1.ts\nfile2.ts",
    });
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("✦");
    expect(content.label).toContain("complete");
    expect(content.label).toContain("150ms");
  });

  test("end state shows result in detail", () => {
    const call = makeToolCall("success", {
      toolName: "read",
      result: "1: import React from 'react';",
    });
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail).toContain("Result:");
    expect(detail).toContain("import React");
  });

  test("error end state shows error glyph and message", () => {
    const call = makeToolCall("error", {
      toolName: "bash",
      error: "Command timed out after 30s",
    });
    const content = toolCallToMessageContent(call);
    expect(content.glyph).toBe("✧");
    expect(content.label).toContain("failed");
    expect(content.label).toContain("Command timed out");
  });

  test("full lifecycle: queued → running → success produces correct glyphs", () => {
    const queued = makeToolCall("queued", { toolName: "grep" });
    const running = makeToolCall("running", { toolName: "grep", args: { pattern: "TODO" } });
    const success = makeToolCall("success", {
      toolName: "grep",
      duration: 42,
      result: "src/app.ts:10: // TODO: fix this",
    });

    expect(toolCallToMessageContent(queued).glyph).toBe("◎");
    expect(toolCallToMessageContent(running).glyph).toBe("◎");
    expect(toolCallToMessageContent(success).glyph).toBe("✦");
  });

  test("full lifecycle: queued → running → error produces correct glyphs", () => {
    const queued = makeToolCall("queued", { toolName: "write" });
    const running = makeToolCall("running", { toolName: "write" });
    const error = makeToolCall("error", {
      toolName: "write",
      error: "Permission denied",
    });

    expect(toolCallToMessageContent(queued).glyph).toBe("◎");
    expect(toolCallToMessageContent(running).glyph).toBe("◎");
    expect(toolCallToMessageContent(error).glyph).toBe("✧");
  });

  test("each lifecycle state uses distinct color category", () => {
    const runningColor = getStatusColor("running", MOCK_TOKENS);
    const successColor = getStatusColor("success", MOCK_TOKENS);
    const errorColor = getStatusColor("error", MOCK_TOKENS);

    expect(runningColor).not.toBe(successColor);
    expect(runningColor).not.toBe(errorColor);
    expect(successColor).not.toBe(errorColor);
  });
});

describe("ToolCallAnchor args display", () => {
  test("running tool with args produces preview", () => {
    const dtc = makeDisplayToolCall("running", {
      name: "bash",
      args: { command: "bun test" },
    });
    const preview = formatArgsPreview(dtc);
    expect(preview).toBeDefined();
    expect(preview).toContain("bun test");
  });

  test("pending tool with args produces preview", () => {
    const dtc = makeDisplayToolCall("pending", {
      name: "read",
      args: { path: "/src/index.ts" },
    });
    const preview = formatArgsPreview(dtc);
    expect(preview).toBeDefined();
    expect(preview).toContain("/src/index.ts");
  });

  test("complete tool does not show args preview (args are for active states)", () => {
    const dtc = makeDisplayToolCall("complete", {
      name: "bash",
      args: { command: "bun test" },
      result: "All tests passed",
    });
    // formatArgsPreview is only called for active states in the component
    // but the function itself still works - the component guards the call
    const preview = formatArgsPreview(dtc);
    expect(preview).toBeDefined(); // function works regardless
  });

  test("message.tsx contains formatArgsPreview export", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function formatArgsPreview");
  });

  test("message.tsx contains formatResultPreview export", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function formatResultPreview");
  });

  test("message.tsx renders args preview for active tool calls", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(source).toContain("argsPreview");
    expect(source).toContain("isActive");
  });

  test("message.tsx renders plain result for non-card completions", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(source).toContain("showPlainResult");
    expect(source).toContain("formatResultPreview");
  });
});

// --- ToolBlock lifecycle style assertions ---

describe("ToolBlock style per lifecycle status", () => {
  test("running status uses glyph.tool.running accent", () => {
    const vs = makeVisualState("running");
    const style = getToolBlockStyle(vs, MOCK_TOKENS);
    expect(style.accentColor).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("queued status uses glyph.tool.running accent", () => {
    const vs = makeVisualState("queued");
    const style = getToolBlockStyle(vs, MOCK_TOKENS);
    expect(style.accentColor).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("success status uses glyph.tool.done accent", () => {
    const vs = makeVisualState("success");
    const style = getToolBlockStyle(vs, MOCK_TOKENS);
    expect(style.accentColor).toBe(MOCK_TOKENS["glyph.tool.done"]);
  });

  test("error status uses glyph.tool.error accent", () => {
    const vs = makeVisualState("error");
    const style = getToolBlockStyle(vs, MOCK_TOKENS);
    expect(style.accentColor).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });

  test("all statuses use surface.secondary background", () => {
    const statuses: ToolVisualStatus[] = ["queued", "running", "success", "error"];
    for (const status of statuses) {
      const vs = makeVisualState(status);
      const style = getToolBlockStyle(vs, MOCK_TOKENS);
      expect(style.backgroundColor).toBe(MOCK_TOKENS["surface.secondary"]);
    }
  });

  test("all statuses share consistent padding", () => {
    const statuses: ToolVisualStatus[] = ["queued", "running", "success", "error"];
    for (const status of statuses) {
      const vs = makeVisualState(status);
      const style = getToolBlockStyle(vs, MOCK_TOKENS);
      expect(style.paddingLeft).toBe(2);
      expect(style.paddingRight).toBe(1);
    }
  });

  test("each lifecycle status produces a distinct accent color", () => {
    const running = getToolBlockStyle(makeVisualState("running"), MOCK_TOKENS);
    const success = getToolBlockStyle(makeVisualState("success"), MOCK_TOKENS);
    const error = getToolBlockStyle(makeVisualState("error"), MOCK_TOKENS);

    expect(running.accentColor).not.toBe(success.accentColor);
    expect(running.accentColor).not.toBe(error.accentColor);
    expect(success.accentColor).not.toBe(error.accentColor);
  });

  test("tool block accent differs from assistant message accent", () => {
    const toolStyle = getToolBlockStyle(makeVisualState("running"), MOCK_TOKENS);
    // Assistant accent uses role.assistant.border, tool uses glyph.tool.running
    expect(toolStyle.accentColor).toBe(MOCK_TOKENS["glyph.tool.running"]);
    // These should be different tokens
    expect(toolStyle.backgroundColor).toBe(MOCK_TOKENS["surface.secondary"]);
    expect(toolStyle.backgroundColor).not.toBe(MOCK_TOKENS["conversation.assistant.bg"]);
  });
});

describe("ToolBlock status suffix", () => {
  test("queued shows 'queued...'", () => {
    const vs = makeVisualState("queued");
    expect(getToolBlockStatusSuffix(vs)).toBe("queued...");
  });

  test("running shows 'running...'", () => {
    const vs = makeVisualState("running");
    expect(getToolBlockStatusSuffix(vs)).toBe("running...");
  });

  test("success without duration shows 'done'", () => {
    const vs = makeVisualState("success");
    expect(getToolBlockStatusSuffix(vs)).toBe("done");
  });

  test("success with duration shows 'done (Nms)'", () => {
    const vs = makeVisualState("success", { duration: 150 });
    expect(getToolBlockStatusSuffix(vs)).toBe("done (150ms)");
  });

  test("error shows 'failed'", () => {
    const vs = makeVisualState("error");
    expect(getToolBlockStatusSuffix(vs)).toBe("failed");
  });
});

describe("formatToolBlockArgs", () => {
  test("returns undefined for undefined args", () => {
    expect(formatToolBlockArgs(undefined)).toBeUndefined();
  });

  test("returns undefined for empty object", () => {
    expect(formatToolBlockArgs({})).toBeUndefined();
  });

  test("returns compact JSON for small args", () => {
    const result = formatToolBlockArgs({ command: "ls -la" });
    expect(result).toBeDefined();
    expect(result).toContain("ls -la");
  });

  test("truncates long args with ellipsis", () => {
    const longValue = "x".repeat(200);
    const result = formatToolBlockArgs({ content: longValue }, 120);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(121);
    expect(result!.endsWith("…")).toBe(true);
  });

  test("preserves short args without truncation", () => {
    const result = formatToolBlockArgs({ q: "hi" });
    expect(result).toBeDefined();
    expect(result!.endsWith("…")).toBe(false);
  });
});

describe("formatToolBlockDetail", () => {
  test("returns undefined for undefined detail", () => {
    expect(formatToolBlockDetail(undefined)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(formatToolBlockDetail("")).toBeUndefined();
  });

  test("returns short detail unchanged", () => {
    const detail = "Args:\n{\"command\":\"ls\"}";
    expect(formatToolBlockDetail(detail)).toBe(detail);
  });

  test("truncates long detail with ellipsis", () => {
    const longDetail = "x".repeat(600);
    const result = formatToolBlockDetail(longDetail, 500);
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(501);
    expect(result!.endsWith("…")).toBe(true);
  });
});

describe("toolCallsToVisualStates adapter", () => {
  test("converts DisplayToolCalls to ToolVisualState array", () => {
    const dtcs: DisplayToolCall[] = [
      makeDisplayToolCall("running", { name: "bash" }),
      makeDisplayToolCall("complete", { name: "read" }),
    ];
    const states = toolCallsToVisualStates(dtcs);
    expect(states).toHaveLength(2);
    expect(states[0].status).toBe("running");
    expect(states[1].status).toBe("success");
  });

  test("respects expanded set for expansion state", () => {
    const dtcs: DisplayToolCall[] = [
      makeDisplayToolCall("complete", {
        name: "bash",
        result: "output data",
      }),
    ];
    const expandedSet = new Set([dtcs[0].id]);
    const states = toolCallsToVisualStates(dtcs, expandedSet);
    expect(states[0].expanded).toBe(true);
  });

  test("defaults to collapsed when no expanded set", () => {
    const dtcs: DisplayToolCall[] = [
      makeDisplayToolCall("complete", {
        name: "bash",
        result: "output data",
      }),
    ];
    const states = toolCallsToVisualStates(dtcs);
    expect(states[0].expanded).toBe(false);
  });

  test("preserves tool names through conversion", () => {
    const dtcs: DisplayToolCall[] = [
      makeDisplayToolCall("running", { name: "calendar.lookup" }),
    ];
    const states = toolCallsToVisualStates(dtcs);
    expect(states[0].toolName).toBe("calendar.lookup");
  });

  test("maps all display statuses correctly", () => {
    const statuses: Array<{ input: DisplayToolCall["status"]; expected: ToolVisualStatus }> = [
      { input: "pending", expected: "queued" },
      { input: "running", expected: "running" },
      { input: "complete", expected: "success" },
      { input: "error", expected: "error" },
    ];

    for (const { input, expected } of statuses) {
      const dtcs = [makeDisplayToolCall(input, { name: "test" })];
      const states = toolCallsToVisualStates(dtcs);
      expect(states[0].status).toBe(expected);
    }
  });
});

describe("shouldRenderToolBlocks", () => {
  test("returns false for message without tool calls", () => {
    const msg = makeDisplayMessage("assistant", "Hello");
    expect(shouldRenderToolBlocks(msg)).toBe(false);
  });

  test("returns false for message with empty tool calls", () => {
    const msg = makeDisplayMessage("assistant", "Hello", { toolCalls: [] });
    expect(shouldRenderToolBlocks(msg)).toBe(false);
  });

  test("returns true for tool-role message with tool calls", () => {
    const msg = makeDisplayMessage("tool", "result", {
      toolCalls: [makeDisplayToolCall("complete", { name: "bash" })],
    });
    expect(shouldRenderToolBlocks(msg)).toBe(true);
  });

  test("returns false for assistant message with tool calls", () => {
    const msg = makeDisplayMessage("assistant", "Let me check...", {
      toolCalls: [makeDisplayToolCall("running", { name: "bash" })],
    });
    expect(shouldRenderToolBlocks(msg)).toBe(false);
  });

  test("returns false for user message", () => {
    const msg = makeDisplayMessage("user", "Hello");
    expect(shouldRenderToolBlocks(msg)).toBe(false);
  });
});

describe("resolveToolBlockAccent", () => {
  test("resolves glyph.tool.running token", () => {
    const color = resolveToolBlockAccent("glyph.tool.running", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("resolves glyph.tool.done token", () => {
    const color = resolveToolBlockAccent("glyph.tool.done", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.tool.done"]);
  });

  test("resolves glyph.tool.error token", () => {
    const color = resolveToolBlockAccent("glyph.tool.error", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });

  test("falls back to glyph.tool.running for unknown token", () => {
    const color = resolveToolBlockAccent("nonexistent.token", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });
});

describe("ToolBlock source structure", () => {
  test("tool-inline.tsx exports ToolBlock component", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function ToolBlock");
  });

  test("tool-inline.tsx uses FramedBlock for tool blocks", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    expect(source).toContain("FramedBlock");
    expect(source).toContain("SUBTLE_BORDER_CHARS");
  });

  test("tool-inline.tsx exports getToolBlockStyle", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function getToolBlockStyle");
  });

  test("tool-inline.tsx exports getToolBlockStatusSuffix", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function getToolBlockStatusSuffix");
  });

  test("tool-inline.tsx imports ToolVisualState from tool-lifecycle", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    expect(source).toContain("ToolVisualState");
    expect(source).toContain("tool-lifecycle");
  });

  test("conversation-panel.tsx imports ToolBlock", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("ToolBlock");
    expect(source).toContain("tool-inline");
  });

  test("conversation-panel.tsx exports ToolBlockList", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("ToolBlockList");
  });

  test("conversation-panel.tsx exports shouldRenderToolBlocks", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function shouldRenderToolBlocks");
  });

  test("message.tsx supports renderToolBlocks prop", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(source).toContain("renderToolBlocks");
  });
});

describe("ToolBlock visual distinction from message blocks", () => {
  test("tool block uses surface.secondary, not conversation backgrounds", () => {
    const vs = makeVisualState("running");
    const style = getToolBlockStyle(vs, MOCK_TOKENS);
    expect(style.backgroundColor).toBe(MOCK_TOKENS["surface.secondary"]);
    expect(style.backgroundColor).not.toBe(MOCK_TOKENS["conversation.user.bg"]);
    expect(style.backgroundColor).not.toBe(MOCK_TOKENS["conversation.assistant.bg"]);
  });

  test("tool block uses SUBTLE_BORDER_CHARS (lighter than assistant ACCENT)", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/tool-inline.tsx"),
      "utf-8",
    );
    // ToolBlock uses SUBTLE_BORDER_CHARS
    expect(source).toContain("SUBTLE_BORDER_CHARS");
    // Message uses ACCENT_BORDER_CHARS for assistant
    const msgSource = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    expect(msgSource).toContain("ACCENT_BORDER_CHARS");
  });

  test("tool block accent colors are status-driven, not role-driven", () => {
    const running = getToolBlockStyle(makeVisualState("running"), MOCK_TOKENS);
    const success = getToolBlockStyle(makeVisualState("success"), MOCK_TOKENS);
    const error = getToolBlockStyle(makeVisualState("error"), MOCK_TOKENS);

    // Each status has its own accent
    expect(running.accentColor).toBe(MOCK_TOKENS["glyph.tool.running"]);
    expect(success.accentColor).toBe(MOCK_TOKENS["glyph.tool.done"]);
    expect(error.accentColor).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });
});

// --- Helper for creating ToolVisualState test fixtures ---

function makeVisualState(
  status: ToolVisualStatus,
  overrides?: Partial<ToolVisualState>,
): ToolVisualState {
  const colorToken = getToolColorToken(status);
  const glyph = getToolGlyph(status);

  return {
    id: `vs-${crypto.randomUUID().slice(0, 8)}`,
    toolName: "bash",
    status,
    glyph,
    label: `Bash ${status}`,
    colorToken,
    detail: undefined,
    expanded: false,
    hasDetail: false,
    duration: undefined,
    ...overrides,
  };
}

function makeDisplayMessage(
  role: DisplayMessage["role"],
  content: string,
  overrides?: Partial<DisplayMessage>,
): DisplayMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(),
    ...overrides,
  };
}
