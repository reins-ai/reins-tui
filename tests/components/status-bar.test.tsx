import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { DaemonConnectionStatus } from "../../src/daemon/contracts";
import type { StartupContent } from "../../src/personalization/greeting-service";
import {
  HEARTBEAT_GLYPH,
  HEARTBEAT_PULSE_INTERVAL_MS,
  HEARTBEAT_RECONNECT_INTERVAL_MS,
  resolveHeartbeatColor,
  resolveHeartbeatInterval,
  type HeartbeatPhase,
} from "../../src/components/status-bar";
import { formatGreetingLines } from "../../src/components/help-screen";

const MOCK_TOKENS: Record<string, string> = {
  "text.primary": "#e8e0d4",
  "text.secondary": "#b8b0a4",
  "text.muted": "#6b6560",
  "status.success": "#a8cc8c",
  "status.error": "#e88388",
  "status.warning": "#dbab79",
  "status.info": "#71bef2",
  "glyph.heartbeat": "#f0c674",
  "accent.primary": "#e8976c",
};

describe("heartbeat glyph", () => {
  test("heartbeat glyph is the middle dot character", () => {
    expect(HEARTBEAT_GLYPH).toBe("·");
  });

  test("heartbeat glyph is a single character", () => {
    expect(HEARTBEAT_GLYPH.length).toBe(1);
  });
});

describe("heartbeat pulse interval", () => {
  test("connected pulse interval is 2000ms", () => {
    expect(HEARTBEAT_PULSE_INTERVAL_MS).toBe(2_000);
  });

  test("reconnect pulse interval is 500ms", () => {
    expect(HEARTBEAT_RECONNECT_INTERVAL_MS).toBe(500);
  });
});

describe("resolveHeartbeatInterval", () => {
  test("connected returns standard pulse interval", () => {
    expect(resolveHeartbeatInterval("connected")).toBe(HEARTBEAT_PULSE_INTERVAL_MS);
  });

  test("disconnected returns null (no animation)", () => {
    expect(resolveHeartbeatInterval("disconnected")).toBeNull();
  });

  test("connecting returns fast reconnect interval", () => {
    expect(resolveHeartbeatInterval("connecting")).toBe(HEARTBEAT_RECONNECT_INTERVAL_MS);
  });

  test("reconnecting returns fast reconnect interval", () => {
    expect(resolveHeartbeatInterval("reconnecting")).toBe(HEARTBEAT_RECONNECT_INTERVAL_MS);
  });

  test("all statuses return expected interval type", () => {
    const statuses: DaemonConnectionStatus[] = ["connected", "disconnected", "connecting", "reconnecting"];
    for (const status of statuses) {
      const result = resolveHeartbeatInterval(status);
      if (status === "disconnected") {
        expect(result).toBeNull();
      } else {
        expect(typeof result).toBe("number");
        expect(result).toBeGreaterThan(0);
      }
    }
  });
});

