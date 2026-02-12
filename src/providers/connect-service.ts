import type { DaemonClient, DaemonClientConfig } from "../daemon/client";
import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../daemon/client";
import { err, ok, type DaemonClientError, type Result } from "../daemon/contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export type ProviderMode = "byok" | "gateway";
export type ProviderModeOption = ProviderMode | "both";

export type ProviderConnectionState = "ready" | "requires_auth" | "requires_reauth" | "invalid";

export type ProviderAuthMethod = "api_key" | "oauth";

export interface ProviderListEntry {
  providerId: string;
  providerName: string;
  connectionState: ProviderConnectionState;
  displayStatus: string;
  authMethods: ProviderAuthMethod[];
  configured: boolean;
  requiresAuth: boolean;
}

export interface ProviderConnection {
  providerId: string;
  providerName: string;
  mode: ProviderMode;
  models: string[];
  configuredAt: string;
}

export interface ConnectionTest {
  connected: boolean;
  latency: number;
  provider: string;
  model?: string;
}

export type ConnectErrorCode =
  | "INVALID_INPUT"
  | "VALIDATION_FAILED"
  | "CONFIGURATION_FAILED"
  | "DAEMON_OFFLINE"
  | "DAEMON_ERROR"
  | "OAUTH_FAILED"
  | "OAUTH_TIMEOUT";

export interface ConnectError {
  code: ConnectErrorCode;
  message: string;
  retryable: boolean;
}

export interface ProviderApiTransport {
  get<T>(path: string): Promise<Result<T, DaemonClientError>>;
  post<TRequest, TResponse>(path: string, body: TRequest): Promise<Result<TResponse, DaemonClientError>>;
  delete(path: string): Promise<Result<void, DaemonClientError>>;
}

export interface ConnectServiceOptions {
  daemonClient?: DaemonClient;
  transport?: ProviderApiTransport;
  daemonBaseUrl?: string;
  requestTimeoutMs?: number;
}

export interface OAuthInitiation {
  authUrl: string;
  provider: string;
  expiresAt?: number;
}

export interface OAuthCompletion {
  success: boolean;
  provider: string;
  error?: string;
}

interface DaemonOAuthInitPayload {
  authUrl?: string;
  url?: string;
  provider?: string;
  expiresAt?: number;
  error?: string;
}

interface DaemonOAuthStatusPayload {
  status?: string;
  provider?: string;
  success?: boolean;
  complete?: boolean;
  error?: string;
  providerId?: string;
  providerName?: string;
  models?: unknown;
  configuredAt?: string;
}

interface DaemonProviderPayload {
  valid?: boolean;
  configured?: boolean;
  connected?: boolean;
  providerId?: string;
  provider?: string;
  providerName?: string;
  models?: unknown;
  availableModels?: unknown;
  configuredAt?: string;
  latency?: number;
  latencyMs?: number;
  model?: string;
  error?: string;
  message?: string;
}

interface DaemonAuthStatusPayload {
  provider?: string;
  requiresAuth?: boolean;
  authModes?: unknown;
  configured?: boolean;
  connectionState?: string;
  credentialType?: string;
  updatedAt?: number;
  expiresAt?: number;
}

interface DaemonProviderListPayload {
  providers?: unknown;
}

interface HttpProviderApiTransportOptions {
  baseUrl?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type HttpMethod = "GET" | "POST" | "DELETE";

export class HttpProviderApiTransport implements ProviderApiTransport {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpProviderApiTransportOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_DAEMON_HTTP_BASE_URL).replace(/\/$/, "");
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async get<T>(path: string): Promise<Result<T, DaemonClientError>> {
    return this.requestJson<undefined, T>("GET", path, undefined);
  }

  public async post<TRequest, TResponse>(path: string, body: TRequest): Promise<Result<TResponse, DaemonClientError>> {
    return this.requestJson<TRequest, TResponse>("POST", path, body);
  }

  public async delete(path: string): Promise<Result<void, DaemonClientError>> {
    const response = await this.request("DELETE", path, undefined);
    if (!response.ok) {
      return response;
    }

    return ok(undefined);
  }

