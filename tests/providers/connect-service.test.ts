import { describe, expect, test } from "bun:test";

import { err, ok, type DaemonClientError } from "../../src/daemon/contracts";
import {
  ConnectService,
  type ProviderApiTransport,
  type ProviderMode,
} from "../../src/providers/connect-service";
import { ProviderStatusService } from "../../src/providers/provider-status";

type HandlerResult = ReturnType<typeof ok<unknown>> | ReturnType<typeof err<DaemonClientError>>;

function daemonError(code: DaemonClientError["code"], message: string, retryable = true): DaemonClientError {
  return {
    code,
    message,
    retryable,
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

describe("connect service", () => {
  test("connectBYOK validates and configures provider", async () => {
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

    const service = new ConnectService({ transport });
    const result = await service.connectBYOK("openai", "sk-test");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.providerId).toBe("openai");
    expect(result.value.providerName).toBe("OpenAI");
    expect(result.value.mode).toBe("byok");
    expect(result.value.models).toEqual(["gpt-4o"]);
    expect(transport.calls.map((call) => call.path)).toEqual(["/api/providers/validate", "/api/providers/configure"]);
  });

  test("connectBYOK returns validation failure and does not configure", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/providers/validate", () => ok({ valid: false, error: "Invalid API key" }));

    const service = new ConnectService({ transport });
    const result = await service.connectBYOK("openai", "bad-key");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(result.error.message).toContain("Invalid API key");
    expect(transport.calls.map((call) => call.path)).toEqual(["/api/providers/validate"]);
  });

  test("connectGateway validates and configures gateway", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/gateway/validate", () => ok({ valid: true, providerName: "Reins Gateway", models: ["gw-model"] }));
    transport.onPost("/api/gateway/configure", () =>
      ok({
        configured: true,
        providerId: "gateway",
        providerName: "Reins Gateway",
        models: ["gw-model"],
      }),
    );

    const service = new ConnectService({ transport });
    const result = await service.connectGateway("gw-token");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.mode).toBe("gateway");
    expect(result.value.providerId).toBe("gateway");
    expect(result.value.models).toEqual(["gw-model"]);
  });

  test("connectGateway returns daemon wrapped error when validation transport fails", async () => {
    const transport = new MockProviderTransport();
    transport.onPost("/api/gateway/validate", () => err(daemonError("DAEMON_TIMEOUT", "Timed out while validating gateway token")));

    const service = new ConnectService({ transport });
    const result = await service.connectGateway("gw-token");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("DAEMON_OFFLINE");
    expect(result.error.retryable).toBe(true);
  });

  test("testConnection returns provider diagnostics", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/test", () =>
      ok({
        connected: true,
        providerName: "OpenAI",
        model: "gpt-4o",
        latencyMs: 123,
      }),
    );

    const service = new ConnectService({ transport });
    const result = await service.testConnection();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.connected).toBe(true);
    expect(result.value.provider).toBe("OpenAI");
    expect(result.value.model).toBe("gpt-4o");
    expect(result.value.latency).toBe(123);
  });

  test("disconnect deletes provider by id", async () => {
    const transport = new MockProviderTransport();
    transport.onDelete("/api/providers/openai", () => ok(undefined));

    const service = new ConnectService({ transport });
    const result = await service.disconnect("openai");

    expect(result.ok).toBe(true);
    expect(transport.calls.map((call) => `${call.method}:${call.path}`)).toEqual(["DELETE:/api/providers/openai"]);
  });

  test("disconnect falls back to disconnect endpoint when delete route not found", async () => {
    const transport = new MockProviderTransport();
    transport.onDelete("/api/providers/openai", () => err(daemonError("DAEMON_NOT_FOUND", "Missing delete route", false)));
    transport.onPost("/api/providers/disconnect", (body) => {
      expect(body).toEqual({ providerId: "openai" });
      return ok({ disconnected: true });
    });

    const service = new ConnectService({ transport });
    const result = await service.disconnect("openai");

    expect(result.ok).toBe(true);
    expect(transport.calls.map((call) => `${call.method}:${call.path}`)).toEqual([
      "DELETE:/api/providers/openai",
      "POST:/api/providers/disconnect",
    ]);
  });
});

describe("provider status service", () => {
  test("getStatus returns parsed status response", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/status", () =>
      ok({
        configured: true,
        mode: "byok" satisfies ProviderMode,
        provider: "openai",
        status: "active",
        models: ["gpt-4o", "gpt-4o-mini"],
        activeModel: "gpt-4o",
      }),
    );

    const statusService = new ProviderStatusService({ transport });
    const result = await statusService.getStatus();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("active");
    expect(result.value.configured).toBe(true);
    expect(result.value.mode).toBe("byok");
    expect(result.value.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(result.value.activeModel).toBe("gpt-4o");
  });

  test("getAvailableModels returns model list", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/models", () =>
      ok({
        models: [{ id: "gpt-4o", name: "GPT-4o", provider: "openai" }, "gpt-4o-mini"],
      }),
    );

    const statusService = new ProviderStatusService({ transport });
    const result = await statusService.getAvailableModels();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toEqual([
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", active: undefined },
      { id: "gpt-4o-mini", name: "gpt-4o-mini" },
    ]);
  });

  test("getActiveModel returns null when daemon reports no active model", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/active-model", () => ok({ activeModel: null }));

    const statusService = new ProviderStatusService({ transport });
    const result = await statusService.getActiveModel();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toBeNull();
  });

  test("getStatus handles daemon offline gracefully", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/status", () => err(daemonError("DAEMON_UNAVAILABLE", "Daemon is offline")));

    const statusService = new ProviderStatusService({ transport });
    const result = await statusService.getStatus();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.status).toBe("offline");
    expect(result.value.configured).toBe(false);
    expect(result.value.error).toContain("offline");
  });

  test("getActiveModel wraps invalid payload into Result error", async () => {
    const transport = new MockProviderTransport();
    transport.onGet("/api/providers/active-model", () => ok(42));

    const statusService = new ProviderStatusService({ transport });
    const result = await statusService.getActiveModel();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("INVALID_RESPONSE");
  });
});
