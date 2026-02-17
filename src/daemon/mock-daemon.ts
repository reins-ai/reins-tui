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

type MockFailureTarget = "connect" | "disconnect" | "health" | "send" | "stream";

interface MockFailureConfig {
  connectFailuresBeforeSuccess: number;
  disconnectFailuresBeforeSuccess: number;
  healthFailuresBeforeSuccess: number;
  sendFailuresBeforeSuccess: number;
  streamFailuresBeforeSuccess: number;
}

interface MockOperationConfig {
  operationDelayMs: number;
  streamChunkDelayMs: number;
}

interface MockFixtureConfig {
  responseChunks: string[];
  handshake: {
    daemonVersion: string;
    contractVersion: string;
    capabilities: string[];
  };
}

export interface MockDaemonOptions {
  clientConfig?: Partial<DaemonClientConfig>;
  daemonAvailable?: boolean;
  failures?: Partial<MockFailureConfig>;
  operation?: Partial<MockOperationConfig>;
  fixtures?: Partial<MockFixtureConfig>;
  now?: () => Date;
}

interface FailureCounters {
  connect: number;
  disconnect: number;
  health: number;
  send: number;
  stream: number;
}

const DEFAULT_FAILURE_CONFIG: MockFailureConfig = {
  connectFailuresBeforeSuccess: 0,
  disconnectFailuresBeforeSuccess: 0,
  healthFailuresBeforeSuccess: 0,
  sendFailuresBeforeSuccess: 0,
  streamFailuresBeforeSuccess: 0,
};

const DEFAULT_OPERATION_CONFIG: MockOperationConfig = {
  operationDelayMs: 0,
  streamChunkDelayMs: 5,
};

const DEFAULT_FIXTURE_CONFIG: MockFixtureConfig = {
  responseChunks: ["I can help with that.", " Let's break it down."],
  handshake: {
    daemonVersion: "0.1.0",
    contractVersion: "1.0.0",
    capabilities: ["health", "chat", "streaming", "conversations"],
  },
};

export class MockDaemonClient implements DaemonClient {
  public readonly config: DaemonClientConfig;

  private state: DaemonConnectionState = {
    status: "disconnected",
    retries: 0,
  };

  private daemonAvailable: boolean;
  private failures: MockFailureConfig;
  private operation: MockOperationConfig;
  private fixtures: MockFixtureConfig;
  private readonly counters: FailureCounters = {
    connect: 0,
    disconnect: 0,
    health: 0,
    send: 0,
    stream: 0,
  };
  private readonly listeners = new Set<(state: DaemonConnectionState) => void>();
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly now: () => Date;

  constructor(options: MockDaemonOptions = {}) {
    this.config = createDaemonClientConfig(options.clientConfig);
    this.daemonAvailable = options.daemonAvailable ?? true;
    this.failures = { ...DEFAULT_FAILURE_CONFIG, ...options.failures };
    this.operation = { ...DEFAULT_OPERATION_CONFIG, ...options.operation };
    this.fixtures = {
      responseChunks: options.fixtures?.responseChunks ?? [...DEFAULT_FIXTURE_CONFIG.responseChunks],
      handshake: {
        ...DEFAULT_FIXTURE_CONFIG.handshake,
        ...options.fixtures?.handshake,
      },
    };
    this.now = options.now ?? (() => new Date());
  }

  public setDaemonAvailable(available: boolean): void {
    this.daemonAvailable = available;
  }

  public configure(options: {
    failures?: Partial<MockFailureConfig>;
    operation?: Partial<MockOperationConfig>;
    fixtures?: Partial<MockFixtureConfig>;
  }): void {
    if (options.failures) {
      this.failures = { ...this.failures, ...options.failures };
    }

    if (options.operation) {
      this.operation = { ...this.operation, ...options.operation };
    }

    if (options.fixtures) {
      this.fixtures = {
        responseChunks: options.fixtures.responseChunks ?? this.fixtures.responseChunks,
        handshake: {
          ...this.fixtures.handshake,
          ...options.fixtures.handshake,
        },
      };
    }
  }

  public resetFailures(): void {
    this.counters.connect = 0;
    this.counters.disconnect = 0;
    this.counters.health = 0;
    this.counters.send = 0;
    this.counters.stream = 0;
  }

  public async connect(): Promise<DaemonResult<void>> {
    if (this.state.status === "connected") {
      return ok(undefined);
    }

    this.setState({
      status: "connecting",
      retries: this.state.retries,
      connectedAt: this.state.connectedAt,
      lastError: this.state.lastError,
    });

    await this.wait(this.operation.operationDelayMs);

    const connectError = this.takeOperationFailure("connect");
    if (connectError) {
      this.setState({
        status: "disconnected",
        retries: this.state.retries,
        lastError: connectError,
      });
      return err(connectError);
    }

    this.setState({
      status: "connected",
      retries: this.state.retries,
      connectedAt: this.now().toISOString(),
    });

    return ok(undefined);
  }

