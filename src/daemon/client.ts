import type {
  ConversationCreateRequest,
  ConversationRecord,
  ConversationSummary,
  ConversationUpdateRequest,
  DaemonConnectionState,
  DaemonHealth,
  DaemonResult,
  DaemonStreamEvent,
  SendMessageRequest,
  SendMessageResponse,
  StreamResponseRequest,
} from "./contracts";

export const DEFAULT_DAEMON_HOST = "localhost";
export const DEFAULT_DAEMON_PORT = 7433;
export const DEFAULT_DAEMON_HTTP_BASE_URL = `http://${DEFAULT_DAEMON_HOST}:${DEFAULT_DAEMON_PORT}`;
export const DEFAULT_DAEMON_WS_BASE_URL = `ws://${DEFAULT_DAEMON_HOST}:${DEFAULT_DAEMON_PORT}/ws`;

export interface DaemonClientConfig {
  httpBaseUrl: string;
  wsBaseUrl: string;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  requestTimeoutMs: number;
}

export interface DaemonClient {
  connect(): Promise<DaemonResult<void>>;
  reconnect(): Promise<DaemonResult<void>>;
  disconnect(): Promise<DaemonResult<void>>;

  getConnectionState(): DaemonConnectionState;
  onConnectionStateChange(listener: (state: DaemonConnectionState) => void): () => void;

  healthCheck(): Promise<DaemonResult<DaemonHealth>>;

  sendMessage(request: SendMessageRequest): Promise<DaemonResult<SendMessageResponse>>;
  streamResponse(request: StreamResponseRequest): Promise<DaemonResult<AsyncIterable<DaemonStreamEvent>>>;

  listConversations(): Promise<DaemonResult<ConversationSummary[]>>;
  getConversation(conversationId: string): Promise<DaemonResult<ConversationRecord>>;
  createConversation(request?: ConversationCreateRequest): Promise<DaemonResult<ConversationRecord>>;
  updateConversation(
    conversationId: string,
    request: ConversationUpdateRequest,
  ): Promise<DaemonResult<ConversationRecord>>;
  deleteConversation(conversationId: string): Promise<DaemonResult<void>>;
}

export function createDaemonClientConfig(overrides: Partial<DaemonClientConfig> = {}): DaemonClientConfig {
  return {
    httpBaseUrl: overrides.httpBaseUrl ?? DEFAULT_DAEMON_HTTP_BASE_URL,
    wsBaseUrl: overrides.wsBaseUrl ?? DEFAULT_DAEMON_WS_BASE_URL,
    reconnectBaseDelayMs: overrides.reconnectBaseDelayMs ?? 250,
    reconnectMaxDelayMs: overrides.reconnectMaxDelayMs ?? 5_000,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 10_000,
  };
}
