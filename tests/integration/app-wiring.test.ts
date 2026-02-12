import { describe, expect, test } from "bun:test";

import { getConnectionLabel } from "../../src/components/status-bar";
import { bootstrapDaemonClient } from "../../src/daemon/daemon-context";
import { MockDaemonClient } from "../../src/daemon/mock-daemon";
import { createConversationStore } from "../../src/state/conversation-store";

function createNow(seed = "2026-02-11T00:00:00.000Z", stepMs = 20): () => Date {
  const start = new Date(seed).getTime();
  let tick = 0;
  return () => {
    const value = new Date(start + tick * stepMs);
    tick += 1;
    return value;
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_500, intervalMs = 5): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}

class SpyMockDaemonClient extends MockDaemonClient {
  public sendCallCount = 0;

  public async sendMessage(request: Parameters<MockDaemonClient["sendMessage"]>[0]) {
    this.sendCallCount += 1;
    return super.sendMessage(request);
  }
}

describe("app wiring integration", () => {
  test("falls back to mock daemon when live daemon is unavailable", async () => {
    const now = createNow();
    const fallback = await bootstrapDaemonClient({
      createLiveClient: () => new MockDaemonClient({ daemonAvailable: false, now }),
      createMockClient: () => new MockDaemonClient({ daemonAvailable: true, now }),
    });

    expect(fallback.mode).toBe("mock");
    expect(fallback.connectionStatus).toBe("disconnected");
    expect(fallback.client.getConnectionState().status).toBe("connected");
  });

  test("message submission routes through daemon client", async () => {
    const now = createNow();
    const daemon = new SpyMockDaemonClient({ daemonAvailable: true, now });
    await daemon.connect();

    const store = createConversationStore({ daemonClient: daemon, now, completeDisplayMs: 5 });
    const sendResult = await store.sendUserMessage({ content: "Route through daemon" });

    expect(sendResult.ok).toBe(true);
    expect(daemon.sendCallCount).toBe(1);
  });

  test("connection status can be consumed by status UI", async () => {
    const now = createNow();
    const connected = await bootstrapDaemonClient({
      createLiveClient: () => new MockDaemonClient({ daemonAvailable: true, now }),
      createMockClient: () => new MockDaemonClient({ daemonAvailable: true, now }),
    });

    expect(connected.mode).toBe("live");
    expect(connected.connectionStatus).toBe("connected");
    expect(getConnectionLabel(connected.connectionStatus)).toBe("Connected");
  });

  test("streaming events progress conversation state to completed response", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({
      daemonAvailable: true,
      now,
      fixtures: { responseChunks: ["hello", " ", "world"] },
      operation: { streamChunkDelayMs: 1 },
    });
    await daemon.connect();

    const statuses: string[] = [];
    const store = createConversationStore({ daemonClient: daemon, now, completeDisplayMs: 5 });
    store.subscribe((snapshot) => {
      statuses.push(snapshot.streaming.status);
    });

    const sendResult = await store.sendUserMessage({ content: "stream please" });
    expect(sendResult.ok).toBe(true);

    await waitFor(() => store.getState().streaming.status === "idle");

    const snapshot = store.getState();
    expect(statuses).toContain("sending");
    expect(statuses).toContain("streaming");
    expect(statuses).toContain("complete");
    expect(snapshot.messages.at(-1)?.content).toBe("hello world");
  });
});
