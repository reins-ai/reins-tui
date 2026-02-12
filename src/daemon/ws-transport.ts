import { err, ok, type DaemonClientError, type DaemonResult, type DaemonStreamEvent, type StreamResponseRequest } from "./contracts";

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
