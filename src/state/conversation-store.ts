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

export function createConversationStore(options: ConversationStoreOptions): ConversationStore {
  const now = options.now ?? (() => new Date());
  const completeDisplayMs = Math.max(0, options.completeDisplayMs ?? DEFAULT_COMPLETE_DISPLAY_MS);
  const listeners = new Set<(state: ConversationStoreState) => void>();

  let completeTimeout: ReturnType<typeof setTimeout> | null = null;
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
    const streamResult = await options.daemonClient.streamResponse({
      conversationId,
      assistantMessageId,
    });

    if (!streamResult.ok) {
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

    for await (const event of streamResult.value) {
      applyEvent(event);
      if (event.type === "complete") {
        completed = true;
      }

      if (event.type === "error") {
        return err(event.error);
      }
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
