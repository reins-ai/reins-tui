import { buildSimplifiedToolText } from "../lib/tool-output";

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
  const resultString = typeof call.result === "string"
    ? call.result
    : call.result === undefined
      ? undefined
      : safePretty(call.result);
  const simplified = buildSimplifiedToolText(call.args, resultString, call.error);
  if (simplified !== undefined) {
    return truncateDetail(simplified, 500);
  }

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

// --- Tool Visual State Model ---

/**
 * Normalized visual status for tool rendering. Maps the various lifecycle
 * status representations (ToolCallStatus, StreamToolCall.status,
 * DisplayToolCall.status) into a single UI-oriented enum.
 */
export type ToolVisualStatus = "queued" | "running" | "success" | "error";

/**
 * UI-ready tool state that components consume directly. Combines lifecycle
 * data with presentation metadata (glyph, label, color token, expand/collapse).
 */
export interface ToolVisualState {
  id: string;
  toolName: string;
  status: ToolVisualStatus;
  glyph: string;
  label: string;
  colorToken: string;
  detail: string | undefined;
  expanded: boolean;
  hasDetail: boolean;
  duration: number | undefined;
}

/**
 * Maps a ToolCallStatus to a color token name for theme resolution.
 */
export function getToolColorToken(status: ToolVisualStatus): string {
  switch (status) {
    case "queued":
    case "running":
      return "glyph.tool.running";
    case "success":
      return "glyph.tool.done";
    case "error":
      return "glyph.tool.error";
  }
}

/**
 * Adapter: converts a ToolCall (from tool-lifecycle reducer) into a
 * ToolVisualState ready for component rendering.
 */
export function toolCallToVisualState(
  call: ToolCall,
  expanded: boolean,
): ToolVisualState {
  const message = toolCallToMessageContent(call);
  const detail = message.detail;

  return {
    id: call.id,
    toolName: call.toolName,
    status: call.status,
    glyph: message.glyph,
    label: message.label,
    colorToken: getToolColorToken(call.status),
    detail,
    expanded: expanded && detail !== undefined,
    hasDetail: detail !== undefined,
    duration: call.duration,
  };
}

/**
 * Minimal shape for stream tool call data. Matches the fields used from
 * StreamToolCall without importing the full streaming-state module.
 */
export interface StreamToolCallLike {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Adapter: converts a StreamToolCall-like object into a ToolVisualState.
 * Normalizes the "complete" status to "success" for visual consistency.
 */
export function streamToolCallToVisualState(
  streamCall: StreamToolCallLike,
  expanded: boolean,
): ToolVisualState {
  const visualStatus = normalizeStreamStatus(streamCall.status);
  const toolLabel = formatToolLabel(streamCall.name);
  const glyph = getToolGlyph(visualStatus);
  const duration = computeStreamDuration(streamCall.startedAt, streamCall.completedAt);

  const label = buildStreamLabel(visualStatus, toolLabel, duration, streamCall.error);
  const detail = buildStreamDetail(streamCall);

  return {
    id: streamCall.id,
    toolName: streamCall.name,
    status: visualStatus,
    glyph,
    label,
    colorToken: getToolColorToken(visualStatus),
    detail,
    expanded: expanded && detail !== undefined,
    hasDetail: detail !== undefined,
    duration,
  };
}

/**
 * Minimal shape for display tool call data. Matches the fields used from
 * DisplayToolCall without importing store types.
 */
export interface DisplayToolCallLike {
  id: string;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  args?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  /** ISO timestamp when the tool call started running. */
  startedAt?: string;
  /** ISO timestamp when the tool call completed or failed. */
  completedAt?: string;
}

/**
 * Adapter: converts a DisplayToolCall-like object into a ToolVisualState.
 * Normalizes "pending" to "queued" and "complete" to "success".
 */
export function displayToolCallToVisualState(
  displayCall: DisplayToolCallLike,
  expanded: boolean,
): ToolVisualState {
  const visualStatus = normalizeDisplayStatus(displayCall.status);
  const toolLabel = formatToolLabel(displayCall.name);
  const glyph = getToolGlyph(visualStatus);
  const duration = computeStreamDuration(displayCall.startedAt, displayCall.completedAt);

  const label = buildDisplayLabel(visualStatus, toolLabel, displayCall, duration);
  const detail = buildDisplayDetail(displayCall);

  return {
    id: displayCall.id,
    toolName: displayCall.name,
    status: visualStatus,
    glyph,
    label,
    colorToken: getToolColorToken(visualStatus),
    detail,
    expanded: expanded && detail !== undefined,
    hasDetail: detail !== undefined,
    duration,
  };
}

function normalizeStreamStatus(status: "running" | "complete" | "error"): ToolVisualStatus {
  switch (status) {
    case "running":
      return "running";
    case "complete":
      return "success";
    case "error":
      return "error";
  }
}

function normalizeDisplayStatus(status: "pending" | "running" | "complete" | "error"): ToolVisualStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "complete":
      return "success";
    case "error":
      return "error";
  }
}

function computeStreamDuration(startedAt?: string, completedAt?: string): number | undefined {
  if (startedAt === undefined || completedAt === undefined) {
    return undefined;
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}

function buildStreamLabel(
  status: ToolVisualStatus,
  toolLabel: string,
  duration: number | undefined,
  error?: string,
): string {
  switch (status) {
    case "queued":
      return `Queued ${toolLabel}...`;
    case "running":
      return `Running ${toolLabel}...`;
    case "success":
      return duration === undefined
        ? `${toolLabel} complete`
        : `${toolLabel} complete (${duration}ms)`;
    case "error":
      return `${toolLabel} failed: ${error ?? "unknown error"}`;
  }
}

function buildStreamDetail(call: StreamToolCallLike): string | undefined {
  const simplified = buildSimplifiedToolText(call.args, call.result, call.error);
  if (simplified !== undefined) {
    return truncateDetail(simplified, 500);
  }

  const sections: string[] = [];

  if (call.args !== undefined) {
    sections.push(`Args:\n${safePretty(call.args)}`);
  }

  if (call.result !== undefined && call.result.length > 0) {
    sections.push(`Result:\n${call.result}`);
  }

  if (call.error !== undefined && call.error.length > 0) {
    sections.push(`Error:\n${call.error}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  return truncateDetail(sections.join("\n\n"), 500);
}

function buildDisplayLabel(
  status: ToolVisualStatus,
  toolLabel: string,
  call: DisplayToolCallLike,
  duration?: number,
): string {
  switch (status) {
    case "queued":
      return `Queued ${toolLabel}...`;
    case "running":
      return `Running ${toolLabel}...`;
    case "success":
      return duration !== undefined
        ? `${toolLabel} complete (${duration}ms)`
        : `${toolLabel} complete`;
    case "error": {
      const errorText = call.result && call.isError ? call.result : "unknown error";
      return duration !== undefined
        ? `${toolLabel} failed (${duration}ms): ${errorText}`
        : `${toolLabel} failed: ${errorText}`;
    }
  }
}

function buildDisplayDetail(call: DisplayToolCallLike): string | undefined {
  const simplified = buildSimplifiedToolText(
    call.args,
    call.result,
    call.isError ? call.result : undefined,
  );
  if (simplified !== undefined) {
    return truncateDetail(simplified, 500);
  }

  const sections: string[] = [];

  if (call.args !== undefined) {
    sections.push(`Args:\n${safePretty(call.args)}`);
  }

  if (call.result !== undefined && call.result.length > 0) {
    sections.push(`Result:\n${call.result}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  return truncateDetail(sections.join("\n\n"), 500);
}
