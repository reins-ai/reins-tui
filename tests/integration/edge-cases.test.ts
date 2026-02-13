import { describe, expect, test } from "bun:test";

import { normalizeDimensions } from "../../src/app";
import type { AppState, DisplayMessage, DisplayToolCall } from "../../src/store";
import { DEFAULT_STATE, appReducer } from "../../src/store";
import {
  formatToolBlockArgs,
  formatToolBlockDetail,
  formatDetailSection,
  getToolBlockStatusSuffix,
} from "../../src/components/tool-inline";
import {
  isExchangeBoundary,
  shouldAutoExpand,
  displayToolCallToToolCall,
} from "../../src/components/conversation-panel";
import type { ToolVisualState } from "../../src/tools/tool-lifecycle";

function createMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "",
    createdAt: new Date("2026-02-10T00:00:00.000Z"),
    ...overrides,
  };
}

function createStreamingState(): AppState {
  return {
    ...DEFAULT_STATE,
    isStreaming: true,
    streamingMessageId: "assistant-1",
    messages: [createMessage({ id: "assistant-1", isStreaming: true })],
  };
}

describe("Edge Cases", () => {
  test("handles empty message content gracefully", () => {
    const initial = {
      ...DEFAULT_STATE,
      messages: [createMessage({ id: "assistant-1", content: "Hello" })],
    };

    const next = appReducer(initial, {
      type: "APPEND_TOKEN",
      payload: { messageId: "assistant-1", token: "" },
    });

    expect(next).toBe(initial);
  });

  test("handles very long message content", () => {
    const longContent = "x".repeat(10_000);
    const next = appReducer(DEFAULT_STATE, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "long", content: longContent, role: "user" }),
    });

    expect(next.messages[0]?.content.length).toBe(10_000);
  });

  test("handles APPEND_TOKEN for non-existent message", () => {
    const next = appReducer(DEFAULT_STATE, {
      type: "APPEND_TOKEN",
      payload: { messageId: "missing", token: "ignored" },
    });

    expect(next).toBe(DEFAULT_STATE);
  });

  test("handles FINISH_STREAMING for non-existent message", () => {
    const initial = createStreamingState();
    const next = appReducer(initial, {
      type: "FINISH_STREAMING",
      payload: { messageId: "missing" },
    });

    expect(next).toBe(initial);
  });

  test("handles SET_TOOL_CALL_STATUS for non-existent tool", () => {
    const initial = {
      ...DEFAULT_STATE,
      messages: [
        createMessage({
          id: "assistant-1",
          toolCalls: [{ id: "tool-1", name: "weather", status: "running" }],
        }),
      ],
    };

    const next = appReducer(initial, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "assistant-1", toolCallId: "missing", status: "complete" },
    });

    expect(next).toBe(initial);
  });

  test("handles double FINISH_STREAMING idempotently", () => {
    const initial = createStreamingState();
    const once = appReducer(initial, {
      type: "FINISH_STREAMING",
      payload: { messageId: "assistant-1" },
    });
    const twice = appReducer(once, {
      type: "FINISH_STREAMING",
      payload: { messageId: "assistant-1" },
    });

    expect(once.isStreaming).toBe(false);
    expect(once.streamingMessageId).toBeNull();
    expect(twice.isStreaming).toBe(false);
    expect(twice.streamingMessageId).toBeNull();
    expect(twice.messages[0]?.isStreaming).toBe(false);
  });

  test("handles focus cycling without leaving known panels (zen default)", () => {
    let state = DEFAULT_STATE;
    const visitedPanels = new Set<string>();

    // Default is zen mode — sidebar not in cycle
    for (let index = 0; index < 12; index += 1) {
      state = appReducer(state, { type: "FOCUS_NEXT" });
      visitedPanels.add(state.focusedPanel);
    }

    expect(visitedPanels.has("conversation")).toBe(true);
    expect(visitedPanels.has("input")).toBe(true);
    expect(visitedPanels.size).toBe(2);
  });

  test("handles focus cycling with sidebar when drawer is open", () => {
    let state = appReducer(DEFAULT_STATE, { type: "TOGGLE_PANEL", payload: "drawer" });
    const visitedPanels = new Set<string>();

    for (let index = 0; index < 12; index += 1) {
      state = appReducer(state, { type: "FOCUS_NEXT" });
      visitedPanels.add(state.focusedPanel);
    }

    expect(visitedPanels.has("sidebar")).toBe(true);
    expect(visitedPanels.has("conversation")).toBe(true);
    expect(visitedPanels.has("input")).toBe(true);
    expect(visitedPanels.size).toBe(3);
  });

  test("handles CLEAR_MESSAGES while streaming", () => {
    const next = appReducer(createStreamingState(), { type: "CLEAR_MESSAGES" });

    expect(next.messages).toHaveLength(0);
    expect(next.isStreaming).toBe(false);
    expect(next.streamingMessageId).toBeNull();
  });

  test("handles conversation filter with special characters", () => {
    const specialQuery = "(foo|bar) [baz] ^$ . * ? +";
    const next = appReducer(DEFAULT_STATE, {
      type: "SET_CONVERSATION_FILTER",
      payload: specialQuery,
    });

    expect(next.conversationFilter).toBe(specialQuery);
  });

  test("normalizes invalid resize payloads", () => {
    const malformed = normalizeDimensions({ width: "wide", height: 24 });
    const missing = normalizeDimensions(null);
    const valid = normalizeDimensions({ width: 120, height: 48 });

    expect(malformed).toEqual({ width: 0, height: 0 });
    expect(missing).toEqual({ width: 0, height: 0 });
    expect(valid).toEqual({ width: 120, height: 48 });
  });
});

