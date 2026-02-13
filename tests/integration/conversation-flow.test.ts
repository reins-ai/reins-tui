import { describe, expect, test } from "bun:test";

import type { AppState, DisplayMessage, DisplayToolCall } from "../../src/store";
import { DEFAULT_STATE, appReducer } from "../../src/store";
import {
  shouldAutoExpand,
  shouldRenderToolBlocks,
  toolCallsToVisualStates,
} from "../../src/components/conversation-panel";

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

describe("Tool Expand/Collapse Integration", () => {
  test("expand/collapse toggle through full conversation lifecycle", () => {
    let state = DEFAULT_STATE;

    // User sends message
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "u1", role: "user", content: "Run some tools" }),
    });

    // Assistant responds with tool calls
    const assistantMsg = createMessage({
      id: "a1",
      role: "assistant",
      content: "Running tools...",
      toolCalls: [
        { id: "t1", name: "bash", status: "complete", args: { command: "ls" }, result: "file1.ts" },
        { id: "t2", name: "read", status: "complete", args: { path: "file1.ts" }, result: "content" },
        { id: "t3", name: "grep", status: "error", result: "pattern not found", isError: true },
      ],
    });
    state = appReducer(state, { type: "ADD_MESSAGE", payload: assistantMsg });

    // Initially no tools expanded
    expect(state.expandedToolCalls.size).toBe(0);

    // Expand tool-1
    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "t1" },
    });
    expect(state.expandedToolCalls.has("t1")).toBe(true);

    // Expand tool-2
    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "t2" },
    });
    expect(state.expandedToolCalls.has("t1")).toBe(true);
    expect(state.expandedToolCalls.has("t2")).toBe(true);

    // Collapse tool-1
    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "t1" },
    });
    expect(state.expandedToolCalls.has("t1")).toBe(false);
    expect(state.expandedToolCalls.has("t2")).toBe(true);

    // Messages remain unchanged
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]?.toolCalls).toHaveLength(3);
  });

  test("expand/collapse state does not affect message ordering", () => {
    let state = DEFAULT_STATE;

    // Build a conversation with multiple messages and tool calls
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "u1", role: "user", content: "First question" }),
    });
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({
        id: "a1",
        role: "assistant",
        content: "First answer",
        toolCalls: [
          { id: "t1", name: "bash", status: "complete", result: "ok" },
        ],
      }),
    });
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({ id: "u2", role: "user", content: "Second question" }),
    });
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMessage({
        id: "a2",
        role: "assistant",
        content: "Second answer",
        toolCalls: [
          { id: "t2", name: "read", status: "complete", result: "data" },
          { id: "t3", name: "grep", status: "complete", result: "match" },
        ],
      }),
    });

    // Toggle various expand states
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t1" } });
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t3" } });

    // Message ordering is preserved
    expect(state.messages[0]?.id).toBe("u1");
    expect(state.messages[1]?.id).toBe("a1");
    expect(state.messages[2]?.id).toBe("u2");
    expect(state.messages[3]?.id).toBe("a2");

    // Tool call ordering within messages is preserved
    expect(state.messages[1]?.toolCalls?.[0]?.id).toBe("t1");
    expect(state.messages[3]?.toolCalls?.[0]?.id).toBe("t2");
    expect(state.messages[3]?.toolCalls?.[1]?.id).toBe("t3");
  });

  test("error tool blocks auto-expand preserves diagnostics visibility", () => {
    const toolCalls: DisplayToolCall[] = [
      { id: "t1", name: "bash", status: "complete", result: "ok" },
      { id: "t2", name: "write", status: "error", result: "Permission denied", isError: true },
      { id: "t3", name: "read", status: "complete", result: "data" },
    ];

    // No tools manually expanded
    const expandedSet = new Set<string>();

    const visualStates = toolCalls.map((dtc) => {
      const expanded = shouldAutoExpand(dtc) || expandedSet.has(dtc.id);
      return { id: dtc.id, expanded };
    });

    // Only error tool is expanded
    expect(visualStates[0].expanded).toBe(false);
    expect(visualStates[1].expanded).toBe(true);
    expect(visualStates[2].expanded).toBe(false);
  });

  test("shouldRenderToolBlocks identifies tool-role messages", () => {
    const toolMsg = createMessage({
      id: "t1",
      role: "tool" as DisplayMessage["role"],
      toolCalls: [{ id: "tc1", name: "bash", status: "complete" }],
    });
    expect(shouldRenderToolBlocks(toolMsg)).toBe(true);

    const assistantMsg = createMessage({
      id: "a1",
      role: "assistant",
      content: "text",
      toolCalls: [{ id: "tc2", name: "bash", status: "complete" }],
    });
    expect(shouldRenderToolBlocks(assistantMsg)).toBe(false);

    const noToolsMsg = createMessage({ id: "a2", role: "assistant", content: "text" });
    expect(shouldRenderToolBlocks(noToolsMsg)).toBe(false);
  });

  test("conversation switch resets expand state", () => {
    let state = DEFAULT_STATE;

    // Expand some tools
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t1" } });
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t2" } });
    expect(state.expandedToolCalls.size).toBe(2);

    // Switch conversation
    state = appReducer(state, { type: "SET_ACTIVE_CONVERSATION", payload: "conv-2" });
    expect(state.expandedToolCalls.size).toBe(0);
  });

  test("toolCallsToVisualStates produces correct visual states for mixed lifecycle", () => {
    const toolCalls: DisplayToolCall[] = [
      { id: "t1", name: "bash", status: "running" },
      { id: "t2", name: "read", status: "complete", result: "data" },
      { id: "t3", name: "write", status: "error", result: "denied", isError: true },
      { id: "t4", name: "grep", status: "pending" },
    ];

    const expandedSet = new Set(["t2"]);
    const states = toolCallsToVisualStates(toolCalls, expandedSet);

    expect(states).toHaveLength(4);

    // Running: not expanded (not in set)
    expect(states[0].status).toBe("running");
    expect(states[0].expanded).toBe(false);

    // Complete: expanded (in set)
    expect(states[1].status).toBe("success");
    expect(states[1].expanded).toBe(true);

    // Error: expanded (auto-expand via shouldAutoExpand in ToolBlockList)
    // Note: toolCallsToVisualStates uses the expandedSet directly,
    // auto-expand is handled by ToolBlockList
    expect(states[2].status).toBe("error");

    // Pending: not expanded
    expect(states[3].status).toBe("queued");
    expect(states[3].expanded).toBe(false);

    // Ordering preserved
    expect(states[0].id).toBe("t1");
    expect(states[1].id).toBe("t2");
    expect(states[2].id).toBe("t3");
    expect(states[3].id).toBe("t4");
  });

  test("collapse all after expanding multiple tools", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t1" } });
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t2" } });
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t3" } });
    expect(state.expandedToolCalls.size).toBe(3);

    state = appReducer(state, { type: "COLLAPSE_ALL_TOOLS" });
    expect(state.expandedToolCalls.size).toBe(0);

    // Can re-expand after collapse all
    state = appReducer(state, { type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId: "t2" } });
    expect(state.expandedToolCalls.size).toBe(1);
    expect(state.expandedToolCalls.has("t2")).toBe(true);
  });
});