  public async reconnect(): Promise<DaemonResult<void>> {
    if (this.state.status === "connected") {
      return ok(undefined);
    }

    this.setState({
      status: "reconnecting",
      retries: this.state.retries + 1,
      connectedAt: this.state.connectedAt,
      lastError: this.state.lastError,
    });

    await this.wait(this.operation.operationDelayMs);

    const connectError = this.takeOperationFailure("connect");
    if (connectError) {
      this.setState({
        status: "disconnected",
        retries: this.state.retries,
        connectedAt: this.state.connectedAt,
        lastError: connectError,
      });
      return err(connectError);
    }

    this.setState({
      status: "connected",
      retries: this.state.retries,
      connectedAt: this.now().toISOString(),
    });
    return ok(undefined);
  }

  public async disconnect(): Promise<DaemonResult<void>> {
    if (this.state.status === "disconnected") {
      return ok(undefined);
    }

    await this.wait(this.operation.operationDelayMs);

    const disconnectError = this.takeOperationFailure("disconnect");
    if (disconnectError) {
      this.setState({
        status: "connected",
        retries: this.state.retries,
        connectedAt: this.state.connectedAt,
        lastError: disconnectError,
      });
      return err(disconnectError);
    }

    this.setState({
      status: "disconnected",
      retries: this.state.retries,
      connectedAt: this.state.connectedAt,
    });

    return ok(undefined);
  }

  public getConnectionState(): DaemonConnectionState {
    return { ...this.state };
  }

