import { describe, expect, test } from "bun:test";

import {
  hasDoomLoop,
  formatStats,
  formatKeybindingHints,
} from "../../src/components/task-panel";
import type {
  ActivityEvent,
  ActivityStats,
  DoneActivityEvent,
  ToolCallActivityEvent,
  ErrorActivityEvent,
  CompactionActivityEvent,
} from "../../src/state/activity-store";

// --- Test data factories ---

let nextId = 0;
function uid(): string {
  return `evt-${++nextId}`;
}

function makeDoneEvent(
  overrides?: Partial<DoneActivityEvent>,
): DoneActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "done",
    finishReason: "stop",
    totalTokensUsed: 1234,
    ...overrides,
  };
}

function makeToolCallEvent(
  overrides?: Partial<ToolCallActivityEvent>,
): ToolCallActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "tool_call",
    toolCallId: "tc-001",
    toolName: "brave_search",
    toolArgs: { query: "test" },
    status: "success",
    result: "Search results here",
    startedAt: Date.now() - 1500,
    completedAt: Date.now(),
    durationMs: 1500,
    ...overrides,
  };
}

function makeErrorEvent(
  overrides?: Partial<ErrorActivityEvent>,
): ErrorActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "error",
    error: new Error("Something went wrong"),
    ...overrides,
  };
}

function makeCompactionEvent(
  overrides?: Partial<CompactionActivityEvent>,
): CompactionActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "compaction",
    summary: "Compacted messages",
    beforeTokenEstimate: 50000,
    afterTokenEstimate: 8000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hasDoomLoop
// ---------------------------------------------------------------------------

describe("hasDoomLoop", () => {
  test("returns false when no events", () => {
    expect(hasDoomLoop([])).toBe(false);
  });

  test("returns false when done event has normal finishReason", () => {
    const events: ActivityEvent[] = [
      makeDoneEvent({ finishReason: "stop" }),
    ];
    expect(hasDoomLoop(events)).toBe(false);
  });

  test("returns false when done event has end_turn finishReason", () => {
    const events: ActivityEvent[] = [
      makeDoneEvent({ finishReason: "end_turn" }),
    ];
    expect(hasDoomLoop(events)).toBe(false);
  });

  test("returns true when done event has finishReason === 'doom_loop_detected'", () => {
    const events: ActivityEvent[] = [
      makeDoneEvent({ finishReason: "doom_loop_detected" }),
    ];
    expect(hasDoomLoop(events)).toBe(true);
  });

  test("returns true when doom loop event is among other events", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent(),
      makeToolCallEvent(),
      makeCompactionEvent(),
      makeDoneEvent({ finishReason: "doom_loop_detected" }),
    ];
    expect(hasDoomLoop(events)).toBe(true);
  });

  test("returns false when events contain no done events", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent(),
      makeErrorEvent(),
      makeCompactionEvent(),
    ];
    expect(hasDoomLoop(events)).toBe(false);
  });

  test("returns true when multiple done events and one has doom loop", () => {
    const events: ActivityEvent[] = [
      makeDoneEvent({ finishReason: "stop" }),
      makeDoneEvent({ finishReason: "doom_loop_detected" }),
    ];
    expect(hasDoomLoop(events)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatStats
// ---------------------------------------------------------------------------

describe("formatStats", () => {
  test("formats stats with single tool call", () => {
    const stats: ActivityStats = {
      totalToolCalls: 1,
      totalTokensUsed: 500,
      totalWallMs: 1500,
    };
    const result = formatStats(stats);
    expect(result).toContain("1 tool call");
    expect(result).not.toContain("1 tool calls");
    expect(result).toContain("500 tokens");
    expect(result).toContain("1.5s total");
  });

  test("formats stats with multiple tool calls and tokens", () => {
    const stats: ActivityStats = {
      totalToolCalls: 5,
      totalTokensUsed: 12345,
      totalWallMs: 30000,
    };
    const result = formatStats(stats);
    expect(result).toContain("5 tool calls");
    expect(result).toContain("12,345 tokens");
    expect(result).toContain("30.0s total");
  });

  test("omits token section when totalTokensUsed is 0", () => {
    const stats: ActivityStats = {
      totalToolCalls: 3,
      totalTokensUsed: 0,
      totalWallMs: 5000,
    };
    const result = formatStats(stats);
    expect(result).toContain("3 tool calls");
    expect(result).not.toContain("tokens");
    expect(result).toContain("5.0s total");
  });

  test("omits wall time section when totalWallMs is 0", () => {
    const stats: ActivityStats = {
      totalToolCalls: 2,
      totalTokensUsed: 1000,
      totalWallMs: 0,
    };
    const result = formatStats(stats);
    expect(result).toContain("2 tool calls");
    expect(result).toContain("1,000 tokens");
    expect(result).not.toContain("total");
  });

  test("omits both tokens and wall time when both are 0", () => {
    const stats: ActivityStats = {
      totalToolCalls: 1,
      totalTokensUsed: 0,
      totalWallMs: 0,
    };
    const result = formatStats(stats);
    expect(result).toBe("1 tool call");
  });

  test("formats zero tool calls correctly", () => {
    const stats: ActivityStats = {
      totalToolCalls: 0,
      totalTokensUsed: 0,
      totalWallMs: 0,
    };
    const result = formatStats(stats);
    expect(result).toContain("0 tool calls");
  });

  test("uses locale formatting for large token counts", () => {
    const stats: ActivityStats = {
      totalToolCalls: 10,
      totalTokensUsed: 1000000,
      totalWallMs: 60000,
    };
    const result = formatStats(stats);
    // Locale formatting should include commas (or locale-specific separators)
    expect(result).toContain("1,000,000 tokens");
  });

  test("uses middle dot (·) as separator between sections", () => {
    const stats: ActivityStats = {
      totalToolCalls: 3,
      totalTokensUsed: 500,
      totalWallMs: 2000,
    };
    const result = formatStats(stats);
    expect(result).toContain("\u00B7");
  });
});

// ---------------------------------------------------------------------------
// formatKeybindingHints
// ---------------------------------------------------------------------------

describe("formatKeybindingHints", () => {
  test("includes copy hint when card is focused", () => {
    const result = formatKeybindingHints(true);
    expect(result).toContain("[y] copy");
    expect(result).toContain("[x] export");
    expect(result).toContain("[c] clear");
  });

  test("omits copy hint when no card is focused", () => {
    const result = formatKeybindingHints(false);
    expect(result).not.toContain("[y] copy");
    expect(result).toContain("[x] export");
    expect(result).toContain("[c] clear");
  });
});
