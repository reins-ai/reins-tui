import { describe, expect, test } from "bun:test";

import {
  getToolCategoryIcon,
  formatEventDuration,
  getEventStatusGlyph,
  formatEventPreview,
  formatExpandedLines,
} from "../../src/components/cards/step-card";
import type {
  ActivityEvent,
  ToolCallActivityEvent,
  CompactionActivityEvent,
  ErrorActivityEvent,
  DoneActivityEvent,
  AbortedActivityEvent,
  ChildAgentActivityEvent,
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
    result: "Search results here",
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

function makeAbortedEvent(
  overrides?: Partial<AbortedActivityEvent>,
): AbortedActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "aborted",
    reason: "User cancelled",
    initiatedBy: "user",
    ...overrides,
  };
}

function makeChildAgentEvent(
  overrides?: Partial<ChildAgentActivityEvent>,
): ChildAgentActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "child_agent",
    childId: "agent-1",
    eventType: "tool_call_start",
    payload: { toolName: "search" },
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
    content: "Let me think about this problem step by step...",
    estimatedTokens: 42,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getToolCategoryIcon
// ---------------------------------------------------------------------------

describe("getToolCategoryIcon", () => {
  test("returns 🔍 for search-related tool names", () => {
    expect(getToolCategoryIcon("brave_search")).toBe("\u{1F50D}");
    expect(getToolCategoryIcon("web_search")).toBe("\u{1F50D}");
    expect(getToolCategoryIcon("exa_search")).toBe("\u{1F50D}");
    expect(getToolCategoryIcon("google_search")).toBe("\u{1F50D}");
  });

  test("returns 💾 for memory-related tool names", () => {
    expect(getToolCategoryIcon("memory_save")).toBe("\u{1F4BE}");
    expect(getToolCategoryIcon("remember_note")).toBe("\u{1F4BE}");
    expect(getToolCategoryIcon("recall_context")).toBe("\u{1F4BE}");
    expect(getToolCategoryIcon("save_to_disk")).toBe("\u{1F4BE}");
  });

  test("returns 🌐 for browser-related tool names", () => {
    expect(getToolCategoryIcon("browser_navigate")).toBe("\u{1F310}");
    expect(getToolCategoryIcon("click_element")).toBe("\u{1F310}");
    expect(getToolCategoryIcon("take_screenshot")).toBe("\u{1F310}");
    expect(getToolCategoryIcon("navigate_to")).toBe("\u{1F310}");
  });

  test("returns 📅 for calendar-related tool names", () => {
    expect(getToolCategoryIcon("calendar_create")).toBe("\u{1F4C5}");
    expect(getToolCategoryIcon("schedule_meeting")).toBe("\u{1F4C5}");
    expect(getToolCategoryIcon("create_event")).toBe("\u{1F4C5}");
    expect(getToolCategoryIcon("set_reminder")).toBe("\u{1F4C5}");
  });

  test("returns 🔧 for unknown tool names", () => {
    expect(getToolCategoryIcon("unknown_tool")).toBe("\u{1F527}");
    expect(getToolCategoryIcon("custom_action")).toBe("\u{1F527}");
    expect(getToolCategoryIcon("")).toBe("\u{1F527}");
  });

  test("matching is case-insensitive", () => {
    expect(getToolCategoryIcon("BRAVE_SEARCH")).toBe("\u{1F50D}");
    expect(getToolCategoryIcon("Memory_Save")).toBe("\u{1F4BE}");
    expect(getToolCategoryIcon("BROWSER_Navigate")).toBe("\u{1F310}");
    expect(getToolCategoryIcon("CALENDAR_create")).toBe("\u{1F4C5}");
  });
});

// ---------------------------------------------------------------------------
// formatEventDuration
// ---------------------------------------------------------------------------

describe("formatEventDuration", () => {
  test("returns empty string for non-tool-call events", () => {
    expect(formatEventDuration(makeDoneEvent())).toBe("");
    expect(formatEventDuration(makeErrorEvent())).toBe("");
    expect(formatEventDuration(makeCompactionEvent())).toBe("");
    expect(formatEventDuration(makeAbortedEvent())).toBe("");
    expect(formatEventDuration(makeThinkingEvent())).toBe("");
  });

  test("returns empty string for running tool calls", () => {
    const event = makeToolCallEvent({ status: "running", durationMs: undefined });
    expect(formatEventDuration(event)).toBe("");
  });

  test("returns empty string when durationMs is undefined", () => {
    const event = makeToolCallEvent({ status: "success", durationMs: undefined });
    expect(formatEventDuration(event)).toBe("");
  });

  test("returns '< 1s' for durations under 1000ms", () => {
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 0 }))).toBe("< 1s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 500 }))).toBe("< 1s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 999 }))).toBe("< 1s");
  });

  test("returns duration in seconds for short completions", () => {
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 1000 }))).toBe("1.0s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 1500 }))).toBe("1.5s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 12300 }))).toBe("12.3s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 59999 }))).toBe("60.0s");
  });

  test("returns duration in minutes for long completions", () => {
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 60000 }))).toBe("1m");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 90000 }))).toBe("1m 30s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 123000 }))).toBe("2m 3s");
    expect(formatEventDuration(makeToolCallEvent({ durationMs: 300000 }))).toBe("5m");
  });
});

