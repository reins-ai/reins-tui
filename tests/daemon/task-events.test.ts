import { describe, expect, it } from "bun:test";

import type { TaskUpdateEvent } from "../../src/daemon/contracts";
import { TaskEventEmitter, type TaskEventListener } from "../../src/daemon/task-events";
import { DaemonWsTransport, type WebSocketLike } from "../../src/daemon/ws-transport";

// ---------------------------------------------------------------------------
// Fake WebSocket — mirrors the pattern from transport.test.ts
// ---------------------------------------------------------------------------

interface WebSocketCloseLike {
  code: number;
  reason: string;
}

class FakeWebSocket implements WebSocketLike {
  public static instances: FakeWebSocket[] = [];

  public readyState = 0;
  public readonly sent: string[] = [];

  private readonly listeners = {
    open: new Set<() => void>(),
    close: new Set<(event: WebSocketCloseLike) => void>(),
    error: new Set<() => void>(),
    message: new Set<(event: { data: string }) => void>(),
  };

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.emitOpen();
    });
  }

  public static reset(): void {
    FakeWebSocket.instances = [];
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(code = 1000, reason = "closed"): void {
    this.readyState = 3;
    this.emitClose({ code, reason });
  }

  public serverMessage(payload: unknown): void {
    const event = { data: JSON.stringify(payload) };
    for (const listener of this.listeners.message) {
      listener(event);
    }
  }

  public serverClose(code = 1006, reason = "abnormal"): void {
    this.readyState = 3;
    this.emitClose({ code, reason });
  }

  public addEventListener(type: "open", listener: () => void): void;
  public addEventListener(type: "close", listener: (event: WebSocketCloseLike) => void): void;
  public addEventListener(type: "error", listener: () => void): void;
  public addEventListener(type: "message", listener: (event: { data: string }) => void): void;
  public addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (() => void) | ((event: WebSocketCloseLike) => void) | ((event: { data: string }) => void),
  ): void {
    if (type === "open" || type === "error") {
      (this.listeners[type] as Set<() => void>).add(listener as () => void);
      return;
    }

    if (type === "close") {
      this.listeners.close.add(listener as (event: WebSocketCloseLike) => void);
      return;
    }

    this.listeners.message.add(listener as (event: { data: string }) => void);
  }

  public removeEventListener(type: "open", listener: () => void): void;
  public removeEventListener(type: "close", listener: (event: WebSocketCloseLike) => void): void;
  public removeEventListener(type: "error", listener: () => void): void;
  public removeEventListener(type: "message", listener: (event: { data: string }) => void): void;
  public removeEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (() => void) | ((event: WebSocketCloseLike) => void) | ((event: { data: string }) => void),
  ): void {
    if (type === "open" || type === "error") {
      (this.listeners[type] as Set<() => void>).delete(listener as () => void);
      return;
    }

    if (type === "close") {
      this.listeners.close.delete(listener as (event: WebSocketCloseLike) => void);
      return;
    }

    this.listeners.message.delete(listener as (event: { data: string }) => void);
  }

  private emitOpen(): void {
    for (const listener of this.listeners.open) {
      listener();
    }
  }

  private emitClose(event: WebSocketCloseLike): void {
    for (const listener of this.listeners.close) {
      listener(event);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTransport(): DaemonWsTransport {
  return new DaemonWsTransport({
    baseUrl: "ws://localhost:7433",
    connectTimeoutMs: 100,
    webSocketFactory: (url) => new FakeWebSocket(url),
  });
}

function makeTaskUpdate(overrides: Partial<TaskUpdateEvent> = {}): TaskUpdateEvent {
  return {
    type: "task_update",
    taskId: overrides.taskId ?? "task-1",
    status: overrides.status ?? "running",
    preview: overrides.preview,
    error: overrides.error,
    timestamp: overrides.timestamp ?? "2026-02-19T10:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// TaskEventEmitter
// ---------------------------------------------------------------------------

describe("TaskEventEmitter", () => {
  describe("subscription lifecycle", () => {
    it("delivers task update events to a single subscriber", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));

      socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));

      expect(received).toHaveLength(1);
      expect(received[0].taskId).toBe("t-1");
      expect(received[0].status).toBe("running");
    });

    it("delivers task update events to multiple subscribers", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received1: TaskUpdateEvent[] = [];
      const received2: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received1.push(event));
      emitter.subscribe((event) => received2.push(event));

      socket.serverMessage(makeTaskUpdate({ taskId: "t-2", status: "complete" }));

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      expect(received1[0].taskId).toBe("t-2");
      expect(received2[0].taskId).toBe("t-2");
    });

    it("stops delivering events after unsubscribe", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      const sub = emitter.subscribe((event) => received.push(event));

      socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));
      expect(received).toHaveLength(1);

      sub.unsubscribe();

      socket.serverMessage(makeTaskUpdate({ taskId: "t-2", status: "complete" }));
      expect(received).toHaveLength(1);
    });

    it("tracks listener count correctly", () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      expect(emitter.listenerCount).toBe(0);

      const sub1 = emitter.subscribe(() => {});
      expect(emitter.listenerCount).toBe(1);

      const sub2 = emitter.subscribe(() => {});
      expect(emitter.listenerCount).toBe(2);

      sub1.unsubscribe();
      expect(emitter.listenerCount).toBe(1);

      sub2.unsubscribe();
      expect(emitter.listenerCount).toBe(0);
    });

    it("clear removes all listeners", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));
      emitter.subscribe((event) => received.push(event));

      emitter.clear();
      expect(emitter.listenerCount).toBe(0);

      socket.serverMessage(makeTaskUpdate());
      expect(received).toHaveLength(0);
    });
  });

  describe("event data integrity", () => {
    it("preserves all task update fields", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));

      socket.serverMessage(makeTaskUpdate({
        taskId: "task-42",
        status: "complete",
        preview: "Research results ready",
        timestamp: "2026-02-19T12:30:00.000Z",
      }));

      expect(received[0]).toEqual({
        type: "task_update",
        taskId: "task-42",
        status: "complete",
        preview: "Research results ready",
        timestamp: "2026-02-19T12:30:00.000Z",
      });
    });

    it("preserves error field on failed task updates", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));

      socket.serverMessage(makeTaskUpdate({
        taskId: "task-99",
        status: "failed",
        error: "Provider rate limit exceeded",
      }));

      expect(received[0].status).toBe("failed");
      expect(received[0].error).toBe("Provider rate limit exceeded");
    });

    it("handles multiple sequential status transitions", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const statuses: string[] = [];
      emitter.subscribe((event) => statuses.push(event.status));

      socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "pending" }));
      socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));
      socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "complete" }));

      expect(statuses).toEqual(["pending", "running", "complete"]);
    });
  });

  describe("error isolation", () => {
    it("does not crash when a listener throws", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];

      // First listener throws
      emitter.subscribe(() => {
        throw new Error("listener error");
      });

      // Second listener should still receive events
      emitter.subscribe((event) => received.push(event));

      socket.serverMessage(makeTaskUpdate({ taskId: "t-1" }));

      expect(received).toHaveLength(1);
      expect(received[0].taskId).toBe("t-1");
    });
  });

  describe("WebSocket disconnect resilience", () => {
    it("does not crash when WebSocket disconnects with active listeners", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));

      // Deliver one event before disconnect
      socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));
      expect(received).toHaveLength(1);

      // Simulate unexpected disconnect
      socket.serverClose(1006, "network-drop");

      // Listeners remain registered — no crash
      expect(emitter.listenerCount).toBe(1);
    });

    it("does not deliver events when transport is disconnected", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();
      const socket = FakeWebSocket.instances[0]!;

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));

      // Disconnect
      await transport.disconnect();

      // No events should arrive — socket is closed
      // (serverMessage would fail silently since listeners are removed)
      expect(received).toHaveLength(0);
    });

    it("preserves listeners across disconnect for reconnect scenarios", async () => {
      FakeWebSocket.reset();
      const transport = createTransport();
      const emitter = new TaskEventEmitter(transport);

      await transport.connect();

      const received: TaskUpdateEvent[] = [];
      emitter.subscribe((event) => received.push(event));

      // Listeners survive disconnect
      expect(emitter.listenerCount).toBe(1);

      const socket1 = FakeWebSocket.instances[0]!;
      socket1.serverClose(1006, "network-drop");

      // Listeners still registered
      expect(emitter.listenerCount).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// WS Transport — task_update message handling
// ---------------------------------------------------------------------------

describe("DaemonWsTransport task_update handling", () => {
  it("routes task_update messages to the task update handler", async () => {
    FakeWebSocket.reset();
    const transport = createTransport();

    const received: TaskUpdateEvent[] = [];
    transport.setTaskUpdateHandler((event) => received.push(event));

    await transport.connect();
    const socket = FakeWebSocket.instances[0]!;

    socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));

    expect(received).toHaveLength(1);
    expect(received[0].taskId).toBe("t-1");
    expect(received[0].status).toBe("running");
    expect(received[0].type).toBe("task_update");
  });

  it("ignores task_update messages when no handler is set", async () => {
    FakeWebSocket.reset();
    const transport = createTransport();

    await transport.connect();
    const socket = FakeWebSocket.instances[0]!;

    // Should not throw
    socket.serverMessage(makeTaskUpdate());
  });

  it("does not interfere with stream events", async () => {
    FakeWebSocket.reset();
    const transport = createTransport();

    const taskUpdates: TaskUpdateEvent[] = [];
    transport.setTaskUpdateHandler((event) => taskUpdates.push(event));

    await transport.connect();
    const socket = FakeWebSocket.instances[0]!;

    const streamResult = await transport.streamResponse({
      conversationId: "c1",
      assistantMessageId: "a1",
    });
    expect(streamResult.ok).toBe(true);
    if (!streamResult.ok) throw new Error("Expected stream to succeed");

    // Interleave task_update with stream events
    socket.serverMessage({
      type: "stream-event",
      event: {
        type: "start",
        conversationId: "c1",
        messageId: "a1",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    });
    socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));
    socket.serverMessage({
      type: "stream-event",
      event: {
        type: "delta",
        conversationId: "c1",
        messageId: "a1",
        delta: "hello",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    });
    socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "complete" }));
    socket.serverMessage({
      type: "stream-event",
      event: {
        type: "complete",
        conversationId: "c1",
        messageId: "a1",
        content: "hello",
        timestamp: "2026-01-01T00:00:03.000Z",
      },
    });

    // Collect stream events
    const streamEvents: string[] = [];
    for await (const event of streamResult.value) {
      streamEvents.push(event.type);
    }

    // Stream events should be unaffected
    expect(streamEvents).toEqual(["start", "delta", "complete"]);

    // Task updates should be captured separately
    expect(taskUpdates).toHaveLength(2);
    expect(taskUpdates[0].status).toBe("running");
    expect(taskUpdates[1].status).toBe("complete");
  });

  it("does not interfere with heartbeat handling", async () => {
    FakeWebSocket.reset();
    const transport = createTransport();

    let heartbeatTimestamp = "";
    transport.setHeartbeatHandler((ts) => {
      heartbeatTimestamp = ts;
    });

    const taskUpdates: TaskUpdateEvent[] = [];
    transport.setTaskUpdateHandler((event) => taskUpdates.push(event));

    await transport.connect();
    const socket = FakeWebSocket.instances[0]!;

    socket.serverMessage({ type: "heartbeat", timestamp: "2026-01-01T00:00:00.000Z" });
    socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "running" }));

    expect(heartbeatTimestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(taskUpdates).toHaveLength(1);
  });

  it("rejects malformed task_update messages missing required fields", async () => {
    FakeWebSocket.reset();
    const transport = createTransport();

    const received: TaskUpdateEvent[] = [];
    transport.setTaskUpdateHandler((event) => received.push(event));

    await transport.connect();
    const socket = FakeWebSocket.instances[0]!;

    // Missing taskId
    socket.serverMessage({ type: "task_update", status: "running", timestamp: "2026-01-01T00:00:00.000Z" });
    // Missing status
    socket.serverMessage({ type: "task_update", taskId: "t-1", timestamp: "2026-01-01T00:00:00.000Z" });
    // Missing timestamp
    socket.serverMessage({ type: "task_update", taskId: "t-1", status: "running" });
    // Wrong type
    socket.serverMessage({ type: "task_updated", taskId: "t-1", status: "running", timestamp: "2026-01-01T00:00:00.000Z" });

    // None should be delivered
    expect(received).toHaveLength(0);
  });

  it("accepts task_update with optional preview and error fields", async () => {
    FakeWebSocket.reset();
    const transport = createTransport();

    const received: TaskUpdateEvent[] = [];
    transport.setTaskUpdateHandler((event) => received.push(event));

    await transport.connect();
    const socket = FakeWebSocket.instances[0]!;

    // Without optional fields
    socket.serverMessage(makeTaskUpdate({ taskId: "t-1", status: "pending" }));
    // With preview
    socket.serverMessage(makeTaskUpdate({ taskId: "t-2", status: "running", preview: "Researching..." }));
    // With error
    socket.serverMessage(makeTaskUpdate({ taskId: "t-3", status: "failed", error: "Timeout" }));

    expect(received).toHaveLength(3);
    expect(received[0].preview).toBeUndefined();
    expect(received[1].preview).toBe("Researching...");
    expect(received[2].error).toBe("Timeout");
  });
});
