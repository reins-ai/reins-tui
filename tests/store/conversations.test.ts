import { describe, expect, test } from "bun:test";

import type { ConversationSummary } from "@reins/core";

import { DEFAULT_STATE, appReducer } from "../../src/store";

function createConversation(id: string, title: string): ConversationSummary {
  return {
    id,
    title,
    model: "default",
    messageCount: 0,
    createdAt: new Date("2026-02-10T00:00:00.000Z"),
    lastMessageAt: new Date("2026-02-10T00:00:00.000Z"),
  };
}

describe("appReducer conversation actions", () => {
  test("SET_CONVERSATIONS replaces list", () => {
    const conversations = [createConversation("c1", "One")];
    const next = appReducer(DEFAULT_STATE, { type: "SET_CONVERSATIONS", payload: conversations });

    expect(next.conversations).toEqual(conversations);
  });

  test("ADD_CONVERSATION adds to list", () => {
    const existing = createConversation("c1", "One");
    const added = createConversation("c2", "Two");
    const state = { ...DEFAULT_STATE, conversations: [existing] };
    const next = appReducer(state, { type: "ADD_CONVERSATION", payload: added });

    expect(next.conversations).toHaveLength(2);
    expect(next.conversations[0]).toEqual(added);
  });

  test("REMOVE_CONVERSATION removes by id", () => {
    const state = {
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One"), createConversation("c2", "Two")],
    };

    const next = appReducer(state, { type: "REMOVE_CONVERSATION", payload: "c1" });
    expect(next.conversations).toHaveLength(1);
    expect(next.conversations[0]?.id).toBe("c2");
  });

  test("RENAME_CONVERSATION updates title", () => {
    const state = {
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "Original")],
    };

    const next = appReducer(state, {
      type: "RENAME_CONVERSATION",
      payload: { id: "c1", title: "Renamed" },
    });

    expect(next.conversations[0]?.title).toBe("Renamed");
  });

  test("SET_ACTIVE_CONVERSATION updates active id", () => {
    const next = appReducer(DEFAULT_STATE, { type: "SET_ACTIVE_CONVERSATION", payload: "c1" });
    expect(next.activeConversationId).toBe("c1");
  });

  test("SET_CONVERSATION_FILTER updates filter", () => {
    const next = appReducer(DEFAULT_STATE, { type: "SET_CONVERSATION_FILTER", payload: "hello" });
    expect(next.conversationFilter).toBe("hello");
  });
});
