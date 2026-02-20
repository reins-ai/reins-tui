import { describe, expect, it } from "bun:test";

import {
  handleTasksCommand,
  createTasksHandler,
  formatTaskTable,
  formatDuration,
  truncatePrompt,
  shortId,
  STATUS_ICONS,
} from "../../../src/commands/handlers/tasks";
import type { TasksCommandDeps, TaskRecord } from "../../../src/commands/handlers/tasks";
import { dispatchCommand } from "../../../src/commands/handlers";
import { parseSlashCommand } from "../../../src/commands/parser";
import { SLASH_COMMANDS, PALETTE_ACTIONS } from "../../../src/commands/registry";
import type { CommandHandlerContext } from "../../../src/commands/handlers/types";

// --- Test helpers ---

function createTestContext(): CommandHandlerContext {
  return {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default"],
      currentModel: "default",
      setModel() {},
    },
    theme: {
      activeTheme: "reins-dark",
      listThemes: () => ["reins-dark"],
      setTheme: () => true,
    },
    session: {
      activeConversationId: "conversation-1",
      messages: [],
      createConversation: () => "conversation-2",
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    memory: null,
    environment: null,
    daemonClient: null,
  };
}

function createMockTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "abcdef12-3456-7890-abcd-ef1234567890",
    prompt: "Research quantum computing advances",
    status: "pending",
    createdAt: new Date("2026-02-19T10:00:00Z"),
    delivered: false,
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<TasksCommandDeps> = {}): TasksCommandDeps {
  return {
    listTasks: async () => [],
    cancelTask: async () => true,
    retryTask: async () => createMockTask({ id: "new-task-id-1234-5678-abcd-ef1234567890", status: "pending" }),
    getTask: async () => null,
    ...overrides,
  };
}

async function runCommand(input: string, context: CommandHandlerContext) {
  const parsed = parseSlashCommand(input);
  if (!parsed.ok) {
    return parsed;
  }

  return dispatchCommand(parsed.value, context);
}

// --- Command registration ---

describe("/tasks command registration", () => {
  it("is recognized as a valid slash command", () => {
    const parsed = parseSlashCommand("/tasks");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("tasks");
    expect(parsed.value.command.handlerKey).toBe("TASKS");
    expect(parsed.value.command.category).toBe("system");
  });

  it("resolves via /bg alias", () => {
    const parsed = parseSlashCommand("/bg");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("tasks");
    expect(parsed.value.command.handlerKey).toBe("TASKS");
  });

  it("parses subcommands as positional args", () => {
    const parsedList = parseSlashCommand("/tasks list");
    expect(parsedList.ok).toBe(true);
    if (parsedList.ok) {
      expect(parsedList.value.args.positional[0]).toBe("list");
    }

    const parsedCancel = parseSlashCommand("/tasks cancel abc123");
    expect(parsedCancel.ok).toBe(true);
    if (parsedCancel.ok) {
      expect(parsedCancel.value.args.positional[0]).toBe("cancel");
      expect(parsedCancel.value.args.positional[1]).toBe("abc123");
    }

    const parsedRetry = parseSlashCommand("/tasks retry abc123");
    expect(parsedRetry.ok).toBe(true);
    if (parsedRetry.ok) {
      expect(parsedRetry.value.args.positional[0]).toBe("retry");
      expect(parsedRetry.value.args.positional[1]).toBe("abc123");
    }
  });

  it("is included in SLASH_COMMANDS list", () => {
    const tasksCommand = SLASH_COMMANDS.find((cmd) => cmd.name === "tasks");
    expect(tasksCommand).toBeDefined();
    expect(tasksCommand!.usage).toBe("/tasks [list|cancel|retry] [id]");
    expect(tasksCommand!.aliases).toContain("bg");
  });
});

// --- Default handler (no daemon) ---

