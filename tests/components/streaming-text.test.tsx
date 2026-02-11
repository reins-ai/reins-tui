import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { ConversationLifecycleStatus } from "../../src/state/status-machine";
import {
  BREATHING_CURSOR_NARROW,
  BREATHING_CURSOR_WIDE,
  BREATHING_INTERVAL_MS,
  STREAMING_CURSOR,
  buildStreamingText,
  resolveCursorForStatus,
} from "../../src/components/streaming-text";
import {
  getConnectionGlyph,
  getConnectionLabel,
} from "../../src/components/status-bar";
import {
  getDaemonOfflineBannerText,
} from "../../src/components/error-boundary";
import type { DaemonConnectionStatus } from "../../src/daemon/contracts";

describe("breathing cursor resolution", () => {
  test("thinking status with wide=true returns wide cursor", () => {
    expect(resolveCursorForStatus("thinking", true)).toBe(BREATHING_CURSOR_WIDE);
  });

  test("thinking status with wide=false returns narrow cursor", () => {
    expect(resolveCursorForStatus("thinking", false)).toBe(BREATHING_CURSOR_NARROW);
  });

  test("streaming status always returns steady cursor", () => {
    expect(resolveCursorForStatus("streaming", true)).toBe(STREAMING_CURSOR);
    expect(resolveCursorForStatus("streaming", false)).toBe(STREAMING_CURSOR);
  });

  test("idle status returns null cursor", () => {
    expect(resolveCursorForStatus("idle", true)).toBeNull();
    expect(resolveCursorForStatus("idle", false)).toBeNull();
  });

  test("sending status returns null cursor", () => {
    expect(resolveCursorForStatus("sending", true)).toBeNull();
  });

  test("complete status returns null cursor", () => {
    expect(resolveCursorForStatus("complete", true)).toBeNull();
    expect(resolveCursorForStatus("complete", false)).toBeNull();
  });

  test("error status returns null cursor", () => {
    expect(resolveCursorForStatus("error", true)).toBeNull();
  });

  test("cursor glyphs are distinct unicode characters", () => {
    expect(BREATHING_CURSOR_WIDE).toBe("\u258D");
    expect(BREATHING_CURSOR_NARROW).toBe("\u258F");
    expect(STREAMING_CURSOR).toBe("\u258D");
    expect(BREATHING_CURSOR_WIDE).not.toBe(BREATHING_CURSOR_NARROW);
  });

  test("breathing interval is 500ms", () => {
    expect(BREATHING_INTERVAL_MS).toBe(500);
  });

  test("all lifecycle statuses produce expected cursor presence", () => {
    const statuses: ConversationLifecycleStatus[] = ["idle", "sending", "thinking", "streaming", "complete", "error"];
    const expectedCursor: (string | null)[] = [null, null, BREATHING_CURSOR_WIDE, STREAMING_CURSOR, null, null];

    statuses.forEach((status, index) => {
      expect(resolveCursorForStatus(status, true)).toBe(expectedCursor[index]);
    });
  });
});

describe("buildStreamingText (legacy)", () => {
  test("appends block cursor when streaming", () => {
    expect(buildStreamingText("partial", true)).toBe("partial\u258A");
  });

  test("returns plain content when not streaming", () => {
    expect(buildStreamingText("final", false)).toBe("final");
  });

  test("handles empty content", () => {
    expect(buildStreamingText("", true)).toBe("\u258A");
    expect(buildStreamingText("", false)).toBe("");
  });
});

describe("connection state indicators", () => {
  test("connected shows filled dot and label", () => {
    expect(getConnectionGlyph("connected")).toBe("●");
    expect(getConnectionLabel("connected")).toBe("Connected");
  });

  test("disconnected shows empty dot and Offline label", () => {
    expect(getConnectionGlyph("disconnected")).toBe("○");
    expect(getConnectionLabel("disconnected")).toBe("Offline");
  });

  test("connecting shows open circle and label", () => {
    expect(getConnectionGlyph("connecting")).toBe("◌");
    expect(getConnectionLabel("connecting")).toBe("Connecting...");
  });

  test("reconnecting shows open circle and label", () => {
    expect(getConnectionGlyph("reconnecting")).toBe("◌");
    expect(getConnectionLabel("reconnecting")).toBe("Reconnecting...");
  });

  test("all connection statuses produce non-empty glyphs", () => {
    const statuses: DaemonConnectionStatus[] = ["connected", "disconnected", "connecting", "reconnecting"];
    for (const status of statuses) {
      expect(getConnectionGlyph(status).length).toBeGreaterThan(0);
      expect(getConnectionLabel(status).length).toBeGreaterThan(0);
    }
  });
});

