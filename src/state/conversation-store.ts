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
