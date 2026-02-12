import { describe, expect, test } from "bun:test";

import { normalizeDimensions } from "../../src/app";
import type { AppState, DisplayMessage } from "../../src/store";
import { DEFAULT_STATE, appReducer } from "../../src/store";

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

  test("handles focus cycling without leaving known panels", () => {
    let state = DEFAULT_STATE;
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
