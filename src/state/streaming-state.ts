import type { DaemonClientError, DaemonMessage, DaemonStreamEvent } from "../daemon/contracts";
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
  type: "text" | "tool-call";
  toolCallId?: string;
  text?: string;
}

export interface MultiToolTurnState {
  contentBlocks: TurnContentBlock[];
  synthesisContent: string;
  hasToolCalls: boolean;
  textBeforeTools: string;
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
    synthesisContent: "",
    hasToolCalls: false,
    textBeforeTools: "",
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
        type: "stream-chunk",
        timestamp: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.messageId,
      };
    case "complete":
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

function buildTurnState(
  toolCalls: StreamToolCall[],
  partialContent: string,
  previousTurnState: MultiToolTurnState,
): MultiToolTurnState {
  const hasToolCalls = toolCalls.length > 0;

  if (!hasToolCalls) {
    return {
      contentBlocks: partialContent.length > 0
        ? [{ type: "text", text: partialContent }]
        : [],
      synthesisContent: "",
      hasToolCalls: false,
      textBeforeTools: partialContent,
    };
  }

  const textBeforeTools = previousTurnState.textBeforeTools;
  const blocks: TurnContentBlock[] = [];

  if (textBeforeTools.length > 0) {
    blocks.push({ type: "text", text: textBeforeTools });
  }

  const sorted = [...toolCalls].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  for (const toolCall of sorted) {
    blocks.push({ type: "tool-call", toolCallId: toolCall.id });
  }

  const synthesisContent = partialContent.length > textBeforeTools.length
    ? partialContent.slice(textBeforeTools.length)
    : previousTurnState.synthesisContent;

  if (synthesisContent.length > 0) {
    blocks.push({ type: "text", text: synthesisContent });
  }

  return {
    contentBlocks: blocks,
    synthesisContent,
    hasToolCalls: true,
    textBeforeTools,
  };
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
      const nextToolCalls = state.toolCalls;
      const nextTurnState = buildTurnState(nextToolCalls, partialContent, state.turnState);
      return {
        status: "streaming",
        lifecycle,
        conversationId: event.conversationId,
        messages: upsertAssistantMessage(state.messages, event.messageId, partialContent, event.timestamp),
        assistantMessageId: event.messageId,
        partialContent,
        toolCalls: nextToolCalls,
        turnState: nextTurnState,
      };
    }
    case "complete": {
      if (lifecycle.status !== "complete") {
        return state;
      }

      const finalTurnState = buildTurnState(state.toolCalls, event.content, state.turnState);
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
      const prevTurnState: MultiToolTurnState = state.turnState.hasToolCalls
        ? state.turnState
        : { ...state.turnState, textBeforeTools: basePartial };
      const nextTurnState = buildTurnState(nextToolCalls, basePartial, prevTurnState);

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
      const nextTurnState = buildTurnState(nextToolCalls, basePartial, state.turnState);

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
