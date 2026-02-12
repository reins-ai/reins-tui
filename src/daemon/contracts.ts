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
  | "DAEMON_INTERNAL_ERROR";

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

export interface SendMessageRequest {
  conversationId?: string;
  content: string;
  role?: DaemonMessageRole;
  model?: string;
  provider?: string;
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
