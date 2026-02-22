import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

import {
  handleAuthCommand,
  handleDeauthCommand,
} from "../../../src/commands/handlers/auth";
import { getSlashCommandByNameOrAlias, SLASH_COMMANDS } from "../../../src/commands/registry";
import type { DaemonClient } from "../../../src/daemon/client";
import type { CommandHandlerContext, CommandArgs } from "../../../src/commands/handlers/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock daemon client that exposes `config.httpBaseUrl`
 * so `resolveChannelBaseUrl` returns a known URL without hitting disk.
 */
function createMockDaemonClient(
  options: {
    status?: "connected" | "disconnected" | "connecting" | "reconnecting";
    httpBaseUrl?: string;
  } = {},
): DaemonClient & { config: { httpBaseUrl: string } } {
  const status = options.status ?? "connected";
  const httpBaseUrl = options.httpBaseUrl ?? "http://localhost:7433";

  return {
    config: { httpBaseUrl },
    getConnectionState: () => ({ status, retries: 0 }),
    onConnectionStateChange: () => () => {},
    connect: () => Promise.resolve({ ok: true as const, value: undefined }),
    reconnect: () => Promise.resolve({ ok: true as const, value: undefined }),
    disconnect: () => Promise.resolve({ ok: true as const, value: undefined }),
    healthCheck: () => Promise.resolve({
      ok: true as const,
      value: {
        healthy: true,
        timestamp: new Date().toISOString(),
        handshake: { daemonVersion: "0.1.0", contractVersion: "1", capabilities: [] },
      },
    }),
    sendMessage: () => Promise.resolve({
      ok: true as const,
      value: { messageId: "m1", conversationId: "c1", userMessageId: "u1", assistantMessageId: "a1" },
    }),
    streamResponse: () => Promise.resolve({ ok: true as const, value: (async function* () {})() }),
    cancelStream: () => Promise.resolve({ ok: true as const, value: undefined }),
    listConversations: () => Promise.resolve({ ok: true as const, value: [] }),
    getConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "not implemented", retryable: false } }),
    createConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "not implemented", retryable: false } }),
    updateConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "not implemented", retryable: false } }),
    deleteConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "not implemented", retryable: false } }),
  };
}

function createTestContext(daemonClient?: DaemonClient | null): CommandHandlerContext {
  return {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default"],
      currentModel: "default",
      setModel() {},
    },
    theme: {
      activeTheme: "reins-dark",
      listThemes: () => ["reins-dark"],
      setTheme: () => true,
    },
    session: {
      activeConversationId: "conversation-1",
      messages: [],
      createConversation: () => "conversation-2",
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    memory: null,
    environment: null,
    daemonClient: daemonClient !== undefined ? daemonClient : null,
  };
}

function makeArgs(positional: string[], flags: Record<string, string | boolean> = {}): CommandArgs {
  return { positional, flags };
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Global fetch mock management
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// /auth — no args (help)
// ---------------------------------------------------------------------------

describe("handleAuthCommand — help", () => {
  it("shows usage help when called with no arguments", async () => {
    const result = await handleAuthCommand(makeArgs([]), createTestContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("Usage");
    expect(result.value.responseText).toContain("/auth");
    expect(result.value.responseText).toContain("list");
    expect(result.value.responseText).toContain("/deauth");
  });
});

// ---------------------------------------------------------------------------
// /auth <channel> <userId> — add user
// ---------------------------------------------------------------------------

describe("handleAuthCommand — add user", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { ok: true, channelId: "telegram", userId: "123456789" }),
    ) as typeof fetch;
  });

  it("authorizes user and returns success message", async () => {
    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("authorized");
    expect(result.value.responseText).toContain("telegram");
    expect(result.value.responseText).toContain("123456789");
  });

  it("includes follow-up hint about /auth list", async () => {
    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("/auth list");
  });

  it("returns error when userId arg is missing", async () => {
    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("userId");
  });

  it("returns error when daemon responds with 500", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(500, { error: "Internal server error" }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Failed to authorize");
  });

  it("returns error when daemon is disconnected", async () => {
    const client = createMockDaemonClient({ status: "disconnected" });
    const result = await handleAuthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("sends POST to /auth/add with correct body", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      capturedBody = init?.body as string;
      return jsonResponse(200, { ok: true, channelId: "telegram", userId: "42" });
    }) as typeof fetch;

    const client = createMockDaemonClient({ httpBaseUrl: "http://test-daemon:7433" });
    await handleAuthCommand(
      makeArgs(["telegram", "42"]),
      createTestContext(client),
    );

    expect(capturedUrl).toBe("http://test-daemon:7433/auth/add");
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.channelId).toBe("telegram");
    expect(parsed.userId).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// /auth list <channel>
// ---------------------------------------------------------------------------

