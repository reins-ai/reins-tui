import { describe, expect, test } from "bun:test";

import { connectReducer, type ConnectStep } from "../../src/components/connect-flow";
import { err, ok, type DaemonClientError } from "../../src/daemon/contracts";
import { MockDaemonClient } from "../../src/daemon/mock-daemon";
import { ConnectService, type ProviderApiTransport } from "../../src/providers/connect-service";
import { ProviderStatusService } from "../../src/providers/provider-status";
import { createConversationStore } from "../../src/state/conversation-store";

type HandlerResult = ReturnType<typeof ok<unknown>> | ReturnType<typeof err<DaemonClientError>>;

interface FlowState {
  step: ConnectStep;
  selectedModeIndex: number;
  selectedProviderIndex: number;
  mode: "byok" | "gateway" | null;
  provider: { id: string; label: string } | null;
  secretInput: string;
  connection: {
    providerId: string;
    providerName: string;
    mode: "byok" | "gateway";
    models: string[];
    configuredAt: string;
  } | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

function daemonError(code: DaemonClientError["code"], message: string, retryable = true): DaemonClientError {
  return {
    code,
    message,
    retryable,
  };
}

function createInitialFlowState(): FlowState {
  return {
    step: "mode-select",
    selectedModeIndex: 0,
    selectedProviderIndex: 0,
    mode: null,
    provider: null,
    secretInput: "",
    connection: null,
    error: null,
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
  test("completes BYOK flow and supports immediate message usage", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/providers/validate", () =>
      ok({
        valid: true,
        providerId: "openai",
        providerName: "OpenAI",
        models: ["gpt-4o", "gpt-4o-mini"],
      }),
    );
    transport.onPost("/api/providers/configure", () =>
      ok({
        configured: true,
        providerId: "openai",
        providerName: "OpenAI",
        models: ["gpt-4o"],
        configuredAt: "2026-02-11T00:00:00.000Z",
      }),
    );

    const daemon = new MockDaemonClient({ now: createNow() });
    await daemon.connect();

    const connectService = new ConnectService({ daemonClient: daemon, transport });

    let state = createInitialFlowState();
    state = connectReducer(state, { type: "SELECT_MODE" }) as FlowState;
    state = connectReducer(state, { type: "SELECT_PROVIDER" }) as FlowState;
    state = connectReducer(state, { type: "SET_SECRET", value: "sk-test-123" }) as FlowState;
    state = connectReducer(state, { type: "SUBMIT_SECRET" }) as FlowState;
    expect(state.step).toBe("validating");

    const connectResult = await connectService.connectBYOK("openai", "sk-test-123");
    expect(connectResult.ok).toBe(true);
    if (!connectResult.ok) {
      return;
    }

    state = connectReducer(state, {
      type: "VALIDATION_SUCCESS",
      connection: connectResult.value,
    }) as FlowState;
    expect(state.step).toBe("success");
    expect(state.connection?.providerName).toBe("OpenAI");

    const store = createConversationStore({ daemonClient: daemon, now: createNow(), completeDisplayMs: 5 });
    const send = await store.sendUserMessage({
      content: "Use the newly configured provider",
      model: connectResult.value.models[0],
    });
    expect(send.ok).toBe(true);

    const conversationId = store.getState().conversationId;
    expect(conversationId).toBeString();
    if (!conversationId) {
      return;
    }

    const conversation = await daemon.getConversation(conversationId);
    expect(conversation.ok).toBe(true);
    if (!conversation.ok) {
      return;
    }

    expect(conversation.value.model).toBe("gpt-4o");
    expect(conversation.value.messages[0]?.content).toBe("Use the newly configured provider");
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
    if (!gateway.ok) {
      return;
    }

    state = connectReducer(state, {
      type: "VALIDATION_SUCCESS",
      connection: gateway.value,
    }) as FlowState;
    expect(state.step).toBe("success");
    expect(state.connection?.providerId).toBe("gateway");
  });

  test("surfaces invalid BYOK key error and allows retry", async () => {
    let validateAttempts = 0;
    const transport = new MockProviderTransport();

    transport.onPost("/api/providers/validate", () => {
      validateAttempts += 1;
      if (validateAttempts === 1) {
        return ok({ valid: false, error: "Invalid API key" });
      }

      return ok({ valid: true, providerId: "openai", providerName: "OpenAI", models: ["gpt-4o"] });
    });

    transport.onPost("/api/providers/configure", () =>
      ok({
        configured: true,
        providerId: "openai",
        providerName: "OpenAI",
        models: ["gpt-4o"],
      }),
    );

    const connectService = new ConnectService({ transport });

    const first = await connectService.connectBYOK("openai", "bad-key");
    expect(first.ok).toBe(false);
    if (first.ok) {
      return;
    }
    expect(first.error.code).toBe("VALIDATION_FAILED");

    const retry = await connectService.connectBYOK("openai", "good-key");
    expect(retry.ok).toBe(true);
    expect(validateAttempts).toBe(2);
  });

  test("handles daemon offline during provider validation", async () => {
    const daemon = new MockDaemonClient({ daemonAvailable: false, now: createNow() });
    const transport = new MockProviderTransport();
    transport.onPost("/api/providers/validate", () => ok({ valid: true }));

    const connectService = new ConnectService({ daemonClient: daemon, transport });
    const result = await connectService.connectBYOK("openai", "sk-offline");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

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
        provider: configured ? "openai" : null,
        status: configured ? "active" : "configured",
        models: configured ? ["gpt-4o"] : [],
        activeModel: configured ? "gpt-4o" : null,
      }),
    );

    transport.onPost("/api/providers/validate", () => ok({ valid: true, providerName: "OpenAI", models: ["gpt-4o"] }));
    transport.onPost("/api/providers/configure", () => {
      configured = true;
      return ok({ configured: true, providerId: "openai", providerName: "OpenAI", models: ["gpt-4o"] });
    });

    const connectService = new ConnectService({ transport });
    const statusService = new ProviderStatusService({ transport });

    const before = await statusService.getStatus();
    expect(before.ok).toBe(true);
    if (!before.ok) {
      return;
    }
    expect(before.value.configured).toBe(false);
    expect(before.value.activeModel).toBeNull();

    const connect = await connectService.connectBYOK("openai", "sk-live");
    expect(connect.ok).toBe(true);

    const after = await statusService.getStatus();
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }

    expect(after.value.configured).toBe(true);
    expect(after.value.status).toBe("active");
    expect(after.value.activeModel).toBe("gpt-4o");
  });
});
