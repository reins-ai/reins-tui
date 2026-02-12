export type ToolCallStatus = "queued" | "running" | "success" | "error";

export interface ToolCall {
  id: string;
  toolName: string;
  status: ToolCallStatus;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
}

export interface ToolQueuedEvent {
  type: "ToolQueued";
  id: string;
  toolName: string;
  args?: Record<string, unknown>;
  timestamp?: number;
}

export interface ToolStartedEvent {
  type: "ToolStarted";
  id: string;
  timestamp: number;
}

export interface ToolCompletedEvent {
  type: "ToolCompleted";
  id: string;
  result?: unknown;
  timestamp: number;
}

export interface ToolFailedEvent {
  type: "ToolFailed";
  id: string;
  error: string;
  timestamp: number;
}

export type ToolEvent = ToolQueuedEvent | ToolStartedEvent | ToolCompletedEvent | ToolFailedEvent;

export function createQueuedToolCall(event: ToolQueuedEvent): ToolCall {
  return {
    id: event.id,
    toolName: event.toolName,
    status: "queued",
    args: event.args,
    startedAt: event.timestamp,
  };
}

export function toolCallReducer(state: ToolCall, event: ToolEvent): ToolCall {
  if (event.id !== state.id) {
    return state;
  }

  switch (event.type) {
    case "ToolQueued":
      if (state.status !== "queued") {
        return state;
      }

      return {
        ...state,
        toolName: event.toolName,
        args: event.args ?? state.args,
      };
    case "ToolStarted":
      if (state.status !== "queued") {
        return state;
      }

      return {
        ...state,
        status: "running",
        startedAt: event.timestamp,
      };
    case "ToolCompleted":
      if (state.status !== "running") {
        return state;
      }

      return {
        ...state,
        status: "success",
        result: event.result,
        completedAt: event.timestamp,
        duration: calculateDuration(state.startedAt, event.timestamp),
      };
    case "ToolFailed":
      if (state.status !== "running") {
        return state;
      }

      return {
        ...state,
        status: "error",
        error: event.error,
        completedAt: event.timestamp,
        duration: calculateDuration(state.startedAt, event.timestamp),
      };
    default:
      return state;
  }
}

export function getToolGlyph(status: ToolCallStatus): string {
  switch (status) {
    case "queued":
    case "running":
      return "◎";
    case "success":
      return "✦";
    case "error":
      return "✧";
  }
}

export interface ToolMessageContent {
  glyph: string;
  label: string;
  detail?: string;
}

export function toolCallToMessageContent(call: ToolCall): ToolMessageContent {
  const glyph = getToolGlyph(call.status);
  const toolLabel = formatToolLabel(call.toolName);

  switch (call.status) {
    case "queued":
      return {
        glyph,
        label: `Queued ${toolLabel}...`,
        detail: buildToolDetail(call),
      };
    case "running":
      return {
        glyph,
        label: `Running ${toolLabel}...`,
        detail: buildToolDetail(call),
      };
    case "success":
      return {
        glyph,
        label: call.duration === undefined ? `${toolLabel} complete` : `${toolLabel} complete (${call.duration}ms)`,
        detail: buildToolDetail(call),
      };
    case "error":
      return {
        glyph,
        label: `${toolLabel} failed: ${call.error ?? "unknown error"}`,
        detail: buildToolDetail(call),
      };
  }
}

function calculateDuration(startedAt: number | undefined, completedAt: number): number | undefined {
  if (startedAt === undefined) {
    return undefined;
  }

  return Math.max(0, completedAt - startedAt);
}

function formatToolLabel(toolName: string): string {
  const tail = toolName.split(/[./]/).filter((part) => part.length > 0).at(-1) ?? toolName;
  const normalized = tail.replace(/[-_]+/g, " ").trim();
  if (normalized.length === 0) {
    return "Tool";
  }

  return `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
}

function buildToolDetail(call: ToolCall): string | undefined {
  const sections: string[] = [];

  if (call.args !== undefined) {
    sections.push(`Args:\n${safePretty(call.args)}`);
  }

  if (call.result !== undefined) {
    sections.push(`Result:\n${safePretty(call.result)}`);
  }

  if (call.error !== undefined && call.error.length > 0) {
    sections.push(`Error:\n${call.error}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  return truncateDetail(sections.join("\n\n"), 500);
}

function safePretty(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) {
      return String(value);
    }

    return json;
  } catch {
    return String(value);
  }
}

function truncateDetail(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}