describe("handleAuthCommand — list", () => {
  it("shows numbered list of authorized users", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { channelId: "telegram", users: ["111", "222", "333"] }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["list", "telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("telegram");
    expect(result.value.responseText).toContain("111");
    expect(result.value.responseText).toContain("222");
    expect(result.value.responseText).toContain("333");
    expect(result.value.responseText).toContain("3 total");
  });

  it("shows numbered entries with sequential indices", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { channelId: "telegram", users: ["aaa", "bbb"] }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["list", "telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("1.");
    expect(result.value.responseText).toContain("2.");
  });

  it("shows empty state message when no users authorized", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { channelId: "telegram", users: [] }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["list", "telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("No authorized users");
    expect(result.value.responseText).toContain("telegram");
    expect(result.value.responseText).toContain("/auth");
  });

  it("returns error when channel arg is missing after list", async () => {
    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["list"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("channel");
  });

  it("returns error when daemon list call fails", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(500, { error: "database unavailable" }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleAuthCommand(
      makeArgs(["list", "telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Failed to list");
  });

  it("sends GET to /auth/list with channelId query param", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      return jsonResponse(200, { channelId: "discord", users: [] });
    }) as typeof fetch;

    const client = createMockDaemonClient({ httpBaseUrl: "http://test-daemon:7433" });
    await handleAuthCommand(
      makeArgs(["list", "discord"]),
      createTestContext(client),
    );

    expect(capturedUrl).toContain("/auth/list");
    expect(capturedUrl).toContain("channelId=discord");
  });

  it("returns error when daemon is disconnected", async () => {
    const client = createMockDaemonClient({ status: "disconnected" });
    const result = await handleAuthCommand(
      makeArgs(["list", "telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });
});

// ---------------------------------------------------------------------------
// /deauth <channel> <userId>
// ---------------------------------------------------------------------------

describe("handleDeauthCommand", () => {
  it("shows usage help when called with no arguments", async () => {
    const result = await handleDeauthCommand(makeArgs([]), createTestContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("Usage");
    expect(result.value.responseText).toContain("/deauth");
  });

  it("removes user and returns success message", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { ok: true, removed: true }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleDeauthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("deauthorized");
    expect(result.value.responseText).toContain("123456789");
    expect(result.value.responseText).toContain("telegram");
  });

  it("includes re-authorize hint in success response", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, { ok: true, removed: true }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleDeauthCommand(
      makeArgs(["telegram", "42"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("/auth");
    expect(result.value.responseText).toContain("re-authorize");
  });

  it("returns NOT_FOUND error when user not in allow-list", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(404, { error: "User 999 not found in channel telegram" }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleDeauthCommand(
      makeArgs(["telegram", "999"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toContain("999");
    expect(result.error.message).toContain("allow-list");
  });

  it("returns INVALID_ARGUMENT for non-404 daemon errors", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(500, { error: "Internal server error" }),
    ) as typeof fetch;

    const client = createMockDaemonClient();
    const result = await handleDeauthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Failed to deauthorize");
  });

  it("returns error when userId arg is missing", async () => {
    const client = createMockDaemonClient();
    const result = await handleDeauthCommand(
      makeArgs(["telegram"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("userId");
  });

  it("returns error when daemon is disconnected", async () => {
    const client = createMockDaemonClient({ status: "disconnected" });
    const result = await handleDeauthCommand(
      makeArgs(["telegram", "123456789"]),
      createTestContext(client),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("sends POST to /auth/remove with correct body", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === "string" ? url : url.toString();
      capturedBody = init?.body as string;
      return jsonResponse(200, { ok: true, removed: true });
    }) as typeof fetch;

    const client = createMockDaemonClient({ httpBaseUrl: "http://test-daemon:7433" });
    await handleDeauthCommand(
      makeArgs(["telegram", "42"]),
      createTestContext(client),
    );

    expect(capturedUrl).toBe("http://test-daemon:7433/auth/remove");
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.channelId).toBe("telegram");
    expect(parsed.userId).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

describe("command registration", () => {
  it("/auth resolves to AUTH handler key", () => {
    const cmd = getSlashCommandByNameOrAlias("auth");
    expect(cmd).not.toBeNull();
    expect(cmd?.handlerKey).toBe("AUTH");
  });

  it("/authenticate resolves to AUTH handler key (alias)", () => {
    const cmd = getSlashCommandByNameOrAlias("authenticate");
    expect(cmd).not.toBeNull();
    expect(cmd?.handlerKey).toBe("AUTH");
  });

  it("/deauth resolves to DEAUTH handler key", () => {
    const cmd = getSlashCommandByNameOrAlias("deauth");
    expect(cmd).not.toBeNull();
    expect(cmd?.handlerKey).toBe("DEAUTH");
  });

  it("/auth command has correct usage string", () => {
    const cmd = getSlashCommandByNameOrAlias("auth");
    expect(cmd).not.toBeNull();
    expect(cmd?.usage).toContain("/auth");
    expect(cmd?.usage).toContain("list");
  });

  it("/deauth command has correct usage string", () => {
    const cmd = getSlashCommandByNameOrAlias("deauth");
    expect(cmd).not.toBeNull();
    expect(cmd?.usage).toContain("/deauth");
    expect(cmd?.usage).toContain("userId");
  });

  it("/auth is in the system category", () => {
    const cmd = getSlashCommandByNameOrAlias("auth");
    expect(cmd?.category).toBe("system");
  });

  it("/deauth is in the system category", () => {
    const cmd = getSlashCommandByNameOrAlias("deauth");
    expect(cmd?.category).toBe("system");
  });
});
