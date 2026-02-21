import { describe, expect, it, beforeEach } from "bun:test";

import { createHarnessEventBus } from "@reins/core";
import type {
  TypedEventBus,
  HarnessEventMap,
  ToolCall,
  ToolResult,
  TokenUsage,
} from "@reins/core";

import {
  ActivityStore,
  type ToolCallActivityEvent,
  type CompactionActivityEvent,
  type DoneActivityEvent,
  type ErrorActivityEvent,
  type AbortedActivityEvent,
  type ChildAgentActivityEvent,
} from "../../src/state/activity-store";

/**
 * The useActivityEvents hook wires event bus subscriptions inside a React
 * useEffect. Since bun:test has no React renderer, we replicate the
 * subscription logic here by calling eventBus.on() with the same handler
 * shapes the hook uses, then verify the ActivityStore state after emitting
 * events through the real TypedEventBus.
 *
 * This tests the integration contract: "when event X is emitted, the store
 * should contain activity event Y with the correct fields."
 */

/** Map from toolCall.id → { eventId, startedAt } — mirrors the hook's useRef Map */
let toolCallMap: Map<string, { eventId: string; startedAt: number }>;
let unsubscribes: Array<() => void>;

let activityEventCounter = 0;

function createActivityEventId(): string {
  activityEventCounter += 1;
  return `ae_${Date.now()}_${activityEventCounter}`;
}

/**
 * Wires up the same subscriptions as useActivityEvents, returning
 * an array of unsubscribe functions (mirroring the useEffect cleanup).
 */
function wireHandlers(
  eventBus: TypedEventBus<HarnessEventMap>,
  store: ActivityStore,
): Array<() => void> {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    eventBus.on("tool_call_start", (envelope) => {
      const { toolCall } = envelope.payload;
      const eventId = createActivityEventId();
      const now = Date.now();

      toolCallMap.set(toolCall.id, { eventId, startedAt: now });

      const event: ToolCallActivityEvent = {
        id: eventId,
        timestamp: now,
        kind: "tool_call",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        status: "running",
        startedAt: now,
      };

      store.push(event);
    }),
  );

  unsubs.push(
    eventBus.on("tool_call_end", (envelope) => {
      const { result } = envelope.payload;
      const tracked = toolCallMap.get(result.callId);

      if (!tracked) {
        return;
      }

      const completedAt = Date.now();
      const hasError = result.error !== undefined;

      const updatedEvent: ToolCallActivityEvent = {
        id: tracked.eventId,
        timestamp: tracked.startedAt,
        kind: "tool_call",
        toolCallId: result.callId,
        toolName: result.name,
        toolArgs: {},
        status: hasError ? "error" : "success",
        result: hasError ? undefined : String(result.result),
        error: hasError ? result.error : undefined,
        startedAt: tracked.startedAt,
        completedAt,
        durationMs: completedAt - tracked.startedAt,
      };

      store.update(tracked.eventId, updatedEvent);
      toolCallMap.delete(result.callId);
    }),
  );

  unsubs.push(
    eventBus.on("compaction", (envelope) => {
      const { summary, beforeTokenEstimate, afterTokenEstimate } = envelope.payload;

      const event: CompactionActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "compaction",
        summary,
        beforeTokenEstimate,
        afterTokenEstimate,
      };

      store.push(event);
    }),
  );

  unsubs.push(
    eventBus.on("error", (envelope) => {
      const { error, code, retryable } = envelope.payload;

      const event: ErrorActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "error",
        error,
        code,
        retryable,
      };

      store.push(event);
    }),
  );

  unsubs.push(
    eventBus.on("done", (envelope) => {
      const { usage, finishReason } = envelope.payload;

      const event: DoneActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "done",
        totalTokensUsed: usage.totalTokens,
        finishReason,
      };

      store.push(event);
    }),
  );

  unsubs.push(
    eventBus.on("aborted", (envelope) => {
      const { reason, initiatedBy } = envelope.payload;

      const event: AbortedActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "aborted",
        reason,
        initiatedBy,
      };

      store.push(event);
    }),
  );

  unsubs.push(
    eventBus.on("child_agent_event", (envelope) => {
      const { childId, eventType, payload } = envelope.payload;

      const event: ChildAgentActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "child_agent",
        childId,
        eventType,
        payload,
      };

      store.push(event);
    }),
  );

  return unsubs;
}