  private async requestJson<TRequest, TResponse>(
    method: HttpMethod,
    path: string,
    body: TRequest | undefined,
  ): Promise<Result<TResponse, DaemonClientError>> {
    const response = await this.request(method, path, body);
    if (!response.ok) {
      return response;
    }

    try {
      const payload = (await response.value.json()) as TResponse;
      return ok(payload);
    } catch {
      return err({
        code: "DAEMON_INTERNAL_ERROR",
        message: `Invalid JSON response from daemon (${method} ${path})`,
        retryable: false,
      });
    }
  }

  private async request<TRequest>(
    method: HttpMethod,
    path: string,
    body: TRequest | undefined,
  ): Promise<Result<Response, DaemonClientError>> {
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
        message: `Daemon request timed out (${method} ${path})`,
        retryable: true,
      };
    }

    return {
      code: "DAEMON_UNAVAILABLE",
      message: `Daemon request failed (${method} ${path})`,
      retryable: true,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readProviderMode(value: unknown): ProviderMode | null {
  if (value === "byok" || value === "gateway") {
    return value;
  }

  return null;
}

function normalizePayload(value: unknown): DaemonProviderPayload {
  if (!isRecord(value)) {
    return {};
  }

  return {
    valid: typeof value.valid === "boolean" ? value.valid : undefined,
    configured: typeof value.configured === "boolean" ? value.configured : undefined,
    connected: typeof value.connected === "boolean" ? value.connected : undefined,
    providerId: typeof value.providerId === "string" ? value.providerId : undefined,
    provider: typeof value.provider === "string" ? value.provider : undefined,
    providerName: typeof value.providerName === "string" ? value.providerName : undefined,
    models: value.models,
    availableModels: value.availableModels,
    configuredAt: typeof value.configuredAt === "string" ? value.configuredAt : undefined,
    latency: typeof value.latency === "number" ? value.latency : undefined,
    latencyMs: typeof value.latencyMs === "number" ? value.latencyMs : undefined,
    model: typeof value.model === "string" ? value.model : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

function isOfflineError(error: DaemonClientError): boolean {
  return error.code === "DAEMON_UNAVAILABLE" || error.code === "DAEMON_DISCONNECTED" || error.code === "DAEMON_TIMEOUT";
}

function mapDaemonError(error: DaemonClientError): ConnectError {
  if (isOfflineError(error)) {
    return {
      code: "DAEMON_OFFLINE",
      message: error.message,
      retryable: true,
    };
  }

  return {
    code: "DAEMON_ERROR",
    message: error.message,
    retryable: error.retryable,
  };
}

function pickModels(payload: DaemonProviderPayload): string[] {
  const models = readStringArray(payload.models);
  if (models.length > 0) {
    return models;
  }

  return readStringArray(payload.availableModels);
}

function pickConfiguredAt(payload: DaemonProviderPayload): string {
  if (payload.configuredAt) {
    return payload.configuredAt;
  }

  return new Date().toISOString();
}

function pickProviderName(payload: DaemonProviderPayload, fallback: string): string {
  if (payload.providerName) {
    return payload.providerName;
  }

  if (payload.provider) {
    return payload.provider;
  }

  return fallback;
}

function pickProviderId(payload: DaemonProviderPayload, fallback: string): string {
  return payload.providerId ?? payload.provider ?? fallback;
}

function pickLatency(payload: DaemonProviderPayload): number {
  if (typeof payload.latencyMs === "number") {
    return payload.latencyMs;
  }

  if (typeof payload.latency === "number") {
    return payload.latency;
  }

  return 0;
}

function pickValidationError(payload: DaemonProviderPayload, fallback: string): string {
  if (payload.error && payload.error.length > 0) {
    return payload.error;
  }

  if (payload.message && payload.message.length > 0) {
    return payload.message;
  }

  return fallback;
}

function pickConnectionState(value: unknown): ProviderConnectionState {
  if (value === "ready" || value === "requires_auth" || value === "requires_reauth" || value === "invalid") {
    return value;
  }

  return "requires_auth";
}

function connectionStateToDisplayStatus(state: ProviderConnectionState): string {
  switch (state) {
    case "ready":
      return "Connected";
    case "requires_auth":
      return "Not configured";
    case "requires_reauth":
      return "Reconnect required";
    case "invalid":
      return "Invalid credentials";
  }
}

function pickAuthMethods(value: unknown): ProviderAuthMethod[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ProviderAuthMethod => item === "api_key" || item === "oauth");
}

function normalizeAuthStatusPayload(value: unknown): DaemonAuthStatusPayload {
  if (!isRecord(value)) {
    return {};
  }

  return {
    provider: typeof value.provider === "string" ? value.provider : undefined,
    requiresAuth: typeof value.requiresAuth === "boolean" ? value.requiresAuth : undefined,
    authModes: value.authModes,
    configured: typeof value.configured === "boolean" ? value.configured : undefined,
    connectionState: typeof value.connectionState === "string" ? value.connectionState : undefined,
    credentialType: typeof value.credentialType === "string" ? value.credentialType : undefined,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
    expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : undefined,
  };
}

function parseProviderListEntry(value: unknown): ProviderListEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const payload = normalizeAuthStatusPayload(value);
  const providerId = payload.provider;
  if (!providerId) {
    return null;
  }

  const connectionState = pickConnectionState(payload.connectionState);
  const authMethods = pickAuthMethods(payload.authModes);
  const providerName = typeof (value as Record<string, unknown>).providerName === "string"
    ? (value as Record<string, unknown>).providerName as string
    : providerId;

  return {
    providerId,
    providerName,
    connectionState,
    displayStatus: connectionStateToDisplayStatus(connectionState),
    authMethods,
    configured: payload.configured ?? false,
    requiresAuth: payload.requiresAuth ?? authMethods.length > 0,
  };
}

function pickBaseUrlFromConfig(config: DaemonClientConfig | null): string {
  if (!config?.httpBaseUrl || config.httpBaseUrl.trim().length === 0) {
    return DEFAULT_DAEMON_HTTP_BASE_URL;
  }

  return config.httpBaseUrl;
}

export class ConnectService {
  private readonly daemonClient: DaemonClient | undefined;
  private readonly transport: ProviderApiTransport;

  constructor(options: ConnectServiceOptions = {}) {
    this.daemonClient = options.daemonClient;

    if (options.transport) {
      this.transport = options.transport;
      return;
    }

    const daemonConfig =
      options.daemonClient && "config" in options.daemonClient
        ? ((options.daemonClient as { config?: DaemonClientConfig }).config ?? null)
        : null;

    this.transport = new HttpProviderApiTransport({
      baseUrl: options.daemonBaseUrl ?? pickBaseUrlFromConfig(daemonConfig),
      requestTimeoutMs: options.requestTimeoutMs,
    });
  }

  public async getAvailableModes(): Promise<Result<ProviderModeOption[], ConnectError>> {
    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    return ok(["byok", "gateway", "both"]);
  }

  public async connectBYOK(provider: string, apiKey: string): Promise<Result<ProviderConnection, ConnectError>> {
    const normalizedProvider = provider.trim();
    const normalizedApiKey = apiKey.trim();

    if (normalizedProvider.length === 0 || normalizedApiKey.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Provider and API key are required.",
        retryable: false,
      });
    }

    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const validationResult = await this.transport.post<{ provider: string; apiKey: string; mode: ProviderMode }, unknown>(
      "/api/providers/validate",
      {
        provider: normalizedProvider,
        apiKey: normalizedApiKey,
        mode: "byok",
      },
    );

    if (!validationResult.ok) {
      return err(mapDaemonError(validationResult.error));
    }

    const validationPayload = normalizePayload(validationResult.value);
    if (validationPayload.valid === false) {
      return err({
        code: "VALIDATION_FAILED",
        message: pickValidationError(validationPayload, "Provider credential validation failed."),
        retryable: false,
      });
    }

    const configureResult = await this.transport.post<
      { provider: string; apiKey: string; mode: ProviderMode },
      unknown
    >("/api/providers/configure", {
      provider: normalizedProvider,
      apiKey: normalizedApiKey,
      mode: "byok",
    });

    if (!configureResult.ok) {
      return err(mapDaemonError(configureResult.error));
    }

    const configurePayload = normalizePayload(configureResult.value);
    if (configurePayload.configured === false) {
      return err({
        code: "CONFIGURATION_FAILED",
        message: pickValidationError(configurePayload, "Provider configuration failed."),
        retryable: false,
      });
    }

    const connection: ProviderConnection = {
      providerId: pickProviderId(configurePayload, pickProviderId(validationPayload, normalizedProvider)),
      providerName: pickProviderName(configurePayload, pickProviderName(validationPayload, normalizedProvider)),
      mode: "byok",
      models: pickModels(configurePayload).length > 0 ? pickModels(configurePayload) : pickModels(validationPayload),
      configuredAt: pickConfiguredAt(configurePayload),
    };

    return ok(connection);
  }

  public async connectGateway(token: string): Promise<Result<ProviderConnection, ConnectError>> {
    const normalizedToken = token.trim();
    if (normalizedToken.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Gateway token is required.",
        retryable: false,
      });
    }

    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const validationResult = await this.transport.post<{ token: string; mode: ProviderMode }, unknown>("/api/gateway/validate", {
      token: normalizedToken,
      mode: "gateway",
    });

    if (!validationResult.ok) {
      return err(mapDaemonError(validationResult.error));
    }

    const validationPayload = normalizePayload(validationResult.value);
    if (validationPayload.valid === false) {
      return err({
        code: "VALIDATION_FAILED",
        message: pickValidationError(validationPayload, "Gateway credential validation failed."),
        retryable: false,
      });
    }

    const configureResult = await this.transport.post<{ token: string; mode: ProviderMode }, unknown>(
      "/api/gateway/configure",
      {
        token: normalizedToken,
        mode: "gateway",
      },
    );

    if (!configureResult.ok) {
      return err(mapDaemonError(configureResult.error));
    }

    const configurePayload = normalizePayload(configureResult.value);
    if (configurePayload.configured === false) {
      return err({
        code: "CONFIGURATION_FAILED",
        message: pickValidationError(configurePayload, "Gateway configuration failed."),
        retryable: false,
      });
    }

    return ok({
      providerId: pickProviderId(configurePayload, pickProviderId(validationPayload, "gateway")),
      providerName: pickProviderName(configurePayload, pickProviderName(validationPayload, "Reins Gateway")),
      mode: "gateway",
      models: pickModels(configurePayload).length > 0 ? pickModels(configurePayload) : pickModels(validationPayload),
      configuredAt: pickConfiguredAt(configurePayload),
    });
  }

  public async testConnection(): Promise<Result<ConnectionTest, ConnectError>> {
    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const result = await this.transport.get<unknown>("/api/providers/test");
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    const payload = normalizePayload(result.value);
    const connected = payload.connected ?? payload.valid ?? false;

    return ok({
      connected,
      latency: pickLatency(payload),
      provider: pickProviderName(payload, "unknown"),
      model: payload.model,
    });
  }

  public async disconnect(providerId: string): Promise<Result<void, ConnectError>> {
    const normalizedProviderId = providerId.trim();
    if (normalizedProviderId.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Provider ID is required.",
        retryable: false,
      });
    }

    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const byPath = await this.transport.delete(`/api/providers/${encodeURIComponent(normalizedProviderId)}`);
    if (byPath.ok) {
      return ok(undefined);
    }

    if (byPath.error.code !== "DAEMON_NOT_FOUND") {
      return err(mapDaemonError(byPath.error));
    }

    const fallback = await this.transport.post<{ providerId: string }, unknown>("/api/providers/disconnect", {
      providerId: normalizedProviderId,
    });

    if (!fallback.ok) {
      return err(mapDaemonError(fallback.error));
    }

    return ok(undefined);
  }

  public async listUserConfigurableProviders(): Promise<Result<ProviderListEntry[], ConnectError>> {
    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const result = await this.transport.get<unknown>("/api/providers/auth/list");
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    const payload = result.value;
    let rawProviders: unknown[];

    if (Array.isArray(payload)) {
      rawProviders = payload;
    } else if (isRecord(payload) && Array.isArray((payload as DaemonProviderListPayload).providers)) {
      rawProviders = (payload as DaemonProviderListPayload).providers as unknown[];
    } else {
      return ok([]);
    }

    const entries = rawProviders
      .map(parseProviderListEntry)
      .filter((entry): entry is ProviderListEntry => entry !== null);

    return ok(entries);
  }

  public async getProviderAuthStatus(providerId: string): Promise<Result<ProviderListEntry, ConnectError>> {
    const normalizedProviderId = providerId.trim();
    if (normalizedProviderId.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Provider ID is required.",
        retryable: false,
      });
    }

    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const result = await this.transport.get<unknown>(
      `/api/providers/auth/status/${encodeURIComponent(normalizedProviderId)}`,
    );
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    const entry = parseProviderListEntry(result.value);
    if (!entry) {
      return err({
        code: "DAEMON_ERROR",
        message: `Invalid auth status response for provider ${normalizedProviderId}.`,
        retryable: false,
      });
    }

    return ok(entry);
  }

  public async initiateOAuth(providerId: string): Promise<Result<OAuthInitiation, ConnectError>> {
    const normalizedProvider = providerId.trim();
    if (normalizedProvider.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Provider ID is required.",
        retryable: false,
      });
    }

    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const result = await this.transport.post<
      { provider: string; source: string },
      unknown
    >("/api/providers/auth/oauth/initiate", {
      provider: normalizedProvider,
      source: "tui",
    });

    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    const payload = result.value as DaemonOAuthInitPayload;
    const authUrl = payload.authUrl ?? payload.url;
    if (!authUrl || typeof authUrl !== "string") {
      return err({
        code: "OAUTH_FAILED",
        message: "Daemon did not return an OAuth authorization URL.",
        retryable: false,
      });
    }

    return ok({
      authUrl,
      provider: payload.provider ?? normalizedProvider,
      expiresAt: payload.expiresAt,
    });
  }

  public async pollOAuthCompletion(
    providerId: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<Result<ProviderConnection, ConnectError>> {
    const normalizedProvider = providerId.trim();
    if (normalizedProvider.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Provider ID is required.",
        retryable: false,
      });
    }

    const timeoutMs = options?.timeoutMs ?? 120_000;
    const pollIntervalMs = options?.pollIntervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.transport.get<unknown>(
        `/api/providers/auth/oauth/status/${encodeURIComponent(normalizedProvider)}`,
      );

      if (result.ok) {
        const payload = result.value as DaemonOAuthStatusPayload;

        if (payload.success === true || payload.complete === true) {
          return ok({
            providerId: payload.providerId ?? payload.provider ?? normalizedProvider,
            providerName: payload.providerName ?? payload.provider ?? normalizedProvider,
            mode: "byok",
            models: readStringArray(payload.models),
            configuredAt: payload.configuredAt ?? new Date().toISOString(),
          });
        }

        if (payload.status === "error" || payload.error) {
          return err({
            code: "OAUTH_FAILED",
            message: payload.error ?? "OAuth authorization failed.",
            retryable: true,
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return err({
      code: "OAUTH_TIMEOUT",
      message: "OAuth login timed out. Please try again.",
      retryable: true,
    });
  }

  public async configureBYOK(
    providerId: string,
    apiKey: string,
  ): Promise<Result<ProviderConnection, ConnectError>> {
    const normalizedProvider = providerId.trim();
    const normalizedApiKey = apiKey.trim();

    if (normalizedProvider.length === 0 || normalizedApiKey.length === 0) {
      return err({
        code: "INVALID_INPUT",
        message: "Provider and API key are required.",
        retryable: false,
      });
    }

    const readiness = await this.ensureDaemonReady();
    if (!readiness.ok) {
      return readiness;
    }

    const configureResult = await this.transport.post<
      { provider: string; mode: "api_key"; key: string; source: string },
      unknown
    >("/api/providers/auth/configure", {
      provider: normalizedProvider,
      mode: "api_key",
      key: normalizedApiKey,
      source: "tui",
    });

    if (!configureResult.ok) {
      return err(mapDaemonError(configureResult.error));
    }

    const configurePayload = normalizePayload(configureResult.value);
    if (configurePayload.configured === false || configurePayload.valid === false) {
      return err({
        code: "VALIDATION_FAILED",
        message: pickValidationError(configurePayload, "API key validation failed."),
        retryable: false,
      });
    }

    return ok({
      providerId: pickProviderId(configurePayload, normalizedProvider),
      providerName: pickProviderName(configurePayload, normalizedProvider),
      mode: "byok",
      models: pickModels(configurePayload),
      configuredAt: pickConfiguredAt(configurePayload),
    });
  }

  private async ensureDaemonReady(): Promise<Result<void, ConnectError>> {
    if (!this.daemonClient) {
      return ok(undefined);
    }

    const health = await this.daemonClient.healthCheck();
    if (!health.ok) {
      return err(mapDaemonError(health.error));
    }

    if (!health.value.healthy) {
      return err({
        code: "DAEMON_OFFLINE",
        message: "Daemon is running but not healthy.",
        retryable: true,
      });
    }

    return ok(undefined);
  }
}

export function isProviderMode(value: unknown): value is ProviderMode {
  return readProviderMode(value) !== null;
}

export { connectionStateToDisplayStatus };
