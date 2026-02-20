import { describe, expect, test } from "bun:test";

import type { ChannelHealthStatus } from "../../src/commands/handlers/channels";
import {
  getChannelStateColorToken,
  getChannelStateGlyph,
  formatUptimeLabel,
} from "../../src/components/daemon-panel";

// ---------------------------------------------------------------------------
// getChannelStateColorToken
// ---------------------------------------------------------------------------

describe("getChannelStateColorToken", () => {
  test("returns success token for connected", () => {
    expect(getChannelStateColorToken("connected")).toBe("status.success");
  });

  test("returns error token for error", () => {
    expect(getChannelStateColorToken("error")).toBe("status.error");
  });

  test("returns warning token for disconnected", () => {
    expect(getChannelStateColorToken("disconnected")).toBe("status.warning");
  });

  test("returns warning token for connecting", () => {
    expect(getChannelStateColorToken("connecting")).toBe("status.warning");
  });

  test("returns warning token for reconnecting", () => {
    expect(getChannelStateColorToken("reconnecting")).toBe("status.warning");
  });

  test("all known states return a non-empty token", () => {
    const states: ChannelHealthStatus["state"][] = [
      "connected",
      "disconnected",
      "connecting",
      "reconnecting",
      "error",
    ];
    for (const state of states) {
      expect(getChannelStateColorToken(state).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getChannelStateGlyph
// ---------------------------------------------------------------------------

describe("getChannelStateGlyph", () => {
  test("returns filled circle for connected", () => {
    expect(getChannelStateGlyph("connected")).toBe("●");
  });

  test("returns filled circle for error", () => {
    expect(getChannelStateGlyph("error")).toBe("●");
  });

  test("returns half circle for connecting", () => {
    expect(getChannelStateGlyph("connecting")).toBe("◐");
  });

  test("returns half circle for reconnecting", () => {
    expect(getChannelStateGlyph("reconnecting")).toBe("◐");
  });

  test("returns empty circle for disconnected", () => {
    expect(getChannelStateGlyph("disconnected")).toBe("○");
  });

  test("all known states return a non-empty glyph", () => {
    const states: ChannelHealthStatus["state"][] = [
      "connected",
      "disconnected",
      "connecting",
      "reconnecting",
      "error",
    ];
    for (const state of states) {
      expect(getChannelStateGlyph(state).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// formatUptimeLabel
// ---------------------------------------------------------------------------

describe("formatUptimeLabel", () => {
  test("formats zero milliseconds as 0s", () => {
    expect(formatUptimeLabel(0)).toBe("0s");
  });

  test("formats sub-minute durations in seconds", () => {
    expect(formatUptimeLabel(30_000)).toBe("30s");
  });

  test("formats exactly 59 seconds", () => {
    expect(formatUptimeLabel(59_999)).toBe("59s");
  });

  test("formats one minute", () => {
    expect(formatUptimeLabel(60_000)).toBe("1m");
  });

  test("formats sub-hour durations in minutes", () => {
    expect(formatUptimeLabel(5 * 60_000)).toBe("5m");
  });

  test("formats 59 minutes", () => {
    expect(formatUptimeLabel(59 * 60_000 + 59_000)).toBe("59m");
  });

  test("formats one hour", () => {
    expect(formatUptimeLabel(3_600_000)).toBe("1h");
  });

  test("formats multi-hour durations", () => {
    expect(formatUptimeLabel(48 * 3_600_000)).toBe("48h");
  });

  test("truncates partial minutes to floor", () => {
    // 2 minutes and 45 seconds → 2m
    expect(formatUptimeLabel(2 * 60_000 + 45_000)).toBe("2m");
  });

  test("truncates partial hours to floor", () => {
    // 3 hours and 30 minutes → 3h
    expect(formatUptimeLabel(3 * 3_600_000 + 30 * 60_000)).toBe("3h");
  });
});
