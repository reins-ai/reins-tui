import {
  KeepSystemAndRecentStrategy,
  estimateConversationTokens,
} from "@reins/core";
import type { Message } from "@reins/core";

import type { DaemonClient } from "../daemon/client";
import {
  err,
  ok,
  type DaemonClientError,
  type DaemonMessage,
  type DaemonResult,
  type SendMessageResponse,
  type ThinkingLevel,
} from "../daemon/contracts";
import {
  createInitialStreamingState,
  reduceStreamingState,
  type StreamingEvent,
  type StreamingState,
} from "./streaming-state";

export interface ConversationStoreState {
  conversationId: string | null;
  messages: DaemonMessage[];
  streaming: StreamingState;
}

export interface ConversationStore {
  getState(): ConversationStoreState;
  subscribe(listener: (state: ConversationStoreState) => void): () => void;
  sendUserMessage(input: { conversationId?: string; content: string; model?: string; thinkingLevel?: ThinkingLevel }): Promise<DaemonResult<void>>;
  cancelActiveResponse(): Promise<DaemonResult<void>>;
  dismissError(): void;
  reset(): void;
}

export interface ConversationStoreOptions {
  daemonClient: DaemonClient;
  now?: () => Date;
  completeDisplayMs?: number;
}

const DEFAULT_COMPLETE_DISPLAY_MS = 750;

function createUserMessage(content: string, messageId: string, createdAt: string): DaemonMessage {
  return {
    id: messageId,
    role: "user",
    content,
    createdAt,
  };
}

function createStreamClosedError(): DaemonClientError {
  return {
    code: "DAEMON_DISCONNECTED",
    message: "Daemon stream ended before completion event",
    retryable: true,
    fallbackHint: "Retry your message after reconnecting.",
  };
}

function createSendAckError(response: SendMessageResponse): DaemonClientError {
  return {
    code: "DAEMON_INVALID_REQUEST",
    message: `Daemon acknowledged message with missing IDs for conversation ${response.conversationId}`,
    retryable: false,
    fallbackHint: "Check daemon contract compatibility.",
  };
}

function toExecutionKey(conversationId: string, assistantMessageId: string): string {
  return `${conversationId}:${assistantMessageId}`;
}

