import type { DaemonClientError, DaemonMessage, DaemonStreamEvent, TokenUsage } from "../daemon/contracts";
import { err, ok, type Result } from "../daemon/contracts";
import {
  createInitialStatusMachineState,
  reduceStatusMachine,
  type StatusMachineEvent,
  type StatusMachineState,
} from "./status-machine";

export interface StreamToolCall {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  sequenceIndex: number;
  args?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

export interface TurnContentBlock {
  type: "text" | "tool-call" | "thinking";
  toolCallId?: string;
  text?: string;
}

export interface MultiToolTurnState {
  contentBlocks: TurnContentBlock[];
  thinkingContent: string;
  hasToolCalls: boolean;
  /** Text + tool-call blocks in event-arrival order (excludes thinking). */
  bodyBlocks: TurnContentBlock[];
  wasCancelled: boolean;
}

export type StreamingEvent =
  | {
      type: "user-send";
      timestamp: string;
      conversationId: string;
      userMessage: DaemonMessage;
    }
  | {
      type: "message-ack";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | DaemonStreamEvent
  | {
      type: "tool-call-start";
      timestamp: string;
      conversationId: string;
      messageId: string;
      toolCallId: string;
      name: string;
      args?: Record<string, unknown>;
    }
  | {
      type: "tool-call-complete";
      timestamp: string;
      conversationId: string;
      messageId: string;
      toolCallId: string;
      result?: string;
      error?: string;
    }
  | {
      type: "complete-timeout";
      timestamp: string;
    }
  | {
      type: "cancelled-complete";
      timestamp: string;
      conversationId: string;
      messageId: string;
      content: string;
    }
  | {
      type: "dismiss-error";
      timestamp: string;
    }
  | {
      type: "reset";
      timestamp: string;
    };

export type StreamingState =
  | {
      status: "idle";
      lifecycle: StatusMachineState;
      conversationId: string | null;
      messages: DaemonMessage[];
      toolCalls: StreamToolCall[];
      turnState: MultiToolTurnState;
    }
  | {
      status: "sending";
      lifecycle: StatusMachineState;
      conversationId: string;
      messages: DaemonMessage[];
      pendingUserMessageId: string;
      toolCalls: StreamToolCall[];
      turnState: MultiToolTurnState;
    }
  | {
      status: "thinking";
      lifecycle: StatusMachineState;
      conversationId: string;
      messages: DaemonMessage[];
      assistantMessageId: string;
      partialContent: string;
      toolCalls: StreamToolCall[];
      turnState: MultiToolTurnState;
    }
  | {
      status: "streaming";
      lifecycle: StatusMachineState;
      conversationId: string;
      messages: DaemonMessage[];
      assistantMessageId: string;
      partialContent: string;
      toolCalls: StreamToolCall[];
      turnState: MultiToolTurnState;
    }
  | {
      status: "complete";
      lifecycle: StatusMachineState;
      conversationId: string;
      messages: DaemonMessage[];
      assistantMessageId: string;
      content: string;
      toolCalls: StreamToolCall[];
      turnState: MultiToolTurnState;
      completedAt: string;
      finishReason?: string;
      usage?: TokenUsage;
    }
  | {
      status: "error";
      lifecycle: StatusMachineState;
      conversationId: string | null;
      messages: DaemonMessage[];
      assistantMessageId: string | null;
      partialContent: string;
      error: DaemonClientError;
      toolCalls: StreamToolCall[];
      turnState: MultiToolTurnState;
      failedAt: string;
    };

export function createInitialTurnState(): MultiToolTurnState {
  return {
    contentBlocks: [],
    thinkingContent: "",
    hasToolCalls: false,
    bodyBlocks: [],
    wasCancelled: false,
  };
}

export function createInitialStreamingState(timestamp: string): StreamingState {
  return {
    status: "idle",
    lifecycle: createInitialStatusMachineState(timestamp),
    conversationId: null,
    messages: [],
    toolCalls: [],
    turnState: createInitialTurnState(),
  };
}

function toStatusMachineEvent(event: StreamingEvent): StatusMachineEvent {
  switch (event.type) {
    case "user-send":
      return {
        type: "user-send",
        timestamp: event.timestamp,
        userMessageId: event.userMessage.id,
      };
    case "message-ack":
      return {
        type: "message-ack",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
      };
    case "start":
      return {
        type: "stream-start",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "delta":
      return {
        type: "stream-chunk",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "thinking-delta":
      return {
        type: "thinking-chunk",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "complete":
    case "cancelled-complete":
      return {
        type: "stream-complete",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "error":
      return {
        type: "stream-error",
        timestamp: event.timestamp,
        error: event.error,
      };
    case "tool-call-start":
      return {
        type: "tool-call-start",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "tool-call-complete":
      return {
        type: "tool-call-complete",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "complete-timeout":
      return {
        type: "complete-timeout",
        timestamp: event.timestamp,
      };
    case "dismiss-error":
      return {
        type: "dismiss-error",
        timestamp: event.timestamp,
      };
    case "reset":
      return {
        type: "reset",
        timestamp: event.timestamp,
      };
  }
}

function upsertAssistantMessage(messages: DaemonMessage[], messageId: string, content: string, createdAt: string): DaemonMessage[] {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return [
      ...messages,
      {
        id: messageId,
        role: "assistant",
        content,
        createdAt,
      },
    ];
  }

  const next = [...messages];
  next[index] = {
    ...next[index],
    content,
  };
  return next;
}

function resolveConversationId(state: StreamingState, event: StreamingEvent): string | null {
  if ("conversationId" in event && typeof event.conversationId === "string") {
    return event.conversationId;
  }

  return state.conversationId;
}

function applyToolCallStart(toolCalls: StreamToolCall[], event: Extract<StreamingEvent, { type: "tool-call-start" }>): StreamToolCall[] {
  const index = toolCalls.findIndex((toolCall) => toolCall.id === event.toolCallId);
  const nextSequenceIndex = index === -1 ? toolCalls.length : toolCalls[index].sequenceIndex;
  const nextToolCall: StreamToolCall = {
    id: event.toolCallId,
    name: event.name,
    status: "running",
    sequenceIndex: nextSequenceIndex,
    args: event.args,
    startedAt: event.timestamp,
  };

  if (index === -1) {
    return [...toolCalls, nextToolCall];
  }

  const next = [...toolCalls];
  next[index] = nextToolCall;
  return next;
}

function applyToolCallComplete(toolCalls: StreamToolCall[], event: Extract<StreamingEvent, { type: "tool-call-complete" }>): StreamToolCall[] {
  const index = toolCalls.findIndex((toolCall) => toolCall.id === event.toolCallId);
  if (index === -1) {
    return [
      ...toolCalls,
      {
        id: event.toolCallId,
        name: "unknown",
        status: event.error ? "error" : "complete",
        sequenceIndex: toolCalls.length,
        startedAt: event.timestamp,
        completedAt: event.timestamp,
        result: event.result,
        error: event.error,
      },
    ];
  }

  const next = [...toolCalls];
  const existing = next[index];
  next[index] = {
    ...existing,
    status: event.error ? "error" : "complete",
    completedAt: event.timestamp,
    result: event.result ?? existing.result,
    error: event.error,
  };
  return next;
}

/**
 * Append a text delta to body blocks. If the last body block is a text block,
 * append the delta to it. Otherwise create a new text block. This ensures
 * text arriving after a tool-call block becomes a separate block.
 */
function appendTextToBody(bodyBlocks: readonly TurnContentBlock[], delta: string): TurnContentBlock[] {
  const next = [...bodyBlocks];
  const last = next.length > 0 ? next[next.length - 1] : null;

  if (last && last.type === "text") {
    next[next.length - 1] = { type: "text", text: (last.text ?? "") + delta };
  } else {
    next.push({ type: "text", text: delta });
  }

  return next;
}

/**
 * Append a thinking delta to body blocks. If the last body block is a thinking
 * block, append the delta to it. Otherwise create a new thinking block.
 * This preserves interleaving order for thinking -> tool -> thinking flows.
 */
function appendThinkingToBody(bodyBlocks: readonly TurnContentBlock[], delta: string): TurnContentBlock[] {
  const next = [...bodyBlocks];
  const last = next.length > 0 ? next[next.length - 1] : null;

  if (last && last.type === "thinking") {
    next[next.length - 1] = { type: "thinking", text: (last.text ?? "") + delta };
  } else {
    next.push({ type: "thinking", text: delta });
  }

  return next;
}

/**
 * Add a tool-call block to body blocks if not already present.
 * Prevents duplicate blocks for the same tool call ID.
 */
function addToolBlockToBody(bodyBlocks: readonly TurnContentBlock[], toolCallId: string): TurnContentBlock[] {
  if (bodyBlocks.some((b) => b.type === "tool-call" && b.toolCallId === toolCallId)) {
    return bodyBlocks as TurnContentBlock[];
  }

  return [...bodyBlocks, { type: "tool-call", toolCallId }];
}

/**
 * Compose the final contentBlocks by prepending thinking (if any) to body blocks.
 */
function composeContentBlocks(thinkingContent: string, bodyBlocks: readonly TurnContentBlock[]): TurnContentBlock[] {
  // Backward compatibility: if no explicit thinking blocks were appended to
  // body, fall back to a single synthetic thinking block.
  const hasThinkingBlocks = bodyBlocks.some((block) => block.type === "thinking");
  if (!hasThinkingBlocks && thinkingContent.length > 0) {
    return [{ type: "thinking", text: thinkingContent }, ...bodyBlocks];
  }

  return [...bodyBlocks];
}

/**
 * Reconcile body blocks with authoritative final content from a complete event.
 * The block structure (ordering of text and tool-call blocks) is preserved.
 * Text content is reconciled against the authoritative `finalContent`.
 */
function reconcileBodyWithFinalContent(
  bodyBlocks: readonly TurnContentBlock[],
  finalContent: string,
  streamedContent: string,
): TurnContentBlock[] {
  // If content matches what we streamed, blocks are already accurate
  if (streamedContent === finalContent) {
    return bodyBlocks as TurnContentBlock[];
  }

  // If final content extends streamed content (common: complete has extra text not seen via deltas)
  if (finalContent.startsWith(streamedContent) && streamedContent.length > 0) {
    const suffix = finalContent.slice(streamedContent.length);
    const next = [...bodyBlocks];
    const lastIndex = findLastTextBlockIndex(next);

    if (lastIndex >= 0) {
      next[lastIndex] = { type: "text", text: (next[lastIndex].text ?? "") + suffix };
    } else {
      next.push({ type: "text", text: suffix });
    }
    return next;
  }

  // If we have no text blocks but final content has text, add a trailing text block
  const textBlocks = bodyBlocks.filter((b) => b.type === "text");
  if (textBlocks.length === 0 && finalContent.length > 0) {
    return [...bodyBlocks, { type: "text", text: finalContent }];
  }

  // General mismatch: redistribute final content across existing text block slots
  // preserving tool block positions
  if (finalContent.length > 0) {
    return redistributeTextContent(bodyBlocks, finalContent);
  }

  // Final content is empty — strip text blocks
  return bodyBlocks.filter((b) => b.type !== "text");
}

/**
 * Find the index of the last text block in the body blocks array.
 */
function findLastTextBlockIndex(blocks: readonly TurnContentBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === "text") return i;
  }
  return -1;
}

/**
 * Redistribute authoritative text content across existing text block slots,
 * preserving tool block positions. Allocates text proportionally to each slot
 * based on original lengths, with any remainder going to the last text slot.
 */
function redistributeTextContent(
  bodyBlocks: readonly TurnContentBlock[],
  finalContent: string,
): TurnContentBlock[] {
  const textSlots: { index: number; length: number }[] = [];
  for (let i = 0; i < bodyBlocks.length; i++) {
    if (bodyBlocks[i].type === "text") {
      textSlots.push({ index: i, length: (bodyBlocks[i].text ?? "").length });
    }
  }

  if (textSlots.length === 0) {
    return [...bodyBlocks, { type: "text", text: finalContent }];
  }

  const totalStreamedLength = textSlots.reduce((sum, s) => sum + s.length, 0);
  const next = [...bodyBlocks];
  let consumed = 0;

  for (let i = 0; i < textSlots.length; i++) {
    const slot = textSlots[i];
    const isLast = i === textSlots.length - 1;

    if (isLast) {
      // Last slot gets all remaining content
      next[slot.index] = { type: "text", text: finalContent.slice(consumed) };
    } else {
      // Proportional allocation
      const proportion = totalStreamedLength > 0 ? slot.length / totalStreamedLength : 1 / textSlots.length;
      const sliceLength = Math.round(proportion * finalContent.length);
      next[slot.index] = { type: "text", text: finalContent.slice(consumed, consumed + sliceLength) };
      consumed += sliceLength;
    }
  }

  return next;
}

export function reduceStreamingState(state: StreamingState, event: StreamingEvent): StreamingState {
  const lifecycle = reduceStatusMachine(state.lifecycle, toStatusMachineEvent(event));
  const conversationId = resolveConversationId(state, event);

  switch (event.type) {
    case "reset":
      return createInitialStreamingState(event.timestamp);
    case "dismiss-error":
    case "complete-timeout":
      if (lifecycle.status === "idle") {
        return {
          status: "idle",
          lifecycle,
          conversationId,
          messages: state.messages,
          toolCalls: [],
          turnState: createInitialTurnState(),
        };
      }

      return state;
    case "user-send": {
      if (lifecycle.status !== "sending") {
        return state;
      }

      return {
        status: "sending",
        lifecycle,
        conversationId: event.conversationId,
        messages: [...state.messages, event.userMessage],
        pendingUserMessageId: event.userMessage.id,
        toolCalls: [],
        turnState: createInitialTurnState(),
      };
    }
    case "message-ack": {
      if (lifecycle.status !== "thinking") {
        return state;
      }

      return {
        status: "thinking",
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.assistantMessageId, "", event.timestamp),
        assistantMessageId: event.assistantMessageId,
        partialContent: "",
        toolCalls: state.toolCalls,
        turnState: state.turnState,
      };
    }
    case "start": {
      if (lifecycle.status !== "streaming") {
        return state;
      }

      return {
        status: "streaming",
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.messageId, "", event.timestamp),
        assistantMessageId: event.messageId,
        partialContent: "",
        toolCalls: state.toolCalls,
        turnState: state.turnState,
      };
    }
    case "delta": {
      if (lifecycle.status !== "streaming") {
        return state;
      }

      const currentPartial =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      const partialContent = `${currentPartial}${event.delta}`;
      const nextBodyBlocks = appendTextToBody(state.turnState.bodyBlocks, event.delta);
      const nextContentBlocks = composeContentBlocks(state.turnState.thinkingContent, nextBodyBlocks);
      const nextTurnState: MultiToolTurnState = {
        contentBlocks: nextContentBlocks,
        thinkingContent: state.turnState.thinkingContent,
        hasToolCalls: state.turnState.hasToolCalls,
        bodyBlocks: nextBodyBlocks,
        wasCancelled: false,
      };
      return {
        status: "streaming",
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.messageId, partialContent, event.timestamp),
        assistantMessageId: event.messageId,
        partialContent,
        toolCalls: state.toolCalls,
        turnState: nextTurnState,
      };
    }
    case "thinking-delta": {
      if (lifecycle.status !== "thinking" && lifecycle.status !== "streaming") {
        return state;
      }

      const partialContent =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      const thinkingContent = `${state.turnState.thinkingContent}${event.delta}`;
      const nextBodyBlocks = appendThinkingToBody(state.turnState.bodyBlocks, event.delta);
      const nextContentBlocks = composeContentBlocks(thinkingContent, nextBodyBlocks);
      const nextTurnState: MultiToolTurnState = {
        contentBlocks: nextContentBlocks,
        thinkingContent,
        hasToolCalls: state.turnState.hasToolCalls,
        bodyBlocks: nextBodyBlocks,
        wasCancelled: false,
      };
      const nextStatus = lifecycle.status === "thinking" ? "thinking" : "streaming";

      return {
        status: nextStatus,
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.messageId, partialContent, event.timestamp),
        assistantMessageId: event.messageId,
        partialContent,
        toolCalls: state.toolCalls,
        turnState: nextTurnState,
      };
    }
    case "complete": {
      if (lifecycle.status !== "complete") {
        return state;
      }

      const streamedContent =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      const reconciledBody = reconcileBodyWithFinalContent(
        state.turnState.bodyBlocks,
        event.content,
        streamedContent,
      );
      const finalContentBlocks = composeContentBlocks(state.turnState.thinkingContent, reconciledBody);
      const finalTurnState: MultiToolTurnState = {
        contentBlocks: finalContentBlocks,
        thinkingContent: state.turnState.thinkingContent,
        hasToolCalls: state.turnState.hasToolCalls,
        bodyBlocks: reconciledBody,
        wasCancelled: false,
      };
      return {
        status: "complete",
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.messageId, event.content, event.timestamp),
        assistantMessageId: event.messageId,
        content: event.content,
        toolCalls: state.toolCalls,
        turnState: finalTurnState,
        completedAt: event.timestamp,
        finishReason: event.finishReason,
        usage: event.usage,
      };
    }
    case "cancelled-complete": {
      if (lifecycle.status !== "complete") {
        return state;
      }

      const streamedContent =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      const reconciledBody = reconcileBodyWithFinalContent(
        state.turnState.bodyBlocks,
        event.content,
        streamedContent,
      );
      const finalContentBlocks = composeContentBlocks(state.turnState.thinkingContent, reconciledBody);
      const finalTurnState: MultiToolTurnState = {
        contentBlocks: finalContentBlocks,
        thinkingContent: state.turnState.thinkingContent,
        hasToolCalls: state.turnState.hasToolCalls,
        bodyBlocks: reconciledBody,
        wasCancelled: true,
      };
      return {
        status: "complete",
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.messageId, event.content, event.timestamp),
        assistantMessageId: event.messageId,
        content: event.content,
        toolCalls: state.toolCalls,
        turnState: finalTurnState,
        completedAt: event.timestamp,
      };
    }
    case "error": {
      if (lifecycle.status !== "error") {
        return state;
      }

      const assistantMessageId = state.status === "streaming" || state.status === "thinking" ? state.assistantMessageId : null;
      const partialContent =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      return {
        status: "error",
        lifecycle,
        conversationId: event.conversationId,
        messages: state.messages,
        assistantMessageId,
        partialContent,
        error: event.error,
        toolCalls: state.toolCalls,
        turnState: state.turnState,
        failedAt: event.timestamp,
      };
    }
    case "tool-call-start": {
      if (lifecycle.status !== "streaming") {
        return state;
      }

      const basePartial =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      const nextToolCalls = applyToolCallStart(state.toolCalls, event);
      const nextBodyBlocks = addToolBlockToBody(state.turnState.bodyBlocks, event.toolCallId);
      const nextContentBlocks = composeContentBlocks(state.turnState.thinkingContent, nextBodyBlocks);
      const nextTurnState: MultiToolTurnState = {
        contentBlocks: nextContentBlocks,
        thinkingContent: state.turnState.thinkingContent,
        hasToolCalls: true,
        bodyBlocks: nextBodyBlocks,
        wasCancelled: false,
      };

      return {
        status: "streaming",
        lifecycle,
        conversationId: event.conversationId,
        messages: state.messages,
        assistantMessageId: event.messageId,
        partialContent: basePartial,
        toolCalls: nextToolCalls,
        turnState: nextTurnState,
      };
    }
    case "tool-call-complete": {
      if (lifecycle.status !== "streaming") {
        return state;
      }

      const basePartial =
        state.status === "streaming" || state.status === "thinking" || state.status === "error" ? state.partialContent : "";
      const nextToolCalls = applyToolCallComplete(state.toolCalls, event);
      // Ensure a tool block exists for orphan completes (complete without prior start)
      const nextBodyBlocks = addToolBlockToBody(state.turnState.bodyBlocks, event.toolCallId);
      const nextContentBlocks = composeContentBlocks(state.turnState.thinkingContent, nextBodyBlocks);
      const nextTurnState: MultiToolTurnState = {
        contentBlocks: nextContentBlocks,
        thinkingContent: state.turnState.thinkingContent,
        hasToolCalls: true,
        bodyBlocks: nextBodyBlocks,
        wasCancelled: false,
      };

      return {
        status: "streaming",
        lifecycle,
        conversationId: event.conversationId,
        messages: state.messages,
        assistantMessageId: event.messageId,
        partialContent: basePartial,
        toolCalls: nextToolCalls,
        turnState: nextTurnState,
      };
    }
    default:
      return state;
  }
}

export function ensureExpectedStatus(
  state: StreamingState,
  expected: StreamingState["status"] | StreamingState["status"][],
): Result<StreamingState, string> {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (expectedList.includes(state.status)) {
    return ok(state);
  }

  return err(`Expected state ${expectedList.join("|")}, received ${state.status}`);
}