// ---------------------------------------------------------------------------
// getEventStatusGlyph
// ---------------------------------------------------------------------------

describe("getEventStatusGlyph", () => {
  test("returns ⟳ for running tool calls", () => {
    const event = makeToolCallEvent({ status: "running" });
    expect(getEventStatusGlyph(event)).toBe("\u27F3");
  });

  test("returns ✓ for successful tool calls", () => {
    const event = makeToolCallEvent({ status: "success" });
    expect(getEventStatusGlyph(event)).toBe("\u2713");
  });

  test("returns ✗ for failed tool calls", () => {
    const event = makeToolCallEvent({ status: "error" });
    expect(getEventStatusGlyph(event)).toBe("\u2717");
  });

  test("returns ✓ for done events", () => {
    expect(getEventStatusGlyph(makeDoneEvent())).toBe("\u2713");
  });

  test("returns ✗ for error events", () => {
    expect(getEventStatusGlyph(makeErrorEvent())).toBe("\u2717");
  });

  test("returns ✗ for aborted events", () => {
    expect(getEventStatusGlyph(makeAbortedEvent())).toBe("\u2717");
  });

  test("returns ⚡ for compaction events", () => {
    expect(getEventStatusGlyph(makeCompactionEvent())).toBe("\u26A1");
  });

  test("returns 💭 for thinking events", () => {
    expect(getEventStatusGlyph(makeThinkingEvent())).toBe("\u{1F4AD}");
  });

  test("returns ⟳ for child_agent events", () => {
    expect(getEventStatusGlyph(makeChildAgentEvent())).toBe("\u27F3");
  });
});

// ---------------------------------------------------------------------------
// formatEventPreview
// ---------------------------------------------------------------------------