// ---------------------------------------------------------------------------
// Regression: Tool rendering edge cases (MH5)
// ---------------------------------------------------------------------------

describe("Tool rendering edge cases", () => {
  test("formatToolBlockArgs handles circular reference gracefully", () => {
    // JSON.stringify throws on circular refs — formatToolBlockArgs should catch
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(formatToolBlockArgs(circular)).toBeUndefined();
  });

  test("formatToolBlockDetail handles whitespace-only content", () => {
    expect(formatToolBlockDetail("   ")).toBe("   ");
    expect(formatToolBlockDetail("\n\n")).toBe("\n\n");
  });

  test("formatDetailSection handles tool call with all fields populated", () => {
    const call = {
      id: "t1",
      toolName: "bash",
      status: "success" as const,
      args: { command: "ls" },
      result: "file1.ts",
      error: undefined,
    };
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail).toContain("Args:");
    expect(detail).toContain("Result:");
  });

  test("formatDetailSection handles tool call with only error", () => {
    const call = {
      id: "t1",
      toolName: "bash",
      status: "error" as const,
      args: undefined,
      result: undefined,
      error: "Permission denied",
    };
    const detail = formatDetailSection(call);
    expect(detail).toBeDefined();
    expect(detail).toContain("Error:");
    expect(detail).toContain("Permission denied");
  });

  test("formatDetailSection returns undefined for empty tool call", () => {
    const call = {
      id: "t1",
      toolName: "bash",
      status: "running" as const,
    };
    expect(formatDetailSection(call)).toBeUndefined();
  });

  test("getToolBlockStatusSuffix includes duration for success with timing", () => {
    const vs: ToolVisualState = {
      id: "t1",
      toolName: "bash",
      status: "success",
      glyph: "✦",
      label: "Bash complete (150ms)",
      colorToken: "glyph.tool.done",
      detail: undefined,
      expanded: false,
      hasDetail: false,
      duration: 150,
    };
    expect(getToolBlockStatusSuffix(vs)).toBe("done (150ms)");
  });

  test("getToolBlockStatusSuffix omits duration for success without timing", () => {
    const vs: ToolVisualState = {
      id: "t1",
      toolName: "bash",
      status: "success",
      glyph: "✦",
      label: "Bash complete",
      colorToken: "glyph.tool.done",
      detail: undefined,
      expanded: false,
      hasDetail: false,
      duration: undefined,
    };
    expect(getToolBlockStatusSuffix(vs)).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Regression: Conversation boundary edge cases (MH1)
// ---------------------------------------------------------------------------

describe("Conversation boundary edge cases", () => {
  test("isExchangeBoundary handles single-message array", () => {
    const messages: DisplayMessage[] = [
      createMessage({ id: "u1", role: "user", content: "Hello" }),
    ];
    expect(isExchangeBoundary(messages, 0)).toBe(false);
  });

  test("isExchangeBoundary handles system-to-user transition", () => {
    const messages: DisplayMessage[] = [
      createMessage({ id: "s1", role: "system" as DisplayMessage["role"], content: "System" }),
      createMessage({ id: "u1", role: "user", content: "Hello" }),
    ];
    // System to user is not an exchange boundary (system is not assistant/tool)
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("displayToolCallToToolCall maps error with isError flag correctly", () => {
    const dtc: DisplayToolCall = {
      id: "t1",
      name: "bash",
      status: "error",
      result: "Permission denied",
      isError: true,
    };
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.status).toBe("error");
    expect(tc.error).toBe("Permission denied");
    expect(tc.result).toBeUndefined();
  });

  test("displayToolCallToToolCall maps complete without isError correctly", () => {
    const dtc: DisplayToolCall = {
      id: "t1",
      name: "bash",
      status: "complete",
      result: "output data",
    };
    const tc = displayToolCallToToolCall(dtc);
    expect(tc.status).toBe("success");
    expect(tc.result).toBe("output data");
    expect(tc.error).toBeUndefined();
  });

  test("shouldAutoExpand returns false for pending status", () => {
    const dtc: DisplayToolCall = { id: "t1", name: "bash", status: "pending" };
    expect(shouldAutoExpand(dtc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression: Store action ordering stability (MH1, MH5)
// ---------------------------------------------------------------------------

describe("Store action ordering stability", () => {
  test("interleaved message and tool actions maintain correct state", () => {
    let state = DEFAULT_STATE;

    // User message
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "u1", role: "user", content: "Do something" }),
    });

    // Assistant starts streaming
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "a1", role: "assistant", content: "", isStreaming: true }),
    });
    state = appReducer(state, { type: "SET_STREAMING", payload: true });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });

    // Tokens arrive while tool is active
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: "Running " } });
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: "command..." } });

    // Tool completes, new tool starts
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "read" });

    // More tokens
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: " Reading..." } });

    // Everything completes
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "complete" });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.messages[1]?.content).toBe("Running command... Reading...");
    expect(state.isStreaming).toBe(false);
    expect(state.activeToolName).toBeNull();
    expect(state.streamingLifecycleStatus).toBe("complete");
  });

  test("expand/collapse during active streaming does not corrupt message state", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({
        id: "a1",
        role: "assistant",
        content: "Working...",
        isStreaming: true,
        toolCalls: [
          { id: "t1", name: "bash", status: "complete", result: "ok" },
          { id: "t2", name: "read", status: "running" },
        ],
      }),
    });
    state = appReducer(state, { type: "SET_STREAMING", payload: true });

    // Toggle expand during streaming
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t1" } });
    expect(state.expandedToolCalls.has("t1")).toBe(true);

    // Append more tokens
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: " more" } });

    // Message content and tool calls are intact
    expect(state.messages[0]?.content).toBe("Working... more");
    expect(state.messages[0]?.toolCalls).toHaveLength(2);
    expect(state.expandedToolCalls.has("t1")).toBe(true);

    // Finish streaming
    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });
    expect(state.isStreaming).toBe(false);
    expect(state.expandedToolCalls.has("t1")).toBe(true); // Expand state preserved
  });

  test("rapid lifecycle transitions do not leave stale state", () => {
    let state = DEFAULT_STATE;

    // Rapid transitions
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "sending" });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "thinking" });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "complete" });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "idle" });

    expect(state.streamingLifecycleStatus).toBe("idle");
    expect(state.activeToolName).toBeNull();
  });
});
