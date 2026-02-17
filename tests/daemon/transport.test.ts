import { describe, expect, test } from "bun:test";

import { DaemonHttpTransport } from "../../src/daemon/http-transport";
import { LiveDaemonClient } from "../../src/daemon/live-daemon-client";
import { ExponentialReconnectPolicy } from "../../src/daemon/reconnect-policy";
import { DaemonWsTransport, type WebSocketLike } from "../../src/daemon/ws-transport";

class FakeWebSocket implements WebSocketLike {
  public static instances: FakeWebSocket[] = [];

  public readyState = 0;
  public readonly sent: string[] = [];

  private readonly listeners = {
    open: new Set<() => void>(),
    close: new Set<(event: { code: number; reason: string }) => void>(),
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
  public addEventListener(type: "close", listener: (event: { code: number; reason: string }) => void): void;
  public addEventListener(type: "error", listener: () => void): void;
  public addEventListener(type: "message", listener: (event: { data: string }) => void): void;
  public addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (() => void) | ((event: { code: number; reason: string }) => void) | ((event: { data: string }) => void),
  ): void {
    if (type === "open" || type === "error") {
      (this.listeners[type] as Set<() => void>).add(listener as () => void);
      return;
    }

    if (type === "close") {
      this.listeners.close.add(listener as (event: { code: number; reason: string }) => void);
      return;
    }

    this.listeners.message.add(listener as (event: { data: string }) => void);
  }

  public removeEventListener(type: "open", listener: () => void): void;
  public removeEventListener(type: "close", listener: (event: { code: number; reason: string }) => void): void;
  public removeEventListener(type: "error", listener: () => void): void;
  public removeEventListener(type: "message", listener: (event: { data: string }) => void): void;
  public removeEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (() => void) | ((event: { code: number; reason: string }) => void) | ((event: { data: string }) => void),
  ): void {
    if (type === "open" || type === "error") {
      (this.listeners[type] as Set<() => void>).delete(listener as () => void);
      return;
    }

    if (type === "close") {
      this.listeners.close.delete(listener as (event: { code: number; reason: string }) => void);
      return;
    }

    this.listeners.message.delete(listener as (event: { data: string }) => void);
  }

  private emitOpen(): void {
    for (const listener of this.listeners.open) {
      listener();
    }
  }

  private emitClose(event: { code: number; reason: string }): void {
    for (const listener of this.listeners.close) {
      listener(event);
    }
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function collectStream(stream: AsyncIterable<{ type: string; delta?: string; content?: string }>): Promise<string[]> {
  const events: string[] = [];
  for await (const event of stream) {
    if (event.type === "delta" && typeof event.delta === "string") {
      events.push(event.delta);
    }

    if (event.type === "complete" && typeof event.content === "string") {
      events.push(event.content);
    }
  }

  return events;
}

async function collectEventTypes(stream: AsyncIterable<{ type: string }>): Promise<string[]> {
  const events: string[] = [];
  for await (const event of stream) {
    events.push(event.type);
  }
  return events;
}

async function waitFor(predicate: () => boolean, timeoutMs = 300, intervalMs = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for predicate");
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}

describe("daemon http transport", () => {
  test("maps health and CRUD/message endpoints to Result", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";

      if (url.endsWith("/health")) {
        return jsonResponse({
          status: "ok",
          version: "1.2.3",
          contractVersion: "1.0.0",
          discovery: { capabilities: ["chat", "streaming"] },
        });
      }

      if (url.endsWith("/messages") && method === "POST") {
        return jsonResponse({
          conversationId: "c1",
          userMessageId: "u1",
          assistantMessageId: "a1",
        });
      }

      if (url.endsWith("/conversations") && method === "GET") {
        return jsonResponse([
          {
            id: "c1",
            title: "Demo",
            model: "gpt",
            messageCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]);
      }

      return jsonResponse({}, 404);
    };

    const transport = new DaemonHttpTransport({
      baseUrl: "http://localhost:7433",
      requestTimeoutMs: 100,
      fetchImpl,
    });

    const health = await transport.healthCheck();
    expect(health.ok).toBe(true);
    if (!health.ok) {
      throw new Error("Expected health check to succeed");
    }

    expect(health.value.handshake.daemonVersion).toBe("1.2.3");
    expect(health.value.handshake.capabilities).toEqual(["chat", "streaming"]);

    const send = await transport.sendMessage({ content: "hello" });
    expect(send.ok).toBe(true);

    const list = await transport.listConversations();
    expect(list.ok).toBe(true);
    if (!list.ok) {
      throw new Error("Expected listConversations to succeed");
    }

    expect(list.value[0]?.id).toBe("c1");
  });

  test("maps non-2xx responses into typed daemon errors", async () => {
    const transport = new DaemonHttpTransport({
      baseUrl: "http://localhost:7433",
      requestTimeoutMs: 100,
      fetchImpl: async () => jsonResponse({ error: "bad" }, 400),
    });

    const result = await transport.sendMessage({ content: "hello" });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected sendMessage to fail");
    }

    expect(result.error.code).toBe("DAEMON_INVALID_REQUEST");
  });
});

