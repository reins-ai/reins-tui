import { describe, expect, test } from "bun:test";

import type { ConversationSummary } from "@reins/core";

import { createConversationsManager } from "../../src/hooks";
import { DEFAULT_STATE, appReducer, type AppAction, type AppState } from "../../src/store";

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

function createHarness(initialState: AppState) {
  let state = initialState;
  const dispatch = (action: AppAction) => {
    state = appReducer(state, action);
  };

  return {
    manager: createConversationsManager({
      getState: () => state,
      dispatch,
      createId: () => "generated-id",
      now: () => new Date("2026-02-10T12:00:00.000Z"),
    }),
    getState: () => state,
  };
}

describe("use-conversations manager", () => {
  test("createConversation adds to list", () => {
    const harness = createHarness(DEFAULT_STATE);

    const id = harness.manager.createConversation("My Chat");

    expect(id).toBe("generated-id");
    expect(harness.getState().conversations).toHaveLength(1);
    expect(harness.getState().conversations[0]?.title).toBe("My Chat");
  });

  test("switchConversation updates activeId", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One"), createConversation("c2", "Two")],
      activeConversationId: "c1",
    });

    harness.manager.switchConversation("c2");

    expect(harness.getState().activeConversationId).toBe("c2");
  });

  test("renameConversation updates title", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "Original")],
    });

    harness.manager.renameConversation("c1", "Renamed");

    expect(harness.getState().conversations[0]?.title).toBe("Renamed");
  });

  test("deleteConversation removes from list", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One"), createConversation("c2", "Two")],
    });

    harness.manager.deleteConversation("c1");

    expect(harness.getState().conversations.map((conversation) => conversation.id)).toEqual(["c2"]);
  });

  test("delete active conversation switches to next or null", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One"), createConversation("c2", "Two")],
      activeConversationId: "c1",
    });

    harness.manager.deleteConversation("c1");
    expect(harness.getState().activeConversationId).toBe("c2");

    harness.manager.deleteConversation("c2");
    expect(harness.getState().activeConversationId).toBeNull();
  });

  test("filteredConversations matches title substring", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [
        createConversation("c1", "Project Alpha"),
        createConversation("c2", "Weekend Plan"),
        createConversation("c3", "Alpha Follow-up"),
      ],
    });

    harness.manager.setFilter("alpha");

    expect(harness.manager.filteredConversations().map((conversation) => conversation.id)).toEqual(["c1", "c3"]);
  });

  test("archiveConversation removes from list", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One"), createConversation("c2", "Two")],
    });

    harness.manager.archiveConversation("c1");

    expect(harness.getState().conversations.map((conversation) => conversation.id)).toEqual(["c2"]);
  });

  test("archive active conversation switches to next or null", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One"), createConversation("c2", "Two")],
      activeConversationId: "c1",
    });

    harness.manager.archiveConversation("c1");
    expect(harness.getState().activeConversationId).toBe("c2");

    harness.manager.archiveConversation("c2");
    expect(harness.getState().activeConversationId).toBeNull();
  });

  test("archiveConversation with empty id is no-op", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One")],
    });

    harness.manager.archiveConversation("");

    expect(harness.getState().conversations).toHaveLength(1);
  });

  test("renameConversation with empty id is no-op", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "One")],
    });

    harness.manager.renameConversation("", "New Title");

    expect(harness.getState().conversations[0]?.title).toBe("One");
  });

  test("renameConversation trims whitespace and defaults to Untitled Chat", () => {
    const harness = createHarness({
      ...DEFAULT_STATE,
      conversations: [createConversation("c1", "Original")],
    });

    harness.manager.renameConversation("c1", "   ");

    expect(harness.getState().conversations[0]?.title).toBe("Untitled Chat");
  });
});
