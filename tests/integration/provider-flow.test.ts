import { describe, expect, test } from "bun:test";

import {
  connectReducer,
  formatAuthMethodBadges,
  getActiveProviders,
  mapDaemonProviderToOption,
  statusColor,
  statusGlyph,
  type ConnectStep,
} from "../../src/components/connect-flow";
import { err, ok, type DaemonClientError } from "../../src/daemon/contracts";
import { MockDaemonClient } from "../../src/daemon/mock-daemon";
import {
  ConnectService,
  type ProviderApiTransport,
  type ProviderAuthMethod,
  type ProviderListEntry,
} from "../../src/providers/connect-service";
import { ProviderStatusService } from "../../src/providers/provider-status";
import { createConversationStore } from "../../src/state/conversation-store";

type HandlerResult = ReturnType<typeof ok<unknown>> | ReturnType<typeof err<DaemonClientError>>;

interface ProviderOptionLike {
  id: string;
  label: string;
  authMethods: readonly string[];
  displayStatus?: string;
  connectionState?: string;
}

interface FlowState {
  step: ConnectStep;
  selectedModeIndex: number;
  selectedProviderIndex: number;
  selectedAuthMethodIndex: number;
  mode: "byok" | "gateway" | null;
  provider: ProviderOptionLike | null;
  authMethod: "api_key" | "oauth" | null;
  secretInput: string;
  connection: {
    providerId: string;
    providerName: string;
    mode: "byok" | "gateway";
    models: string[];
    configuredAt: string;
  } | null;
  error: { code: string; message: string; retryable: boolean } | null;
  oauthUrl: string | null;
  liveProviders: readonly ProviderOptionLike[] | null;
}

function daemonError(code: DaemonClientError["code"], message: string, retryable = true): DaemonClientError {
  return {
    code,
    message,
    retryable,
  };
}

function createInitialFlowState(overrides?: Partial<FlowState>): FlowState {
  return {
    step: "mode-select",
    selectedModeIndex: 0,
    selectedProviderIndex: 0,
    selectedAuthMethodIndex: 0,
    mode: null,
    provider: null,
    authMethod: null,
    secretInput: "",
    connection: null,
    error: null,
    oauthUrl: null,
    liveProviders: null,
    ...overrides,
  };
}

class MockProviderTransport implements ProviderApiTransport {
  public readonly calls: Array<{ method: "GET" | "POST" | "DELETE"; path: string; body?: unknown }> = [];

  private readonly getHandlers = new Map<string, () => Promise<HandlerResult> | HandlerResult>();
  private readonly postHandlers = new Map<string, (body: unknown) => Promise<HandlerResult> | HandlerResult>();
  private readonly deleteHandlers = new Map<string, () => Promise<HandlerResult> | HandlerResult>();

  public onGet(path: string, handler: () => Promise<HandlerResult> | HandlerResult): void {
    this.getHandlers.set(path, handler);
  }

  public onPost(path: string, handler: (body: unknown) => Promise<HandlerResult> | HandlerResult): void {
    this.postHandlers.set(path, handler);
  }

  public onDelete(path: string, handler: () => Promise<HandlerResult> | HandlerResult): void {
    this.deleteHandlers.set(path, handler);
  }

  public async get<T>(path: string) {
    this.calls.push({ method: "GET", path });
    const handler = this.getHandlers.get(path);
    if (!handler) {
      return err(daemonError("DAEMON_NOT_FOUND", `No GET handler for ${path}`, false));
    }

    const result = await handler();
    return result as ReturnType<ProviderApiTransport["get"]> extends Promise<infer R> ? R : never;
  }

  public async post<TRequest, TResponse>(path: string, body: TRequest) {
    this.calls.push({ method: "POST", path, body });
    const handler = this.postHandlers.get(path);
    if (!handler) {
      return err(daemonError("DAEMON_NOT_FOUND", `No POST handler for ${path}`, false));
    }

    const result = await handler(body);
    return result as ReturnType<ProviderApiTransport["post"]> extends Promise<infer R> ? R : never;
  }

  public async delete(path: string) {
    this.calls.push({ method: "DELETE", path });
    const handler = this.deleteHandlers.get(path);
    if (!handler) {
      return err(daemonError("DAEMON_NOT_FOUND", `No DELETE handler for ${path}`, false));
    }

    const result = await handler();
    return result as ReturnType<ProviderApiTransport["delete"]> extends Promise<infer R> ? R : never;
  }
}

