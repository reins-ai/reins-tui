import type { DaemonClient, DaemonClientConfig } from "./client";
import { createDaemonClientConfig } from "./client";
import {
  err,
  ok,
  type ConversationCreateRequest,
  type ConversationRecord,
  type ConversationSummary,
  type ConversationUpdateRequest,
  type DaemonClientError,
  type DaemonConnectionState,
  type DaemonHealth,
  type DaemonResult,
  type DaemonStreamEvent,
  type SendMessageRequest,
  type SendMessageResponse,
  type StreamResponseRequest,
} from "./contracts";
import { DaemonHttpTransport } from "./http-transport";
import { ExponentialReconnectPolicy } from "./reconnect-policy";
import { DaemonWsTransport, type WebSocketFactory } from "./ws-transport";

export interface DaemonHeartbeatEvent {
  alive: boolean;
  pulse: boolean;
  timestamp: string;
  source: "http" | "ws";
}

export interface LiveDaemonClientOptions {
  clientConfig?: Partial<DaemonClientConfig>;
  maxReconnectRetries?: number;
  heartbeatIntervalMs?: number;
  fetchImpl?: typeof fetch;
  webSocketFactory?: WebSocketFactory;
  random?: () => number;
  now?: () => Date;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 2_000;

export class LiveDaemonClient implements DaemonClient {
  public readonly config: DaemonClientConfig;

  private state: DaemonConnectionState = {
    status: "disconnected",
    retries: 0,
  };

  private readonly httpTransport: DaemonHttpTransport;
  private readonly wsTransport: DaemonWsTransport;
  private readonly reconnectPolicy: ExponentialReconnectPolicy;
  private readonly now: () => Date;
  private readonly heartbeatIntervalMs: number;

  private readonly connectionListeners = new Set<(state: DaemonConnectionState) => void>();
  private readonly heartbeatListeners = new Set<(event: DaemonHeartbeatEvent) => void>();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatPulse = false;
  private reconnectTask: Promise<DaemonResult<void>> | null = null;
  private reconnectRequested = false;

  constructor(options: LiveDaemonClientOptions = {}) {
    this.config = createDaemonClientConfig(options.clientConfig);
    this.now = options.now ?? (() => new Date());
    this.heartbeatIntervalMs = Math.max(250, options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);

    this.httpTransport = new DaemonHttpTransport({
      baseUrl: this.config.httpBaseUrl,
      requestTimeoutMs: this.config.requestTimeoutMs,
      fetchImpl: options.fetchImpl,
      now: this.now,
    });

    this.wsTransport = new DaemonWsTransport({
      baseUrl: this.config.wsBaseUrl,
      connectTimeoutMs: this.config.requestTimeoutMs,
      webSocketFactory: options.webSocketFactory,
      now: this.now,
    });

    this.reconnectPolicy = new ExponentialReconnectPolicy({
      baseDelayMs: this.config.reconnectBaseDelayMs,
      maxDelayMs: this.config.reconnectMaxDelayMs,
      maxRetries: options.maxReconnectRetries,
      random: options.random,
    });

    this.wsTransport.setUnexpectedCloseHandler((error) => {
      this.setState({
        status: "disconnected",
        retries: this.state.retries,
        connectedAt: this.state.connectedAt,
        lastError: error,
      });
      void this.ensureReconnect(error);
    });

    this.wsTransport.setHeartbeatHandler((timestamp) => {
      this.emitHeartbeat({
        alive: true,
        pulse: this.togglePulse(),
        source: "ws",
        timestamp,
      });
    });
  }

  public async connect(): Promise<DaemonResult<void>> {
    this.reconnectRequested = false;
    this.reconnectPolicy.reset();

    if (this.state.status === "connected" && this.wsTransport.isConnected()) {
      return ok(undefined);
    }

    this.setState({
      status: "connecting",
      retries: this.state.retries,
      connectedAt: this.state.connectedAt,
      lastError: this.state.lastError,
    });

    const health = await this.httpTransport.healthCheck();
    if (!health.ok) {
      this.setState({
        status: "disconnected",
        retries: this.state.retries,
        connectedAt: this.state.connectedAt,
        lastError: health.error,
      });
      return health;
    }

    const wsConnect = await this.wsTransport.connect();
    if (!wsConnect.ok) {
      this.setState({
        status: "disconnected",
        retries: this.state.retries,
        connectedAt: this.state.connectedAt,
        lastError: wsConnect.error,
      });
      return wsConnect;
    }

    this.setState({
      status: "connected",
      retries: 0,
      connectedAt: this.now().toISOString(),
      lastError: undefined,
    });

    this.emitHeartbeat({
      alive: health.value.healthy,
      pulse: this.togglePulse(),
      source: "http",
      timestamp: health.value.timestamp,
    });

    this.startHeartbeatLoop();
    return ok(undefined);
  }

  public async reconnect(): Promise<DaemonResult<void>> {
    return this.ensureReconnect({
      code: "DAEMON_DISCONNECTED",
      message: "Reconnect requested by client",
      retryable: true,
      fallbackHint: "Reconnect in progress.",
    });
  }

  public async disconnect(): Promise<DaemonResult<void>> {
    this.reconnectRequested = false;
    this.stopHeartbeatLoop();

    const result = await this.wsTransport.disconnect();
    if (!result.ok) {
      return result;
    }

    this.setState({
      status: "disconnected",
      retries: 0,
      connectedAt: this.state.connectedAt,
      lastError: undefined,
    });

    return ok(undefined);
  }

  public getConnectionState(): DaemonConnectionState {
    return { ...this.state };
  }

