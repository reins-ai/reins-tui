/**
 * Daemon-backed memory client for TUI command context.
 *
 * Translates MemoryCommandContext calls into daemon HTTP requests,
 * mapping daemon DTOs to the TUI MemoryEntry shape.
 */

import { err, ok, type DaemonClientError, type DaemonResult } from "./contracts";
import type {
  CommandError,
  MemoryCommandContext,
  MemoryEntry,
  MemoryLayer,
  MemoryType,
} from "../commands/handlers/types";
import type { Result } from "./contracts";

/** Capability state for a single memory feature. */
export interface MemoryCapabilityState {
  enabled: boolean;
  reason?: string;
}

/** Response shape from GET /api/memory/capabilities. */
export interface MemoryCapabilitiesResponse {
  ready: boolean;
  embeddingConfigured: boolean;
  setupRequired: boolean;
  configPath: string;
  features: {
    crud: MemoryCapabilityState;
    semanticSearch: MemoryCapabilityState;
    consolidation: MemoryCapabilityState;
  };
  embedding?: {
    provider: string;
    model: string;
  };
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface DaemonMemoryClientOptions {
  baseUrl: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** DTO shape returned by daemon memory endpoints. */
interface DaemonMemoryRecordDto {
  id: string;
  content: string;
  type: string;
  layer: string;
  tags: string[];
  entities: string[];
  importance: number;
  confidence: number;
  provenance: {
    sourceType: string;
    conversationId?: string;
  };
  supersedes?: string;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
}

interface DaemonMemoryListResponse {
  memories: DaemonMemoryRecordDto[];
}

interface DaemonMemorySearchResponse {
  query: string;
  results: DaemonMemoryRecordDto[];
  total: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function mapDtoToEntry(dto: DaemonMemoryRecordDto): MemoryEntry {
  return {
    id: dto.id,
    content: dto.content,
    type: dto.type as MemoryType,
    layer: dto.layer as MemoryLayer,
    tags: dto.tags,
    entities: dto.entities,
    importance: dto.importance,
    confidence: dto.confidence,
    source: {
      type: dto.provenance.sourceType,
      conversationId: dto.provenance.conversationId,
    },
    supersedes: dto.supersedes,
    supersededBy: dto.supersededBy,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    accessedAt: dto.accessedAt,
  };
}

function mapDaemonError(daemonError: DaemonClientError): CommandError {
  if (daemonError.code === "DAEMON_NOT_FOUND") {
    return { code: "NOT_FOUND", message: daemonError.message };
  }
  if (daemonError.code === "DAEMON_INVALID_REQUEST") {
    return { code: "INVALID_ARGUMENT", message: daemonError.message };
  }
  if (daemonError.code === "DAEMON_EMBEDDING_NOT_CONFIGURED") {
    return { code: "UNSUPPORTED", message: daemonError.message };
  }
  return { code: "UNSUPPORTED", message: daemonError.message };
}

export class DaemonMemoryClient implements MemoryCommandContext {
  public readonly available = true;

  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonMemoryClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async remember(input: {
    content: string;
    type?: MemoryType;
    tags?: string[];
    conversationId?: string;
  }): Promise<Result<MemoryEntry, CommandError>> {
    const body: Record<string, unknown> = { content: input.content };
    if (input.type) body.type = input.type;
    if (input.tags) body.tags = input.tags;
    if (input.conversationId) body.conversationId = input.conversationId;

    const result = await this.requestJson<DaemonMemoryRecordDto>("POST", "/api/memory", body);
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    return ok(mapDtoToEntry(result.value));
  }

  async list(options?: {
    type?: MemoryType;
    layer?: MemoryLayer;
    limit?: number;
  }): Promise<Result<readonly MemoryEntry[], CommandError>> {
    const params = new URLSearchParams();
    if (options?.type) params.set("type", options.type);
    if (options?.layer) params.set("layer", options.layer);
    if (options?.limit) params.set("limit", String(options.limit));

    const query = params.toString();
    const path = query ? `/api/memory?${query}` : "/api/memory";

    const result = await this.requestJson<DaemonMemoryListResponse>("GET", path);
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    return ok(result.value.memories.map(mapDtoToEntry));
  }

  async show(id: string): Promise<Result<MemoryEntry | null, CommandError>> {
    const result = await this.requestJson<DaemonMemoryRecordDto>(
      "GET",
      `/api/memory/${encodeURIComponent(id)}`,
    );

    if (!result.ok) {
      if (result.error.code === "DAEMON_NOT_FOUND") {
        return ok(null);
      }
      return err(mapDaemonError(result.error));
    }

    return ok(mapDtoToEntry(result.value));
  }

  async checkCapabilities(): Promise<DaemonResult<MemoryCapabilitiesResponse>> {
    return this.requestJson<MemoryCapabilitiesResponse>("GET", "/api/memory/capabilities");
  }

  async saveEmbeddingConfig(config: {
    provider: string;
    model: string;
  }): Promise<DaemonResult<MemoryCapabilitiesResponse>> {
    return this.requestJson<MemoryCapabilitiesResponse>(
      "POST",
      "/api/memory/capabilities",
      { embedding: config },
    );
  }

  async search(input: {
    query: string;
    type?: MemoryType;
    layer?: MemoryLayer;
    limit?: number;
  }): Promise<Result<readonly MemoryEntry[], CommandError>> {
    const body: Record<string, unknown> = { query: input.query };
    if (input.type) body.type = input.type;
    if (input.layer) body.layer = input.layer;
    if (input.limit) body.limit = input.limit;

    const result = await this.requestJson<DaemonMemorySearchResponse>(
      "POST",
      "/api/memory/search",
      body,
    );

    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    return ok(result.value.results.map(mapDtoToEntry));
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
        return err(await this.mapHttpErrorWithBody(response, method, path));
      }

      return ok(response);
    } catch (cause) {
      return err(this.mapTransportError(cause, method, path));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse the response body for structured error details before falling
   * back to status-code-only mapping. This enables the client to
   * distinguish embedding-not-configured (503 with specific code) from
   * generic service unavailability.
   */
  private async mapHttpErrorWithBody(
    response: Response,
    method: HttpMethod,
    path: string,
  ): Promise<DaemonClientError> {
    if (response.status === 503) {
      try {
        const body = await response.json() as Record<string, unknown>;
        if (body.code === "EMBEDDING_NOT_CONFIGURED") {
          const message = typeof body.error === "string"
            ? body.error
            : "Embedding provider setup is required. Run /memory setup to configure.";
          return {
            code: "DAEMON_EMBEDDING_NOT_CONFIGURED",
            message,
            retryable: false,
            fallbackHint: "Run /memory setup to configure an embedding provider.",
          };
        }
      } catch {
        // Fall through to generic 503 handling
      }
    }

    return this.mapHttpError(response.status, method, path);
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
        message: `Memory not found (${method} ${path})`,
        retryable: false,
      };
    }

    if (status === 503) {
      return {
        code: "DAEMON_UNAVAILABLE",
        message: "Memory service is not ready. Try again shortly.",
        retryable: true,
        fallbackHint: "Wait for daemon memory initialization to complete.",
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
    };
  }

  private mapTransportError(cause: unknown, method: HttpMethod, path: string): DaemonClientError {
    if (cause instanceof Error && cause.name === "AbortError") {
      return {
        code: "DAEMON_TIMEOUT",
        message: `Memory request timed out (${method} ${path})`,
        retryable: true,
        fallbackHint: "Retry and verify daemon health status.",
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: "Memory service is not reachable. Is the daemon running?",
      retryable: true,
      fallbackHint: "Start the daemon and retry.",
    };
  }
}

/**
 * Create a DaemonMemoryClient if the daemon is connected, or null if not.
 */
export function createMemoryClient(
  daemonConnected: boolean,
  baseUrl: string,
  options?: { requestTimeoutMs?: number; fetchImpl?: typeof fetch },
): MemoryCommandContext | null {
  if (!daemonConnected) {
    return null;
  }

  return new DaemonMemoryClient({
    baseUrl,
    requestTimeoutMs: options?.requestTimeoutMs,
    fetchImpl: options?.fetchImpl,
  });
}
