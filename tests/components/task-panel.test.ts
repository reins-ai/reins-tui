import { describe, expect, test } from "bun:test";

import {
  getStatusGlyph,
  getStatusColorToken,
  getStatusLabel,
  truncatePreview,
  formatDuration,
  padTaskLine,
  selectRecentTasks,
  buildTaskSummaryLine,
  buildExpandedLines,
  wrapText,
  resolveTaskLineColor,
  getAgentStatusGlyph,
  getAgentStatusColorToken,
  buildAgentCardLine,
  hasActiveAgents,
  type TaskItem,
  type TaskItemStatus,
  type SubAgentInfo,
  type SubAgentStatus,
} from "../../src/components/task-panel";
import type { ThemeTokens } from "../../src/theme/theme-schema";

// --- Mock tokens ---

const MOCK_TOKENS: ThemeTokens = {
  "surface.primary": "#1a1a2e",
  "surface.secondary": "#252540",
  "surface.tertiary": "#2e2e4a",
  "surface.elevated": "#353555",
  "text.primary": "#e8e0d4",
  "text.secondary": "#a09888",
  "text.muted": "#6b6360",
  "text.inverse": "#1a1a2e",
  "accent.primary": "#e8976c",
  "accent.secondary": "#f0c674",
  "accent.subtle": "#4a3a2e",
  "border.primary": "#4a4a6a",
  "border.subtle": "#3a3a5a",
  "border.focus": "#e8976c",
  "status.error": "#e85050",
  "status.success": "#50c878",
  "status.warning": "#f0c674",
  "status.info": "#6ca8e8",
  "glyph.reins": "#e8976c",
  "glyph.user": "#f0c674",
  "glyph.tool.running": "#6ca8e8",
  "glyph.tool.done": "#50c878",
  "glyph.tool.error": "#e85050",
  "glyph.heartbeat": "#e8976c",
  "conversation.user.bg": "#2e2e4a",
  "conversation.user.text": "#e8e0d4",
  "conversation.assistant.bg": "#1a1a2e",
  "conversation.assistant.text": "#e8e0d4",
  "sidebar.bg": "#1a1a2e",
  "sidebar.text": "#a09888",
  "sidebar.active": "#e8976c",
  "sidebar.hover": "#353555",
  "input.bg": "#252540",
  "input.text": "#e8e0d4",
  "input.placeholder": "#6b6360",
  "input.border": "#4a4a6a",
  "depth.panel1": "#252540",
  "depth.panel2": "#2e2e4a",
  "depth.panel3": "#353555",
  "depth.interactive": "#3a3a5a",
  "role.user.border": "#e8976c",
  "role.assistant.border": "#6ca8e8",
  "role.system.border": "#50c878",
};

// --- Test data factories ---

function createTask(overrides?: Partial<TaskItem>): TaskItem {
  return {
    id: "task-001",
    prompt: "Summarize the quarterly report",
    status: "complete",
    result: "The quarterly report shows 15% growth in revenue.",
    createdAt: new Date("2026-02-19T10:00:00.000Z"),
    startedAt: new Date("2026-02-19T10:00:01.000Z"),
    completedAt: new Date("2026-02-19T10:00:30.000Z"),
    delivered: false,
    ...overrides,
  } as TaskItem;
}

function createTasks(count: number): TaskItem[] {
  return Array.from({ length: count }, (_, i) => createTask({
    id: `task-${String(i + 1).padStart(3, "0")}`,
    prompt: `Task number ${i + 1} description`,
    status: (["pending", "running", "complete", "failed"] as const)[i % 4],
    createdAt: new Date(`2026-02-19T${String(10 + i).padStart(2, "0")}:00:00.000Z`),
    startedAt: i > 0 ? new Date(`2026-02-19T${String(10 + i).padStart(2, "0")}:00:01.000Z`) : undefined,
    completedAt: i % 4 === 2 ? new Date(`2026-02-19T${String(10 + i).padStart(2, "0")}:00:30.000Z`) : undefined,
  }));
}

// ---------------------------------------------------------------------------
// getStatusGlyph
// ---------------------------------------------------------------------------

