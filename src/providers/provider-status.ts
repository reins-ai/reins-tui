import type { DaemonClient, DaemonClientConfig } from "../daemon/client";
import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../daemon/client";
import { err, ok, type DaemonClientError, type Result } from "../daemon/contracts";
import {
  connectionStateToDisplayStatus,
  HttpProviderApiTransport,
  type ProviderApiTransport,
  type ProviderConnectionState,
  type ProviderMode,
} from "./connect-service";

export interface ModelInfo {
  id: string;
  name: string;
  provider?: string;
  active?: boolean;
}

export interface ProviderStatusInfo {
  configured: boolean;
  mode: ProviderMode | null;
  provider: string | null;
  status: "active" | "configured" | "error" | "offline";
  connectionState: ProviderConnectionState;
  connectionDisplayStatus: string;
  models: string[];
  activeModel: string | null;
  error?: string;
}

export type StatusErrorCode = "DAEMON_OFFLINE" | "DAEMON_ERROR" | "INVALID_RESPONSE";

export interface StatusError {
  code: StatusErrorCode;
  message: string;
  retryable: boolean;
}

export interface ProviderStatusServiceOptions {
  daemonClient?: DaemonClient;
  transport?: ProviderApiTransport;
  daemonBaseUrl?: string;
  requestTimeoutMs?: number;
}

interface StatusPayload {
  configured?: boolean;
  mode?: string;
  provider?: string;
  status?: string;
  connectionState?: string;
  models?: unknown;
  availableModels?: unknown;
  activeModel?: string | null | { id?: string; name?: string; provider?: string; active?: boolean };
  error?: string;
}

