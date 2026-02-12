import { describe, expect, test } from "bun:test";

import type { AppState, DisplayMessage, DisplayToolCall } from "../../src/store";
import { DEFAULT_STATE, appReducer } from "../../src/store";

function createMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: "message-id",
    role: "assistant",
    content: "",
    createdAt: new Date("2026-02-10T00:00:00.000Z"),
    ...overrides,
  };
}

function withToolCalls(state: AppState, messageId: string, toolCalls: DisplayToolCall[]): AppState {
  return {
    ...state,
    messages: state.messages.map((message) => (message.id === messageId ? { ...message, toolCalls } : message)),
  };
}

describe("Conversation Flow Integration", () => {
  test("complete conversation: send -> stream -> tool -> complete", () => {
    let state = DEFAULT_STATE;

    const userMessage = createMessage({
      id: "u1",
      role: "user",
      content: "What's the weather?",
    });
    state = appReducer(state, { type: "ADD_MESSAGE", payload: userMessage });

    const assistantMessage = createMessage({
      id: "a1",
      role: "assistant",
      content: "",
      isStreaming: true,
    });
    state = appReducer(state, { type: "ADD_MESSAGE", payload: assistantMessage });
    state = appReducer(state, { type: "SET_STREAMING", payload: true });

    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: "Let me " } });
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: "check " } });
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: "the weather." } });

    state = withToolCalls(state, "a1", [{ id: "t1", name: "weather", status: "pending" }]);
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t1", status: "running" },
    });
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t1", status: "complete", result: "Sunny, 72F" },
    });
    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.role).toBe("user");
    expect(state.messages[1]?.content).toBe("Let me check the weather.");
    expect(state.messages[1]?.toolCalls?.[0]?.status).toBe("complete");
    expect(state.messages[1]?.toolCalls?.[0]?.result).toBe("Sunny, 72F");
    expect(state.isStreaming).toBe(false);
    expect(state.messages[1]?.isStreaming).toBe(false);
  });

  test("conversation switching clears messages", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "ADD_CONVERSATION",
      payload: {
        id: "c1",
        title: "Chat 1",
        model: "default",
        messageCount: 0,
        lastMessageAt: new Date(),
        createdAt: new Date(),
      },
    });
    state = appReducer(state, { type: "SET_ACTIVE_CONVERSATION", payload: "c1" });
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "m1", role: "user", content: "Hello" }),
    });
    state = appReducer(state, { type: "SET_ACTIVE_CONVERSATION", payload: "c2" });
    state = appReducer(state, { type: "CLEAR_MESSAGES" });

    expect(state.activeConversationId).toBe("c2");
    expect(state.messages).toHaveLength(0);
  });

  test("multiple tool calls in one response", () => {
    let state = {
      ...DEFAULT_STATE,
      messages: [
        createMessage({
          id: "a1",
          role: "assistant",
          content: "Working on it",
          toolCalls: [
            { id: "t1", name: "weather", status: "pending" },
            { id: "t2", name: "calendar", status: "pending" },
            { id: "t3", name: "notes", status: "pending" },
          ],
        }),
      ],
    };

    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t1", status: "running" },
    });
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t2", status: "complete", result: "Event created" },
    });
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t3", status: "error", isError: true, result: "Permission denied" },
    });

    expect(state.messages[0]?.toolCalls?.[0]?.status).toBe("running");
    expect(state.messages[0]?.toolCalls?.[1]?.status).toBe("complete");
    expect(state.messages[0]?.toolCalls?.[1]?.result).toBe("Event created");
    expect(state.messages[0]?.toolCalls?.[2]?.status).toBe("error");
    expect(state.messages[0]?.toolCalls?.[2]?.isError).toBe(true);
  });

  test("error during streaming recovers gracefully", () => {
    let state = DEFAULT_STATE;

    state = appReducer(
      state,
      {
        type: "ADD_MESSAGE",
        payload: createMessage({
          id: "a1",
          role: "assistant",
          isStreaming: true,
          toolCalls: [{ id: "t1", name: "weather", status: "running" }],
        }),
      },
    );
    state = appReducer(state, { type: "SET_STREAMING", payload: true });
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: {
        messageId: "a1",
        toolCallId: "t1",
        status: "error",
        isError: true,
        result: "Tool timed out",
      },
    });
    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });

    expect(state.isStreaming).toBe(false);
    expect(state.streamingMessageId).toBeNull();
    expect(state.messages[0]?.isStreaming).toBe(false);
    expect(state.messages[0]?.toolCalls?.[0]?.status).toBe("error");
  });

  test("rapid message sending queues correctly", () => {
    let state = DEFAULT_STATE;
    const sentCount = 25;

    for (let index = 0; index < sentCount; index += 1) {
      state = appReducer(state, {
        type: "ADD_MESSAGE",
        payload: createMessage({ id: `u-${index}`, role: "user", content: `Message ${index}` }),
      });
    }

    expect(state.messages).toHaveLength(sentCount);
    expect(state.messages[0]?.content).toBe("Message 0");
    expect(state.messages[sentCount - 1]?.content).toBe(`Message ${sentCount - 1}`);
  });
});
