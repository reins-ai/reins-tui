import {
  err,
  ok,
  type DaemonClientError,
  type DaemonMessage,
  type DaemonRawHistoryMessage,
  type DaemonRawHistoryPayload,
  type DaemonResult,
  type DaemonStreamEvent,
  type StreamResponseRequest,
} from "./contracts";

interface WebSocketMessageLike {
  data: string | ArrayBuffer | ArrayBufferView;
}

interface WebSocketCloseLike {
  code: number;
  reason: string;
}

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "close", listener: (event: WebSocketCloseLike) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: "message", listener: (event: WebSocketMessageLike) => void): void;
  removeEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: "close", listener: (event: WebSocketCloseLike) => void): void;
  removeEventListener(type: "error", listener: () => void): void;
  removeEventListener(type: "message", listener: (event: WebSocketMessageLike) => void): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface DaemonWsTransportConfig {
  baseUrl: string;
  connectTimeoutMs: number;
  webSocketFactory?: WebSocketFactory;
  now?: () => Date;
}

interface StreamEnvelope {
  type: "stream-event";
  event: unknown;
}

interface HeartbeatEnvelope {
  type: "heartbeat";
  timestamp?: string;
}

interface StreamSubscribeMessage {
  type: "stream.subscribe";
  conversationId: string;
  assistantMessageId: string;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  public push(value: T): void {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ done: false, value });
      return;
    }

    this.values.push(value);
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.({ done: true, value: undefined });
    }
  }

  public [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        if (this.values.length > 0) {
          const value = this.values.shift();
          if (typeof value === "undefined") {
            return { done: true, value: undefined };
          }

          return { done: false, value };
        }

        if (this.closed) {
          return { done: true, value: undefined };
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

export class DaemonWsTransport {
  private readonly baseUrl: string;
  private readonly connectTimeoutMs: number;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly now: () => Date;

  private socket: WebSocketLike | null = null;
  private closedByClient = false;
  private readonly streams = new Map<string, AsyncEventQueue<DaemonStreamEvent>>();

  private onUnexpectedCloseHandler: ((error: DaemonClientError) => void) | null = null;
  private onHeartbeatHandler: ((timestamp: string) => void) | null = null;

  private readonly messageListener = (event: WebSocketMessageLike): void => {
    this.handleMessage(event);
  };

  private readonly closeListener = (event: WebSocketCloseLike): void => {
    this.handleClose(event);
  };

  constructor(config: DaemonWsTransportConfig) {
    this.baseUrl = normalizeWebSocketUrl(config.baseUrl);
    this.connectTimeoutMs = Math.max(1, config.connectTimeoutMs);
    this.webSocketFactory = config.webSocketFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.now = config.now ?? (() => new Date());
  }

  public setUnexpectedCloseHandler(handler: (error: DaemonClientError) => void): void {
    this.onUnexpectedCloseHandler = handler;
  }

  public setHeartbeatHandler(handler: (timestamp: string) => void): void {
    this.onHeartbeatHandler = handler;
  }

  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === 1;
  }

  public async connect(): Promise<DaemonResult<void>> {
    if (this.isConnected()) {
      return ok(undefined);
    }

    this.closedByClient = false;
    const socket = this.webSocketFactory(this.baseUrl);
    this.socket = socket;

    return new Promise<DaemonResult<void>>((resolve) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        this.cleanupConnectListeners(socket, handleOpen, handleClose, handleError);
        socket.close(4000, "connect-timeout");
        this.socket = null;
        resolve(
          err({
            code: "DAEMON_TIMEOUT",
            message: "Timed out while connecting daemon WebSocket transport",
            retryable: true,
          }),
        );
      }, this.connectTimeoutMs);

      const finish = (result: DaemonResult<void>): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        this.cleanupConnectListeners(socket, handleOpen, handleClose, handleError);
        resolve(result);
      };

      const handleOpen = (): void => {
        socket.addEventListener("message", this.messageListener);
        socket.addEventListener("close", this.closeListener);
        finish(ok(undefined));
      };

      const handleClose = (event: WebSocketCloseLike): void => {
        this.socket = null;
        finish(
          err({
            code: "DAEMON_UNAVAILABLE",
            message: `Daemon WebSocket closed during connect (${event.code})`,
            retryable: true,
          }),
        );
      };

      const handleError = (): void => {
        this.socket = null;
        finish(
          err({
            code: "DAEMON_UNAVAILABLE",
            message: "Daemon WebSocket failed during connect",
            retryable: true,
          }),
        );
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("error", handleError);
    });
  }

  public async disconnect(): Promise<DaemonResult<void>> {
    this.closedByClient = true;

    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return ok(undefined);
    }

    socket.removeEventListener("message", this.messageListener);
    socket.removeEventListener("close", this.closeListener);
    socket.close(1000, "client-disconnect");
    this.closeAllStreams();
    return ok(undefined);
  }

  public async streamResponse(request: StreamResponseRequest): Promise<DaemonResult<AsyncIterable<DaemonStreamEvent>>> {
    if (!this.socket || this.socket.readyState !== 1) {
      return err({
        code: "DAEMON_DISCONNECTED",
        message: "Cannot start stream while WebSocket transport is disconnected",
        retryable: true,
      });
    }

    const streamKey = this.streamKey(request.conversationId, request.assistantMessageId);
    const queue = new AsyncEventQueue<DaemonStreamEvent>();
    this.streams.set(streamKey, queue);

    const payload: StreamSubscribeMessage = {
      type: "stream.subscribe",
      conversationId: request.conversationId,
      assistantMessageId: request.assistantMessageId,
    };

    this.socket.send(JSON.stringify(payload));
    return ok(queue);
  }

  private handleMessage(event: WebSocketMessageLike): void {
    const text = this.asText(event.data);
    if (!text) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }

    if (this.isHeartbeatEnvelope(payload)) {
      this.onHeartbeatHandler?.(payload.timestamp ?? this.now().toISOString());
      return;
    }

    const streamEvent = this.extractStreamEvent(payload);
    if (!streamEvent) {
      return;
    }

    const streamKey = this.streamKey(streamEvent.conversationId, streamEvent.messageId);
    const queue = this.streams.get(streamKey);
    if (!queue) {
      return;
    }

    queue.push(streamEvent);
    if (streamEvent.type === "complete" || streamEvent.type === "error") {
      queue.close();
      this.streams.delete(streamKey);
    }
  }

  private handleClose(event: WebSocketCloseLike): void {
    this.socket = null;
    this.closeAllStreams();

    if (this.closedByClient) {
      return;
    }

    this.onUnexpectedCloseHandler?.({
      code: "DAEMON_DISCONNECTED",
      message: `Daemon WebSocket disconnected unexpectedly (${event.code} ${event.reason || "closed"})`,
      retryable: true,
      fallbackHint: "Reconnect is in progress.",
    });
  }

  private closeAllStreams(): void {
    for (const [, stream] of this.streams) {
      stream.close();
    }
    this.streams.clear();
  }

  private cleanupConnectListeners(
    socket: WebSocketLike,
    handleOpen: () => void,
    handleClose: (event: WebSocketCloseLike) => void,
    handleError: () => void,
  ): void {
    socket.removeEventListener("open", handleOpen);
    socket.removeEventListener("close", handleClose);
    socket.removeEventListener("error", handleError);
  }

  private asText(data: string | ArrayBuffer | ArrayBufferView): string | null {
    if (typeof data === "string") {
      return data;
    }

    if (ArrayBuffer.isView(data)) {
      return new TextDecoder().decode(data);
    }

    return new TextDecoder().decode(new Uint8Array(data));
  }

  private streamKey(conversationId: string, messageId: string): string {
    return `${conversationId}:${messageId}`;
  }

  private extractStreamEvent(payload: unknown): DaemonStreamEvent | null {
    const candidate = this.isStreamEnvelope(payload) ? payload.event : payload;
    return this.toDaemonStreamEvent(candidate);
  }

  private toDaemonStreamEvent(payload: unknown): DaemonStreamEvent | null {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const event = payload as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : undefined;
    const conversationId = typeof event.conversationId === "string" ? event.conversationId : undefined;
    const messageId = typeof event.messageId === "string" ? event.messageId : undefined;
    const timestamp = typeof event.timestamp === "string" ? event.timestamp : undefined;

    if (!type || !conversationId || !messageId || !timestamp) {
      return null;
    }

    if (type === "start" || type === "message_start") {
      return { type: "start", conversationId, messageId, timestamp };
    }

    if (type === "delta" || type === "content_chunk") {
      const delta = typeof event.delta === "string" ? event.delta : typeof event.chunk === "string" ? event.chunk : undefined;
      if (delta === undefined) {
        return null;
      }

      return { type: "delta", conversationId, messageId, delta, timestamp };
    }

    if (type === "tool-call-start" || type === "tool_call_start" || type === "tool-start" || type === "tool_start") {
      const toolCallRecord = this.isRecord(event.toolCall) ? event.toolCall : undefined;
      const toolCallId = typeof event.toolCallId === "string"
        ? event.toolCallId
        : typeof event.tool_use_id === "string"
          ? event.tool_use_id
          : typeof event.id === "string"
            ? event.id
            : toolCallRecord && typeof toolCallRecord.id === "string"
              ? toolCallRecord.id
              : undefined;
      const name = typeof event.name === "string"
        ? event.name
        : typeof event.toolName === "string"
          ? event.toolName
          : toolCallRecord && typeof toolCallRecord.name === "string"
            ? toolCallRecord.name
            : undefined;
      const args = this.isRecord(event.args)
        ? event.args
        : this.isRecord(event.input)
          ? event.input
          : toolCallRecord && this.isRecord(toolCallRecord.arguments)
            ? toolCallRecord.arguments
          : undefined;

      if (!toolCallId || !name) {
        return null;
      }

      return {
        type: "tool-call-start",
        conversationId,
        messageId,
        toolCallId,
        name,
        args,
        timestamp,
      };
    }

    if (
      type === "tool-call-complete"
      || type === "tool_call_complete"
      || type === "tool_call_end"
      || type === "tool-complete"
      || type === "tool_result"
    ) {
      const resultRecord = this.isRecord(event.result) ? event.result : undefined;
      const toolCallId = typeof event.toolCallId === "string"
        ? event.toolCallId
        : typeof event.tool_use_id === "string"
          ? event.tool_use_id
          : typeof event.id === "string"
            ? event.id
            : resultRecord && typeof resultRecord.callId === "string"
              ? resultRecord.callId
              : undefined;
      const result = typeof event.result === "string"
        ? event.result
        : typeof event.output === "string"
          ? event.output
          : typeof event.result_summary === "string"
            ? event.result_summary
            : this.stringifyUnknown(resultRecord?.result);
      const error = typeof event.error === "string"
        ? event.error
        : this.isRecord(event.error) && typeof event.error.message === "string"
          ? event.error.message
          : resultRecord && typeof resultRecord.error === "string"
            ? resultRecord.error
            : undefined;

      if (!toolCallId) {
        return null;
      }

      return {
        type: "tool-call-complete",
        conversationId,
        messageId,
        toolCallId,
        result,
        error,
        timestamp,
      };
    }

    if (type === "complete" || type === "message_complete") {
      const content = typeof event.content === "string" ? event.content : "";
      return { type: "complete", conversationId, messageId, content, timestamp };
    }

    if (type === "error") {
      const errorPayload = event.error;
      if (!errorPayload || typeof errorPayload !== "object") {
        return null;
      }

      const errorRecord = errorPayload as Record<string, unknown>;
      const code = this.toDaemonErrorCode(errorRecord.code);
      const message = typeof errorRecord.message === "string" ? errorRecord.message : "Daemon stream error";
      const retryable = typeof errorRecord.retryable === "boolean" ? errorRecord.retryable : false;

      return {
        type: "error",
        conversationId,
        messageId,
        error: {
          code,
          message,
          retryable,
          fallbackHint: typeof errorRecord.fallbackHint === "string" ? errorRecord.fallbackHint : undefined,
        },
        timestamp,
      };
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
  }

  private stringifyUnknown(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private toDaemonErrorCode(value: unknown): DaemonClientError["code"] {
    if (value === "DAEMON_UNAVAILABLE" ||
      value === "DAEMON_DISCONNECTED" ||
      value === "DAEMON_TIMEOUT" ||
      value === "DAEMON_INVALID_REQUEST" ||
      value === "DAEMON_NOT_FOUND" ||
      value === "DAEMON_INTERNAL_ERROR") {
      return value;
    }

    return "DAEMON_INTERNAL_ERROR";
  }

  private isStreamEnvelope(payload: unknown): payload is StreamEnvelope {
    return Boolean(
      payload &&
        typeof payload === "object" &&
        "type" in payload &&
        (payload as { type?: unknown }).type === "stream-event" &&
        "event" in payload,
    );
  }

  private isHeartbeatEnvelope(payload: unknown): payload is HeartbeatEnvelope {
    return Boolean(payload && typeof payload === "object" && (payload as { type?: unknown }).type === "heartbeat");
  }
}

// ---------------------------------------------------------------------------
// History mapping — convert DaemonMessage[] to DaemonRawHistoryMessage[]
// ---------------------------------------------------------------------------

/**
 * Classify a DaemonMessage content string into the appropriate raw history
 * payload variant. The content may be:
 *
 * 1. A JSON object with text/blocks fields (structured payload serialized as string)
 * 2. A JSON string (double-encoded text)
 * 3. Plain text (the common case for simple messages)
 *
 * This function does NOT decode or normalize — it only classifies the payload
 * so the downstream hydration pipeline can handle it uniformly.
 */
export function classifyHistoryPayload(content: string): DaemonRawHistoryPayload {
  const trimmed = content.trim();

  // Empty content → plain text
  if (trimmed.length === 0) {
    return { kind: "serialized", value: content, encoding: "plain-text" };
  }

  // Attempt JSON parse for structured payloads
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);

      // Object with text or blocks fields → structured payload
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        const record = parsed as Record<string, unknown>;
        if ("text" in record || "blocks" in record) {
          return { kind: "serialized", value: trimmed, encoding: "json" };
        }
      }

      // JSON string (double-encoded) → json encoding
      if (typeof parsed === "string") {
        return { kind: "serialized", value: trimmed, encoding: "json" };
      }

      // Other JSON (array, number, etc.) — treat as json-encoded
      return { kind: "serialized", value: trimmed, encoding: "json" };
    } catch {
      // Not valid JSON — fall through to escape detection
    }
  }

  // Detect escaped content (common in legacy payloads)
  if (trimmed.includes("\\n") || trimmed.includes("\\t") || trimmed.includes("\\\\") || trimmed.includes('\\"')) {
    return { kind: "serialized", value: content, encoding: "json-escaped" };
  }

  // Default: plain text
  return { kind: "serialized", value: content, encoding: "plain-text" };
}

/**
 * Map a single DaemonMessage (from HTTP getConversation response) into the
 * DaemonRawHistoryMessage shape expected by the hydration pipeline.
 *
 * This is the transport-boundary bridge between the daemon's flat message
 * format and the store's typed normalization input.
 */
export function mapDaemonMessageToRawHistory(message: DaemonMessage): DaemonRawHistoryMessage {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    payload: classifyHistoryPayload(message.content),
  };
}

/**
 * Map an array of DaemonMessage records (from getConversation) into
 * DaemonRawHistoryMessage[] for the hydration pipeline.
 *
 * This is the primary entry point for reconnect history mapping.
 * It preserves the original message order — deterministic sorting
 * is handled downstream by the hydration pipeline.
 */
export function mapConversationHistory(
  messages: readonly DaemonMessage[],
): DaemonRawHistoryMessage[] {
  return messages.map(mapDaemonMessageToRawHistory);
}

// ---------------------------------------------------------------------------

function normalizeWebSocketUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "ws://localhost:7433/ws";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === "" || parsed.pathname === "/") {
      parsed.pathname = "/ws";
    }

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}
