import { describe, expect, test } from "bun:test";

import { getDaemonOfflineBannerText } from "../../src/components/error-boundary";
import { getConnectionGlyph, getConnectionLabel } from "../../src/components/status-bar";
import { MockDaemonClient } from "../../src/daemon/mock-daemon";
import { ExponentialReconnectPolicy } from "../../src/daemon/reconnect-policy";
import { createConversationStore } from "../../src/state/conversation-store";

function createNow(seed = "2026-02-11T00:00:00.000Z", stepMs = 40): () => Date {
  const start = new Date(seed).getTime();
  let tick = 0;
  return () => {
    const value = new Date(start + tick * stepMs);
    tick += 1;
    return value;
  };
}

describe("daemon offline integration", () => {
  test("starts offline when daemon is unavailable and exposes disconnected UI state", async () => {
    const daemon = new MockDaemonClient({ daemonAvailable: false, now: createNow() });

    const connectionStates: string[] = [];
    daemon.onConnectionStateChange((state) => {
      connectionStates.push(state.status);
    });

    const connectResult = await daemon.connect();
    expect(connectResult.ok).toBe(false);
    if (connectResult.ok) {
      return;
    }

    expect(connectResult.error.code).toBe("DAEMON_UNAVAILABLE");
    expect(daemon.getConnectionState().status).toBe("disconnected");
    expect(connectionStates).toContain("connecting");
    expect(connectionStates).toContain("disconnected");

    const banner = getDaemonOfflineBannerText("disconnected", connectResult.error.message);
    expect(banner.visible).toBe(true);
    expect(banner.title).toContain("localhost:7433");

    expect(getConnectionLabel("disconnected")).toBe("Offline");
    expect(getConnectionGlyph("disconnected")).toBe("○");
  });

  test("handles daemon loss during active usage and surfaces retryable message error", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({ daemonAvailable: true, now });
    await daemon.connect();

    const store = createConversationStore({
      daemonClient: daemon,
      now,
      completeDisplayMs: 5,
    });

    daemon.setDaemonAvailable(false);

    const sendResult = await store.sendUserMessage({ content: "Will this send?" });
    expect(sendResult.ok).toBe(false);
    if (sendResult.ok) {
      return;
    }

    expect(sendResult.error.code).toBe("DAEMON_UNAVAILABLE");
    expect(sendResult.error.retryable).toBe(true);

    const snapshot = store.getState();
    expect(snapshot.streaming.status).toBe("error");
    if (snapshot.streaming.status === "error") {
      expect(snapshot.streaming.error.code).toBe("DAEMON_UNAVAILABLE");
      expect(snapshot.streaming.partialContent).toBe("");
    }
  });

  test("recovers from offline start via reconnect without restarting app state", async () => {
    const now = createNow();
    const daemon = new MockDaemonClient({ daemonAvailable: false, now });

    const firstConnect = await daemon.connect();
    expect(firstConnect.ok).toBe(false);

    daemon.setDaemonAvailable(true);
    const reconnect = await daemon.reconnect();
    expect(reconnect.ok).toBe(true);
    expect(daemon.getConnectionState().status).toBe("connected");

    const store = createConversationStore({ daemonClient: daemon, now, completeDisplayMs: 5 });
    const sendAfterRecovery = await store.sendUserMessage({ content: "Recovered" });
    expect(sendAfterRecovery.ok).toBe(true);
  });

  test("generates exponential backoff with jitter and cap", () => {
    const policy = new ExponentialReconnectPolicy({
      baseDelayMs: 100,
      maxDelayMs: 500,
      maxRetries: 5,
      jitterRatio: 0.5,
      random: () => 1,
    });

    const delays = [policy.next(), policy.next(), policy.next(), policy.next(), policy.next()].map((entry) => entry?.delayMs ?? 0);
    expect(delays[0]).toBe(150);
    expect(delays[1]).toBe(300);
    expect(delays[2]).toBe(600);
    expect(delays[3]).toBe(750);
    expect(delays[4]).toBe(750);
    expect(policy.next()).toBeNull();
  });

  test("reconnect attempts can fail multiple times before succeeding", async () => {
    const daemon = new MockDaemonClient({
      daemonAvailable: true,
      failures: { connectFailuresBeforeSuccess: 2 },
      now: createNow(),
    });

    const first = await daemon.connect();
    const second = await daemon.reconnect();
    const third = await daemon.reconnect();
    const fourth = await daemon.reconnect();

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(third.ok).toBe(true);
    expect(fourth.ok).toBe(true);
    expect(daemon.getConnectionState().status).toBe("connected");
  });
});
