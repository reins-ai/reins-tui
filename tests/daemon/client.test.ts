import { describe, expect, test } from "bun:test";

import type { DaemonClient } from "../../src/daemon/client";
import { MockDaemonClient } from "../../src/daemon/mock-daemon";

async function collectStream(stream: AsyncIterable<{ type: string; delta?: string; content?: string }>): Promise<{
  deltas: string[];
  completed: string;
}> {
  const deltas: string[] = [];
  let completed = "";

  for await (const event of stream) {
    if (event.type === "delta" && typeof event.delta === "string") {
      deltas.push(event.delta);
    }

    if (event.type === "complete" && typeof event.content === "string") {
      completed = event.content;
    }
  }

  return { deltas, completed };
}

function buildClient(overrides: ConstructorParameters<typeof MockDaemonClient>[0] = {}): MockDaemonClient {
  return new MockDaemonClient({
    fixtures: {
      responseChunks: ["Deterministic", " stream", " output."],
      handshake: {
        daemonVersion: "0.2.0",
        contractVersion: "1.0.0",
        capabilities: ["health", "chat", "streaming", "conversations"],
      },
    },
    ...overrides,
  });
}

describe("daemon client contract", () => {
  test("connect/disconnect lifecycle updates connection state", async () => {
    const client: DaemonClient = buildClient();

    expect(client.getConnectionState().status).toBe("disconnected");

    const transitions: string[] = [];
    const unsubscribe = client.onConnectionStateChange((state) => {
      transitions.push(state.status);
    });

    const connectResult = await client.connect();
    expect(connectResult.ok).toBe(true);
    expect(client.getConnectionState().status).toBe("connected");

    const disconnectResult = await client.disconnect();
    expect(disconnectResult.ok).toBe(true);
    expect(client.getConnectionState().status).toBe("disconnected");

    unsubscribe();

    expect(transitions).toEqual(["connecting", "connected", "disconnected"]);
  });

  test("send message and stream deterministic assistant chunks", async () => {
    const client: DaemonClient = buildClient();
    const connected = await client.connect();
    expect(connected.ok).toBe(true);

    const send = await client.sendMessage({ content: "hello" });
    expect(send.ok).toBe(true);
    if (!send.ok) {
      throw new Error("Expected sendMessage to succeed");
    }

    const streamResult = await client.streamResponse({
      conversationId: send.value.conversationId,
      assistantMessageId: send.value.assistantMessageId,
    });
    expect(streamResult.ok).toBe(true);
    if (!streamResult.ok) {
      throw new Error("Expected streamResponse to succeed");
    }

    const streamed = await collectStream(streamResult.value);
    expect(streamed.deltas).toEqual(["Deterministic", " stream", " output."]);
    expect(streamed.completed).toBe("Deterministic stream output.");

    const conversation = await client.getConversation(send.value.conversationId);
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) {
      throw new Error("Expected getConversation to succeed");
    }

    const assistant = conversation.value.messages.find((message) => message.id === send.value.assistantMessageId);
    expect(assistant?.content).toBe("Deterministic stream output.");
  });

  test("health check returns versioned handshake", async () => {
    const client: DaemonClient = buildClient();
    const connect = await client.connect();
    expect(connect.ok).toBe(true);

    const health = await client.healthCheck();
    expect(health.ok).toBe(true);
    if (!health.ok) {
      throw new Error("Expected healthCheck to succeed");
    }

    expect(health.value.healthy).toBe(true);
    expect(health.value.handshake.contractVersion).toBe("1.0.0");
    expect(health.value.handshake.capabilities).toContain("streaming");
  });

  test("graceful degradation surfaces retryable unavailable state", async () => {
    const client = buildClient({ daemonAvailable: false });

    const connect = await client.connect();
    expect(connect.ok).toBe(false);
    if (connect.ok) {
      throw new Error("Expected connect to fail while daemon is unavailable");
    }

    expect(connect.error.code).toBe("DAEMON_UNAVAILABLE");
    expect(connect.error.retryable).toBe(true);
    expect(connect.error.fallbackHint).toContain("offline");
    expect(client.getConnectionState().status).toBe("disconnected");

    const health = await client.healthCheck();
    expect(health.ok).toBe(false);
    if (health.ok) {
      throw new Error("Expected healthCheck to fail while daemon is unavailable");
    }

    expect(health.error.code).toBe("DAEMON_UNAVAILABLE");
  });

  test("reconnect recovers after transient connection failure", async () => {
    const client = buildClient({
      failures: {
        connectFailuresBeforeSuccess: 1,
      },
    });

    const firstConnect = await client.connect();
    expect(firstConnect.ok).toBe(false);

    const reconnect = await client.reconnect();
    expect(reconnect.ok).toBe(true);
    expect(client.getConnectionState().status).toBe("connected");
    expect(client.getConnectionState().retries).toBe(1);
  });

  test("conversation CRUD works through the same client contract", async () => {
    const client: DaemonClient = buildClient();
    const connect = await client.connect();
    expect(connect.ok).toBe(true);

    const created = await client.createConversation({ title: "Alpha", model: "test-model" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("Expected createConversation to succeed");
    }

    const listed = await client.listConversations();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      throw new Error("Expected listConversations to succeed");
    }

    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]?.title).toBe("Alpha");

    const updated = await client.updateConversation(created.value.id, { title: "Renamed" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      throw new Error("Expected updateConversation to succeed");
    }
    expect(updated.value.title).toBe("Renamed");

    const deleted = await client.deleteConversation(created.value.id);
    expect(deleted.ok).toBe(true);

    const afterDelete = await client.listConversations();
    expect(afterDelete.ok).toBe(true);
    if (!afterDelete.ok) {
      throw new Error("Expected listConversations to succeed after delete");
    }

    expect(afterDelete.value).toHaveLength(0);
  });
});
