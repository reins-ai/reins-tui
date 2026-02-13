import { describe, expect, test } from "bun:test";

import { DEFAULT_STATE, appReducer } from "../../src/store";
import type { DisplayMessage } from "../../src/store";

function createMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: "message-1",
    role: "assistant",
    content: "Hello",
    createdAt: new Date("2026-02-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("appReducer message actions", () => {
  test("ADD_MESSAGE adds to messages array", () => {
    const message = createMessage();
    const next = appReducer(DEFAULT_STATE, { type: "ADD_MESSAGE", payload: message });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]).toEqual(message);
  });

  test("APPEND_TOKEN appends to correct message content", () => {
    const state = {
      ...DEFAULT_STATE,
      messages: [createMessage({ id: "target", content: "Hello" })],
    };

    const next = appReducer(state, {
      type: "APPEND_TOKEN",
      payload: { messageId: "target", token: " world" },
    });

    expect(next.messages[0]?.content).toBe("Hello world");
  });

  test("APPEND_TOKEN ignores unknown messageId", () => {
    const state = {
      ...DEFAULT_STATE,
      messages: [createMessage({ id: "known" })],
    };

    const next = appReducer(state, {
      type: "APPEND_TOKEN",
      payload: { messageId: "unknown", token: "ignored" },
    });

    expect(next).toBe(state);
  });

  test("SET_TOOL_CALL_STATUS updates correct tool call", () => {
    const state = {
      ...DEFAULT_STATE,
      messages: [
        createMessage({
          id: "assistant-1",
          toolCalls: [
            { id: "tool-1", name: "weather", status: "running" },
            { id: "tool-2", name: "calendar", status: "pending" },
          ],
        }),
      ],
    };

    const next = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: {
        messageId: "assistant-1",
        toolCallId: "tool-2",
        status: "complete",
        result: "done",
      },
    });

    expect(next.messages[0]?.toolCalls?.[0]?.status).toBe("running");
    expect(next.messages[0]?.toolCalls?.[1]?.status).toBe("complete");
    expect(next.messages[0]?.toolCalls?.[1]?.result).toBe("done");
  });

  test("SET_MESSAGES preserves existing tool metadata when incoming payload omits it", () => {
    const state = {
      ...DEFAULT_STATE,
      messages: [
        createMessage({
          id: "assistant-1",
          content: "Original",
          toolCalls: [{ id: "tool-1", name: "bash", status: "complete", result: "ok" }],
          contentBlocks: [{ type: "tool-call", toolCallId: "tool-1" }],
        }),
      ],
    };

    const next = appReducer(state, {
      type: "SET_MESSAGES",
      payload: [
        createMessage({
          id: "assistant-1",
          content: "Server hydrated content",
          toolCalls: undefined,
          contentBlocks: undefined,
        }),
      ],
    });

    expect(next.messages[0]?.content).toBe("Server hydrated content");
    expect(next.messages[0]?.toolCalls).toHaveLength(1);
    expect(next.messages[0]?.toolCalls?.[0]?.id).toBe("tool-1");
    expect(next.messages[0]?.contentBlocks).toHaveLength(1);
    expect(next.messages[0]?.contentBlocks?.[0]?.toolCallId).toBe("tool-1");
  });

  test("FINISH_STREAMING marks message as not streaming", () => {
    const state = {
      ...DEFAULT_STATE,
      isStreaming: true,
      streamingMessageId: "assistant-1",
      messages: [createMessage({ id: "assistant-1", isStreaming: true })],
    };

    const next = appReducer(state, {
      type: "FINISH_STREAMING",
      payload: { messageId: "assistant-1" },
    });

    expect(next.messages[0]?.isStreaming).toBe(false);
    expect(next.streamingMessageId).toBeNull();
    expect(next.isStreaming).toBe(false);
  });

  test("CLEAR_MESSAGES empties message array", () => {
    const state = {
      ...DEFAULT_STATE,
      isStreaming: true,
      streamingMessageId: "assistant-1",
      messages: [createMessage()],
    };

    const next = appReducer(state, { type: "CLEAR_MESSAGES" });

    expect(next.messages).toEqual([]);
    expect(next.streamingMessageId).toBeNull();
    expect(next.isStreaming).toBe(false);
  });
});