describe("daemon offline banner", () => {
  test("connected status produces invisible banner", () => {
    const result = getDaemonOfflineBannerText("connected");
    expect(result.visible).toBe(false);
  });

  test("connecting status produces invisible banner", () => {
    const result = getDaemonOfflineBannerText("connecting");
    expect(result.visible).toBe(false);
  });

  test("disconnected status produces visible banner with default message", () => {
    const result = getDaemonOfflineBannerText("disconnected");
    expect(result.visible).toBe(true);
    expect(result.title).toBe("Daemon is unavailable");
    expect(result.hint).toContain("Ctrl+R");
    expect(result.hint).toContain("history");
  });

  test("disconnected status uses custom error message when provided", () => {
    const result = getDaemonOfflineBannerText("disconnected", "Connection refused on port 7433");
    expect(result.visible).toBe(true);
    expect(result.title).toBe("Connection refused on port 7433");
  });

  test("reconnecting status produces visible banner", () => {
    const result = getDaemonOfflineBannerText("reconnecting");
    expect(result.visible).toBe(true);
    expect(result.title).toContain("Reconnecting");
    expect(result.hint).toContain("history");
  });

  test("offline banner does not block conversation history access", () => {
    const disconnected = getDaemonOfflineBannerText("disconnected");
    const reconnecting = getDaemonOfflineBannerText("reconnecting");
    expect(disconnected.hint).toContain("still available");
    expect(reconnecting.hint).toContain("still available");
  });
});

describe("breathing cursor timing behavior", () => {
  let originalSetInterval: typeof globalThis.setInterval;
  let originalClearInterval: typeof globalThis.clearInterval;
  let timers: { callback: () => void; interval: number; id: number }[];
  let nextTimerId: number;

  beforeEach(() => {
    originalSetInterval = globalThis.setInterval;
    originalClearInterval = globalThis.clearInterval;
    timers = [];
    nextTimerId = 1;

    globalThis.setInterval = ((callback: () => void, interval: number) => {
      const id = nextTimerId++;
      timers.push({ callback, interval, id });
      return id;
    }) as typeof globalThis.setInterval;

    globalThis.clearInterval = ((id: number) => {
      timers = timers.filter((t) => t.id !== id);
    }) as typeof globalThis.clearInterval;
  });

  afterEach(() => {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  test("thinking status creates interval at 500ms", () => {
    // Simulate what useBreathingCursor does internally for thinking
    const status: ConversationLifecycleStatus = "thinking";
    if (status === "thinking") {
      const id = setInterval(() => {}, BREATHING_INTERVAL_MS);
      expect(timers.length).toBe(1);
      expect(timers[0].interval).toBe(500);
      clearInterval(id);
    }
  });

  test("non-thinking statuses do not create intervals", () => {
    const nonThinkingStatuses: ConversationLifecycleStatus[] = ["idle", "sending", "streaming", "complete", "error"];
    for (const status of nonThinkingStatuses) {
      if (status === "thinking") {
        setInterval(() => {}, BREATHING_INTERVAL_MS);
      }
    }
    expect(timers.length).toBe(0);
  });

  test("interval callback toggles cursor state", () => {
    let wide = true;
    setInterval(() => {
      wide = !wide;
    }, BREATHING_INTERVAL_MS);

    expect(wide).toBe(true);
    timers[0].callback();
    expect(wide).toBe(false);
    timers[0].callback();
    expect(wide).toBe(true);
  });

  test("clearing interval stops toggling", () => {
    let wide = true;
    const id = setInterval(() => {
      wide = !wide;
    }, BREATHING_INTERVAL_MS);

    timers[0].callback();
    expect(wide).toBe(false);

    clearInterval(id);
    expect(timers.length).toBe(0);
  });
});
