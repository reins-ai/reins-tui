import { err, ok, type DaemonClientError, type DaemonResult } from "./contracts";

export interface DeviceCodeResponse {
  code: string;
  verificationUrl: string;
  expiresAt: number;
}

export type DeviceCodeStatus = "pending" | "verified" | "expired";

export interface DeviceCodeStatusResponse {
  status: DeviceCodeStatus;
  sessionToken?: string;
  expiresAt?: number;
}

export interface DaemonAuthClientOptions {
  baseUrl: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class DaemonAuthClient {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonAuthClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async requestDeviceCode(): Promise<DaemonResult<DeviceCodeResponse>> {
    return this.requestJson<DeviceCodeResponse>("POST", "/auth/device-code");
  }

  public async pollDeviceCodeStatus(code: string): Promise<DaemonResult<DeviceCodeStatusResponse>> {
    return this.requestJson<DeviceCodeStatusResponse>(
      "GET",
      `/auth/device-code/${encodeURIComponent(code)}/status`,
    );
  }

  private async requestJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<DaemonResult<T>> {
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

      const payload = (await response.json()) as T;
      return ok(payload);
    } catch (cause) {
      return err(this.mapTransportError(cause, method, path));
    } finally {
      clearTimeout(timeout);
    }
  }

  private mapHttpError(status: number, method: string, path: string): DaemonClientError {
    if (status === 404) {
      return {
        code: "DAEMON_NOT_FOUND",
        message: `Auth endpoint not found (${method} ${path})`,
        retryable: false,
      };
    }

    if (status >= 500) {
      return {
        code: "DAEMON_INTERNAL_ERROR",
        message: `Auth service error (${status})`,
        retryable: true,
        fallbackHint: "Retry after daemon health recovers.",
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: `Unexpected auth response (${status})`,
      retryable: true,
      fallbackHint: "Retry connection.",
    };
  }

  private mapTransportError(cause: unknown, method: string, path: string): DaemonClientError {
    if (cause instanceof Error && cause.name === "AbortError") {
      return {
        code: "DAEMON_TIMEOUT",
        message: `Auth request timed out (${method} ${path})`,
        retryable: true,
        fallbackHint: "Retry and verify daemon health status.",
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: `Auth request failed (${method} ${path})`,
      retryable: true,
      fallbackHint: "Retry connection.",
    };
  }
}
