export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type DaemonConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type DaemonErrorCode =
  | "DAEMON_UNAVAILABLE"
  | "DAEMON_DISCONNECTED"
  | "DAEMON_TIMEOUT"
  | "DAEMON_INVALID_REQUEST"
  | "DAEMON_NOT_FOUND"
  | "DAEMON_INTERNAL_ERROR"
  | "DAEMON_EMBEDDING_NOT_CONFIGURED";

export interface DaemonClientError {
  code: DaemonErrorCode;
  message: string;
  retryable: boolean;
  fallbackHint?: string;
}

export type DaemonResult<T> = Result<T, DaemonClientError>;

export interface DaemonConnectionState {
  status: DaemonConnectionStatus;
  retries: number;
  connectedAt?: string;
  lastError?: DaemonClientError;
}

export interface DaemonHandshake {
  daemonVersion: string;
  contractVersion: string;
  capabilities: string[];
}

export interface DaemonHealth {
  healthy: boolean;
  timestamp: string;
  handshake: DaemonHandshake;
}

export type DaemonMessageRole = "system" | "user" | "assistant";

export interface DaemonMessage {
  id: string;
  role: DaemonMessageRole;
  content: string;
  createdAt: string;
}

/**
 * Canonical history block used by normalized reconnect hydration.
 * This is also compatible with live-session block semantics.
 */
export type DaemonHistoryBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-use";
      toolCallId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      output: string;
      isError?: boolean;
    };

/**
 * Canonical hydrated content shape consumed by rendering.
 */
export interface DaemonHydratedHistoryPayload {
  text: string;
  blocks: DaemonHistoryBlock[];
}

/**
 * Normalized message shape produced by reconnect hydration.
 * ordering and dedupe fields support deterministic merge behavior
 * when history arrives across multiple chunks.
 */
export interface DaemonHydratedHistoryMessage {
  id: string;
  role: DaemonMessageRole;
  createdAt: string;
  payload: DaemonHydratedHistoryPayload;
  ordering: {
    timestampMs: number;
    fallbackIndex: number;
  };
  dedupeKey: string;
}

/**
 * Raw history payload variants observed at reconnect boundaries.
 *
 * serialized is retained as a discrete discriminant to avoid ambiguous
 * string/object unions in downstream hydration code.
 */
export type DaemonRawHistoryPayload =
  | {
      kind: "structured";
      value: {
        text?: string;
        blocks?: ReadonlyArray<
          | {
              type: "text";
              text: string;
            }
          | {
              type: "tool-use";
              toolCallId: string;
              name: string;
              args?: Record<string, unknown>;
            }
          | {
              type: "tool-result";
              toolCallId: string;
              output?: string;
              result?: string;
              isError?: boolean;
              error?: boolean;
            }
        >;
      };
    }
  | {
      kind: "serialized";
      value: string;
      encoding: "json" | "json-escaped" | "plain-text";
    };

export interface DaemonRawHistoryMessage {
  id: string;
  role: DaemonMessageRole;
  createdAt: string;
  payload: DaemonRawHistoryPayload;
}

/**
 * Context passed to a single normalization interface.
 * - fallbackIndex ensures deterministic ordering when timestamps match
 * - seenMessageIds supports idempotent chunk hydration
 */
export interface DaemonHistoryNormalizationContext {
  source: "live" | "reload";
  fallbackIndex: number;
  seenMessageIds: ReadonlySet<string>;
}

export type DaemonHistoryNormalizationResult =
  | {
      status: "accepted";
      message: DaemonHydratedHistoryMessage;
    }
  | {
      status: "duplicate";
      dedupeKey: string;
    }
  | {
      status: "dropped";
      reason: "invalid-shape" | "invalid-created-at" | "decode-failed";
    };

/**
 * Single parser surface for all reconnect payload variants, including
 * legacy escaped payload forms.
 */
export interface DaemonHistoryPayloadNormalizer {
  normalize(
    rawMessage: DaemonRawHistoryMessage,
    context: DaemonHistoryNormalizationContext,
  ): DaemonHistoryNormalizationResult;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  provider?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord extends ConversationSummary {
  messages: DaemonMessage[];
}

export interface ConversationCreateRequest {
  title?: string;
  model?: string;
}

export interface ConversationUpdateRequest {
  title?: string;
  model?: string;
}

export type ThinkingLevel = "none" | "low" | "medium" | "high";

export interface SendMessageRequest {
  conversationId?: string;
  content: string;
  role?: DaemonMessageRole;
  model?: string;
  provider?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface SendMessageResponse {
  conversationId: string;
  messageId?: string;
  userMessageId: string;
  assistantMessageId: string;
  timestamp?: string;
}

export interface StreamResponseRequest {
  conversationId: string;
  assistantMessageId: string;
}

export interface StreamSubscribePayload extends StreamResponseRequest {
  type: "stream.subscribe";
}

export type DaemonStreamEvent =
  | {
      type: "start";
      conversationId: string;
      messageId: string;
      timestamp: string;
    }
  | {
      type: "delta";
      conversationId: string;
      messageId: string;
      delta: string;
      timestamp: string;
    }
  | {
      type: "thinking-delta";
      conversationId: string;
      messageId: string;
      delta: string;
      timestamp: string;
    }
  | {
      type: "tool-call-start";
      conversationId: string;
      messageId: string;
      toolCallId: string;
      name: string;
      args?: Record<string, unknown>;
      timestamp: string;
    }
  | {
      type: "tool-call-complete";
      conversationId: string;
      messageId: string;
      toolCallId: string;
      result?: string;
      error?: string;
      timestamp: string;
    }
  | {
      type: "complete";
      conversationId: string;
      messageId: string;
      content: string;
      timestamp: string;
    }
  | {
      type: "error";
      conversationId: string;
      messageId: string;
      error: DaemonClientError;
      timestamp: string;
    };

export const DAEMON_CONTRACT_COMPATIBILITY_NOTES = [
  "sendMessage response keeps userMessageId for existing clients and may also include canonical messageId",
  "sendMessage response may include timestamp once daemon message persistence acknowledgement is wired",
  "stream subscription payload remains type=stream.subscribe with conversationId and assistantMessageId",
] as const;

export const DAEMON_HISTORY_COMPATIBILITY_NOTES = [
  "history payload may arrive as structured object blocks or as serialized string payloads",
  "legacy escaped payload strings use encoding=json-escaped and should be decoded before rendering",
  "tool-result compatibility accepts output/result aliases and isError/error aliases",
  "invalid legacy entries should be dropped without placeholder rendering",
] as const;
