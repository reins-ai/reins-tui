import { describe, expect, test } from "bun:test";

import { BREATHING_CURSOR_NARROW, BREATHING_CURSOR_WIDE, STREAMING_CURSOR, resolveCursorForStatus } from "../../src/components/streaming-text";
import { MockDaemonClient } from "../../src/daemon/mock-daemon";
import { createConversationStore } from "../../src/state/conversation-store";

function createNow(seed = "2026-02-11T00:00:00.000Z", stepMs = 25): () => Date {
  const start = new Date(seed).getTime();
  let tick = 0;
  return () => {
    const value = new Date(start + tick * stepMs);
    tick += 1;
    return value;
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000, intervalMs = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}

async function collectAssistantContent(client: MockDaemonClient, conversationId: string, assistantMessageId: string): Promise<string> {
  const streamResult = await client.streamResponse({ conversationId, assistantMessageId });
  if (!streamResult.ok) {
    throw new Error(`Expected stream to succeed: ${streamResult.error.code}`);
  }

  let content = "";
  for await (const event of streamResult.value) {
    if (event.type === "delta") {
      content += event.delta;
    }
    if (event.type === "complete") {
      content = event.content;
    }
  }

  return content;
}

describe("daemon live integration", () => {
  test("connects and executes full send -> stream -> complete -> idle lifecycle", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({
      now,
      fixtures: { responseChunks: ["Hello", " from", " daemon"] },
      operation: { streamChunkDelayMs: 1 },
    });

    const connectionStates: string[] = [];
    daemon.onConnectionStateChange((state) => {
      connectionStates.push(state.status);
    });

    const connectResult = await daemon.connect();
    expect(connectResult.ok).toBe(true);
    expect(daemon.getConnectionState().status).toBe("connected");
    expect(connectionStates).toContain("connecting");
    expect(connectionStates).toContain("connected");

    const store = createConversationStore({
      daemonClient: daemon,
      now,
      completeDisplayMs: 5,
    });

    const streamingStates: string[] = [];
    store.subscribe((state) => {
      streamingStates.push(state.streaming.status);
    });

    const sendResult = await store.sendUserMessage({ content: "Hi there" });
    expect(sendResult.ok).toBe(true);

    await waitFor(() => store.getState().streaming.status === "idle");

    const snapshot = store.getState();
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0]?.role).toBe("user");
    expect(snapshot.messages[0]?.content).toBe("Hi there");
    expect(snapshot.messages[1]?.role).toBe("assistant");
    expect(snapshot.messages[1]?.content).toBe("Hello from daemon");

    expect(streamingStates).toContain("sending");
    expect(streamingStates).toContain("thinking");
    expect(streamingStates).toContain("streaming");
    expect(streamingStates).toContain("complete");
    expect(streamingStates.at(-1)).toBe("idle");
  });

  test("supports sequential messages without lifecycle corruption", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({
      now,
      fixtures: { responseChunks: ["A", "B"] },
      operation: { streamChunkDelayMs: 1 },
    });

    await daemon.connect();

    const store = createConversationStore({
      daemonClient: daemon,
      now,
      completeDisplayMs: 5,
    });

    const first = await store.sendUserMessage({ content: "First" });
    expect(first.ok).toBe(true);
    await waitFor(() => store.getState().streaming.status === "idle");

    const conversationId = store.getState().conversationId;
    expect(conversationId).toBeString();

    const second = await store.sendUserMessage({
      conversationId: conversationId ?? undefined,
      content: "Second",
    });
    expect(second.ok).toBe(true);
    await waitFor(() => store.getState().streaming.status === "idle");

    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(4);
    expect(finalState.messages[0]?.content).toBe("First");
    expect(finalState.messages[1]?.content).toBe("AB");
    expect(finalState.messages[2]?.content).toBe("Second");
    expect(finalState.messages[3]?.content).toBe("AB");
  });

  test("preserves cursor behavior for thinking, streaming, and complete states", () => {
    expect(resolveCursorForStatus("thinking", true)).toBe(BREATHING_CURSOR_WIDE);
    expect(resolveCursorForStatus("thinking", false)).toBe(BREATHING_CURSOR_NARROW);
    expect(resolveCursorForStatus("streaming", true)).toBe(STREAMING_CURSOR);
    expect(resolveCursorForStatus("streaming", false)).toBe(STREAMING_CURSOR);
    expect(resolveCursorForStatus("complete", true)).toBeNull();
  });

  test("handles concurrent stream consumption without cross-message corruption", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({
      now,
      fixtures: { responseChunks: ["One", " + ", "Two"] },
      operation: { operationDelayMs: 0, streamChunkDelayMs: 1 },
    });

    await daemon.connect();

    const firstSend = await daemon.sendMessage({ content: "alpha" });
    const secondSend = await daemon.sendMessage({
      conversationId: firstSend.ok ? firstSend.value.conversationId : undefined,
      content: "beta",
    });

    expect(firstSend.ok).toBe(true);
    expect(secondSend.ok).toBe(true);
    if (!firstSend.ok || !secondSend.ok) {
      return;
    }

    const [firstContent, secondContent] = await Promise.all([
      collectAssistantContent(daemon, firstSend.value.conversationId, firstSend.value.assistantMessageId),
      collectAssistantContent(daemon, secondSend.value.conversationId, secondSend.value.assistantMessageId),
    ]);

    expect(firstContent).toBe("One + Two");
    expect(secondContent).toBe("One + Two");

    const conversation = await daemon.getConversation(firstSend.value.conversationId);
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) {
      return;
    }

    const userContents = conversation.value.messages.filter((message) => message.role === "user").map((message) => message.content);
    expect(userContents).toEqual(["alpha", "beta"]);

    const assistantMessages = conversation.value.messages.filter((message) => message.role === "assistant");
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages.every((message) => message.content === "One + Two")).toBe(true);
  });

  test("preserves message ordering in sequential store usage", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({
      now,
      fixtures: { responseChunks: ["ok"] },
      operation: { streamChunkDelayMs: 1 },
    });

    await daemon.connect();
    const store = createConversationStore({ daemonClient: daemon, now, completeDisplayMs: 5 });

    for (const content of ["m1", "m2", "m3"]) {
      const result = await store.sendUserMessage({
        conversationId: store.getState().conversationId ?? undefined,
        content,
      });
      expect(result.ok).toBe(true);
      await waitFor(() => store.getState().streaming.status === "idle");
    }

    const orderedUsers = store
      .getState()
      .messages
      .filter((message) => message.role === "user")
      .map((message) => message.content);

    expect(orderedUsers).toEqual(["m1", "m2", "m3"]);
  });
});
