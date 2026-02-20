import { err, ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

const TASKS_SUBCOMMANDS = ["list", "cancel", "retry"] as const;
type TasksSubcommand = (typeof TASKS_SUBCOMMANDS)[number];

function isTasksSubcommand(value: string): value is TasksSubcommand {
  return TASKS_SUBCOMMANDS.includes(value as TasksSubcommand);
}

// --- Task types (mirrors reins-core/src/tasks/types.ts) ---

export type TaskStatus = "pending" | "running" | "complete" | "failed";

export interface TaskRecord {
  id: string;
  prompt: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  conversationId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  workerId?: string;
  delivered: boolean;
}

// --- Dependency injection for testability ---

export interface TasksCommandDeps {
  listTasks: () => Promise<TaskRecord[]>;
  cancelTask: (taskId: string) => Promise<boolean>;
  retryTask: (taskId: string) => Promise<TaskRecord | null>;
  getTask: (taskId: string) => Promise<TaskRecord | null>;
}

// --- Formatting helpers ---

const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: "⏳",
  running: "🔄",
  complete: "✅",
  failed: "❌",
};

function truncatePrompt(prompt: string, maxLength: number = 60): string {
  if (prompt.length <= maxLength) {
    return prompt;
  }

  return `${prompt.slice(0, maxLength - 3)}...`;
}

function formatDuration(task: TaskRecord): string {
  if (!task.startedAt) {
    return "—";
  }

  const end = task.completedAt ?? new Date();
  const durationMs = end.getTime() - task.startedAt.getTime();

  if (durationMs < 1000) {
    return "<1s";
  }

  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatTaskTable(tasks: TaskRecord[]): string {
  if (tasks.length === 0) {
    return "No background tasks found.";
  }

  const header = "| ID       | Status    | Prompt                                                       | Duration |";
  const separator = "|----------|-----------|--------------------------------------------------------------|----------|";

  const rows = tasks.map((task) => {
    const icon = STATUS_ICONS[task.status];
    const id = shortId(task.id);
    const status = `${icon} ${task.status}`.padEnd(9);
    const prompt = truncatePrompt(task.prompt).padEnd(60);
    const duration = formatDuration(task).padEnd(8);
    return `| ${id} | ${status} | ${prompt} | ${duration} |`;
  });

  return [header, separator, ...rows].join("\n");
}

// --- Subcommand handlers ---

function createListHandler(deps: TasksCommandDeps): CommandHandler {
  return async () => {
    const tasks = await deps.listTasks();

    const table = formatTaskTable(tasks);

    return ok({
      statusMessage: `${tasks.length} task${tasks.length === 1 ? "" : "s"} found`,
      responseText: table,
    });
  };
}

function createCancelHandler(deps: TasksCommandDeps): CommandHandler {
  return async (args) => {
    const taskId = args.positional[1];

    if (!taskId) {
      return err({
        code: "INVALID_ARGUMENT",
        message: "Missing task ID. Usage: /tasks cancel <id>",
      });
    }

    const task = await deps.getTask(taskId);
    if (!task) {
      return err({
        code: "NOT_FOUND",
        message: `Task '${taskId}' not found.`,
      });
    }

    if (task.status !== "running" && task.status !== "pending") {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Task '${shortId(taskId)}' is ${task.status} and cannot be cancelled.`,
      });
    }

    const cancelled = await deps.cancelTask(taskId);
    if (!cancelled) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Failed to cancel task '${shortId(taskId)}'. It may have already completed.`,
      });
    }

    return ok({
      statusMessage: `Task ${shortId(taskId)} cancelled`,
      responseText: `Cancelled task ${shortId(taskId)}: "${truncatePrompt(task.prompt, 80)}"`,
    });
  };
}

function createRetryHandler(deps: TasksCommandDeps): CommandHandler {
  return async (args) => {
    const taskId = args.positional[1];

    if (!taskId) {
      return err({
        code: "INVALID_ARGUMENT",
        message: "Missing task ID. Usage: /tasks retry <id>",
      });
    }

    const task = await deps.getTask(taskId);
    if (!task) {
      return err({
        code: "NOT_FOUND",
        message: `Task '${taskId}' not found.`,
      });
    }

    if (task.status !== "failed") {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Task '${shortId(taskId)}' is ${task.status}. Only failed tasks can be retried.`,
      });
    }

    const newTask = await deps.retryTask(taskId);
    if (!newTask) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Failed to retry task '${shortId(taskId)}'.`,
      });
    }

    return ok({
      statusMessage: `Task ${shortId(taskId)} retried`,
      responseText: `Re-enqueued task as ${shortId(newTask.id)}: "${truncatePrompt(task.prompt, 80)}"`,
    });
  };
}

// --- Main handler with dependency injection ---

export function createTasksHandler(deps: TasksCommandDeps): CommandHandler {
  const subcommandHandlers: Record<TasksSubcommand, CommandHandler> = {
    list: createListHandler(deps),
    cancel: createCancelHandler(deps),
    retry: createRetryHandler(deps),
  };

  return (args, context) => {
    const subcommand = args.positional[0]?.trim().toLowerCase();

    if (!subcommand) {
      // Default to list when no subcommand given
      return subcommandHandlers.list(args, context);
    }

    if (!isTasksSubcommand(subcommand)) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Unknown subcommand '${subcommand}'. Usage: /tasks [${TASKS_SUBCOMMANDS.join("|")}]`,
      });
    }

    return subcommandHandlers[subcommand](args, context);
  };
}

/**
 * Default `/tasks` handler used when no daemon connection is available.
 * Returns an informational message that the daemon must be running.
 */
export const handleTasksCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Tasks unavailable",
    responseText: "The task queue is not available. Make sure the daemon is running.",
  });
};

// Re-export helpers for testing
export {
  formatTaskTable,
  formatDuration,
  truncatePrompt,
  shortId,
  STATUS_ICONS,
};