function makeToolCall(overrides?: Partial<ToolCall>): ToolCall {
  return {
    id: "tc-1",
    name: "readFile",
    arguments: { path: "/tmp/test.txt" },
    ...overrides,
  };
}

function makeToolResult(overrides?: Partial<ToolResult>): ToolResult {
  return {
    callId: "tc-1",
    name: "readFile",
    result: "file contents",
    ...overrides,
  };
}

function makeUsage(overrides?: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: 500,
    outputTokens: 200,
    totalTokens: 700,
    ...overrides,
  };
}

describe("useActivityEvents", () => {
  let eventBus: TypedEventBus<HarnessEventMap>;
  let store: ActivityStore;

  beforeEach(() => {
    activityEventCounter = 0;
    toolCallMap = new Map();
    eventBus = createHarnessEventBus();
    store = new ActivityStore();
    unsubscribes = wireHandlers(eventBus, store);
  });

  it("subscribes to tool_call_start and pushes a running tool_call event", async () => {
    const toolCall = makeToolCall({ id: "tc-start-1", name: "bash" });

    await eventBus.emit("tool_call_start", { toolCall });

    expect(store.size).toBe(1);

    const events = store.getAll();
    const event = events[0] as ToolCallActivityEvent;
    expect(event.kind).toBe("tool_call");
    expect(event.status).toBe("running");
    expect(event.toolCallId).toBe("tc-start-1");
    expect(event.toolName).toBe("bash");
    expect(event.toolArgs).toEqual(toolCall.arguments);
    expect(event.startedAt).toBeGreaterThan(0);
  });

  it("updates tool_call to success on tool_call_end", async () => {
    const toolCall = makeToolCall({ id: "tc-success" });
    await eventBus.emit("tool_call_start", { toolCall });

    expect(store.size).toBe(1);
    expect((store.getAll()[0] as ToolCallActivityEvent).status).toBe("running");

    const result = makeToolResult({
      callId: "tc-success",
      name: "readFile",
      result: "hello world",
    });
    await eventBus.emit("tool_call_end", { result });

    expect(store.size).toBe(1);

    const updated = store.getAll()[0] as ToolCallActivityEvent;
    expect(updated.status).toBe("success");
    expect(updated.result).toBe("hello world");
    expect(updated.error).toBeUndefined();
    expect(updated.completedAt).toBeGreaterThan(0);
    expect(updated.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("updates tool_call to error on tool_call_end when result has error", async () => {
    const toolCall = makeToolCall({ id: "tc-err" });
    await eventBus.emit("tool_call_start", { toolCall });

    const result = makeToolResult({
      callId: "tc-err",
      name: "readFile",
      result: undefined,
      error: "Permission denied",
    });
    await eventBus.emit("tool_call_end", { result });

    expect(store.size).toBe(1);

    const updated = store.getAll()[0] as ToolCallActivityEvent;
    expect(updated.status).toBe("error");
    expect(updated.error).toBe("Permission denied");
    expect(updated.result).toBeUndefined();
  });

  it("pushes compaction event", async () => {
    await eventBus.emit("compaction", {
      summary: "Summarised 50 messages into 5",
      beforeTokenEstimate: 8000,
      afterTokenEstimate: 2000,
    });

    expect(store.size).toBe(1);

    const event = store.getAll()[0] as CompactionActivityEvent;
    expect(event.kind).toBe("compaction");
    expect(event.summary).toBe("Summarised 50 messages into 5");
    expect(event.beforeTokenEstimate).toBe(8000);
    expect(event.afterTokenEstimate).toBe(2000);
  });

  it("pushes error event", async () => {
    const error = new Error("Network timeout");
    await eventBus.emit("error", {
      error,
      code: "NETWORK_TIMEOUT",
      retryable: true,
    });

    expect(store.size).toBe(1);

    const event = store.getAll()[0] as ErrorActivityEvent;
    expect(event.kind).toBe("error");
    expect(event.error.message).toBe("Network timeout");
    expect(event.code).toBe("NETWORK_TIMEOUT");
    expect(event.retryable).toBe(true);
  });

  it("pushes done event with totalTokensUsed", async () => {
    await eventBus.emit("done", {
      usage: makeUsage({ totalTokens: 1500 }),
      finishReason: "stop",
    });

    expect(store.size).toBe(1);

    const event = store.getAll()[0] as DoneActivityEvent;
    expect(event.kind).toBe("done");
    expect(event.totalTokensUsed).toBe(1500);
    expect(event.finishReason).toBe("stop");
  });

  it("pushes aborted event", async () => {
    await eventBus.emit("aborted", {
      reason: "User pressed Ctrl+C",
      initiatedBy: "user",
    });

    expect(store.size).toBe(1);

    const event = store.getAll()[0] as AbortedActivityEvent;
    expect(event.kind).toBe("aborted");
    expect(event.reason).toBe("User pressed Ctrl+C");
    expect(event.initiatedBy).toBe("user");
  });

  it("pushes child_agent_event", async () => {
    await eventBus.emit("child_agent_event", {
      childId: "agent-42",
      eventType: "done",
      payload: { result: "sub-task complete" },
    });

    expect(store.size).toBe(1);

    const event = store.getAll()[0] as ChildAgentActivityEvent;
    expect(event.kind).toBe("child_agent");
    expect(event.childId).toBe("agent-42");
    expect(event.eventType).toBe("done");
    expect(event.payload).toEqual({ result: "sub-task complete" });
  });

  it("ignores tool_call_end for untracked tool calls", async () => {
    const result = makeToolResult({ callId: "unknown-tc" });
    await eventBus.emit("tool_call_end", { result });

    expect(store.size).toBe(0);
  });

  it("handles full tool call lifecycle with stats", async () => {
    const toolCall = makeToolCall({ id: "tc-lifecycle" });
    await eventBus.emit("tool_call_start", { toolCall });

    const result = makeToolResult({
      callId: "tc-lifecycle",
      name: "readFile",
      result: "data",
    });
    await eventBus.emit("tool_call_end", { result });

    await eventBus.emit("done", {
      usage: makeUsage({ totalTokens: 300 }),
      finishReason: "stop",
    });

    expect(store.size).toBe(2);

    const stats = store.getStats();
    expect(stats.totalToolCalls).toBe(1);
    expect(stats.totalTokensUsed).toBe(300);
    expect(stats.totalWallMs).toBeGreaterThanOrEqual(0);
  });

  it("cleans up subscriptions on unmount", async () => {
    // Call all unsubscribe functions (simulating useEffect cleanup)
    for (const unsub of unsubscribes) {
      unsub();
    }
    toolCallMap.clear();

    // Emit events after cleanup — store should remain empty
    await eventBus.emit("tool_call_start", {
      toolCall: makeToolCall({ id: "after-cleanup" }),
    });
    await eventBus.emit("compaction", {
      summary: "test",
      beforeTokenEstimate: 100,
      afterTokenEstimate: 50,
    });
    await eventBus.emit("done", {
      usage: makeUsage(),
      finishReason: "stop",
    });
    await eventBus.emit("error", {
      error: new Error("test"),
    });
    await eventBus.emit("aborted", {
      initiatedBy: "system",
    });
    await eventBus.emit("child_agent_event", {
      childId: "c1",
      eventType: "done",
      payload: {},
    });

    expect(store.size).toBe(0);
  });

  it("correlates multiple concurrent tool calls independently", async () => {
    const tc1 = makeToolCall({ id: "tc-a", name: "bash" });
    const tc2 = makeToolCall({ id: "tc-b", name: "grep" });

    await eventBus.emit("tool_call_start", { toolCall: tc1 });
    await eventBus.emit("tool_call_start", { toolCall: tc2 });

    expect(store.size).toBe(2);

    // Complete tc-b first (out of order)
    await eventBus.emit("tool_call_end", {
      result: makeToolResult({ callId: "tc-b", name: "grep", result: "found" }),
    });

    // Complete tc-a second
    await eventBus.emit("tool_call_end", {
      result: makeToolResult({ callId: "tc-a", name: "bash", result: "ok" }),
    });

    expect(store.size).toBe(2);

    const events = store.getAll();
    const tcA = events.find(
      (e) => e.kind === "tool_call" && (e as ToolCallActivityEvent).toolCallId === "tc-a",
    ) as ToolCallActivityEvent;
    const tcB = events.find(
      (e) => e.kind === "tool_call" && (e as ToolCallActivityEvent).toolCallId === "tc-b",
    ) as ToolCallActivityEvent;

    expect(tcA.status).toBe("success");
    expect(tcA.result).toBe("ok");
    expect(tcB.status).toBe("success");
    expect(tcB.result).toBe("found");
  });
});
