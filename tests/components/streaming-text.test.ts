import { describe, expect, test } from "bun:test";

import {
  BREATHING_CURSOR_WIDE,
  BREATHING_CURSOR_NARROW,
  STREAMING_CURSOR,
  BLINKING_CURSOR,
  BREATHING_INTERVAL_MS,
  BLINK_INTERVAL_MS,
  THINKING_INDICATOR_PREFIX,
  resolveCursorForStatus,
  buildStreamingText,
  formatThinkingIndicator,
} from "../../src/components/streaming-text";
import type { ConversationLifecycleStatus } from "../../src/state/status-machine";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("streaming-text constants", () => {
  test("BREATHING_CURSOR_WIDE is ▍", () => {
    expect(BREATHING_CURSOR_WIDE).toBe("\u258D");
  });

  test("BREATHING_CURSOR_NARROW is ▏", () => {
    expect(BREATHING_CURSOR_NARROW).toBe("\u258F");
  });

  test("STREAMING_CURSOR is ▍ (legacy)", () => {
    expect(STREAMING_CURSOR).toBe("\u258D");
  });

  test("BLINKING_CURSOR is ▋", () => {
    expect(BLINKING_CURSOR).toBe("\u258B");
  });

  test("BREATHING_INTERVAL_MS is 500", () => {
    expect(BREATHING_INTERVAL_MS).toBe(500);
  });

  test("BLINK_INTERVAL_MS is 500", () => {
    expect(BLINK_INTERVAL_MS).toBe(500);
  });

  test("THINKING_INDICATOR_PREFIX starts with ⟳", () => {
    expect(THINKING_INDICATOR_PREFIX).toBe("\u27F3 Thinking\u2026");
  });
});

// ---------------------------------------------------------------------------
// resolveCursorForStatus
// ---------------------------------------------------------------------------