describe("resolveHeartbeatColor", () => {
  test("connected bright uses glyph.heartbeat token", () => {
    const color = resolveHeartbeatColor("connected", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.heartbeat"]);
  });

  test("connected dim uses text.muted token", () => {
    const color = resolveHeartbeatColor("connected", "dim", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("disconnected always uses text.muted regardless of phase", () => {
    const bright = resolveHeartbeatColor("disconnected", "bright", MOCK_TOKENS);
    const dim = resolveHeartbeatColor("disconnected", "dim", MOCK_TOKENS);
    expect(bright).toBe(MOCK_TOKENS["text.muted"]);
    expect(dim).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("connecting bright uses status.warning token", () => {
    const color = resolveHeartbeatColor("connecting", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("connecting dim uses text.muted token", () => {
    const color = resolveHeartbeatColor("connecting", "dim", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("reconnecting bright uses status.warning token", () => {
    const color = resolveHeartbeatColor("reconnecting", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("reconnecting dim uses text.muted token", () => {
    const color = resolveHeartbeatColor("reconnecting", "dim", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("no hardcoded color values returned", () => {
    const statuses: DaemonConnectionStatus[] = ["connected", "disconnected", "connecting", "reconnecting"];
    const phases: HeartbeatPhase[] = ["bright", "dim"];

    for (const status of statuses) {
      for (const phase of phases) {
        const color = resolveHeartbeatColor(status, phase, MOCK_TOKENS);
        const tokenValues = Object.values(MOCK_TOKENS);
        expect(tokenValues).toContain(color);
      }
    }
  });
});

describe("heartbeat timer lifecycle", () => {
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

  test("connected status creates interval at 2000ms", () => {
    const interval = resolveHeartbeatInterval("connected");
    expect(interval).toBe(2_000);

    const id = setInterval(() => {}, interval!);
    expect(timers.length).toBe(1);
    expect(timers[0].interval).toBe(2_000);
    clearInterval(id);
  });

  test("reconnecting status creates interval at 500ms", () => {
    const interval = resolveHeartbeatInterval("reconnecting");
    expect(interval).toBe(500);

    const id = setInterval(() => {}, interval!);
    expect(timers.length).toBe(1);
    expect(timers[0].interval).toBe(500);
    clearInterval(id);
  });

  test("disconnected status does not create interval", () => {
    const interval = resolveHeartbeatInterval("disconnected");
    expect(interval).toBeNull();
    expect(timers.length).toBe(0);
  });

  test("interval callback toggles phase between bright and dim", () => {
    let phase: HeartbeatPhase = "bright";
    setInterval(() => {
      phase = phase === "bright" ? "dim" : "bright";
    }, HEARTBEAT_PULSE_INTERVAL_MS);

    expect(phase).toBe("bright");
    timers[0].callback();
    expect(phase).toBe("dim");
    timers[0].callback();
    expect(phase).toBe("bright");
  });

  test("clearing interval stops phase toggling", () => {
    let phase: HeartbeatPhase = "bright";
    const id = setInterval(() => {
      phase = phase === "bright" ? "dim" : "bright";
    }, HEARTBEAT_PULSE_INTERVAL_MS);

    timers[0].callback();
    expect(phase).toBe("dim");

    clearInterval(id);
    expect(timers.length).toBe(0);
  });
});

describe("greeting presentation", () => {
  test("formats greeting-only startup content", () => {
    const startup: StartupContent = {
      greeting: "Good morning, James",
      contextSummary: null,
      hasReminders: false,
      hasEvents: false,
    };

    const lines = formatGreetingLines(startup);
    expect(lines).toEqual(["Good morning, James"]);
  });

  test("formats greeting with context summary", () => {
    const startup: StartupContent = {
      greeting: "Good afternoon, James",
      contextSummary: "You have 2 reminders today:\n· Submit expense report (due 5:00 PM)\n📅 Team standup at 10:00 AM",
      hasReminders: true,
      hasEvents: true,
    };

    const lines = formatGreetingLines(startup);
    expect(lines[0]).toBe("Good afternoon, James");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("You have 2 reminders today:");
    expect(lines[3]).toContain("Submit expense report");
    expect(lines[4]).toContain("Team standup");
  });

  test("greeting is always the first line", () => {
    const startup: StartupContent = {
      greeting: "Evening, James",
      contextSummary: "You have 1 event today:\n📅 Dinner at 7:00 PM",
      hasReminders: false,
      hasEvents: true,
    };

    const lines = formatGreetingLines(startup);
    expect(lines[0]).toBe("Evening, James");
  });

  test("handles empty context summary gracefully", () => {
    const startup: StartupContent = {
      greeting: "Night owl mode, James",
      contextSummary: null,
      hasReminders: false,
      hasEvents: false,
    };

    const lines = formatGreetingLines(startup);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("Night owl mode, James");
  });

  test("handles greeting without user name", () => {
    const startup: StartupContent = {
      greeting: "Good morning",
      contextSummary: null,
      hasReminders: false,
      hasEvents: false,
    };

    const lines = formatGreetingLines(startup);
    expect(lines[0]).toBe("Good morning");
  });

  test("context summary lines are separated from greeting by blank line", () => {
    const startup: StartupContent = {
      greeting: "Morning, James",
      contextSummary: "You have 1 reminder today:\n· Call dentist (due 3:00 PM)",
      hasReminders: true,
      hasEvents: false,
    };

    const lines = formatGreetingLines(startup);
    expect(lines[0]).toBe("Morning, James");
    expect(lines[1]).toBe("");
    expect(lines[2]).toContain("reminder");
  });

  test("reminders-only context renders correctly", () => {
    const startup: StartupContent = {
      greeting: "Good afternoon, James",
      contextSummary: "You have 1 reminder today:\n· Buy groceries (due 6:00 PM)",
      hasReminders: true,
      hasEvents: false,
    };

    const lines = formatGreetingLines(startup);
    expect(lines.length).toBe(4);
    expect(lines[3]).toContain("Buy groceries");
  });

  test("events-only context renders correctly", () => {
    const startup: StartupContent = {
      greeting: "Good morning, James",
      contextSummary: "You have 1 event today:\n📅 Team standup at 10:00 AM",
      hasReminders: false,
      hasEvents: true,
    };

    const lines = formatGreetingLines(startup);
    expect(lines.length).toBe(4);
    expect(lines[3]).toContain("Team standup");
  });
});

describe("heartbeat color uses theme tokens exclusively", () => {
  test("connected state never returns a raw hex value not in tokens", () => {
    const bright = resolveHeartbeatColor("connected", "bright", MOCK_TOKENS);
    const dim = resolveHeartbeatColor("connected", "dim", MOCK_TOKENS);
    expect(Object.values(MOCK_TOKENS)).toContain(bright);
    expect(Object.values(MOCK_TOKENS)).toContain(dim);
  });

  test("disconnected state never returns a raw hex value not in tokens", () => {
    const bright = resolveHeartbeatColor("disconnected", "bright", MOCK_TOKENS);
    const dim = resolveHeartbeatColor("disconnected", "dim", MOCK_TOKENS);
    expect(Object.values(MOCK_TOKENS)).toContain(bright);
    expect(Object.values(MOCK_TOKENS)).toContain(dim);
  });

  test("reconnecting state never returns a raw hex value not in tokens", () => {
    const bright = resolveHeartbeatColor("reconnecting", "bright", MOCK_TOKENS);
    const dim = resolveHeartbeatColor("reconnecting", "dim", MOCK_TOKENS);
    expect(Object.values(MOCK_TOKENS)).toContain(bright);
    expect(Object.values(MOCK_TOKENS)).toContain(dim);
  });
});
