import { err, ok, type ConversationCreateRequest, type ConversationRecord, type ConversationSummary, type ConversationUpdateRequest, type DaemonClientError, type DaemonHealth, type DaemonResult, type SendMessageRequest, type SendMessageResponse } from "./contracts";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface DaemonHttpTransportConfig {
  baseUrl: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface DaemonHttpHealthShape {
  healthy?: boolean;
  timestamp?: string;
  handshake?: {
    daemonVersion?: string;
    contractVersion?: string;
    capabilities?: string[];
  };
  status?: "ok" | "degraded" | "error";
  version?: string;
  contractVersion?: string;
  discovery?: {
    capabilities?: string[];
  };
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class DaemonHttpTransport {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: DaemonHttpTransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = Math.max(1, config.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  public async healthCheck(): Promise<DaemonResult<DaemonHealth>> {
    const response = await this.requestJson<DaemonHttpHealthShape>("GET", "/health");
    if (!response.ok) {
      return response;
    }

    const payload = response.value;
    const healthy = typeof payload.healthy === "boolean" ? payload.healthy : payload.status !== "error";

    return ok({
      healthy,
      timestamp: payload.timestamp ?? this.now().toISOString(),
      handshake: {
        daemonVersion: payload.handshake?.daemonVersion ?? payload.version ?? "unknown",
        contractVersion: payload.handshake?.contractVersion ?? payload.contractVersion ?? "unknown",
        capabilities: payload.handshake?.capabilities ?? payload.discovery?.capabilities ?? [],
      },
    });
  }

  public async sendMessage(request: SendMessageRequest): Promise<DaemonResult<SendMessageResponse>> {
    return this.requestJson<SendMessageResponse>("POST", "/messages", request);
  }

  public async listConversations(): Promise<DaemonResult<ConversationSummary[]>> {
    return this.requestJson<ConversationSummary[]>("GET", "/conversations");
  }

  public async getConversation(conversationId: string): Promise<DaemonResult<ConversationRecord>> {
    return this.requestJson<ConversationRecord>("GET", `/conversations/${encodeURIComponent(conversationId)}`);
  }

  public async createConversation(request: ConversationCreateRequest = {}): Promise<DaemonResult<ConversationRecord>> {
    return this.requestJson<ConversationRecord>("POST", "/conversations", request);
  }

  public async updateConversation(
    conversationId: string,
    request: ConversationUpdateRequest,
  ): Promise<DaemonResult<ConversationRecord>> {
    return this.requestJson<ConversationRecord>("PATCH", `/conversations/${encodeURIComponent(conversationId)}`, request);
  }

  public async deleteConversation(conversationId: string): Promise<DaemonResult<void>> {
    const response = await this.request("DELETE", `/conversations/${encodeURIComponent(conversationId)}`);
    if (!response.ok) {
      return response;
    }

    return ok(undefined);
  }

  private async requestJson<T>(method: HttpMethod, path: string, body?: unknown): Promise<DaemonResult<T>> {
    const response = await this.request(method, path, body);
    if (!response.ok) {
      return response;
    }

    try {
      const payload = (await response.value.json()) as T;
      return ok(payload);
    } catch {
      return err({
        code: "DAEMON_INTERNAL_ERROR",
        message: `Invalid JSON response from daemon (${method} ${path})`,
        retryable: false,
      });
    }
  }

  private async request(method: HttpMethod, path: string, body?: unknown): Promise<DaemonResult<Response>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        return err(this.mapHttpError(response.status, method, path));
      }

      return ok(response);
    } catch (cause) {
      return err(this.mapTransportError(cause, method, path));
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapHttpError(status: number, method: HttpMethod, path: string): DaemonClientError {
    if (status === 400) {
      return {
        code: "DAEMON_INVALID_REQUEST",
        message: `Daemon rejected request (${method} ${path})`,
        retryable: false,
      };
    }

    if (status === 404) {
      return {
        code: "DAEMON_NOT_FOUND",
        message: `Daemon resource not found (${method} ${path})`,
        retryable: false,
      };
    }

    if (status >= 500) {
      return {
        code: "DAEMON_INTERNAL_ERROR",
        message: `Daemon internal failure (${status})`,
        retryable: true,
        fallbackHint: "Retry after daemon health recovers.",
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: `Unexpected daemon response (${status})`,
      retryable: true,
      fallbackHint: "Retry connection or continue in offline mode.",
    };
  }

  private mapTransportError(cause: unknown, method: HttpMethod, path: string): DaemonClientError {
    if (cause instanceof Error && cause.name === "AbortError") {
      return {
        code: "DAEMON_TIMEOUT",
        message: `Daemon request timed out (${method} ${path})`,
        retryable: true,
        fallbackHint: "Retry and verify daemon health status.",
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: `Daemon request failed (${method} ${path})`,
      retryable: true,
      fallbackHint: "Retry connection and continue in offline mode if needed.",
    };
  }
}
