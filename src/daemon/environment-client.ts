/**
 * Daemon-backed environment client for TUI command context.
 *
 * Translates EnvironmentCommandContext calls into daemon HTTP requests,
 * mapping daemon DTOs to the TUI environment shape.
 */

import { err, ok, type DaemonClientError, type DaemonResult } from "./contracts";
import type { CommandError, EnvironmentCommandContext } from "../commands/handlers/types";
import type { Result } from "./contracts";

type HttpMethod = "GET" | "POST";

/** Response shape from GET /api/environments. */
export interface EnvironmentListResponse {
  activeEnvironment: string;
  environments: EnvironmentSummaryDto[];
}

export interface EnvironmentSummaryDto {
  name: string;
  path: string;
  availableDocumentTypes: string[];
}

/** Response shape from POST /api/environments/switch. */
export interface EnvironmentSwitchResponse {
  activeEnvironment: string;
  previousEnvironment: string;
  switchedAt: string;
}

export interface DaemonEnvironmentClientOptions {
  baseUrl: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function mapDaemonError(daemonError: DaemonClientError): CommandError {
  if (daemonError.code === "DAEMON_NOT_FOUND") {
    return { code: "NOT_FOUND", message: daemonError.message };
  }
  if (daemonError.code === "DAEMON_INVALID_REQUEST") {
    return { code: "INVALID_ARGUMENT", message: daemonError.message };
  }
  return { code: "UNSUPPORTED", message: daemonError.message };
}

export class DaemonEnvironmentClient implements EnvironmentCommandContext {
  private _activeEnvironment = "default";
  private _availableEnvironments: readonly string[] = ["default"];

  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonEnvironmentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get activeEnvironment(): string {
    return this._activeEnvironment;
  }

  get availableEnvironments(): readonly string[] {
    return this._availableEnvironments;
  }

  async refresh(): Promise<DaemonResult<EnvironmentListResponse>> {
    const result = await this.requestJson<EnvironmentListResponse>("GET", "/api/environments");
    if (!result.ok) {
      return result;
    }

    this._activeEnvironment = result.value.activeEnvironment;
    this._availableEnvironments = result.value.environments.map((env) => env.name);
    return result;
  }

  async switchEnvironment(
    name: string,
  ): Promise<Result<{ activeEnvironment: string; previousEnvironment: string }, CommandError>> {
    const result = await this.requestJson<EnvironmentSwitchResponse>(
      "POST",
      "/api/environments/switch",
      { name },
    );

    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    this._activeEnvironment = result.value.activeEnvironment;

    const refreshResult = await this.refresh();
    if (!refreshResult.ok) {
      this.ensureEnvironmentListed(this._activeEnvironment);
    }

    return ok({
      activeEnvironment: result.value.activeEnvironment,
      previousEnvironment: result.value.previousEnvironment,
    });
  }

  private ensureEnvironmentListed(environment: string): void {
    if (this._availableEnvironments.includes(environment)) {
      return;
    }

    this._availableEnvironments = [...this._availableEnvironments, environment];
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
        message: `Daemon rejected environment request (${method} ${path})`,
        retryable: false,
      };
    }

    if (status === 404) {
      return {
        code: "DAEMON_NOT_FOUND",
        message: `Environment not found (${method} ${path})`,
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
    };
  }

  private mapTransportError(cause: unknown, method: HttpMethod, path: string): DaemonClientError {
    if (cause instanceof Error && cause.name === "AbortError") {
      return {
        code: "DAEMON_TIMEOUT",
        message: `Environment request timed out (${method} ${path})`,
        retryable: true,
        fallbackHint: "Retry and verify daemon health status.",
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: "Environment service is not reachable. Is the daemon running?",
      retryable: true,
      fallbackHint: "Start the daemon and retry.",
    };
  }
}

/**
 * Create a DaemonEnvironmentClient if the daemon is connected, or null if not.
 */
export function createEnvironmentClient(
  daemonConnected: boolean,
  baseUrl: string,
  options?: { requestTimeoutMs?: number; fetchImpl?: typeof fetch },
): DaemonEnvironmentClient | null {
  if (!daemonConnected) {
    return null;
  }

  return new DaemonEnvironmentClient({
    baseUrl,
    requestTimeoutMs: options?.requestTimeoutMs,
    fetchImpl: options?.fetchImpl,
  });
}