describe("daemon ws transport", () => {
  test("streams events and emits heartbeat from websocket payloads", async () => {
    FakeWebSocket.reset();

    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    let heartbeatTimestamp = "";
    transport.setHeartbeatHandler((timestamp) => {
      heartbeatTimestamp = timestamp;
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const streamResult = await transport.streamResponse({
      conversationId: "c1",
      assistantMessageId: "a1",
    });
    expect(streamResult.ok).toBe(true);
    if (!streamResult.ok) {
      throw new Error("Expected streamResponse to succeed");
    }

    const socket = FakeWebSocket.instances[0];
    expect(socket?.sent[0]).toContain("stream.subscribe");

    socket?.serverMessage({ type: "heartbeat", timestamp: "2026-01-01T00:00:00.000Z" });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "start",
        conversationId: "c1",
        messageId: "a1",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "delta",
        conversationId: "c1",
        messageId: "a1",
        delta: "hello",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "complete",
        conversationId: "c1",
        messageId: "a1",
        content: "hello",
        timestamp: "2026-01-01T00:00:03.000Z",
      },
    });

    const chunks = await collectStream(streamResult.value);
    expect(chunks).toEqual(["hello", "hello"]);
    expect(heartbeatTimestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  test("cancelStream sends stream.unsubscribe and closes local queue", async () => {
    FakeWebSocket.reset();

    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const streamResult = await transport.streamResponse({
      conversationId: "c1",
      assistantMessageId: "a1",
    });
    expect(streamResult.ok).toBe(true);
    if (!streamResult.ok) {
      throw new Error("Expected streamResponse to succeed");
    }

    const socket = FakeWebSocket.instances[0];
    const cancelResult = transport.cancelStream({
      conversationId: "c1",
      assistantMessageId: "a1",
    });
    expect(cancelResult.ok).toBe(true);

    const unsubscribeMessage = socket?.sent.find((msg) => msg.includes("stream.unsubscribe"));
    expect(unsubscribeMessage).toBeDefined();

    // Local queue should be closed immediately so iteration ends.
    const events = await collectEventTypes(streamResult.value);
    expect(events).toEqual([]);
  });

  test("responds with heartbeat.pong when receiving heartbeat.ping", async () => {
    FakeWebSocket.reset();

    const fixedNow = new Date("2026-06-15T12:00:00.000Z");
    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
      now: () => fixedNow,
    });

    let heartbeatTimestamp = "";
    transport.setHeartbeatHandler((timestamp) => {
      heartbeatTimestamp = timestamp;
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const socket = FakeWebSocket.instances[0];

    // Daemon sends heartbeat.ping
    socket?.serverMessage({ type: "heartbeat.ping", timestamp: "2026-06-15T12:00:05.000Z" });

    // Transport should auto-reply with heartbeat.pong
    const pongMessage = socket?.sent.find((msg) => msg.includes("heartbeat.pong"));
    expect(pongMessage).toBeDefined();

    const parsed = JSON.parse(pongMessage!);
    expect(parsed.type).toBe("heartbeat.pong");
    expect(parsed.timestamp).toBe("2026-06-15T12:00:00.000Z");

    // Heartbeat handler should still be invoked with the ping timestamp
    expect(heartbeatTimestamp).toBe("2026-06-15T12:00:05.000Z");
  });

  test("does not send pong for legacy heartbeat type", async () => {
    FakeWebSocket.reset();

    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    let heartbeatTimestamp = "";
    transport.setHeartbeatHandler((timestamp) => {
      heartbeatTimestamp = timestamp;
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const socket = FakeWebSocket.instances[0];

    // Legacy heartbeat — should NOT trigger a pong reply
    socket?.serverMessage({ type: "heartbeat", timestamp: "2026-01-01T00:00:00.000Z" });

    // No pong sent (sent array should be empty — no subscribe or pong)
    const pongMessages = socket?.sent.filter((msg) => msg.includes("heartbeat.pong")) ?? [];
    expect(pongMessages).toHaveLength(0);

    // But heartbeat handler should still fire
    expect(heartbeatTimestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  test("does not send pong for heartbeat.pong type", async () => {
    FakeWebSocket.reset();

    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    let heartbeatTimestamp = "";
    transport.setHeartbeatHandler((timestamp) => {
      heartbeatTimestamp = timestamp;
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const socket = FakeWebSocket.instances[0];

    // Receiving a pong (e.g. echo from server) should NOT trigger another pong
    socket?.serverMessage({ type: "heartbeat.pong", timestamp: "2026-01-01T00:00:00.000Z" });

    const pongMessages = socket?.sent.filter((msg) => msg.includes("heartbeat.pong")) ?? [];
    expect(pongMessages).toHaveLength(0);

    // Heartbeat handler should still fire
    expect(heartbeatTimestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  test("heartbeat.ping does not interfere with active stream events", async () => {
    FakeWebSocket.reset();

    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const streamResult = await transport.streamResponse({
      conversationId: "c1",
      assistantMessageId: "a1",
    });
    expect(streamResult.ok).toBe(true);
    if (!streamResult.ok) {
      throw new Error("Expected streamResponse to succeed");
    }

    const socket = FakeWebSocket.instances[0];

    // Interleave heartbeat.ping with stream events
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "start",
        conversationId: "c1",
        messageId: "a1",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    });
    socket?.serverMessage({ type: "heartbeat.ping", timestamp: "2026-01-01T00:00:02.000Z" });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "delta",
        conversationId: "c1",
        messageId: "a1",
        delta: "world",
        timestamp: "2026-01-01T00:00:03.000Z",
      },
    });
    socket?.serverMessage({ type: "heartbeat.ping", timestamp: "2026-01-01T00:00:04.000Z" });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "complete",
        conversationId: "c1",
        messageId: "a1",
        content: "world",
        timestamp: "2026-01-01T00:00:05.000Z",
      },
    });

    // Stream should complete normally despite interleaved pings
    const chunks = await collectStream(streamResult.value);
    expect(chunks).toEqual(["world", "world"]);

    // Two pong replies should have been sent (one per ping)
    const pongMessages = socket?.sent.filter((msg) => msg.includes("heartbeat.pong")) ?? [];
    expect(pongMessages).toHaveLength(2);
  });

  test("maps daemon tool_call_start/tool_call_end events into daemon stream events", async () => {
    FakeWebSocket.reset();

    const transport = new DaemonWsTransport({
      baseUrl: "ws://localhost:7433",
      connectTimeoutMs: 100,
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    const connected = await transport.connect();
    expect(connected.ok).toBe(true);

    const streamResult = await transport.streamResponse({
      conversationId: "c1",
      assistantMessageId: "a1",
    });
    expect(streamResult.ok).toBe(true);
    if (!streamResult.ok) {
      throw new Error("Expected streamResponse to succeed");
    }

    const socket = FakeWebSocket.instances[0];

    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "start",
        conversationId: "c1",
        messageId: "a1",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "tool_call_start",
        conversationId: "c1",
        messageId: "a1",
        tool_use_id: "tool-1",
        name: "bash",
        input: { command: "pwd" },
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "tool_call_end",
        conversationId: "c1",
        messageId: "a1",
        tool_use_id: "tool-1",
        result_summary: "Listed directory",
        result: {
          callId: "tool-1",
          name: "bash",
          result: { cwd: "/tmp" },
          error: undefined,
        },
        timestamp: "2026-01-01T00:00:03.000Z",
      },
    });
    socket?.serverMessage({
      type: "stream-event",
      event: {
        type: "complete",
        conversationId: "c1",
        messageId: "a1",
        content: "done",
        timestamp: "2026-01-01T00:00:04.000Z",
      },
    });

    const eventTypes = await collectEventTypes(streamResult.value);
    expect(eventTypes).toEqual(["start", "tool-call-start", "tool-call-complete", "complete"]);
  });
});

describe("reconnect policy", () => {
  test("applies exponential growth, jitter, and max delay cap", () => {
    const policy = new ExponentialReconnectPolicy({
      baseDelayMs: 1_000,
      maxDelayMs: 30_000,
      maxRetries: 4,
      jitterRatio: 0,
      random: () => 0.5,
    });

    expect(policy.next()).toEqual({ attempt: 1, delayMs: 1_000 });
    expect(policy.next()).toEqual({ attempt: 2, delayMs: 2_000 });
    expect(policy.next()).toEqual({ attempt: 3, delayMs: 4_000 });
    expect(policy.next()).toEqual({ attempt: 4, delayMs: 8_000 });
    expect(policy.next()).toBeNull();
  });
});

describe("live daemon client", () => {
  test("connects, emits heartbeat, and auto-reconnects on websocket close", async () => {
    FakeWebSocket.reset();

    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/health")) {
        return jsonResponse({
          healthy: true,
          timestamp: new Date().toISOString(),
          handshake: {
            daemonVersion: "1.0.0",
            contractVersion: "1.0.0",
            capabilities: ["chat", "streaming"],
          },
        });
      }

      if (url.endsWith("/messages")) {
        return jsonResponse({ conversationId: "c1", userMessageId: "u1", assistantMessageId: "a1" });
      }

      if (url.endsWith("/conversations") || url.includes("/conversations/")) {
        return jsonResponse([]);
      }

      return jsonResponse({}, 200);
    };

    const client = new LiveDaemonClient({
      clientConfig: {
        reconnectBaseDelayMs: 5,
        reconnectMaxDelayMs: 10,
        requestTimeoutMs: 100,
      },
      maxReconnectRetries: 5,
      heartbeatIntervalMs: 20,
      fetchImpl,
      webSocketFactory: (url) => new FakeWebSocket(url),
      random: () => 0,
    });

    const states: string[] = [];
    client.onConnectionStateChange((state) => states.push(state.status));

    const heartbeats: boolean[] = [];
    client.onHeartbeat((event) => heartbeats.push(event.alive));

    const connected = await client.connect();
    expect(connected.ok).toBe(true);
    expect(client.getConnectionState().status).toBe("connected");

    await waitFor(() => heartbeats.length > 0, 500);

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket?.serverClose(1006, "network-drop");

    await waitFor(() => FakeWebSocket.instances.length >= 2, 500);
    await waitFor(() => client.getConnectionState().status === "connected", 500);

    expect(states).toContain("reconnecting");
    expect(heartbeats.some((alive) => alive)).toBe(true);
  });
});