  public onConnectionStateChange(listener: (state: DaemonConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  public onHeartbeat(listener: (event: DaemonHeartbeatEvent) => void): () => void {
    this.heartbeatListeners.add(listener);
    return () => {
      this.heartbeatListeners.delete(listener);
    };
  }

  public async healthCheck(): Promise<DaemonResult<DaemonHealth>> {
    return this.httpTransport.healthCheck();
  }

  public async sendMessage(request: SendMessageRequest): Promise<DaemonResult<SendMessageResponse>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.httpTransport.sendMessage(request);
  }

  public async streamResponse(request: StreamResponseRequest): Promise<DaemonResult<AsyncIterable<DaemonStreamEvent>>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.wsTransport.streamResponse(request);
  }

  public async cancelStream(request: StreamResponseRequest): Promise<DaemonResult<void>> {
    return this.wsTransport.cancelStream(request);
  }

  public async listConversations(): Promise<DaemonResult<ConversationSummary[]>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.httpTransport.listConversations();
  }

  public async getConversation(conversationId: string): Promise<DaemonResult<ConversationRecord>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.httpTransport.getConversation(conversationId);
  }

  public async createConversation(request?: ConversationCreateRequest): Promise<DaemonResult<ConversationRecord>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.httpTransport.createConversation(request);
  }

  public async updateConversation(
    conversationId: string,
    request: ConversationUpdateRequest,
  ): Promise<DaemonResult<ConversationRecord>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.httpTransport.updateConversation(conversationId, request);
  }

  public async deleteConversation(conversationId: string): Promise<DaemonResult<void>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return this.httpTransport.deleteConversation(conversationId);
  }

  private async ensureReconnect(triggerError: DaemonClientError): Promise<DaemonResult<void>> {
    if (this.reconnectTask) {
      return this.reconnectTask;
    }

    this.reconnectRequested = true;
    this.stopHeartbeatLoop();
    this.reconnectTask = this.runReconnectLoop(triggerError).finally(() => {
      this.reconnectTask = null;
    });
    return this.reconnectTask;
  }

  private async runReconnectLoop(triggerError: DaemonClientError): Promise<DaemonResult<void>> {
    this.setState({
      status: "reconnecting",
      retries: this.state.retries,
      connectedAt: this.state.connectedAt,
      lastError: triggerError,
    });

    while (this.reconnectRequested) {
      const schedule = this.reconnectPolicy.next();
      if (!schedule) {
        const finalError: DaemonClientError = {
          code: "DAEMON_UNAVAILABLE",
          message: "Reconnect retry budget exhausted",
          retryable: true,
          fallbackHint: "Continue in offline mode until daemon recovers.",
        };

        this.setState({
          status: "disconnected",
          retries: this.state.retries,
          connectedAt: this.state.connectedAt,
          lastError: finalError,
        });
        return err(finalError);
      }

      this.setState({
        status: "reconnecting",
        retries: schedule.attempt,
        connectedAt: this.state.connectedAt,
        lastError: this.state.lastError,
      });

      await this.wait(schedule.delayMs);
      if (!this.reconnectRequested) {
        break;
      }

      const health = await this.httpTransport.healthCheck();
      if (!health.ok) {
        this.setState({
          status: "reconnecting",
          retries: schedule.attempt,
          connectedAt: this.state.connectedAt,
          lastError: health.error,
        });
        continue;
      }

      const wsResult = await this.wsTransport.connect();
      if (!wsResult.ok) {
        this.setState({
          status: "reconnecting",
          retries: schedule.attempt,
          connectedAt: this.state.connectedAt,
          lastError: wsResult.error,
        });
        continue;
      }

      this.reconnectRequested = false;
      this.reconnectPolicy.reset();
      this.setState({
        status: "connected",
        retries: schedule.attempt,
        connectedAt: this.now().toISOString(),
        lastError: undefined,
      });

      this.emitHeartbeat({
        alive: true,
        pulse: this.togglePulse(),
        source: "http",
        timestamp: health.value.timestamp,
      });
      this.startHeartbeatLoop();
      return ok(undefined);
    }

    return err({
      code: "DAEMON_DISCONNECTED",
      message: "Reconnect loop stopped",
      retryable: true,
    });
  }

  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      void this.tickHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeatLoop(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private async tickHeartbeat(): Promise<void> {
    if (this.state.status !== "connected") {
      return;
    }

    const health = await this.httpTransport.healthCheck();
    if (!health.ok) {
      this.emitHeartbeat({
        alive: false,
        pulse: false,
        source: "http",
        timestamp: this.now().toISOString(),
      });

      if (health.error.retryable) {
        void this.ensureReconnect(health.error);
      }
      return;
    }

    this.emitHeartbeat({
      alive: health.value.healthy,
      pulse: this.togglePulse(),
      source: "http",
      timestamp: health.value.timestamp,
    });
  }

  private emitHeartbeat(event: DaemonHeartbeatEvent): void {
    for (const listener of this.heartbeatListeners) {
      listener(event);
    }
  }

  private setState(next: DaemonConnectionState): void {
    this.state = { ...next };
    const snapshot = { ...this.state };
    for (const listener of this.connectionListeners) {
      listener(snapshot);
    }
  }

  private requireConnected(): DaemonResult<void> {
    if (this.state.status !== "connected") {
      return err({
        code: "DAEMON_DISCONNECTED",
        message: "Daemon client is disconnected",
        retryable: true,
        fallbackHint: "Reconnect or continue in offline mode.",
      });
    }

    return ok(undefined);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private togglePulse(): boolean {
    this.heartbeatPulse = !this.heartbeatPulse;
    return this.heartbeatPulse;
  }
}