interface ModelsPayload {
  models?: unknown;
  availableModels?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOfflineError(error: DaemonClientError): boolean {
  return error.code === "DAEMON_UNAVAILABLE" || error.code === "DAEMON_DISCONNECTED" || error.code === "DAEMON_TIMEOUT";
}

function mapDaemonError(error: DaemonClientError): StatusError {
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

function pickMode(value: unknown): ProviderMode | null {
  if (value === "byok" || value === "gateway") {
    return value;
  }

  return null;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function pickStatus(value: unknown): ProviderStatusInfo["status"] | null {
  if (value === "active" || value === "configured" || value === "error" || value === "offline") {
    return value;
  }

  return null;
}

function toOfflineStatus(message: string): ProviderStatusInfo {
  return {
    configured: false,
    mode: null,
    provider: null,
    status: "offline",
    connectionState: "requires_auth",
    connectionDisplayStatus: connectionStateToDisplayStatus("requires_auth"),
    models: [],
    activeModel: null,
    error: message,
  };
}

function pickBaseUrlFromConfig(config: DaemonClientConfig | null): string {
  if (!config?.httpBaseUrl || config.httpBaseUrl.trim().length === 0) {
    return DEFAULT_DAEMON_HTTP_BASE_URL;
  }

  return config.httpBaseUrl;
}

function parseModelInfo(value: unknown, fallbackIndex: number): ModelInfo | null {
  if (typeof value === "string") {
    return {
      id: value,
      name: value,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : `model-${fallbackIndex}`;
  const name = typeof value.name === "string" ? value.name : id;
  const provider = typeof value.provider === "string" ? value.provider : undefined;
  const active = typeof value.active === "boolean" ? value.active : undefined;

  return { id, name, provider, active };
}

function parseModelList(payload: unknown): ModelInfo[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item, index) => parseModelInfo(item, index))
      .filter((item): item is ModelInfo => item !== null);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const modelsArray = Array.isArray(payload.models)
    ? payload.models
    : Array.isArray(payload.availableModels)
      ? payload.availableModels
      : [];

  return modelsArray
    .map((item, index) => parseModelInfo(item, index))
    .filter((item): item is ModelInfo => item !== null);
}

function pickConnectionState(value: unknown): ProviderConnectionState {
  if (value === "ready" || value === "requires_auth" || value === "requires_reauth" || value === "invalid") {
    return value;
  }

  return "requires_auth";
}

function deriveConnectionState(
  configured: boolean,
  status: ProviderStatusInfo["status"],
  rawConnectionState: unknown,
): ProviderConnectionState {
  if (rawConnectionState !== undefined) {
    return pickConnectionState(rawConnectionState);
  }

  if (status === "active") {
    return "ready";
  }

  if (status === "error") {
    return "invalid";
  }

  if (configured) {
    return "ready";
  }

  return "requires_auth";
}

function parseStatusPayload(value: unknown): ProviderStatusInfo {
  if (!isRecord(value)) {
    return {
      configured: false,
      mode: null,
      provider: null,
      status: "error",
      connectionState: "requires_auth",
      connectionDisplayStatus: connectionStateToDisplayStatus("requires_auth"),
      models: [],
      activeModel: null,
      error: "Invalid provider status response.",
    };
  }

  const payload = value as StatusPayload;
  const models = pickStringArray(payload.models).length > 0 ? pickStringArray(payload.models) : pickStringArray(payload.availableModels);
  const activeModel =
    typeof payload.activeModel === "string"
      ? payload.activeModel
      : isRecord(payload.activeModel) && typeof payload.activeModel.name === "string"
        ? payload.activeModel.name
        : null;
  const configured = payload.configured === true;

  const derivedStatus = payload.error
    ? "error"
    : activeModel
      ? "active"
      : configured
        ? "configured"
        : "configured";

  const status = pickStatus(payload.status) ?? derivedStatus;
  const connectionState = deriveConnectionState(configured, status, payload.connectionState);

  return {
    configured,
    mode: pickMode(payload.mode),
    provider: typeof payload.provider === "string" ? payload.provider : null,
    status,
    connectionState,
    connectionDisplayStatus: connectionStateToDisplayStatus(connectionState),
    models,
    activeModel,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * Lightweight shape for feeding provider health and model data
 * into the status segment system. Maps from ProviderStatusInfo
 * without requiring daemon contract changes.
 */
export interface ProviderStatusFeed {
  healthy: boolean;
  activeModel: string | null;
  provider: string | null;
  modelCount: number;
}

/**
 * Extract a ProviderStatusFeed from a ProviderStatusInfo.
 * This adapter keeps the status segment system decoupled from
 * the full provider status response shape.
 */
export function toProviderStatusFeed(info: ProviderStatusInfo): ProviderStatusFeed {
  return {
    healthy: info.status === "active" || info.status === "configured",
    activeModel: info.activeModel,
    provider: info.provider,
    modelCount: info.models.length,
  };
}

export class ProviderStatusService {
  private readonly daemonClient: DaemonClient | undefined;
  private readonly transport: ProviderApiTransport;

  constructor(options: ProviderStatusServiceOptions = {}) {
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

  public async getStatus(): Promise<Result<ProviderStatusInfo, StatusError>> {
    const health = await this.ensureDaemonHealth();
    if (!health.ok) {
      if (health.error.code === "DAEMON_OFFLINE") {
        return ok(toOfflineStatus(health.error.message));
      }

      return health;
    }

    const result = await this.transport.get<unknown>("/api/providers/status");
    if (!result.ok) {
      if (isOfflineError(result.error)) {
        return ok(toOfflineStatus(result.error.message));
      }

      return err(mapDaemonError(result.error));
    }

    return ok(parseStatusPayload(result.value));
  }

  public async getAvailableModels(): Promise<Result<ModelInfo[], StatusError>> {
    const result = await this.transport.get<ModelsPayload | unknown[]>("/api/providers/models");
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    return ok(parseModelList(result.value));
  }

  public async getActiveModel(): Promise<Result<ModelInfo | null, StatusError>> {
    const result = await this.transport.get<unknown>("/api/providers/active-model");
    if (!result.ok) {
      return err(mapDaemonError(result.error));
    }

    if (result.value === null || typeof result.value === "undefined") {
      return ok(null);
    }

    if (isRecord(result.value) && "activeModel" in result.value) {
      const activeCandidate = (result.value as { activeModel?: unknown }).activeModel;
      if (activeCandidate === null || typeof activeCandidate === "undefined") {
        return ok(null);
      }

      const parsedNested = parseModelInfo(activeCandidate, 0);
      if (!parsedNested) {
        return err({
          code: "INVALID_RESPONSE",
          message: "Daemon returned an invalid active model payload.",
          retryable: false,
        });
      }

      return ok(parsedNested);
    }

    const parsed = parseModelInfo(result.value, 0);
    if (!parsed) {
      return err({
        code: "INVALID_RESPONSE",
        message: "Daemon returned an invalid active model payload.",
        retryable: false,
      });
    }

    return ok(parsed);
  }

  private async ensureDaemonHealth(): Promise<Result<void, StatusError>> {
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