describe("formatEventPreview", () => {
  test("shows args for running tool calls", () => {
    const event = makeToolCallEvent({
      status: "running",
      toolArgs: { query: "hello world" },
      result: undefined,
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("hello world");
  });

  test("shows args as string when toolArgs is a string", () => {
    const event = makeToolCallEvent({
      status: "running",
      toolArgs: "raw string args",
      result: undefined,
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("raw string args");
  });

  test("shows result for successful tool calls", () => {
    const event = makeToolCallEvent({
      status: "success",
      result: "Found 10 results",
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("Found 10 results");
  });

  test("shows error message for failed tool calls", () => {
    const event = makeToolCallEvent({
      status: "error",
      error: "Connection refused",
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("Connection refused");
  });

  test("shows summary for compaction events", () => {
    const event = makeCompactionEvent({
      summary: "Compacted 30 messages",
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("Compacted 30 messages");
  });

  test("shows error message for error events", () => {
    const event = makeErrorEvent({
      error: new Error("Fatal crash"),
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("Fatal crash");
  });

  test("shows token count for done events", () => {
    const event = makeDoneEvent({
      finishReason: "stop",
      totalTokensUsed: 5000,
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("stop");
    expect(preview).toContain("5,000 tokens");
  });

  test("shows finish reason without tokens when totalTokensUsed is undefined", () => {
    const event = makeDoneEvent({
      finishReason: "stop",
      totalTokensUsed: undefined,
    });
    const preview = formatEventPreview(event);
    expect(preview).toBe("stop");
  });

  test("shows reason for aborted events", () => {
    const event = makeAbortedEvent({ reason: "User cancelled" });
    const preview = formatEventPreview(event);
    expect(preview).toContain("User cancelled");
  });

  test("shows 'No reason' for aborted events without reason", () => {
    const event = makeAbortedEvent({ reason: undefined });
    const preview = formatEventPreview(event);
    expect(preview).toContain("No reason");
  });

  test("shows child agent ID for child_agent events", () => {
    const event = makeChildAgentEvent({ childId: "agent-42" });
    const preview = formatEventPreview(event);
    expect(preview).toContain("Agent: agent-42");
  });

  test("shows estimated tokens for thinking events", () => {
    const event = makeThinkingEvent({ estimatedTokens: 150 });
    const preview = formatEventPreview(event);
    expect(preview).toContain("~150 tokens");
  });

  test("truncates to maxLength with ellipsis", () => {
    const event = makeToolCallEvent({
      status: "success",
      result: "a".repeat(200),
    });
    const preview = formatEventPreview(event, 20);
    expect(preview).toHaveLength(20);
    expect(preview.endsWith("\u2026")).toBe(true);
  });

  test("does not truncate when content fits within maxLength", () => {
    const event = makeToolCallEvent({
      status: "success",
      result: "short",
    });
    const preview = formatEventPreview(event, 60);
    expect(preview).toBe("short");
    expect(preview.endsWith("\u2026")).toBe(false);
  });

  test("uses default maxLength of 60", () => {
    const event = makeToolCallEvent({
      status: "success",
      result: "a".repeat(200),
    });
    const preview = formatEventPreview(event);
    expect(preview).toHaveLength(60);
  });

  test("shows args when tool call has no result and no error (running)", () => {
    const event = makeToolCallEvent({
      status: "running",
      toolArgs: { file: "test.ts" },
      result: undefined,
      error: undefined,
    });
    const preview = formatEventPreview(event);
    expect(preview).toContain("test.ts");
  });
});

// ---------------------------------------------------------------------------
// formatExpandedLines
// ---------------------------------------------------------------------------

describe("formatExpandedLines", () => {
  const innerWidth = 36; // typical inner width for a 44-wide card

  test("shows Args and Result sections for successful tool calls", () => {
    const event = makeToolCallEvent({
      status: "success",
      toolArgs: { query: "test" },
      result: "Found results",
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Args");
    expect(text).toContain("Result");
    expect(text).toContain("test");
    expect(text).toContain("Found results");
  });

  test("shows Args and Error sections for failed tool calls", () => {
    const event = makeToolCallEvent({
      status: "error",
      toolArgs: { query: "test" },
      error: "Connection timeout",
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Args");
    expect(text).toContain("Error");
    expect(text).toContain("Connection timeout");
  });

  test("shows Summary section for compaction events", () => {
    const event = makeCompactionEvent({
      summary: "Compacted messages",
      beforeTokenEstimate: 50000,
      afterTokenEstimate: 8000,
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Summary");
    expect(text).toContain("Compacted messages");
    expect(text).toContain("Before:");
    expect(text).toContain("After:");
  });

  test("shows Error section for error events", () => {
    const event = makeErrorEvent({
      error: new Error("Fatal error"),
      code: "ERR_FATAL",
      retryable: false,
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Error");
    expect(text).toContain("Fatal error");
    expect(text).toContain("Code: ERR_FATAL");
    expect(text).toContain("Retryable: no");
  });

  test("shows Details section for done events", () => {
    const event = makeDoneEvent({
      finishReason: "stop",
      totalTokensUsed: 5000,
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Details");
    expect(text).toContain("Finish reason: stop");
    expect(text).toContain("Tokens used:");
  });

  test("shows Details section for aborted events", () => {
    const event = makeAbortedEvent({
      reason: "User cancelled",
      initiatedBy: "user",
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Details");
    expect(text).toContain("Reason: User cancelled");
    expect(text).toContain("Initiated by: user");
  });

  test("shows Child Agent section for child_agent events", () => {
    const event = makeChildAgentEvent({
      childId: "agent-42",
      eventType: "done",
      payload: { result: "completed" },
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Child Agent");
    expect(text).toContain("ID: agent-42");
    expect(text).toContain("Event: done");
  });

  test("shows Thinking section for thinking events", () => {
    const event = makeThinkingEvent({
      content: "Let me think about this...",
      estimatedTokens: 42,
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Thinking");
    expect(text).toContain("Let me think about this...");
    expect(text).toContain("~42 tokens");
  });

  test("limits output to MAX_EXPANDED_LINES (10)", () => {
    const event = makeToolCallEvent({
      status: "success",
      toolArgs: "a".repeat(500),
      result: "b".repeat(500),
    });
    const lines = formatExpandedLines(event, innerWidth);
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  test("omits Args section when toolArgs is undefined", () => {
    const event = makeToolCallEvent({
      status: "success",
      toolArgs: undefined,
      result: "Some result",
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).not.toContain("Args");
    expect(text).toContain("Result");
  });

  test("omits Result section when result is undefined for success", () => {
    const event = makeToolCallEvent({
      status: "success",
      toolArgs: { query: "test" },
      result: undefined,
    });
    const lines = formatExpandedLines(event, innerWidth);
    const text = lines.join("\n");
    expect(text).toContain("Args");
    expect(text).not.toContain("Result");
  });
});