export function createConversationStore(options: ConversationStoreOptions): ConversationStore {
  const now = options.now ?? (() => new Date());
  const completeDisplayMs = Math.max(0, options.completeDisplayMs ?? DEFAULT_COMPLETE_DISPLAY_MS);
  const listeners = new Set<(state: ConversationStoreState) => void>();

  let completeTimeout: ReturnType<typeof setTimeout> | null = null;
  let activeStreamTarget: { conversationId: string; assistantMessageId: string } | null = null;
  const cancelledExecutionKeys = new Set<string>();
  let state: ConversationStoreState = {
    conversationId: null,
    messages: [],
    streaming: createInitialStreamingState(now().toISOString()),
  };

  function clearCompleteTimeout(): void {
    if (!completeTimeout) {
      return;
    }

    clearTimeout(completeTimeout);
    completeTimeout = null;
  }

  function emit(): void {
    const snapshot: ConversationStoreState = {
      conversationId: state.conversationId,
      messages: [...state.messages],
      streaming: state.streaming,
    };

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  function applyEvent(event: StreamingEvent): void {
    clearCompleteTimeout();

    const nextStreaming = reduceStreamingState(state.streaming, event);
    state = {
      conversationId: nextStreaming.conversationId,
      messages: nextStreaming.messages,
      streaming: nextStreaming,
    };

    if (nextStreaming.status === "complete" && completeDisplayMs > 0) {
      completeTimeout = setTimeout(() => {
        applyEvent({
          type: "complete-timeout",
          timestamp: now().toISOString(),
        });
      }, completeDisplayMs);
    }

    emit();
  }

  async function streamAssistantResponse(conversationId: string, assistantMessageId: string): Promise<DaemonResult<void>> {
    const executionKey = toExecutionKey(conversationId, assistantMessageId);
    activeStreamTarget = { conversationId, assistantMessageId };

    const streamResult = await options.daemonClient.streamResponse({
      conversationId,
      assistantMessageId,
    });

    if (!streamResult.ok) {
      if (cancelledExecutionKeys.has(executionKey)) {
        return ok(undefined);
      }

      applyEvent({
        type: "error",
        timestamp: now().toISOString(),
        conversationId,
        messageId: assistantMessageId,
        error: streamResult.error,
      });
      return streamResult;
    }

    let completed = false;
    let cancelledByUser = false;

    try {
      for await (const event of streamResult.value) {
        if (cancelledExecutionKeys.has(executionKey)) {
          cancelledByUser = true;
          break;
        }

        applyEvent(event);
        if (event.type === "complete") {
          completed = true;
        }

        if (event.type === "error") {
          return err(event.error);
        }
      }

      if (cancelledByUser || cancelledExecutionKeys.has(executionKey)) {
        return ok(undefined);
      }

      if (!completed) {
        const streamClosedError = createStreamClosedError();
        applyEvent({
          type: "error",
          timestamp: now().toISOString(),
          conversationId,
          messageId: assistantMessageId,
          error: streamClosedError,
        });
        return err(streamClosedError);
      }

      return ok(undefined);
    } finally {
      if (activeStreamTarget && toExecutionKey(activeStreamTarget.conversationId, activeStreamTarget.assistantMessageId) === executionKey) {
        activeStreamTarget = null;
      }
      cancelledExecutionKeys.delete(executionKey);
    }
  }

  return {
    getState() {
      return {
        conversationId: state.conversationId,
        messages: [...state.messages],
        streaming: state.streaming,
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async sendUserMessage(input) {
      const timestamp = now().toISOString();
      const requestedConversationId = input.conversationId ?? state.conversationId ?? crypto.randomUUID();
      const pendingUserMessageId = crypto.randomUUID();
      applyEvent({
        type: "user-send",
        timestamp,
        conversationId: requestedConversationId,
        userMessage: createUserMessage(input.content, pendingUserMessageId, timestamp),
      });

      const sendResult = await options.daemonClient.sendMessage({
        conversationId: input.conversationId,
        content: input.content,
        model: input.model,
        thinkingLevel: input.thinkingLevel,
      });

      if (!sendResult.ok) {
        applyEvent({
          type: "error",
          timestamp: now().toISOString(),
          conversationId: requestedConversationId,
          messageId: pendingUserMessageId,
          error: sendResult.error,
        });
        return sendResult;
      }

      if (sendResult.value.conversationId.length === 0 || sendResult.value.assistantMessageId.length === 0) {
        const ackError = createSendAckError(sendResult.value);
        applyEvent({
          type: "error",
          timestamp: now().toISOString(),
          conversationId: requestedConversationId,
          messageId: pendingUserMessageId,
          error: ackError,
        });
        return err(ackError);
      }

      applyEvent({
        type: "message-ack",
        timestamp: now().toISOString(),
        conversationId: sendResult.value.conversationId,
        assistantMessageId: sendResult.value.assistantMessageId,
      });

      return streamAssistantResponse(sendResult.value.conversationId, sendResult.value.assistantMessageId);
    },

    async cancelActiveResponse() {
      const streaming = state.streaming;
      if (streaming.status !== "thinking" && streaming.status !== "streaming") {
        return ok(undefined);
      }

      const target = {
        conversationId: streaming.conversationId,
        assistantMessageId: streaming.assistantMessageId,
      };
      const executionKey = toExecutionKey(target.conversationId, target.assistantMessageId);
      cancelledExecutionKeys.add(executionKey);

      const cancelResult = await options.daemonClient.cancelStream({
        conversationId: target.conversationId,
        assistantMessageId: target.assistantMessageId,
      });

      const latest = state.streaming;
      const latestContent =
        latest.status === "streaming" || latest.status === "thinking" || latest.status === "error"
          ? latest.partialContent
          : latest.status === "complete"
            ? latest.content
            : "";

      applyEvent({
        type: "cancelled-complete",
        timestamp: now().toISOString(),
        conversationId: target.conversationId,
        messageId: target.assistantMessageId,
        content: latestContent,
      });

      return cancelResult.ok ? ok(undefined) : cancelResult;
    },

    dismissError() {
      applyEvent({
        type: "dismiss-error",
        timestamp: now().toISOString(),
      });
    },

    reset() {
      applyEvent({
        type: "reset",
        timestamp: now().toISOString(),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Session restore — fetch last conversation and trim if too large
// ---------------------------------------------------------------------------

/** Default context window budget used when trimming restored messages. */
const RESTORE_MAX_TOKENS = 128_000;

/** Tokens reserved for the next user message and system overhead. */
const RESTORE_RESERVED_TOKENS = 4_000;

/** Message count threshold above which trimming is applied. */
const RESTORE_MESSAGE_COUNT_THRESHOLD = 200;

/** Number of recent non-system messages to keep when trimming. */
const RESTORE_KEEP_RECENT = 20;

function daemonMessageToCore(message: DaemonMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt),
  };
}

function coreMessageToDaemon(message: Message): DaemonMessage {
  return {
    id: message.id,
    role: message.role as DaemonMessage["role"],
    content: typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content),
    createdAt: message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : String(message.createdAt),
  };
}

export interface RestoreSessionResult {
  conversationId: string;
  messages: DaemonMessage[];
  trimmed: boolean;
}

/**
 * Fetch a conversation from the daemon and trim its messages if they
 * exceed the context budget. Uses `KeepSystemAndRecentStrategy` to
 * preserve system messages and the most recent exchanges.
 *
 * Returns `null` when the conversation cannot be fetched (e.g. daemon
 * offline or conversation deleted).
 */
export async function restoreSession(
  daemonClient: DaemonClient,
  conversationId: string,
): Promise<RestoreSessionResult | null> {
  const result = await daemonClient.getConversation(conversationId);
  if (!result.ok) {
    return null;
  }

  const record = result.value;
  let messages = record.messages;
  let trimmed = false;

  if (messages.length > RESTORE_MESSAGE_COUNT_THRESHOLD) {
    const coreMessages = messages.map(daemonMessageToCore);
    const tokenCount = estimateConversationTokens(coreMessages);
    const effectiveLimit = RESTORE_MAX_TOKENS - RESTORE_RESERVED_TOKENS;

    if (tokenCount > effectiveLimit) {
      const strategy = new KeepSystemAndRecentStrategy();
      const truncated = strategy.truncate(coreMessages, {
        maxTokens: RESTORE_MAX_TOKENS,
        reservedTokens: RESTORE_RESERVED_TOKENS,
        keepRecentMessages: RESTORE_KEEP_RECENT,
      });
      messages = truncated.map(coreMessageToDaemon);
      trimmed = true;
    }
  }

  return {
    conversationId: record.id,
    messages,
    trimmed,
  };
}