  public onConnectionStateChange(listener: (state: DaemonConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async healthCheck(): Promise<DaemonResult<DaemonHealth>> {
    await this.wait(this.operation.operationDelayMs);

    const healthError = this.takeOperationFailure("health");
    if (healthError) {
      return err(healthError);
    }

    return ok({
      healthy: true,
      timestamp: this.now().toISOString(),
      handshake: {
        daemonVersion: this.fixtures.handshake.daemonVersion,
        contractVersion: this.fixtures.handshake.contractVersion,
        capabilities: [...this.fixtures.handshake.capabilities],
      },
    });
  }

  public async sendMessage(request: SendMessageRequest): Promise<DaemonResult<SendMessageResponse>> {
    await this.wait(this.operation.operationDelayMs);

    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    const sendError = this.takeOperationFailure("send");
    if (sendError) {
      return err(sendError);
    }

    const conversationResult = this.getOrCreateConversation(request.conversationId, request.model);
    if (!conversationResult.ok) {
      return conversationResult;
    }

    const conversation = conversationResult.value;
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const now = this.now().toISOString();

    conversation.messages.push({
      id: userMessageId,
      role: "user",
      content: request.content,
      createdAt: now,
    });
    conversation.messages.push({
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt: now,
    });
    conversation.updatedAt = now;
    conversation.messageCount = conversation.messages.length;

    return ok({
      conversationId: conversation.id,
      userMessageId,
      assistantMessageId,
    });
  }

  public async streamResponse(request: StreamResponseRequest): Promise<DaemonResult<AsyncIterable<DaemonStreamEvent>>> {
    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    const streamError = this.takeOperationFailure("stream");
    if (streamError) {
      return err(streamError);
    }

    const conversation = this.conversations.get(request.conversationId);
    if (!conversation) {
      return err(this.notFoundError(`Conversation '${request.conversationId}' was not found`));
    }

    const assistantMessage = conversation.messages.find((message) => message.id === request.assistantMessageId);
    if (!assistantMessage || assistantMessage.role !== "assistant") {
      return err(this.notFoundError(`Assistant message '${request.assistantMessageId}' was not found`));
    }

    const stream = this.createStream(conversation, assistantMessage.id);
    return ok(stream);
  }

  public async cancelStream(_request: StreamResponseRequest): Promise<DaemonResult<void>> {
    // Mock streams are local async generators. Treat cancellation as a no-op success.
    return ok(undefined);
  }

  public async listConversations(): Promise<DaemonResult<ConversationSummary[]>> {
    await this.wait(this.operation.operationDelayMs);

    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    return ok(
      Array.from(this.conversations.values()).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        messageCount: conversation.messageCount,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      })),
    );
  }

  public async getConversation(conversationId: string): Promise<DaemonResult<ConversationRecord>> {
    await this.wait(this.operation.operationDelayMs);

    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return err(this.notFoundError(`Conversation '${conversationId}' was not found`));
    }

    return ok(this.cloneConversation(conversation));
  }

  public async createConversation(request: ConversationCreateRequest = {}): Promise<DaemonResult<ConversationRecord>> {
    await this.wait(this.operation.operationDelayMs);

    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    const now = this.now().toISOString();
    const conversation: ConversationRecord = {
      id: crypto.randomUUID(),
      title: request.title?.trim() ? request.title.trim() : "New conversation",
      model: request.model?.trim() ? request.model.trim() : "default",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    this.conversations.set(conversation.id, conversation);
    return ok(this.cloneConversation(conversation));
  }

  public async updateConversation(
    conversationId: string,
    request: ConversationUpdateRequest,
  ): Promise<DaemonResult<ConversationRecord>> {
    await this.wait(this.operation.operationDelayMs);

    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return err(this.notFoundError(`Conversation '${conversationId}' was not found`));
    }

    if (request.title?.trim()) {
      conversation.title = request.title.trim();
    }

    if (request.model?.trim()) {
      conversation.model = request.model.trim();
    }

    conversation.updatedAt = this.now().toISOString();
    return ok(this.cloneConversation(conversation));
  }

  public async deleteConversation(conversationId: string): Promise<DaemonResult<void>> {
    await this.wait(this.operation.operationDelayMs);

    const connected = this.requireConnected();
    if (!connected.ok) {
      return connected;
    }

    const deleted = this.conversations.delete(conversationId);
    if (!deleted) {
      return err(this.notFoundError(`Conversation '${conversationId}' was not found`));
    }

    return ok(undefined);
  }

  private setState(next: DaemonConnectionState): void {
    this.state = { ...next };
    const snapshot = { ...this.state };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async wait(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private takeOperationFailure(target: MockFailureTarget): DaemonClientError | null {
    if (!this.daemonAvailable) {
      return this.unavailableError();
    }

    this.counters[target] += 1;

    const threshold = this.failureThresholdFor(target);
    if (this.counters[target] <= threshold) {
      return this.unavailableError();
    }

    return null;
  }

  private failureThresholdFor(target: MockFailureTarget): number {
    switch (target) {
      case "connect":
        return this.failures.connectFailuresBeforeSuccess;
      case "disconnect":
        return this.failures.disconnectFailuresBeforeSuccess;
      case "health":
        return this.failures.healthFailuresBeforeSuccess;
      case "send":
        return this.failures.sendFailuresBeforeSuccess;
      case "stream":
        return this.failures.streamFailuresBeforeSuccess;
    }
  }

  private requireConnected(): DaemonResult<void> {
    if (this.state.status !== "connected") {
      return err({
        code: "DAEMON_DISCONNECTED",
        message: "Daemon client is not connected",
        retryable: true,
        fallbackHint: "Retry connection or continue in offline mode.",
      });
    }

    return ok(undefined);
  }

  private unavailableError(): DaemonClientError {
    return {
      code: "DAEMON_UNAVAILABLE",
      message: "Daemon is unavailable on localhost:7433",
      retryable: true,
      fallbackHint: "Retry connection and use offline fallback while unavailable.",
    };
  }

  private notFoundError(message: string): DaemonClientError {
    return {
      code: "DAEMON_NOT_FOUND",
      message,
      retryable: false,
    };
  }

  private getOrCreateConversation(
    conversationId: string | undefined,
    model: string | undefined,
  ): DaemonResult<ConversationRecord> {
    if (conversationId) {
      const existing = this.conversations.get(conversationId);
      if (!existing) {
        return err(this.notFoundError(`Conversation '${conversationId}' was not found`));
      }

      return ok(existing);
    }

    const now = this.now().toISOString();
    const conversation: ConversationRecord = {
      id: crypto.randomUUID(),
      title: "New conversation",
      model: model?.trim() ? model.trim() : "default",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    this.conversations.set(conversation.id, conversation);
    return ok(conversation);
  }

  private createStream(conversation: ConversationRecord, assistantMessageId: string): AsyncIterable<DaemonStreamEvent> {
    const chunkDelay = this.operation.streamChunkDelayMs;
    const chunks = [...this.fixtures.responseChunks];
    const now = this.now;

    const self = this;

    return {
      async *[Symbol.asyncIterator]() {
        const startedAt = now().toISOString();
        yield {
          type: "start",
          conversationId: conversation.id,
          messageId: assistantMessageId,
          timestamp: startedAt,
        } satisfies DaemonStreamEvent;

        let content = "";
        for (const chunk of chunks) {
          if (chunkDelay > 0) {
            await self.wait(chunkDelay);
          }

          content += chunk;
          const chunkAt = now().toISOString();
          yield {
            type: "delta",
            conversationId: conversation.id,
            messageId: assistantMessageId,
            delta: chunk,
            timestamp: chunkAt,
          } satisfies DaemonStreamEvent;
        }

        const assistantMessage = conversation.messages.find((message) => message.id === assistantMessageId);
        if (assistantMessage) {
          assistantMessage.content = content;
          conversation.updatedAt = now().toISOString();
          conversation.messageCount = conversation.messages.length;
        }

        yield {
          type: "complete",
          conversationId: conversation.id,
          messageId: assistantMessageId,
          content,
          timestamp: now().toISOString(),
        } satisfies DaemonStreamEvent;
      },
    };
  }

  private cloneConversation(conversation: ConversationRecord): ConversationRecord {
    return {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    };
  }
}