describe("handleTasksCommand (default)", () => {
  it("returns informational message when no daemon is connected", async () => {
    const context = createTestContext();
    const result = await runCommand("/tasks", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("unavailable");
    expect(result.value.responseText).toBeDefined();
    expect(result.value.responseText!.toLowerCase()).toContain("daemon");
  });

  it("dispatches through command system", async () => {
    const context = createTestContext();
    const result = await runCommand("/tasks list", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBeDefined();
  });
});

// --- /tasks list ---

describe("createTasksHandler: list", () => {
  it("returns empty table when no tasks exist", async () => {
    const deps = createMockDeps({ listTasks: async () => [] });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["list"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("0 tasks found");
    expect(result.value.responseText).toContain("No background tasks found");
  });

  it("returns formatted table with tasks", async () => {
    const tasks: TaskRecord[] = [
      createMockTask({
        id: "task-0001-0000-0000-000000000001",
        prompt: "Research quantum computing",
        status: "complete",
        startedAt: new Date("2026-02-19T10:00:00Z"),
        completedAt: new Date("2026-02-19T10:02:30Z"),
      }),
      createMockTask({
        id: "task-0002-0000-0000-000000000002",
        prompt: "Summarize meeting notes",
        status: "running",
        startedAt: new Date("2026-02-19T10:05:00Z"),
      }),
      createMockTask({
        id: "task-0003-0000-0000-000000000003",
        prompt: "Draft email to team",
        status: "failed",
        error: "Provider timeout",
        startedAt: new Date("2026-02-19T10:03:00Z"),
        completedAt: new Date("2026-02-19T10:03:15Z"),
      }),
    ];

    const deps = createMockDeps({ listTasks: async () => tasks });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["list"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("3 tasks found");
    expect(result.value.responseText).toContain("task-000");
    expect(result.value.responseText).toContain("Research quantum computing");
    expect(result.value.responseText).toContain("Summarize meeting notes");
    expect(result.value.responseText).toContain("Draft email to team");
    expect(result.value.responseText).toContain("✅");
    expect(result.value.responseText).toContain("🔄");
    expect(result.value.responseText).toContain("❌");
  });

  it("defaults to list when no subcommand given", async () => {
    const tasks = [createMockTask({ status: "pending" })];
    const deps = createMockDeps({ listTasks: async () => tasks });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: [], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("1 task found");
  });

  it("singular 'task' for single result", async () => {
    const tasks = [createMockTask()];
    const deps = createMockDeps({ listTasks: async () => tasks });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["list"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("1 task found");
  });
});

// --- /tasks cancel ---

describe("createTasksHandler: cancel", () => {
  it("cancels a running task", async () => {
    const task = createMockTask({
      id: "cancel-me-1234-5678-abcd-ef1234567890",
      status: "running",
      prompt: "Long running analysis",
    });

    const deps = createMockDeps({
      getTask: async (id) => (id === task.id ? task : null),
      cancelTask: async (id) => id === task.id,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("cancelled");
    expect(result.value.responseText).toContain("cancel-m");
    expect(result.value.responseText).toContain("Long running analysis");
  });

  it("cancels a pending task", async () => {
    const task = createMockTask({
      id: "pending-task-1234-5678-abcd-ef1234567890",
      status: "pending",
      prompt: "Queued work",
    });

    const deps = createMockDeps({
      getTask: async (id) => (id === task.id ? task : null),
      cancelTask: async (id) => id === task.id,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("cancelled");
  });

  it("returns error when task ID is missing", async () => {
    const deps = createMockDeps();
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing task ID");
    expect(result.error.message).toContain("Usage");
  });

  it("returns error when task is not found", async () => {
    const deps = createMockDeps({
      getTask: async () => null,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel", "nonexistent-id"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toContain("nonexistent-id");
  });

  it("returns error when task is already complete", async () => {
    const task = createMockTask({
      id: "done-task-1234-5678-abcd-ef1234567890",
      status: "complete",
    });

    const deps = createMockDeps({
      getTask: async () => task,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("complete");
    expect(result.error.message).toContain("cannot be cancelled");
  });

  it("returns error when task is already failed", async () => {
    const task = createMockTask({
      id: "failed-task-1234-5678-abcd-ef1234567890",
      status: "failed",
    });

    const deps = createMockDeps({
      getTask: async () => task,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("failed");
    expect(result.error.message).toContain("cannot be cancelled");
  });

  it("returns error when cancel operation fails", async () => {
    const task = createMockTask({
      id: "race-task-1234-5678-abcd-ef1234567890",
      status: "running",
    });

    const deps = createMockDeps({
      getTask: async () => task,
      cancelTask: async () => false,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["cancel", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Failed to cancel");
  });
});

// --- /tasks retry ---

describe("createTasksHandler: retry", () => {
  it("retries a failed task", async () => {
    const failedTask = createMockTask({
      id: "failed-task-1234-5678-abcd-ef1234567890",
      status: "failed",
      prompt: "Analyze sales data",
      error: "Provider timeout",
    });

    const newTask = createMockTask({
      id: "new-task-9999-0000-0000-000000000001",
      status: "pending",
      prompt: "Analyze sales data",
    });

    const deps = createMockDeps({
      getTask: async (id) => (id === failedTask.id ? failedTask : null),
      retryTask: async (id) => (id === failedTask.id ? newTask : null),
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry", failedTask.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("retried");
    expect(result.value.responseText).toContain("new-task");
    expect(result.value.responseText).toContain("Analyze sales data");
  });

  it("returns error when task ID is missing", async () => {
    const deps = createMockDeps();
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing task ID");
    expect(result.error.message).toContain("Usage");
  });

  it("returns error when task is not found", async () => {
    const deps = createMockDeps({
      getTask: async () => null,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry", "nonexistent-id"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toContain("nonexistent-id");
  });

  it("returns error when task is not failed", async () => {
    const task = createMockTask({
      id: "running-task-1234-5678-abcd-ef1234567890",
      status: "running",
    });

    const deps = createMockDeps({
      getTask: async () => task,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("running");
    expect(result.error.message).toContain("Only failed tasks");
  });

  it("returns error when task is pending", async () => {
    const task = createMockTask({
      id: "pending-task-1234-5678-abcd-ef1234567890",
      status: "pending",
    });

    const deps = createMockDeps({
      getTask: async () => task,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("pending");
    expect(result.error.message).toContain("Only failed tasks");
  });

  it("returns error when task is complete", async () => {
    const task = createMockTask({
      id: "complete-task-1234-5678-abcd-ef1234567890",
      status: "complete",
    });

    const deps = createMockDeps({
      getTask: async () => task,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("complete");
    expect(result.error.message).toContain("Only failed tasks");
  });

  it("returns error when retry operation fails", async () => {
    const task = createMockTask({
      id: "retry-fail-1234-5678-abcd-ef1234567890",
      status: "failed",
    });

    const deps = createMockDeps({
      getTask: async () => task,
      retryTask: async () => null,
    });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["retry", task.id], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Failed to retry");
  });
});

// --- Unknown subcommand ---

describe("createTasksHandler: unknown subcommand", () => {
  it("returns error for unknown subcommand", async () => {
    const deps = createMockDeps();
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["status"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unknown subcommand");
    expect(result.error.message).toContain("status");
    expect(result.error.message).toContain("list|cancel|retry");
  });

  it("handles case-insensitive subcommands", async () => {
    const tasks = [createMockTask()];
    const deps = createMockDeps({ listTasks: async () => tasks });
    const handler = createTasksHandler(deps);

    const result = await handler(
      { positional: ["LIST"], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("1 task found");
  });
});

// --- Formatting helpers ---

describe("formatTaskTable", () => {
  it("returns 'no tasks' message for empty array", () => {
    const result = formatTaskTable([]);
    expect(result).toBe("No background tasks found.");
  });

  it("includes header and separator rows", () => {
    const tasks = [createMockTask()];
    const result = formatTaskTable(tasks);

    const lines = result.split("\n");
    expect(lines[0]).toContain("ID");
    expect(lines[0]).toContain("Status");
    expect(lines[0]).toContain("Prompt");
    expect(lines[0]).toContain("Duration");
    expect(lines[1]).toContain("---");
  });

  it("shows status icons for each status", () => {
    const tasks: TaskRecord[] = [
      createMockTask({ id: "id-pending-000-0000-0000-000000000001", status: "pending" }),
      createMockTask({ id: "id-running-000-0000-0000-000000000002", status: "running", startedAt: new Date() }),
      createMockTask({ id: "id-complete-00-0000-0000-000000000003", status: "complete", startedAt: new Date(), completedAt: new Date() }),
      createMockTask({ id: "id-failed-000-0000-0000-000000000004", status: "failed", startedAt: new Date(), completedAt: new Date() }),
    ];

    const result = formatTaskTable(tasks);

    expect(result).toContain("⏳");
    expect(result).toContain("🔄");
    expect(result).toContain("✅");
    expect(result).toContain("❌");
  });
});

describe("truncatePrompt", () => {
  it("returns short prompts unchanged", () => {
    expect(truncatePrompt("Hello world")).toBe("Hello world");
  });

  it("truncates long prompts with ellipsis", () => {
    const longPrompt = "A".repeat(100);
    const result = truncatePrompt(longPrompt, 60);

    expect(result.length).toBe(60);
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns exact-length prompts unchanged", () => {
    const exactPrompt = "A".repeat(60);
    expect(truncatePrompt(exactPrompt, 60)).toBe(exactPrompt);
  });
});

describe("formatDuration", () => {
  it("returns dash when task has no startedAt", () => {
    const task = createMockTask({ startedAt: undefined });
    expect(formatDuration(task)).toBe("—");
  });

  it("formats sub-second durations", () => {
    const task = createMockTask({
      startedAt: new Date("2026-02-19T10:00:00.000Z"),
      completedAt: new Date("2026-02-19T10:00:00.500Z"),
    });
    expect(formatDuration(task)).toBe("<1s");
  });

  it("formats seconds", () => {
    const task = createMockTask({
      startedAt: new Date("2026-02-19T10:00:00Z"),
      completedAt: new Date("2026-02-19T10:00:45Z"),
    });
    expect(formatDuration(task)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    const task = createMockTask({
      startedAt: new Date("2026-02-19T10:00:00Z"),
      completedAt: new Date("2026-02-19T10:02:30Z"),
    });
    expect(formatDuration(task)).toBe("2m 30s");
  });
});

describe("shortId", () => {
  it("returns first 8 characters", () => {
    expect(shortId("abcdef12-3456-7890-abcd-ef1234567890")).toBe("abcdef12");
  });

  it("handles short IDs gracefully", () => {
    expect(shortId("abc")).toBe("abc");
  });
});

describe("STATUS_ICONS", () => {
  it("has icons for all task statuses", () => {
    expect(STATUS_ICONS.pending).toBe("⏳");
    expect(STATUS_ICONS.running).toBe("🔄");
    expect(STATUS_ICONS.complete).toBe("✅");
    expect(STATUS_ICONS.failed).toBe("❌");
  });
});

// --- Palette entries ---

describe("palette entry: List Background Tasks", () => {
  it("palette action exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-list");
    expect(action).toBeDefined();
    expect(action!.label).toBe("List Background Tasks");
    expect(action!.actionKey).toBe("tasks-list");
    expect(action!.category).toBe("actions");
  });

  it("is searchable by 'tasks'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-list");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("tasks");
  });

  it("is searchable by 'background'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-list");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("background");
  });

  it("is searchable by 'queue'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-list");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("queue");
  });
});

describe("palette entry: Cancel Background Task", () => {
  it("palette action exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-cancel");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Cancel Background Task");
    expect(action!.actionKey).toBe("tasks-cancel");
    expect(action!.category).toBe("actions");
  });

  it("is searchable by 'cancel'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-cancel");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("cancel");
  });

  it("is searchable by 'stop'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-cancel");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("stop");
  });
});

describe("palette entry: Retry Failed Task", () => {
  it("palette action exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-retry");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Retry Failed Task");
    expect(action!.actionKey).toBe("tasks-retry");
    expect(action!.category).toBe("actions");
  });

  it("is searchable by 'retry'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-retry");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("retry");
  });

  it("is searchable by 'failed'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-retry");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("failed");
  });

  it("is searchable by 'rerun'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:tasks-retry");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("rerun");
  });
});
