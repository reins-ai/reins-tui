import { describe, expect, it, beforeEach } from "bun:test";

import {
  ActivityStore,
  type ActivityEvent,
  type DoneActivityEvent,
  type ToolCallActivityEvent,
} from "../../src/state/activity-store";

function makeToolCallEvent(
  overrides?: Partial<ToolCallActivityEvent>,
): ToolCallActivityEvent {
  return {
    id: `tc_${Math.random()}`,
    timestamp: Date.now(),
    kind: "tool_call",
    toolCallId: "call-1",
    toolName: "testTool",
    toolArgs: {},
    status: "running",
    startedAt: Date.now(),
    ...overrides,
  };
}

function makeDoneEvent(totalTokensUsed = 100): DoneActivityEvent {
  return {
    id: `done_${Math.random()}`,
    timestamp: Date.now(),
    kind: "done",
    totalTokensUsed,
    finishReason: "stop",
  };
}

function makeCompactionEvent(): ActivityEvent {
  return {
    id: `compact_${Math.random()}`,
    timestamp: Date.now(),
    kind: "compaction",
    summary: "Compacted context",
    beforeTokenEstimate: 5000,
    afterTokenEstimate: 2000,
  };
}

describe("ActivityStore", () => {
  let store: ActivityStore;

  beforeEach(() => {
    store = new ActivityStore();
  });

  it("starts empty with zero stats", () => {
    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);

    const stats = store.getStats();
    expect(stats.totalToolCalls).toBe(0);
    expect(stats.totalTokensUsed).toBe(0);
    expect(stats.totalWallMs).toBe(0);
  });

  it("push adds an event to the buffer", () => {
    const event = makeToolCallEvent();
    store.push(event);

    expect(store.size).toBe(1);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].id).toBe(event.id);
  });

  it("getAll returns events newest-first", () => {
    const event1 = makeToolCallEvent({ id: "first", timestamp: 1000 });
    const event2 = makeToolCallEvent({ id: "second", timestamp: 2000 });
    const event3 = makeToolCallEvent({ id: "third", timestamp: 3000 });

    store.push(event1);
    store.push(event2);
    store.push(event3);

    const all = store.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe("third");
    expect(all[1].id).toBe("second");
    expect(all[2].id).toBe("first");
  });

  it("push drops oldest when buffer is full", () => {
    const smallStore = new ActivityStore(3);

    const event1 = makeToolCallEvent({ id: "ev-1" });
    const event2 = makeToolCallEvent({ id: "ev-2" });
    const event3 = makeToolCallEvent({ id: "ev-3" });
    const event4 = makeToolCallEvent({ id: "ev-4" });

    smallStore.push(event1);
    smallStore.push(event2);
    smallStore.push(event3);
    expect(smallStore.size).toBe(3);

    smallStore.push(event4);
    expect(smallStore.size).toBe(3);

    const all = smallStore.getAll();
    const ids = all.map((e) => e.id);
    expect(ids).not.toContain("ev-1");
    expect(ids).toContain("ev-2");
    expect(ids).toContain("ev-3");
    expect(ids).toContain("ev-4");
  });

  it("getAll returns a copy (mutations do not affect store)", () => {
    store.push(makeToolCallEvent({ id: "original" }));

    const all = store.getAll();
    all.pop();

    expect(store.size).toBe(1);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].id).toBe("original");
  });

  it("clear resets buffer and stats", () => {
    store.push(
      makeToolCallEvent({
        id: "tc-1",
        status: "success",
        durationMs: 50,
        completedAt: Date.now(),
      }),
    );
    store.push(makeDoneEvent(200));

    expect(store.size).toBeGreaterThan(0);
    expect(store.getStats().totalToolCalls).toBeGreaterThan(0);

    store.clear();

    expect(store.size).toBe(0);
    expect(store.getAll()).toEqual([]);

    const stats = store.getStats();
    expect(stats.totalToolCalls).toBe(0);
    expect(stats.totalTokensUsed).toBe(0);
    expect(stats.totalWallMs).toBe(0);
  });

  it("stats.totalToolCalls increments only for completed tool calls", () => {
    const running = makeToolCallEvent({ id: "tc-running", status: "running" });
    store.push(running);
    expect(store.getStats().totalToolCalls).toBe(0);

    const completed = makeToolCallEvent({
      id: "tc-done",
      status: "success",
      completedAt: Date.now(),
      durationMs: 100,
    });
    store.push(completed);
    expect(store.getStats().totalToolCalls).toBe(1);
  });

  it("stats.totalWallMs accumulates durationMs from completed tool calls", () => {
    store.push(
      makeToolCallEvent({
        id: "tc-1",
        status: "success",
        durationMs: 150,
        completedAt: Date.now(),
      }),
    );
    store.push(
      makeToolCallEvent({
        id: "tc-2",
        status: "success",
        durationMs: 250,
        completedAt: Date.now(),
      }),
    );

    expect(store.getStats().totalWallMs).toBe(400);
  });

  it("stats.totalTokensUsed accumulates from done events", () => {
    store.push(makeDoneEvent(100));
    store.push(makeDoneEvent(250));

    expect(store.getStats().totalTokensUsed).toBe(350);
  });

  it("update replaces event by id", () => {
    const original = makeToolCallEvent({
      id: "tc-update",
      status: "running",
      toolName: "readFile",
    });
    store.push(original);

    const updated = makeToolCallEvent({
      id: "tc-update",
      status: "success",
      toolName: "readFile",
      result: "file contents",
      completedAt: Date.now(),
      durationMs: 75,
    });

    const result = store.update("tc-update", updated);
    expect(result).toBe(true);

    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe("tool_call");
    expect((all[0] as ToolCallActivityEvent).status).toBe("success");
    expect((all[0] as ToolCallActivityEvent).result).toBe("file contents");
  });

  it("update increments totalToolCalls when completing a tool call via update", () => {
    const running = makeToolCallEvent({ id: "tc-track", status: "running" });
    store.push(running);
    expect(store.getStats().totalToolCalls).toBe(0);

    const completed = makeToolCallEvent({
      id: "tc-track",
      status: "success",
      completedAt: Date.now(),
      durationMs: 200,
    });
    store.update("tc-track", completed);

    expect(store.getStats().totalToolCalls).toBe(1);
    expect(store.getStats().totalWallMs).toBe(200);
  });

  it("update returns false when id not found", () => {
    store.push(makeToolCallEvent({ id: "existing" }));

    const result = store.update("nonexistent", makeToolCallEvent({ id: "nonexistent" }));
    expect(result).toBe(false);
  });

  it("size reflects buffer length", () => {
    expect(store.size).toBe(0);

    store.push(makeToolCallEvent({ id: "a" }));
    store.push(makeCompactionEvent());
    store.push(makeDoneEvent());

    expect(store.size).toBe(3);

    store.clear();
    expect(store.size).toBe(0);
  });
});