describe("resolveCursorForStatus", () => {
  test("returns wide cursor for thinking status when breathingWide is true", () => {
    expect(resolveCursorForStatus("thinking", true)).toBe(BREATHING_CURSOR_WIDE);
  });

  test("returns narrow cursor for thinking status when breathingWide is false", () => {
    expect(resolveCursorForStatus("thinking", false)).toBe(BREATHING_CURSOR_NARROW);
  });

  test("returns STREAMING_CURSOR for streaming status by default", () => {
    expect(resolveCursorForStatus("streaming", true)).toBe(STREAMING_CURSOR);
  });

  test("returns STREAMING_CURSOR for streaming when blinkVisible is true", () => {
    expect(resolveCursorForStatus("streaming", true, true)).toBe(STREAMING_CURSOR);
  });

  test("returns null for streaming when blinkVisible is false", () => {
    expect(resolveCursorForStatus("streaming", true, false)).toBeNull();
  });

  test("returns null for idle status", () => {
    expect(resolveCursorForStatus("idle", true)).toBeNull();
    expect(resolveCursorForStatus("idle", false)).toBeNull();
  });

  test("returns null for sending status", () => {
    expect(resolveCursorForStatus("sending", true)).toBeNull();
  });

  test("returns null for complete status", () => {
    expect(resolveCursorForStatus("complete", true)).toBeNull();
  });

  test("returns null for error status", () => {
    expect(resolveCursorForStatus("error", true)).toBeNull();
  });

  test("cursor disappears on done (complete status)", () => {
    // Verify the spec requirement: cursor disappears when streaming ends
    const duringStreaming = resolveCursorForStatus("streaming", true);
    expect(duringStreaming).not.toBeNull();

    const afterDone = resolveCursorForStatus("complete", true);
    expect(afterDone).toBeNull();
  });

  test("all non-active statuses return null", () => {
    const inactiveStatuses: ConversationLifecycleStatus[] = [
      "idle",
      "sending",
      "complete",
      "error",
    ];
    for (const status of inactiveStatuses) {
      expect(resolveCursorForStatus(status, true)).toBeNull();
      expect(resolveCursorForStatus(status, false)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// buildStreamingText
// ---------------------------------------------------------------------------

describe("buildStreamingText", () => {
  test("appends block cursor when streaming", () => {
    const result = buildStreamingText("hello", true);
    expect(result).toBe("hello\u258A");
  });

  test("returns content as-is when not streaming", () => {
    const result = buildStreamingText("hello", false);
    expect(result).toBe("hello");
  });

  test("handles empty content when streaming", () => {
    const result = buildStreamingText("", true);
    expect(result).toBe("\u258A");
  });

  test("handles empty content when not streaming", () => {
    const result = buildStreamingText("", false);
    expect(result).toBe("");
  });

  test("handles multi-line content", () => {
    const result = buildStreamingText("line1\nline2", true);
    expect(result).toBe("line1\nline2\u258A");
  });
});

// ---------------------------------------------------------------------------
// formatThinkingIndicator
// ---------------------------------------------------------------------------

describe("formatThinkingIndicator", () => {
  test("formats with 0 seconds", () => {
    expect(formatThinkingIndicator(0)).toBe("\u27F3 Thinking\u2026 (0s)");
  });

  test("formats with positive seconds", () => {
    expect(formatThinkingIndicator(3)).toBe("\u27F3 Thinking\u2026 (3s)");
  });

  test("formats with large seconds", () => {
    expect(formatThinkingIndicator(120)).toBe("\u27F3 Thinking\u2026 (120s)");
  });

  test("includes the thinking prefix", () => {
    const result = formatThinkingIndicator(5);
    expect(result).toContain(THINKING_INDICATOR_PREFIX);
  });

  test("includes elapsed seconds in parentheses", () => {
    const result = formatThinkingIndicator(7);
    expect(result).toContain("(7s)");
  });
});

// ---------------------------------------------------------------------------
// Cursor blink state transitions
// ---------------------------------------------------------------------------

describe("cursor blink state transitions", () => {
  test("thinking cursor alternates between wide and narrow", () => {
    const wide = resolveCursorForStatus("thinking", true);
    const narrow = resolveCursorForStatus("thinking", false);
    expect(wide).toBe(BREATHING_CURSOR_WIDE);
    expect(narrow).toBe(BREATHING_CURSOR_NARROW);
    expect(wide).not.toBe(narrow);
  });

  test("streaming cursor toggles between visible and hidden", () => {
    const visible = resolveCursorForStatus("streaming", true, true);
    const hidden = resolveCursorForStatus("streaming", true, false);
    expect(visible).toBe(STREAMING_CURSOR);
    expect(hidden).toBeNull();
  });

  test("transition from streaming to complete hides cursor", () => {
    const streaming = resolveCursorForStatus("streaming", true);
    expect(streaming).not.toBeNull();

    const complete = resolveCursorForStatus("complete", true);
    expect(complete).toBeNull();
  });

  test("transition from thinking to idle hides cursor", () => {
    const thinking = resolveCursorForStatus("thinking", true);
    expect(thinking).not.toBeNull();

    const idle = resolveCursorForStatus("idle", true);
    expect(idle).toBeNull();
  });

  test("transition from thinking to streaming uses different cursor mechanism", () => {
    // Thinking uses breathing (wide/narrow alternation)
    const thinkingWide = resolveCursorForStatus("thinking", true);
    const thinkingNarrow = resolveCursorForStatus("thinking", false);
    expect(thinkingWide).toBe(BREATHING_CURSOR_WIDE);
    expect(thinkingNarrow).toBe(BREATHING_CURSOR_NARROW);

    // Streaming uses blink (visible/hidden alternation)
    const streamingVisible = resolveCursorForStatus("streaming", true, true);
    const streamingHidden = resolveCursorForStatus("streaming", true, false);
    expect(streamingVisible).toBe(STREAMING_CURSOR);
    expect(streamingHidden).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Thinking indicator integration
// ---------------------------------------------------------------------------

describe("thinking indicator integration", () => {
  test("thinking indicator shows elapsed time progression", () => {
    const t0 = formatThinkingIndicator(0);
    const t1 = formatThinkingIndicator(1);
    const t5 = formatThinkingIndicator(5);

    expect(t0).toContain("(0s)");
    expect(t1).toContain("(1s)");
    expect(t5).toContain("(5s)");

    // All share the same prefix
    expect(t0.startsWith(THINKING_INDICATOR_PREFIX)).toBe(true);
    expect(t1.startsWith(THINKING_INDICATOR_PREFIX)).toBe(true);
    expect(t5.startsWith(THINKING_INDICATOR_PREFIX)).toBe(true);
  });

  test("thinking indicator only relevant during thinking status", () => {
    // Cursor exists during thinking
    const cursor = resolveCursorForStatus("thinking", true);
    expect(cursor).not.toBeNull();

    // Cursor gone during other statuses — indicator should not render
    expect(resolveCursorForStatus("idle", true)).toBeNull();
    expect(resolveCursorForStatus("complete", true)).toBeNull();
    expect(resolveCursorForStatus("error", true)).toBeNull();
  });
});