describe("getStatusGlyph", () => {
  test("returns open circle for pending", () => {
    expect(getStatusGlyph("pending")).toBe("\u25CB");
  });

  test("returns quarter circle for running", () => {
    expect(getStatusGlyph("running")).toBe("\u25D4");
  });

  test("returns filled circle for complete", () => {
    expect(getStatusGlyph("complete")).toBe("\u25CF");
  });

  test("returns cross for failed", () => {
    expect(getStatusGlyph("failed")).toBe("\u2716");
  });
});

// ---------------------------------------------------------------------------
// getStatusColorToken
// ---------------------------------------------------------------------------

describe("getStatusColorToken", () => {
  test("returns warning color for pending", () => {
    expect(getStatusColorToken("pending", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("returns info color for running", () => {
    expect(getStatusColorToken("running", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.info"]);
  });

  test("returns success color for complete", () => {
    expect(getStatusColorToken("complete", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.success"]);
  });

  test("returns error color for failed", () => {
    expect(getStatusColorToken("failed", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.error"]);
  });
});

// ---------------------------------------------------------------------------
// getStatusLabel
// ---------------------------------------------------------------------------

describe("getStatusLabel", () => {
  test("returns Pending for pending", () => {
    expect(getStatusLabel("pending")).toBe("Pending");
  });

  test("returns Running for running", () => {
    expect(getStatusLabel("running")).toBe("Running");
  });

  test("returns Done for complete", () => {
    expect(getStatusLabel("complete")).toBe("Done");
  });

  test("returns Failed for failed", () => {
    expect(getStatusLabel("failed")).toBe("Failed");
  });
});

// ---------------------------------------------------------------------------
// truncatePreview
// ---------------------------------------------------------------------------

describe("truncatePreview", () => {
  test("returns text unchanged when within limit", () => {
    expect(truncatePreview("short text", 80)).toBe("short text");
  });

  test("truncates with ellipsis when exceeding limit", () => {
    const longText = "a".repeat(100);
    const result = truncatePreview(longText, 80);
    expect(result).toHaveLength(80);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  test("returns text unchanged when exactly at limit", () => {
    const exactText = "a".repeat(80);
    expect(truncatePreview(exactText, 80)).toBe(exactText);
  });

  test("handles empty string", () => {
    expect(truncatePreview("", 80)).toBe("");
  });

  test("handles single character", () => {
    expect(truncatePreview("x", 1)).toBe("x");
  });

  test("truncates to 1 character with ellipsis when maxLength is 1 and text is longer", () => {
    // maxLength 1 means slice(0, 0) + ellipsis = just ellipsis
    const result = truncatePreview("hello", 1);
    expect(result).toHaveLength(1);
    expect(result).toBe("\u2026");
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  test("returns em dash when startedAt is undefined", () => {
    expect(formatDuration(undefined, undefined)).toBe("\u2014");
  });

  test("returns <1s for sub-second durations", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T10:00:00.500Z");
    expect(formatDuration(start, end)).toBe("<1s");
  });

  test("returns seconds for short durations", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T10:00:30.000Z");
    expect(formatDuration(start, end)).toBe("30s");
  });

  test("returns minutes and seconds for medium durations", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T10:02:15.000Z");
    expect(formatDuration(start, end)).toBe("2m 15s");
  });

  test("returns minutes only when seconds are zero", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T10:05:00.000Z");
    expect(formatDuration(start, end)).toBe("5m");
  });

  test("returns hours and minutes for long durations", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T11:30:00.000Z");
    expect(formatDuration(start, end)).toBe("1h 30m");
  });

  test("returns hours only when minutes are zero", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T12:00:00.000Z");
    expect(formatDuration(start, end)).toBe("2h");
  });

  test("uses now parameter when completedAt is undefined", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const now = new Date("2026-02-19T10:00:45.000Z");
    expect(formatDuration(start, undefined, now)).toBe("45s");
  });

  test("returns 0s for negative duration", () => {
    const start = new Date("2026-02-19T10:00:30.000Z");
    const end = new Date("2026-02-19T10:00:00.000Z");
    expect(formatDuration(start, end)).toBe("0s");
  });

  test("returns 1s for exactly one second", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const end = new Date("2026-02-19T10:00:01.000Z");
    expect(formatDuration(start, end)).toBe("1s");
  });
});

// ---------------------------------------------------------------------------
// padTaskLine
// ---------------------------------------------------------------------------

describe("padTaskLine", () => {
  test("pads short content to fill card width", () => {
    const result = padTaskLine("hello", 42);
    expect(result.startsWith("\u2502 ")).toBe(true);
    expect(result.endsWith(" \u2502")).toBe(true);
    // Total length: 42 chars
    expect(result).toHaveLength(42);
  });

  test("truncates content that exceeds available width", () => {
    const longContent = "a".repeat(50);
    const result = padTaskLine(longContent, 42);
    expect(result).toHaveLength(42);
    expect(result.includes("\u2026")).toBe(true);
  });

  test("handles empty content", () => {
    const result = padTaskLine("", 42);
    expect(result.startsWith("\u2502 ")).toBe(true);
    expect(result.endsWith(" \u2502")).toBe(true);
    expect(result).toHaveLength(42);
  });

  test("handles content exactly at available width", () => {
    const exactContent = "a".repeat(38); // 42 - 4 = 38
    const result = padTaskLine(exactContent, 42);
    expect(result).toHaveLength(42);
    expect(result.includes("\u2026")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// selectRecentTasks
// ---------------------------------------------------------------------------

describe("selectRecentTasks", () => {
  test("returns all tasks when fewer than MAX_TASKS", () => {
    const tasks = createTasks(3);
    const result = selectRecentTasks(tasks);
    expect(result).toHaveLength(3);
  });

  test("returns exactly MAX_TASKS when more are provided", () => {
    const tasks = createTasks(8);
    const result = selectRecentTasks(tasks);
    expect(result).toHaveLength(5);
  });

  test("sorts by createdAt descending (most recent first)", () => {
    const tasks = createTasks(3);
    const result = selectRecentTasks(tasks);
    expect(result[0].id).toBe("task-003");
    expect(result[1].id).toBe("task-002");
    expect(result[2].id).toBe("task-001");
  });

  test("returns empty array for empty input", () => {
    const result = selectRecentTasks([]);
    expect(result).toHaveLength(0);
  });

  test("does not mutate the original array", () => {
    const tasks = createTasks(3);
    const originalOrder = tasks.map((t) => t.id);
    selectRecentTasks(tasks);
    expect(tasks.map((t) => t.id)).toEqual(originalOrder);
  });

  test("selects the 5 most recent from 8 tasks", () => {
    const tasks = createTasks(8);
    const result = selectRecentTasks(tasks);
    // Tasks 4-8 are the most recent (indices 3-7, hours 13-17)
    expect(result.map((t) => t.id)).toEqual([
      "task-008",
      "task-007",
      "task-006",
      "task-005",
      "task-004",
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildTaskSummaryLine
// ---------------------------------------------------------------------------

describe("buildTaskSummaryLine", () => {
  test("includes status glyph", () => {
    const task = createTask({ status: "complete" });
    const line = buildTaskSummaryLine(task, 38);
    expect(line.includes(getStatusGlyph("complete"))).toBe(true);
  });

  test("includes status label", () => {
    const task = createTask({ status: "running" });
    const line = buildTaskSummaryLine(task, 38);
    expect(line.includes("Running")).toBe(true);
  });

  test("includes duration", () => {
    const task = createTask({
      startedAt: new Date("2026-02-19T10:00:00.000Z"),
      completedAt: new Date("2026-02-19T10:00:30.000Z"),
    });
    const line = buildTaskSummaryLine(task, 38);
    expect(line.includes("30s")).toBe(true);
  });

  test("includes truncated preview of prompt", () => {
    const task = createTask({ prompt: "Summarize the quarterly report" });
    const line = buildTaskSummaryLine(task, 38);
    expect(line.includes("Summarize")).toBe(true);
  });

  test("truncates long prompts", () => {
    const task = createTask({ prompt: "a".repeat(200) });
    const line = buildTaskSummaryLine(task, 38);
    expect(line.length).toBeLessThanOrEqual(38);
  });

  test("uses now parameter for running tasks", () => {
    const start = new Date("2026-02-19T10:00:00.000Z");
    const now = new Date("2026-02-19T10:00:45.000Z");
    const task = createTask({
      status: "running",
      startedAt: start,
      completedAt: undefined,
    });
    const line = buildTaskSummaryLine(task, 38, now);
    expect(line.includes("45s")).toBe(true);
  });

  test("shows em dash for pending tasks without startedAt", () => {
    const task = createTask({
      status: "pending",
      startedAt: undefined,
      completedAt: undefined,
    });
    const line = buildTaskSummaryLine(task, 38);
    expect(line.includes("\u2014")).toBe(true);
  });

  test("handles all four statuses", () => {
    const statuses: TaskItemStatus[] = ["pending", "running", "complete", "failed"];
    for (const status of statuses) {
      const task = createTask({ status });
      const line = buildTaskSummaryLine(task, 38);
      expect(line.includes(getStatusGlyph(status))).toBe(true);
      expect(line.includes(getStatusLabel(status))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// buildExpandedLines
// ---------------------------------------------------------------------------

describe("buildExpandedLines", () => {
  test("includes separator line", () => {
    const task = createTask();
    const lines = buildExpandedLines(task, 42);
    expect(lines.length).toBeGreaterThan(0);
    // First line should be a separator
    expect(lines[0].text.includes("─")).toBe(true);
    expect(lines[0].colorKey).toBe("muted");
  });

  test("includes full prompt text", () => {
    const task = createTask({ prompt: "Summarize the quarterly report" });
    const lines = buildExpandedLines(task, 42);
    const promptLines = lines.filter((l) => l.colorKey === "primary");
    expect(promptLines.length).toBeGreaterThan(0);
    const fullText = promptLines.map((l) => l.text).join("");
    expect(fullText.includes("Summarize")).toBe(true);
  });

  test("includes result for complete tasks", () => {
    const task = createTask({
      status: "complete",
      result: "The report shows growth.",
    });
    const lines = buildExpandedLines(task, 42);
    const resultLines = lines.filter((l) => l.colorKey === "secondary");
    expect(resultLines.length).toBeGreaterThan(0);
    const fullText = resultLines.map((l) => l.text).join("");
    expect(fullText.includes("growth")).toBe(true);
  });

  test("includes error for failed tasks", () => {
    const task = createTask({
      status: "failed",
      error: "Connection timeout",
      result: undefined,
    });
    const lines = buildExpandedLines(task, 42);
    const errorLines = lines.filter((l) => l.colorKey === "error");
    expect(errorLines.length).toBeGreaterThan(0);
    const fullText = errorLines.map((l) => l.text).join("");
    expect(fullText.includes("timeout")).toBe(true);
  });

  test("includes duration line when startedAt exists", () => {
    const task = createTask({
      startedAt: new Date("2026-02-19T10:00:00.000Z"),
      completedAt: new Date("2026-02-19T10:00:30.000Z"),
    });
    const lines = buildExpandedLines(task, 42);
    const durationLines = lines.filter((l) => l.text.includes("Duration:"));
    expect(durationLines).toHaveLength(1);
    expect(durationLines[0].text.includes("30s")).toBe(true);
  });

  test("omits result section for pending tasks", () => {
    const task = createTask({
      status: "pending",
      result: undefined,
      error: undefined,
    });
    const lines = buildExpandedLines(task, 42);
    const resultLines = lines.filter((l) => l.colorKey === "secondary");
    expect(resultLines).toHaveLength(0);
  });

  test("omits error section for complete tasks", () => {
    const task = createTask({
      status: "complete",
      result: "Done",
      error: undefined,
    });
    const lines = buildExpandedLines(task, 42);
    const errorLines = lines.filter((l) => l.colorKey === "error");
    expect(errorLines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// wrapText
// ---------------------------------------------------------------------------

describe("wrapText", () => {
  test("returns single line for short text", () => {
    const result = wrapText("hello world", 30, 5);
    expect(result).toEqual(["hello world"]);
  });

  test("wraps text at word boundaries", () => {
    const result = wrapText("hello world foo bar", 12, 5);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(12);
    }
  });

  test("respects maxLines limit", () => {
    const longText = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const result = wrapText(longText, 15, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test("handles single long word", () => {
    const result = wrapText("superlongword", 5, 3);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].length).toBeLessThanOrEqual(5);
  });

  test("handles empty string", () => {
    const result = wrapText("", 30, 5);
    expect(result).toEqual([]);
  });

  test("handles text with multiple spaces", () => {
    const result = wrapText("hello   world", 30, 5);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// resolveTaskLineColor
// ---------------------------------------------------------------------------

describe("resolveTaskLineColor", () => {
  test("resolves primary to text.primary", () => {
    expect(resolveTaskLineColor("primary", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.primary"]);
  });

  test("resolves secondary to text.secondary", () => {
    expect(resolveTaskLineColor("secondary", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.secondary"]);
  });

  test("resolves muted to text.muted", () => {
    expect(resolveTaskLineColor("muted", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("resolves accent to accent.primary", () => {
    expect(resolveTaskLineColor("accent", MOCK_TOKENS)).toBe(MOCK_TOKENS["accent.primary"]);
  });

  test("resolves error to status.error", () => {
    expect(resolveTaskLineColor("error", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.error"]);
  });
});

// ---------------------------------------------------------------------------
// Integration: full panel data flow
// ---------------------------------------------------------------------------

describe("TaskPanel data flow", () => {
  test("complete flow: select recent, build summaries, expand selected", () => {
    const tasks = createTasks(7);
    const recent = selectRecentTasks(tasks);

    // Should have 5 most recent
    expect(recent).toHaveLength(5);

    // Each should produce a valid summary line
    for (const task of recent) {
      const summary = buildTaskSummaryLine(task, 38);
      expect(summary.length).toBeLessThanOrEqual(38);
      expect(summary.includes(getStatusGlyph(task.status))).toBe(true);
    }

    // Expanding a task should produce detail lines
    const expanded = buildExpandedLines(recent[0], 42);
    expect(expanded.length).toBeGreaterThan(0);
  });

  test("all status types produce valid color tokens", () => {
    const statuses: TaskItemStatus[] = ["pending", "running", "complete", "failed"];
    for (const status of statuses) {
      const color = getStatusColorToken(status, MOCK_TOKENS);
      expect(color).toBeTruthy();
      expect(color.startsWith("#")).toBe(true);
    }
  });

  test("padded lines maintain consistent width", () => {
    const widths = [30, 42, 50];
    for (const width of widths) {
      const line = padTaskLine("test content", width);
      expect(line).toHaveLength(width);
    }
  });
});

// ---------------------------------------------------------------------------
// Sub-agent status card utilities
// ---------------------------------------------------------------------------

function createAgent(overrides?: Partial<SubAgentInfo>): SubAgentInfo {
  return {
    id: "agent-1",
    status: "running",
    stepsUsed: 3,
    prompt: "Summarize the quarterly report for the board meeting",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getAgentStatusGlyph
// ---------------------------------------------------------------------------

describe("getAgentStatusGlyph", () => {
  test("returns hourglass for queued", () => {
    expect(getAgentStatusGlyph("queued")).toBe("\u23F3");
  });

  test("returns play triangle for running", () => {
    expect(getAgentStatusGlyph("running")).toBe("\u25B6");
  });

  test("returns check mark for done", () => {
    expect(getAgentStatusGlyph("done")).toBe("\u2713");
  });

  test("returns cross for failed", () => {
    expect(getAgentStatusGlyph("failed")).toBe("\u2717");
  });
});

// ---------------------------------------------------------------------------
// getAgentStatusColorToken
// ---------------------------------------------------------------------------

describe("getAgentStatusColorToken", () => {
  test("returns muted color for queued", () => {
    expect(getAgentStatusColorToken("queued", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("returns warning color for running", () => {
    expect(getAgentStatusColorToken("running", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("returns success color for done", () => {
    expect(getAgentStatusColorToken("done", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.success"]);
  });

  test("returns error color for failed", () => {
    expect(getAgentStatusColorToken("failed", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.error"]);
  });
});

// ---------------------------------------------------------------------------
// buildAgentCardLine
// ---------------------------------------------------------------------------

describe("buildAgentCardLine", () => {
  test("includes status glyph for running agent", () => {
    const agent = createAgent({ status: "running" });
    const line = buildAgentCardLine(agent, 38);
    expect(line.includes(getAgentStatusGlyph("running"))).toBe(true);
  });

  test("includes agent id", () => {
    const agent = createAgent({ id: "sub-42" });
    const line = buildAgentCardLine(agent, 38);
    expect(line.includes("sub-42")).toBe(true);
  });

  test("includes status text", () => {
    const agent = createAgent({ status: "done" });
    const line = buildAgentCardLine(agent, 38);
    expect(line.includes("done")).toBe(true);
  });

  test("includes steps used with singular form", () => {
    const agent = createAgent({ stepsUsed: 1 });
    const line = buildAgentCardLine(agent, 60);
    expect(line.includes("1 step")).toBe(true);
    expect(line.includes("1 steps")).toBe(false);
  });

  test("includes steps used with plural form", () => {
    const agent = createAgent({ stepsUsed: 5 });
    const line = buildAgentCardLine(agent, 60);
    expect(line.includes("5 steps")).toBe(true);
  });

  test("includes truncated prompt preview", () => {
    const agent = createAgent({
      prompt: "Summarize the quarterly report for the board meeting presentation",
    });
    const line = buildAgentCardLine(agent, 80);
    expect(line.includes("Summarize")).toBe(true);
  });

  test("truncates long prompts to 50 chars max", () => {
    const longPrompt = "a".repeat(200);
    const agent = createAgent({ prompt: longPrompt });
    const line = buildAgentCardLine(agent, 120);
    // The prompt portion should be at most 50 chars (including ellipsis)
    const promptPart = line.slice(line.lastIndexOf("  ") + 2);
    expect(promptPart.length).toBeLessThanOrEqual(50);
  });

  test("handles all four statuses", () => {
    const statuses: SubAgentStatus[] = ["queued", "running", "done", "failed"];
    for (const status of statuses) {
      const agent = createAgent({ status });
      const line = buildAgentCardLine(agent, 60);
      expect(line.includes(getAgentStatusGlyph(status))).toBe(true);
      expect(line.includes(status)).toBe(true);
    }
  });

  test("handles zero steps", () => {
    const agent = createAgent({ stepsUsed: 0 });
    const line = buildAgentCardLine(agent, 60);
    expect(line.includes("0 steps")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasActiveAgents
// ---------------------------------------------------------------------------

describe("hasActiveAgents", () => {
  test("returns true when any agent is queued", () => {
    const agents = [
      createAgent({ status: "queued" }),
      createAgent({ id: "agent-2", status: "done" }),
    ];
    expect(hasActiveAgents(agents)).toBe(true);
  });

  test("returns true when any agent is running", () => {
    const agents = [
      createAgent({ status: "running" }),
      createAgent({ id: "agent-2", status: "done" }),
    ];
    expect(hasActiveAgents(agents)).toBe(true);
  });

  test("returns false when all agents are done", () => {
    const agents = [
      createAgent({ status: "done" }),
      createAgent({ id: "agent-2", status: "done" }),
    ];
    expect(hasActiveAgents(agents)).toBe(false);
  });

  test("returns false when all agents are failed", () => {
    const agents = [
      createAgent({ status: "failed" }),
      createAgent({ id: "agent-2", status: "failed" }),
    ];
    expect(hasActiveAgents(agents)).toBe(false);
  });

  test("returns false when agents array is empty", () => {
    expect(hasActiveAgents([])).toBe(false);
  });

  test("returns false when mix of done and failed only", () => {
    const agents = [
      createAgent({ status: "done" }),
      createAgent({ id: "agent-2", status: "failed" }),
    ];
    expect(hasActiveAgents(agents)).toBe(false);
  });
});
