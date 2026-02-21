import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  generateExportFilename,
  eventsToJson,
  eventsToMarkdown,
} from "../../src/util/activity-export";
import type {
  ActivityEvent,
  ToolCallActivityEvent,
  CompactionActivityEvent,
  DoneActivityEvent,
  ErrorActivityEvent,
  ThinkingActivityEvent,
} from "../../src/state/activity-store";

// --- Test data factories ---

let nextId = 0;
function uid(): string {
  return `evt-${++nextId}`;
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
    result: "Found 10 results",
    startedAt: Date.now() - 1500,
    completedAt: Date.now(),
    durationMs: 1500,
    ...overrides,
  };
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

function makeCompactionEvent(
  overrides?: Partial<CompactionActivityEvent>,
): CompactionActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "compaction",
    summary: "Summarised 30 messages into 1 system message",
    beforeTokenEstimate: 50000,
    afterTokenEstimate: 8000,
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
    code: "ERR_TIMEOUT",
    retryable: true,
    ...overrides,
  };
}

function makeThinkingEvent(
  overrides?: Partial<ThinkingActivityEvent>,
): ThinkingActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "thinking",
    content: "Let me think about this...",
    estimatedTokens: 42,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateExportFilename
// ---------------------------------------------------------------------------

describe("generateExportFilename", () => {
  test("generates JSON filename with correct date format", () => {
    const date = new Date("2026-02-20T14:30:45.000Z");
    const result = generateExportFilename("json", date);
    const home = homedir();

    // The filename should be in the home directory
    expect(result.startsWith(home)).toBe(true);
    expect(result.endsWith(".json")).toBe(true);
    expect(result).toContain("reins-activity-");

    // Extract the timestamp portion
    const filename = result.slice(result.lastIndexOf("/") + 1);
    expect(filename).toMatch(/^reins-activity-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  });

  test("generates Markdown filename with correct extension", () => {
    const date = new Date("2026-02-20T14:30:45.000Z");
    const result = generateExportFilename("markdown", date);

    expect(result.endsWith(".md")).toBe(true);
    expect(result).toContain("reins-activity-");
  });

  test("uses provided date (not current time)", () => {
    const specificDate = new Date("2025-12-25T08:15:30.000Z");
    const result = generateExportFilename("json", specificDate);

    // The filename should contain the specific date components
    expect(result).toContain("2025-12-25");
  });

  test("pads single-digit months and days with leading zeros", () => {
    const date = new Date("2026-01-05T03:07:09.000Z");
    const result = generateExportFilename("json", date);
    const filename = result.slice(result.lastIndexOf("/") + 1);

    // Extract date parts from filename
    const match = filename.match(/reins-activity-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
    expect(match).not.toBeNull();
    // Month should be 01, not 1
    expect(match![2]).toBe("01");
    // Day should be 05, not 5
    expect(match![3]).toBe("05");
  });

  test("returns a path under the home directory", () => {
    const result = generateExportFilename("json");
    const home = homedir();
    const expected = join(home, "reins-activity-");
    expect(result.startsWith(expected)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// eventsToJson
// ---------------------------------------------------------------------------

describe("eventsToJson", () => {
  test("serializes events as pretty-printed JSON array", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent({ toolName: "search" }),
    ];
    const result = eventsToJson(events);

    // Should be valid JSON
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("tool_call");
    expect(parsed[0].toolName).toBe("search");
  });

  test("handles empty events array", () => {
    const result = eventsToJson([]);
    expect(result).toBe("[]");
  });

  test("serializes multiple event types", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent(),
      makeDoneEvent(),
      makeCompactionEvent(),
    ];
    const result = eventsToJson(events);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].kind).toBe("tool_call");
    expect(parsed[1].kind).toBe("done");
    expect(parsed[2].kind).toBe("compaction");
  });

  test("uses 2-space indentation", () => {
    const events: ActivityEvent[] = [makeToolCallEvent()];
    const result = eventsToJson(events);
    // Pretty-printed JSON with 2-space indent should have lines starting with "  "
    const lines = result.split("\n");
    const indentedLines = lines.filter((l) => l.startsWith("  "));
    expect(indentedLines.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// eventsToMarkdown
// ---------------------------------------------------------------------------

describe("eventsToMarkdown", () => {
  test("includes header section", () => {
    const events: ActivityEvent[] = [makeToolCallEvent()];
    const result = eventsToMarkdown(events);
    expect(result).toContain("# Reins Activity Log");
    expect(result).toContain("Generated:");
  });

  test("includes summary stats section", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent({ durationMs: 1500 }),
      makeDoneEvent({ totalTokensUsed: 5000 }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("## Summary");
    expect(result).toContain("Tool calls: 1");
    expect(result).toContain("Total tokens: 5,000");
    expect(result).toContain("Duration:");
  });

  test("includes Events section header", () => {
    const events: ActivityEvent[] = [makeToolCallEvent()];
    const result = eventsToMarkdown(events);
    expect(result).toContain("## Events");
  });

  test("formats tool_call events with args and result", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent({
        toolName: "brave_search",
        toolArgs: { query: "test query" },
        status: "success",
        result: "Found 10 results",
        durationMs: 1500,
      }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("tool_call: brave_search");
    expect(result).toContain("test query");
    expect(result).toContain("Found 10 results");
    expect(result).toContain("\u2713"); // ✓ for success
  });

  test("formats failed tool_call events with error", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent({
        toolName: "search",
        status: "error",
        error: "Connection refused",
        result: undefined,
      }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("\u2717"); // ✗ for error
    expect(result).toContain("Connection refused");
  });

  test("formats compaction events with summary", () => {
    const events: ActivityEvent[] = [
      makeCompactionEvent({
        summary: "Compacted 30 messages",
        beforeTokenEstimate: 50000,
        afterTokenEstimate: 8000,
      }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("compaction");
    expect(result).toContain("Compacted 30 messages");
    expect(result).toContain("Before:");
    expect(result).toContain("After:");
  });

  test("formats error events", () => {
    const events: ActivityEvent[] = [
      makeErrorEvent({
        error: new Error("Fatal crash"),
        code: "ERR_FATAL",
        retryable: false,
      }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("error");
    expect(result).toContain("Fatal crash");
    expect(result).toContain("ERR_FATAL");
    expect(result).toContain("**Retryable:** no");
  });

  test("formats done events with token count", () => {
    const events: ActivityEvent[] = [
      makeDoneEvent({
        finishReason: "stop",
        totalTokensUsed: 5000,
      }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("done");
    expect(result).toContain("**Finish reason:** stop");
    expect(result).toContain("**Tokens used:**");
  });

  test("formats thinking events", () => {
    const events: ActivityEvent[] = [
      makeThinkingEvent({
        content: "Let me think about this...",
        estimatedTokens: 42,
      }),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("thinking");
    expect(result).toContain("~42");
    expect(result).toContain("Let me think about this...");
  });

  test("handles empty events array gracefully", () => {
    const result = eventsToMarkdown([]);
    expect(result).toContain("# Reins Activity Log");
    expect(result).toContain("## Summary");
    expect(result).toContain("Tool calls: 0");
    expect(result).toContain("## Events");
    // Should not throw or produce malformed output
    expect(result.length).toBeGreaterThan(0);
  });

  test("numbers events sequentially starting from 1", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent({ toolName: "search" }),
      makeToolCallEvent({ toolName: "memory" }),
      makeDoneEvent(),
    ];
    const result = eventsToMarkdown(events);
    expect(result).toContain("[1]");
    expect(result).toContain("[2]");
    expect(result).toContain("[3]");
  });

  test("summary stats count only completed tool calls", () => {
    const events: ActivityEvent[] = [
      makeToolCallEvent({ status: "success", durationMs: 1000 }),
      makeToolCallEvent({ status: "error", durationMs: 500 }),
      makeToolCallEvent({ status: "running", durationMs: undefined }),
    ];
    const result = eventsToMarkdown(events);
    // Only 2 completed tool calls (success + error), not the running one
    expect(result).toContain("Tool calls: 2");
  });
});