function createNow(seed = "2026-02-11T00:00:00.000Z", stepMs = 30): () => Date {
  const start = new Date(seed).getTime();
  let tick = 0;
  return () => {
    const value = new Date(start + tick * stepMs);
    tick += 1;
    return value;
  };
}

describe("provider flow integration", () => {
  test("completes Anthropic BYOK flow via configureBYOK and supports immediate message usage", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/providers/auth/configure", () =>
      ok({
        configured: true,
        valid: true,
        providerId: "anthropic",
        providerName: "Anthropic",
        models: ["claude-sonnet-4-20250514"],
        configuredAt: "2026-02-11T00:00:00.000Z",
      }),
    );

    const daemon = new MockDaemonClient({ now: createNow() });
    await daemon.connect();

    const connectService = new ConnectService({ daemonClient: daemon, transport });

    let state = createInitialFlowState();

    // Select BYOK mode — triggers provider loading
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");

    // Simulate daemon returning providers (fallback to static)
    state = connectReducer(state, { type: "PROVIDERS_LOAD_FAILED" }) as FlowState;
    expect(state.step).toBe("provider-select");

    // Select Anthropic (index 0) — goes to auth method select
    state = connectReducer(state, { type: "SELECT_PROVIDER" }) as FlowState;
    expect(state.step).toBe("auth-method-select");

    // Select API Key (index 0)
    state = connectReducer(state, { type: "SELECT_AUTH_METHOD" }) as FlowState;
    expect(state.step).toBe("api-key-entry");

    // Enter key and submit
    state = connectReducer(state, { type: "SET_SECRET", value: "sk-ant-test-123" }) as FlowState;
    state = connectReducer(state, { type: "SUBMIT_SECRET" }) as FlowState;
    expect(state.step).toBe("validating");

    const connectResult = await connectService.configureBYOK("anthropic", "sk-ant-test-123");
    expect(connectResult.ok).toBe(true);
    if (!connectResult.ok) return;

    state = connectReducer(state, {
      type: "VALIDATION_SUCCESS",
      connection: connectResult.value,
    }) as FlowState;
    expect(state.step).toBe("success");
    expect(state.connection?.providerName).toBe("Anthropic");

    // Verify immediate conversation usage
    const store = createConversationStore({ daemonClient: daemon, now: createNow(), completeDisplayMs: 5 });
    const send = await store.sendUserMessage({
      content: "Use the newly configured Anthropic provider",
      model: connectResult.value.models[0],
    });
    expect(send.ok).toBe(true);

    const conversationId = store.getState().conversationId;
    expect(conversationId).toBeString();
    if (!conversationId) return;

    const conversation = await daemon.getConversation(conversationId);
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) return;

    expect(conversation.value.model).toBe("claude-sonnet-4-20250514");
    expect(conversation.value.messages[0]?.content).toBe("Use the newly configured Anthropic provider");
  });

  test("completes Anthropic OAuth flow from start to finish", async () => {
    const transport = new MockProviderTransport();
    let oauthComplete = false;

    transport.onPost("/api/providers/auth/oauth/initiate", () =>
      ok({
        authUrl: "https://console.anthropic.com/oauth/authorize?client_id=test&state=abc",
        provider: "anthropic",
        expiresAt: Date.now() + 120_000,
      }),
    );

    transport.onGet("/api/providers/auth/oauth/status/anthropic", () => {
      if (oauthComplete) {
        return ok({
          success: true,
          provider: "anthropic",
          providerId: "anthropic",
          providerName: "Anthropic",
          models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"],
          configuredAt: "2026-02-11T00:00:00.000Z",
        });
      }
      return ok({ status: "pending", provider: "anthropic" });
    });

    const connectService = new ConnectService({ transport });

    // Initiate OAuth
    const initResult = await connectService.initiateOAuth("anthropic");
    expect(initResult.ok).toBe(true);
    if (!initResult.ok) return;

    expect(initResult.value.authUrl).toContain("console.anthropic.com");
    expect(initResult.value.provider).toBe("anthropic");

    // Simulate browser completing OAuth
    oauthComplete = true;

    // Poll for completion
    const pollResult = await connectService.pollOAuthCompletion("anthropic", {
      timeoutMs: 5_000,
      pollIntervalMs: 50,
    });
    expect(pollResult.ok).toBe(true);
    if (!pollResult.ok) return;

    expect(pollResult.value.providerId).toBe("anthropic");
    expect(pollResult.value.providerName).toBe("Anthropic");
    expect(pollResult.value.models).toContain("claude-sonnet-4-20250514");

    // Verify reducer flow matches
    let state = createInitialFlowState();
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");
    state = connectReducer(state, { type: "PROVIDERS_LOAD_FAILED" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_PROVIDER" }) as FlowState;
    state = connectReducer(state, { type: "NAVIGATE_DOWN" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_AUTH_METHOD" }) as FlowState;
    expect(state.step).toBe("oauth-launching");

    state = connectReducer(state, { type: "OAUTH_LAUNCHING", url: initResult.value.authUrl }) as FlowState;
    state = connectReducer(state, { type: "OAUTH_WAITING" }) as FlowState;
    expect(state.step).toBe("oauth-waiting");

    state = connectReducer(state, { type: "OAUTH_COMPLETE", connection: pollResult.value }) as FlowState;
    expect(state.step).toBe("success");
    expect(state.connection?.providerName).toBe("Anthropic");
  });

  test("surfaces daemon re-auth guidance when Anthropic credentials expire", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/status/anthropic", () =>
      ok({
        provider: "anthropic",
        providerName: "Anthropic",
        requiresAuth: true,
        authModes: ["api_key", "oauth"],
        configured: true,
        connectionState: "requires_reauth",
      }),
    );

    const connectService = new ConnectService({ transport });
    const result = await connectService.getProviderAuthStatus("anthropic");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.providerId).toBe("anthropic");
    expect(result.value.connectionState).toBe("requires_reauth");
    expect(result.value.displayStatus).toBe("Reconnect required");
    expect(result.value.authMethods).toEqual(["api_key", "oauth"]);
  });

  test("completes gateway flow end-to-end", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/gateway/validate", () => ok({ valid: true, providerName: "Reins Gateway", models: ["gateway-model"] }));
    transport.onPost("/api/gateway/configure", () =>
      ok({
        configured: true,
        providerId: "gateway",
        providerName: "Reins Gateway",
        models: ["gateway-model"],
      }),
    );

    const connectService = new ConnectService({ transport });

    let state = createInitialFlowState();
    state = connectReducer(state, { type: "NAVIGATE_DOWN" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("gateway-token-entry");

    state = connectReducer(state, { type: "SET_SECRET", value: "gw-token" }) as FlowState;
    state = connectReducer(state, { type: "SUBMIT_SECRET" }) as FlowState;
    expect(state.step).toBe("validating");

    const gateway = await connectService.connectGateway("gw-token");
    expect(gateway.ok).toBe(true);
    if (!gateway.ok) return;

    state = connectReducer(state, {
      type: "VALIDATION_SUCCESS",
      connection: gateway.value,
    }) as FlowState;
    expect(state.step).toBe("success");
    expect(state.connection?.providerId).toBe("gateway");
  });

  test("surfaces invalid Anthropic BYOK key error and allows retry", async () => {
    let configureAttempts = 0;
    const transport = new MockProviderTransport();

    transport.onPost("/api/providers/auth/configure", () => {
      configureAttempts += 1;
      if (configureAttempts === 1) {
        return ok({ configured: false, valid: false, error: "Invalid API key" });
      }

      return ok({
        configured: true,
        valid: true,
        providerId: "anthropic",
        providerName: "Anthropic",
        models: ["claude-sonnet-4-20250514"],
      });
    });

    const connectService = new ConnectService({ transport });

    const first = await connectService.configureBYOK("anthropic", "bad-key");
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.code).toBe("VALIDATION_FAILED");

    const retry = await connectService.configureBYOK("anthropic", "good-key");
    expect(retry.ok).toBe(true);
    expect(configureAttempts).toBe(2);
  });

  test("handles OAuth initiation failure gracefully", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/providers/auth/oauth/initiate", () =>
      err(daemonError("DAEMON_INTERNAL_ERROR", "OAuth service unavailable", true)),
    );

    const connectService = new ConnectService({ transport });
    const result = await connectService.initiateOAuth("anthropic");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.retryable).toBe(true);
  });

  test("handles OAuth timeout during polling", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/oauth/status/anthropic", () =>
      ok({ status: "pending", provider: "anthropic" }),
    );

    const connectService = new ConnectService({ transport });
    const result = await connectService.pollOAuthCompletion("anthropic", {
      timeoutMs: 200,
      pollIntervalMs: 50,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OAUTH_TIMEOUT");
    expect(result.error.retryable).toBe(true);
  });

  test("handles OAuth error response during polling", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/oauth/status/anthropic", () =>
      ok({ status: "error", provider: "anthropic", error: "User denied access" }),
    );

    const connectService = new ConnectService({ transport });
    const result = await connectService.pollOAuthCompletion("anthropic", {
      timeoutMs: 5_000,
      pollIntervalMs: 50,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OAUTH_FAILED");
    expect(result.error.message).toBe("User denied access");
  });

  test("handles daemon offline during provider validation", async () => {
    const daemon = new MockDaemonClient({ daemonAvailable: false, now: createNow() });
    const transport = new MockProviderTransport();
    transport.onPost("/api/providers/auth/configure", () => ok({ configured: true, valid: true }));

    const connectService = new ConnectService({ daemonClient: daemon, transport });
    const result = await connectService.configureBYOK("anthropic", "sk-offline");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("DAEMON_OFFLINE");
    expect(result.error.retryable).toBe(true);
  });

  test("provider status reflects configuration changes after successful connect", async () => {
    const transport = new MockProviderTransport();
    let configured = false;

    transport.onGet("/api/providers/status", () =>
      ok({
        configured,
        mode: configured ? "byok" : null,
        provider: configured ? "anthropic" : null,
        status: configured ? "active" : "configured",
        models: configured ? ["claude-sonnet-4-20250514"] : [],
        activeModel: configured ? "claude-sonnet-4-20250514" : null,
      }),
    );

    transport.onPost("/api/providers/auth/configure", () => {
      configured = true;
      return ok({
        configured: true,
        valid: true,
        providerId: "anthropic",
        providerName: "Anthropic",
        models: ["claude-sonnet-4-20250514"],
      });
    });

    const connectService = new ConnectService({ transport });
    const statusService = new ProviderStatusService({ transport });

    const before = await statusService.getStatus();
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.value.configured).toBe(false);
    expect(before.value.activeModel).toBeNull();

    const connect = await connectService.configureBYOK("anthropic", "sk-live");
    expect(connect.ok).toBe(true);

    const after = await statusService.getStatus();
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    expect(after.value.configured).toBe(true);
    expect(after.value.status).toBe("active");
    expect(after.value.activeModel).toBe("claude-sonnet-4-20250514");
  });

  test("cancel/back navigation through Anthropic BYOK flow", () => {
    let state = createInitialFlowState();

    // Navigate to auth method select
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");
    state = connectReducer(state, { type: "PROVIDERS_LOAD_FAILED" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_PROVIDER" }) as FlowState;
    expect(state.step).toBe("auth-method-select");

    // Select API key
    state = connectReducer(state, { type: "SELECT_AUTH_METHOD" }) as FlowState;
    expect(state.step).toBe("api-key-entry");

    // Go back to auth method select
    state = connectReducer(state, { type: "GO_BACK" }) as FlowState;
    expect(state.step).toBe("auth-method-select");

    // Go back to provider select
    state = connectReducer(state, { type: "GO_BACK" }) as FlowState;
    expect(state.step).toBe("provider-select");

    // Go back to mode select
    state = connectReducer(state, { type: "GO_BACK" }) as FlowState;
    expect(state.step).toBe("mode-select");
  });

  test("cancel/back navigation through OAuth flow", () => {
    let state = createInitialFlowState();

    // Navigate to OAuth launching
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");
    state = connectReducer(state, { type: "PROVIDERS_LOAD_FAILED" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_PROVIDER" }) as FlowState;
    state = connectReducer(state, { type: "NAVIGATE_DOWN" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_AUTH_METHOD" }) as FlowState;
    expect(state.step).toBe("oauth-launching");

    // Go back from OAuth launching
    state = connectReducer(state, { type: "GO_BACK" }) as FlowState;
    expect(state.step).toBe("auth-method-select");
    expect(state.authMethod).toBeNull();

    // Go back to provider select
    state = connectReducer(state, { type: "GO_BACK" }) as FlowState;
    expect(state.step).toBe("provider-select");
  });

  test("OAuth initiation with empty provider ID returns input error", async () => {
    const transport = new MockProviderTransport();
    const connectService = new ConnectService({ transport });

    const result = await connectService.initiateOAuth("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  test("OAuth polling with empty provider ID returns input error", async () => {
    const transport = new MockProviderTransport();
    const connectService = new ConnectService({ transport });

    const result = await connectService.pollOAuthCompletion("  ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  // ---------------------------------------------------------------------------
  // Live provider status display tests (MH5)
  // ---------------------------------------------------------------------------

  test("loads provider list from daemon auth/list endpoint and displays live status", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/list", () =>
      ok({
        providers: [
          {
            provider: "anthropic",
            providerName: "Anthropic",
            connectionState: "ready",
            authModes: ["api_key", "oauth"],
            configured: true,
            requiresAuth: false,
          },
          {
            provider: "openai",
            providerName: "OpenAI",
            connectionState: "requires_auth",
            authModes: ["api_key"],
            configured: false,
            requiresAuth: true,
          },
        ],
      }),
    );

    const connectService = new ConnectService({ transport });
    const listResult = await connectService.listUserConfigurableProviders();

    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;

    expect(listResult.value.length).toBe(2);

    // Map to ProviderOptions for the UI
    const mapped = listResult.value.map(mapDaemonProviderToOption);

    expect(mapped[0].id).toBe("anthropic");
    expect(mapped[0].displayStatus).toBe("Connected");
    expect(mapped[0].connectionState).toBe("ready");
    expect(mapped[0].authMethods).toEqual(["api_key", "oauth"]);

    expect(mapped[1].id).toBe("openai");
    expect(mapped[1].displayStatus).toBe("Not configured");
    expect(mapped[1].connectionState).toBe("requires_auth");
    expect(mapped[1].authMethods).toEqual(["api_key"]);

    // Verify reducer uses live providers when loaded
    let state = createInitialFlowState();
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");

    state = connectReducer(state, { type: "PROVIDERS_LOADED", providers: mapped }) as FlowState;
    expect(state.step).toBe("provider-select");
    expect(state.liveProviders).toHaveLength(2);

    // getActiveProviders returns live list
    const active = getActiveProviders(state);
    expect(active).toHaveLength(2);
    expect(active[0].displayStatus).toBe("Connected");
    expect(active[1].displayStatus).toBe("Not configured");
  });

  test("provider select shows re-auth-required status from daemon", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/list", () =>
      ok({
        providers: [
          {
            provider: "anthropic",
            providerName: "Anthropic",
            connectionState: "requires_reauth",
            authModes: ["api_key", "oauth"],
            configured: true,
            requiresAuth: true,
          },
        ],
      }),
    );

    const connectService = new ConnectService({ transport });
    const listResult = await connectService.listUserConfigurableProviders();
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;

    const mapped = listResult.value.map(mapDaemonProviderToOption);
    expect(mapped[0].displayStatus).toBe("Reconnect required");
    expect(mapped[0].connectionState).toBe("requires_reauth");

    // Verify status glyph and color helpers
    expect(statusGlyph("requires_reauth")).toBe("◎");
    expect(statusGlyph("ready")).toBe("●");
    expect(statusGlyph("invalid")).toBe("✗");
    expect(statusGlyph(undefined)).toBe("○");
  });

  test("formatAuthMethodBadges renders BYOK and OAuth labels", () => {
    expect(formatAuthMethodBadges(["api_key", "oauth"])).toBe("BYOK · OAuth");
    expect(formatAuthMethodBadges(["api_key"])).toBe("BYOK");
    expect(formatAuthMethodBadges(["oauth"])).toBe("OAuth");
    expect(formatAuthMethodBadges([])).toBe("");
  });

  test("statusColor returns correct theme token colors", () => {
    const tokens: Record<string, string> = {
      "status.success": "#50c878",
      "status.warning": "#f0c674",
      "status.error": "#e85050",
      "text.muted": "#6b6360",
    };

    expect(statusColor("ready", tokens)).toBe("#50c878");
    expect(statusColor("requires_reauth", tokens)).toBe("#f0c674");
    expect(statusColor("invalid", tokens)).toBe("#e85050");
    expect(statusColor(undefined, tokens)).toBe("#6b6360");
    expect(statusColor("requires_auth", tokens)).toBe("#6b6360");
  });

  test("falls back to static provider catalog when daemon list fails", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/list", () =>
      err(daemonError("DAEMON_UNAVAILABLE", "Daemon offline", true)),
    );

    const connectService = new ConnectService({ transport });
    const listResult = await connectService.listUserConfigurableProviders();
    expect(listResult.ok).toBe(false);

    // Reducer falls back to static BYOK_PROVIDERS on load failure
    let state = createInitialFlowState();
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");

    state = connectReducer(state, { type: "PROVIDERS_LOAD_FAILED" }) as FlowState;
    expect(state.step).toBe("provider-select");
    expect(state.liveProviders).toBeNull();

    // getActiveProviders returns static fallback
    const active = getActiveProviders(state);
    expect(active.length).toBeGreaterThan(0);
    expect(active[0].id).toBe("anthropic");
    expect(active[0].displayStatus).toBeUndefined();
  });

  test("BYOK flow works with live providers from daemon", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/auth/list", () =>
      ok({
        providers: [
          {
            provider: "anthropic",
            providerName: "Anthropic",
            connectionState: "requires_auth",
            authModes: ["api_key", "oauth"],
            configured: false,
            requiresAuth: true,
          },
        ],
      }),
    );
    transport.onPost("/api/providers/auth/configure", () =>
      ok({
        configured: true,
        valid: true,
        providerId: "anthropic",
        providerName: "Anthropic",
        models: ["claude-sonnet-4-20250514"],
        configuredAt: "2026-02-11T00:00:00.000Z",
      }),
    );

    const connectService = new ConnectService({ transport });

    // Load providers from daemon
    const listResult = await connectService.listUserConfigurableProviders();
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;

    const mapped = listResult.value.map(mapDaemonProviderToOption);

    let state = createInitialFlowState();
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");

    state = connectReducer(state, { type: "PROVIDERS_LOADED", providers: mapped }) as FlowState;
    expect(state.step).toBe("provider-select");

    // Select Anthropic (only provider from daemon)
    state = connectReducer(state, { type: "SELECT_PROVIDER" }) as FlowState;
    expect(state.step).toBe("auth-method-select");
    expect(state.provider?.id).toBe("anthropic");
    expect(state.provider?.authMethods).toEqual(["api_key", "oauth"]);

    // Select API key
    state = connectReducer(state, { type: "SELECT_AUTH_METHOD" }) as FlowState;
    expect(state.step).toBe("api-key-entry");

    // Enter key and submit
    state = connectReducer(state, { type: "SET_SECRET", value: "sk-ant-test-123" }) as FlowState;
    state = connectReducer(state, { type: "SUBMIT_SECRET" }) as FlowState;
    expect(state.step).toBe("validating");

    const connectResult = await connectService.configureBYOK("anthropic", "sk-ant-test-123");
    expect(connectResult.ok).toBe(true);
    if (!connectResult.ok) return;

    state = connectReducer(state, {
      type: "VALIDATION_SUCCESS",
      connection: connectResult.value,
    }) as FlowState;
    expect(state.step).toBe("success");
    expect(state.connection?.providerName).toBe("Anthropic");
  });

  test("back from providers-loading returns to mode-select", () => {
    let state = createInitialFlowState();
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    expect(state.step).toBe("providers-loading");

    state = connectReducer(state, { type: "GO_BACK" }) as FlowState;
    expect(state.step).toBe("mode-select");
    expect(state.mode).toBeNull();
  });

  test("skips providers-loading when providers already cached", () => {
    const cachedProviders = [
      { id: "anthropic", label: "Anthropic", authMethods: ["api_key", "oauth"] as ProviderAuthMethod[], displayStatus: "Connected", connectionState: "ready" },
    ];

    let state = createInitialFlowState({ liveProviders: cachedProviders });
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;

    // Should skip loading and go directly to provider-select
    expect(state.step).toBe("provider-select");
    expect(state.liveProviders).toHaveLength(1);
  });

  test("mapDaemonProviderToOption defaults authMethods to api_key when empty", () => {
    const entry: ProviderListEntry = {
      providerId: "custom",
      providerName: "Custom Provider",
      connectionState: "requires_auth",
      displayStatus: "Not configured",
      authMethods: [],
      configured: false,
      requiresAuth: true,
    };

    const option = mapDaemonProviderToOption(entry);
    expect(option.authMethods).toEqual(["api_key"]);
    expect(option.displayStatus).toBe("Not configured");
  });
});
