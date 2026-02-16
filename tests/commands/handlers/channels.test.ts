import { describe, expect, it, mock } from "bun:test";

import {
  callDaemonChannelApi,
  callDaemonChannelGet,
  formatChannelStatusTable,
  formatRelativeTime,
  formatStatusIndicator,
  handleChannelsAddWithToken,
  handleChannelsCommand,
  maskBotToken,
  resolveChannelBaseUrl,
  type ChannelHealthStatus,
} from "../../../src/commands/handlers/channels";
import type { DaemonClient } from "../../../src/daemon/client";
import type { CommandHandlerContext, CommandArgs } from "../../../src/commands/handlers/types";
import { SLASH_COMMANDS } from "../../../src/commands/registry";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock daemon client for testing.
 *
 * Implements the subset of DaemonClient that channel handlers inspect:
 * - `getConnectionState()` — returns the provided status
 * - `config.httpBaseUrl` — exposed by LiveDaemonClient at runtime
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
    healthCheck: () => Promise.resolve({ ok: true as const, value: { healthy: true, timestamp: new Date().toISOString(), handshake: { daemonVersion: "0.1.0", contractVersion: "1", capabilities: [] } } }),
    sendMessage: () => Promise.resolve({ ok: true as const, value: { messageId: "m1", conversationId: "c1" } }),
    streamResponse: () => Promise.resolve({ ok: true as const, value: (async function* () {})() }),
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

function createMockFetch(status: number, body: Record<string, unknown>): typeof fetch {
  return mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })),
  ) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// maskBotToken
// ---------------------------------------------------------------------------

describe("maskBotToken", () => {
  it("masks a long token showing first 4 and last 4 characters", () => {
    const result = maskBotToken("1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ");
    expect(result.startsWith("1234")).toBe(true);
    expect(result.endsWith("wxYZ")).toBe(true);
    expect(result).toContain("*");
    expect(result).not.toContain("567890");
  });

  it("fully masks a short token", () => {
    expect(maskBotToken("short")).toBe("****");
  });

  it("fully masks a 10-character token", () => {
    expect(maskBotToken("0123456789")).toBe("****");
  });

  it("masks an 11-character token with partial reveal", () => {
    const result = maskBotToken("01234567890");
    expect(result.startsWith("0123")).toBe(true);
    expect(result.endsWith("7890")).toBe(true);
  });

  it("never reveals the full token", () => {
    const token = "1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ";
    const masked = maskBotToken(token);
    expect(masked).not.toBe(token);
    expect(masked.length).toBeLessThan(token.length);
  });
});

// ---------------------------------------------------------------------------
// callDaemonChannelApi
// ---------------------------------------------------------------------------

describe("callDaemonChannelApi", () => {
  it("returns parsed data on successful response", async () => {
    const mockFetch = createMockFetch(201, {
      channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
    });

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "test-token" }, 10_000, mockFetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.channel?.channelId).toBe("telegram");
    expect(result.data.channel?.state).toBe("connected");
  });

  it("returns error message from daemon error response", async () => {
    const mockFetch = createMockFetch(400, { error: "token is required" });

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("token is required");
  });

  it("returns error for 404 responses", async () => {
    const mockFetch = createMockFetch(404, { error: "Channel not found: slack" });

    const result = await callDaemonChannelApi("/channels/remove", { channelId: "slack" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Channel not found");
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Unable to reach daemon");
  });

  it("handles AbortError timeout errors", async () => {
    const timeoutError = new DOMException("The operation was aborted", "AbortError");
    const mockFetch = mock(() => Promise.reject(timeoutError)) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("timed out");
    expect(result.error).toContain("/channels status");
  });

  it("handles TimeoutError errors", async () => {
    const timeoutError = new DOMException("signal timed out", "TimeoutError");
    const mockFetch = mock(() => Promise.reject(timeoutError)) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("timed out");
    expect(result.error).toContain("/channels status");
  });

  it("handles errors with 'timed out' in message", async () => {
    const timedOutError = new Error("The operation timed out");
    const mockFetch = mock(() => Promise.reject(timedOutError)) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("timed out");
  });

  it("handles non-JSON responses", async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500 })),
    ) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid response");
  });

  it("falls back to HTTP status when no error field in response", async () => {
    const mockFetch = createMockFetch(500, { message: "something broke" });

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("500");
  });

  it("passes custom timeout to fetch signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return Promise.resolve(new Response(JSON.stringify({
        channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
      }), { status: 201, headers: { "Content-Type": "application/json" } }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 60_000, mockFetch);

    expect(capturedSignal).toBeDefined();
    // The signal should not be aborted immediately (60s timeout)
    expect(capturedSignal!.aborted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleChannelsCommand — add subcommand (argument validation)
// ---------------------------------------------------------------------------

describe("handleChannelsAdd", () => {
  it("returns error when platform is missing", async () => {
    const context = createTestContext();
    const args = makeArgs(["add"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing platform");
  });

  it("returns error for unsupported platform", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "slack"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unsupported platform");
    expect(result.error.message).toContain("slack");
  });

  it("prompts for token interactively when token is missing", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "telegram"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusMessage).toContain("Enter");
    expect(result.value.statusMessage).toContain("Telegram");
    expect(result.value.responseText).toContain("BotFather");
    expect(result.value.signals).toBeDefined();
    expect(result.value.signals).toHaveLength(1);
    expect(result.value.signals![0].type).toBe("PROMPT_CHANNEL_TOKEN");
    expect(result.value.signals![0].payload).toBe("telegram");
  });

  it("prompts with discord-specific help when token missing for discord", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "discord"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("discord.com/developers");
    expect(result.value.signals).toBeDefined();
    expect(result.value.signals![0].type).toBe("PROMPT_CHANNEL_TOKEN");
    expect(result.value.signals![0].payload).toBe("discord");
  });

  it("is case-insensitive for platform name", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "TELEGRAM"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should get prompt signal, not "unsupported platform" error
    expect(result.value.signals).toBeDefined();
    expect(result.value.signals![0].type).toBe("PROMPT_CHANNEL_TOKEN");
    expect(result.value.signals![0].payload).toBe("telegram");
  });

  it("prompts for token when token is empty string", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "telegram", "   "]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.signals).toBeDefined();
    expect(result.value.signals![0].type).toBe("PROMPT_CHANNEL_TOKEN");
  });
});

// ---------------------------------------------------------------------------
// handleChannelsCommand — remove subcommand (argument validation)
// ---------------------------------------------------------------------------

describe("handleChannelsRemove", () => {
  it("returns error when platform is missing", async () => {
    const context = createTestContext();
    const args = makeArgs(["remove"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing platform");
  });

  it("returns error for unsupported platform", async () => {
    const context = createTestContext();
    const args = makeArgs(["remove", "whatsapp"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unsupported platform");
  });
});

// ---------------------------------------------------------------------------
// handleChannelsCommand — enable subcommand (argument validation)
// ---------------------------------------------------------------------------

describe("handleChannelsEnable", () => {
  it("returns error when platform is missing", async () => {
    const context = createTestContext();
    const args = makeArgs(["enable"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing platform");
  });

  it("returns error for unsupported platform", async () => {
    const context = createTestContext();
    const args = makeArgs(["enable", "signal"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unsupported platform");
  });
});

// ---------------------------------------------------------------------------
// handleChannelsCommand — disable subcommand (argument validation)
// ---------------------------------------------------------------------------

describe("handleChannelsDisable", () => {
  it("returns error when platform is missing", async () => {
    const context = createTestContext();
    const args = makeArgs(["disable"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing platform");
  });

  it("returns error for unsupported platform", async () => {
    const context = createTestContext();
    const args = makeArgs(["disable", "irc"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unsupported platform");
  });
});

// ---------------------------------------------------------------------------
// handleChannelsCommand — help and routing
// ---------------------------------------------------------------------------

describe("handleChannelsCommand routing", () => {
  it("bare /channels shows help with examples", async () => {
    const context = createTestContext();
    const args = makeArgs([]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusMessage).toBe("Channels");
    expect(result.value.responseText).toContain("Channel Management");
    expect(result.value.responseText).toContain("/channels add");
    expect(result.value.responseText).toContain("[token]");
    expect(result.value.responseText).toContain("/channels remove");
    expect(result.value.responseText).toContain("/channels enable");
    expect(result.value.responseText).toContain("/channels disable");
    expect(result.value.responseText).toContain("/channels status");
    expect(result.value.responseText).toContain("telegram");
    expect(result.value.responseText).toContain("discord");
  });

  it("bare /channels help includes examples section", async () => {
    const context = createTestContext();
    const args = makeArgs([]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("Examples:");
    expect(result.value.responseText).toContain("/channels add telegram 123456789:ABC...");
    expect(result.value.responseText).toContain("/channels status");
    expect(result.value.responseText).toContain("/channels disable telegram");
  });

  it("bare /channels help includes alias", async () => {
    const context = createTestContext();
    const args = makeArgs([]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.responseText).toContain("Alias:");
    expect(result.value.responseText).toContain("/ch");
  });

  it("unknown subcommand returns error", async () => {
    const context = createTestContext();
    const args = makeArgs(["foobar"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unknown subcommand");
    expect(result.error.message).toContain("foobar");
  });
});

// ---------------------------------------------------------------------------
// callDaemonChannelApi — request format verification
// ---------------------------------------------------------------------------

describe("callDaemonChannelApi request format", () => {
  it("sends correct JSON body for add", async () => {
    let capturedBody: string | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve(new Response(JSON.stringify({
        channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
      }), { status: 201, headers: { "Content-Type": "application/json" } }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "my-token" }, 10_000, mockFetch);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.platform).toBe("telegram");
    expect(parsed.token).toBe("my-token");
  });

  it("sends correct JSON body for remove", async () => {
    let capturedBody: string | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve(new Response(JSON.stringify({ removed: true, channelId: "discord" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/remove", { channelId: "discord" }, 10_000, mockFetch);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.channelId).toBe("discord");
  });

  it("sends correct JSON body for enable", async () => {
    let capturedBody: string | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve(new Response(JSON.stringify({
        channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/enable", { channelId: "telegram" }, 10_000, mockFetch);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.channelId).toBe("telegram");
  });

  it("sends correct JSON body for disable", async () => {
    let capturedBody: string | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return Promise.resolve(new Response(JSON.stringify({
        channel: { channelId: "discord", platform: "discord", enabled: false, state: "disconnected", healthy: false },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/disable", { channelId: "discord" }, 10_000, mockFetch);

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.channelId).toBe("discord");
  });

  it("uses POST method for all channel operations", async () => {
    let capturedMethod: string | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedMethod = init.method;
      return Promise.resolve(new Response(JSON.stringify({ removed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, 10_000, mockFetch);

    expect(capturedMethod).toBe("POST");
  });

  it("sets Content-Type header to application/json", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return Promise.resolve(new Response(JSON.stringify({ removed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, 10_000, mockFetch);

    expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
  });

  it("appends endpoint to daemon base URL", async () => {
    let capturedUrl: string | undefined;
    const mockFetch = mock((url: string, _init: RequestInit) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ removed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, 10_000, mockFetch);

    expect(capturedUrl).toBeDefined();
    expect(capturedUrl!).toContain("/channels/remove");
    // URL should start with http:// and end with the endpoint
    expect(capturedUrl!).toMatch(/^https?:\/\/.+\/channels\/remove$/);
  });
});

// ---------------------------------------------------------------------------
// callDaemonChannelGet
// ---------------------------------------------------------------------------

describe("callDaemonChannelGet", () => {
  it("returns parsed data on successful GET response", async () => {
    const body = {
      channels: [{ channelId: "telegram", platform: "telegram", enabled: true, state: "connected" }],
      summary: { total: 1, enabled: 1, healthy: 1, unhealthy: 0 },
    };
    const mockFetch = createMockFetch(200, body);

    const result = await callDaemonChannelGet<typeof body>("/channels/status", 10_000, mockFetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.channels).toHaveLength(1);
    expect(result.data.summary.total).toBe(1);
  });

  it("uses GET method", async () => {
    let capturedMethod: string | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedMethod = init.method;
      return Promise.resolve(new Response(JSON.stringify({ channels: [], summary: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(capturedMethod).toBe("GET");
  });

  it("returns error on network failure", async () => {
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

    const result = await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Unable to reach daemon");
  });

  it("returns error on AbortError timeout", async () => {
    const timeoutError = new DOMException("The operation was aborted", "AbortError");
    const mockFetch = mock(() => Promise.reject(timeoutError)) as unknown as typeof fetch;

    const result = await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("timed out");
    expect(result.error).toContain("/channels status");
  });

  it("returns error on TimeoutError", async () => {
    const timeoutError = new DOMException("signal timed out", "TimeoutError");
    const mockFetch = mock(() => Promise.reject(timeoutError)) as unknown as typeof fetch;

    const result = await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("timed out");
  });

  it("returns error on non-JSON response", async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500 })),
    ) as unknown as typeof fetch;

    const result = await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid response");
  });

  it("returns error field from non-ok response", async () => {
    const mockFetch = createMockFetch(500, { error: "service unavailable" });

    const result = await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("service unavailable");
  });

  it("passes custom timeout to fetch signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockFetch = mock((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return Promise.resolve(new Response(JSON.stringify({ channels: [], summary: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelGet("/channels/status", 5_000, mockFetch);

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatStatusIndicator
// ---------------------------------------------------------------------------

describe("formatStatusIndicator", () => {
  it("returns green indicator for connected state", () => {
    const result = formatStatusIndicator("connected");
    expect(result).toContain("\x1b[32m");
    expect(result).toContain("connected");
    expect(result).toContain("\x1b[0m");
  });

  it("returns red indicator for error state", () => {
    const result = formatStatusIndicator("error");
    expect(result).toContain("\x1b[31m");
    expect(result).toContain("error");
  });

  it("returns yellow indicator for disconnected state", () => {
    const result = formatStatusIndicator("disconnected");
    expect(result).toContain("\x1b[33m");
    expect(result).toContain("disconnected");
  });

  it("returns yellow indicator for connecting state", () => {
    const result = formatStatusIndicator("connecting");
    expect(result).toContain("\x1b[33m");
    expect(result).toContain("connecting");
  });

  it("returns yellow indicator for reconnecting state", () => {
    const result = formatStatusIndicator("reconnecting");
    expect(result).toContain("\x1b[33m");
    expect(result).toContain("reconnecting");
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe("formatRelativeTime", () => {
  const fixedNow = new Date("2026-02-15T12:00:00Z").getTime();

  it("returns dim dash for undefined timestamp", () => {
    const result = formatRelativeTime(undefined, fixedNow);
    expect(result).toBe("-");
  });

  it("returns dim dash for invalid timestamp", () => {
    const result = formatRelativeTime("not-a-date", fixedNow);
    expect(result).toContain("-");
  });

  it("returns 'just now' for timestamps within 1 second", () => {
    const result = formatRelativeTime("2026-02-15T12:00:00Z", fixedNow);
    expect(result).toBe("just now");
  });

  it("returns seconds ago for recent timestamps", () => {
    const result = formatRelativeTime("2026-02-15T11:59:30Z", fixedNow);
    expect(result).toBe("30s ago");
  });

  it("returns minutes ago for timestamps within an hour", () => {
    const result = formatRelativeTime("2026-02-15T11:45:00Z", fixedNow);
    expect(result).toBe("15m ago");
  });

  it("returns hours ago for timestamps within a day", () => {
    const result = formatRelativeTime("2026-02-15T09:00:00Z", fixedNow);
    expect(result).toBe("3h ago");
  });

  it("returns days ago for older timestamps", () => {
    const result = formatRelativeTime("2026-02-13T12:00:00Z", fixedNow);
    expect(result).toBe("2d ago");
  });

  it("returns 'just now' for future timestamps", () => {
    const result = formatRelativeTime("2026-02-15T13:00:00Z", fixedNow);
    expect(result).toBe("just now");
  });
});

// ---------------------------------------------------------------------------
// formatChannelStatusTable
// ---------------------------------------------------------------------------

describe("formatChannelStatusTable", () => {
  const fixedNow = new Date("2026-02-15T12:00:00Z").getTime();

  it("shows empty state message when no channels configured", () => {
    const snapshot = {
      channels: [],
      summary: { total: 0, enabled: 0, healthy: 0, unhealthy: 0 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("No channels configured");
    expect(result).toContain("/channels add telegram");
    expect(result).toContain("/channels add discord");
    expect(result).toContain("Supported platforms");
  });

  it("shows a single connected channel", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: true,
          state: "connected" as const,
          uptimeMs: 60_000,
          healthy: true,
          lastMessageAt: "2026-02-15T11:55:00Z",
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 1, enabled: 1, healthy: 1, unhealthy: 0 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("Channel Status");
    expect(result).toContain("Platform");
    expect(result).toContain("Status");
    expect(result).toContain("Enabled");
    expect(result).toContain("Last Activity");
    expect(result).toContain("Telegram");
    expect(result).toContain("connected");
    expect(result).toContain("Yes");
    expect(result).toContain("5m ago");
    expect(result).toContain("1 channel");
    expect(result).toContain("1 healthy");
  });

  it("shows multiple channels with different states", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: true,
          state: "connected" as const,
          uptimeMs: 3_600_000,
          healthy: true,
          lastMessageAt: "2026-02-15T11:30:00Z",
          checkedAt: "2026-02-15T12:00:00Z",
        },
        {
          channelId: "discord",
          platform: "discord",
          enabled: true,
          state: "error" as const,
          uptimeMs: 0,
          healthy: false,
          lastError: "Invalid token",
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 2, enabled: 2, healthy: 1, unhealthy: 1 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("Telegram");
    expect(result).toContain("Discord");
    expect(result).toContain("2 channels");
    expect(result).toContain("1 healthy");
    expect(result).toContain("1 unhealthy");
    // Green for connected
    expect(result).toContain("\x1b[32m");
    // Red for error
    expect(result).toContain("\x1b[31m");
  });

  it("shows disabled channel with No in enabled column", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: false,
          state: "disconnected" as const,
          uptimeMs: 0,
          healthy: false,
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 1, enabled: 0, healthy: 0, unhealthy: 0 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("No");
    expect(result).toContain("disconnected");
  });

  it("shows dash for channels with no last activity", () => {
    const snapshot = {
      channels: [
        {
          channelId: "discord",
          platform: "discord",
          enabled: true,
          state: "connecting" as const,
          uptimeMs: 0,
          healthy: false,
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 1, enabled: 1, healthy: 0, unhealthy: 1 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("-");
  });

  it("includes separator line between header and rows", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: true,
          state: "connected" as const,
          uptimeMs: 1000,
          healthy: true,
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 1, enabled: 1, healthy: 1, unhealthy: 0 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("-");
  });

  it("uses singular 'channel' for single channel summary", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: true,
          state: "connected" as const,
          uptimeMs: 1000,
          healthy: true,
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 1, enabled: 1, healthy: 1, unhealthy: 0 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("1 channel");
    expect(result).not.toContain("1 channels");
  });

  it("uses plural 'channels' for multiple channels summary", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: true,
          state: "connected" as const,
          uptimeMs: 1000,
          healthy: true,
          checkedAt: "2026-02-15T12:00:00Z",
        },
        {
          channelId: "discord",
          platform: "discord",
          enabled: true,
          state: "connected" as const,
          uptimeMs: 1000,
          healthy: true,
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 2, enabled: 2, healthy: 2, unhealthy: 0 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    expect(result).toContain("2 channels");
  });

  it("highlights unhealthy count in red when present", () => {
    const snapshot = {
      channels: [
        {
          channelId: "telegram",
          platform: "telegram",
          enabled: true,
          state: "error" as const,
          uptimeMs: 0,
          healthy: false,
          lastError: "Connection refused",
          checkedAt: "2026-02-15T12:00:00Z",
        },
      ],
      summary: { total: 1, enabled: 1, healthy: 0, unhealthy: 1 },
    };

    const result = formatChannelStatusTable(snapshot, fixedNow);

    // The unhealthy count should be wrapped in red
    expect(result).toContain("\x1b[31m1 unhealthy\x1b[0m");
  });
});

// ---------------------------------------------------------------------------
// resolveChannelBaseUrl — daemon client URL preference
// ---------------------------------------------------------------------------

describe("resolveChannelBaseUrl", () => {
  it("returns daemon client httpBaseUrl when available", async () => {
    const client = createMockDaemonClient({ httpBaseUrl: "http://my-daemon:9000" });
    const context = createTestContext(client);

    const url = await resolveChannelBaseUrl(context);

    expect(url).toBe("http://my-daemon:9000");
  });

  it("falls back to getActiveDaemonUrl when no daemon client", async () => {
    const context = createTestContext(null);

    const url = await resolveChannelBaseUrl(context);

    // Should return a URL (either from profile store or default localhost)
    expect(url).toMatch(/^https?:\/\//);
  });

  it("falls back when daemon client has no config property", async () => {
    // Simulate a DaemonClient that does not expose config (bare interface)
    const bareClient: DaemonClient = {
      getConnectionState: () => ({ status: "connected" as const, retries: 0 }),
      onConnectionStateChange: () => () => {},
      connect: () => Promise.resolve({ ok: true as const, value: undefined }),
      reconnect: () => Promise.resolve({ ok: true as const, value: undefined }),
      disconnect: () => Promise.resolve({ ok: true as const, value: undefined }),
      healthCheck: () => Promise.resolve({ ok: true as const, value: { healthy: true, timestamp: "", handshake: { daemonVersion: "0.1.0", contractVersion: "1", capabilities: [] } } }),
      sendMessage: () => Promise.resolve({ ok: true as const, value: { messageId: "m1", conversationId: "c1" } }),
      streamResponse: () => Promise.resolve({ ok: true as const, value: (async function* () {})() }),
      listConversations: () => Promise.resolve({ ok: true as const, value: [] }),
      getConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "n/a", retryable: false } }),
      createConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "n/a", retryable: false } }),
      updateConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "n/a", retryable: false } }),
      deleteConversation: () => Promise.resolve({ ok: false as const, error: { code: "DAEMON_DISCONNECTED" as const, message: "n/a", retryable: false } }),
    };
    const context = createTestContext(bareClient);

    const url = await resolveChannelBaseUrl(context);

    // Falls back to getActiveDaemonUrl default
    expect(url).toMatch(/^https?:\/\//);
  });
});

// ---------------------------------------------------------------------------
// callDaemonChannelApi / callDaemonChannelGet — baseUrlOverride
// ---------------------------------------------------------------------------

describe("callDaemonChannelApi baseUrlOverride", () => {
  it("uses baseUrlOverride when provided", async () => {
    let capturedUrl: string | undefined;
    const mockFetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({
        channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
      }), { status: 201, headers: { "Content-Type": "application/json" } }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, 10_000, mockFetch, "http://custom-daemon:8080");

    expect(capturedUrl).toBe("http://custom-daemon:8080/channels/add");
  });

  it("falls back to getActiveDaemonUrl when no override", async () => {
    let capturedUrl: string | undefined;
    const mockFetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ removed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, 10_000, mockFetch);

    expect(capturedUrl).toBeDefined();
    expect(capturedUrl!).toContain("/channels/remove");
    expect(capturedUrl!).toMatch(/^https?:\/\/.+\/channels\/remove$/);
  });
});

describe("callDaemonChannelGet baseUrlOverride", () => {
  it("uses baseUrlOverride when provided", async () => {
    let capturedUrl: string | undefined;
    const mockFetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ channels: [], summary: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelGet("/channels/status", 10_000, mockFetch, "http://remote-daemon:7433");

    expect(capturedUrl).toBe("http://remote-daemon:7433/channels/status");
  });

  it("falls back to getActiveDaemonUrl when no override", async () => {
    let capturedUrl: string | undefined;
    const mockFetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ channels: [], summary: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as unknown as typeof fetch;

    await callDaemonChannelGet("/channels/status", 10_000, mockFetch);

    expect(capturedUrl).toBeDefined();
    expect(capturedUrl!).toContain("/channels/status");
    expect(capturedUrl!).toMatch(/^https?:\/\/.+\/channels\/status$/);
  });
});

// ---------------------------------------------------------------------------
// Disconnected daemon client — fast fail
// ---------------------------------------------------------------------------

describe("disconnected daemon client fast fail", () => {
  it("status returns immediate error when daemon is disconnected", async () => {
    const client = createMockDaemonClient({ status: "disconnected" });
    const context = createTestContext(client);
    const args = makeArgs(["status"]);

    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
    expect(result.error.message).toContain("/daemon switch");
  });

  it("add returns immediate error when daemon is reconnecting", async () => {
    const client = createMockDaemonClient({ status: "reconnecting" });
    const context = createTestContext(client);
    const args = makeArgs(["add", "telegram", "my-bot-token-1234567890"]);

    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("remove returns immediate error when daemon is connecting", async () => {
    const client = createMockDaemonClient({ status: "connecting" });
    const context = createTestContext(client);
    const args = makeArgs(["remove", "telegram"]);

    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("enable returns immediate error when daemon is disconnected", async () => {
    const client = createMockDaemonClient({ status: "disconnected" });
    const context = createTestContext(client);
    const args = makeArgs(["enable", "telegram"]);

    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("disable returns immediate error when daemon is disconnected", async () => {
    const client = createMockDaemonClient({ status: "disconnected" });
    const context = createTestContext(client);
    const args = makeArgs(["disable", "discord"]);

    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("does not block when daemon client is null (no client configured)", async () => {
    // When there's no daemon client at all, resolveChannelBaseUrl should
    // still return a URL (the fallback), not throw or return disconnected.
    const context = createTestContext(null);

    const url = await resolveChannelBaseUrl(context);
    expect(url).toMatch(/^https?:\/\//);
  });

  it("does not block when daemon client is connected", async () => {
    const client = createMockDaemonClient({ status: "connected", httpBaseUrl: "http://localhost:7433" });
    const context = createTestContext(client);

    const url = await resolveChannelBaseUrl(context);
    expect(url).toBe("http://localhost:7433");
  });
});

// ---------------------------------------------------------------------------
// Subcommand handlers prefer daemon client base URL
// ---------------------------------------------------------------------------

describe("handlers prefer daemon client base URL", () => {
  it("status handler uses daemon client URL over profile store", async () => {
    let capturedUrl: string | undefined;

    // We can't easily inject fetchFn into the handler, but we can verify
    // via resolveChannelBaseUrl that the URL is correct
    const client = createMockDaemonClient({
      status: "connected",
      httpBaseUrl: "http://my-remote-daemon:7433",
    });
    const context = createTestContext(client);

    const url = await resolveChannelBaseUrl(context);
    expect(url).toBe("http://my-remote-daemon:7433");
  });

  it("add handler uses daemon client URL over profile store", async () => {
    const client = createMockDaemonClient({
      status: "connected",
      httpBaseUrl: "http://tailscale-daemon:7433",
    });
    const context = createTestContext(client);

    const url = await resolveChannelBaseUrl(context);
    expect(url).toBe("http://tailscale-daemon:7433");
  });
});

// ---------------------------------------------------------------------------
// handleChannelsAddWithToken — direct token submission
// ---------------------------------------------------------------------------

describe("handleChannelsAddWithToken", () => {
  it("calls daemon API and returns success on valid token", async () => {
    const mockFetch = createMockFetch(201, {
      channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
    });
    const client = createMockDaemonClient({ status: "connected" });
    const context = createTestContext(client);

    const result = await handleChannelsAddWithToken("telegram", "123456:ABC-DEF", context, mockFetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusMessage).toContain("Telegram");
    expect(result.value.statusMessage).toContain("added");
    expect(result.value.responseText).toContain("configured successfully");
    expect(result.value.responseText).toContain("connected");
  });

  it("returns masked token in success response", async () => {
    const mockFetch = createMockFetch(201, {
      channel: { channelId: "telegram", platform: "telegram", enabled: true, state: "connected", healthy: true },
    });
    const client = createMockDaemonClient({ status: "connected" });
    const context = createTestContext(client);

    const result = await handleChannelsAddWithToken("telegram", "1234567890:ABCdefGHIjklMNO", context, mockFetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Token should be masked — not showing full token
    expect(result.value.responseText).not.toContain("1234567890:ABCdefGHIjklMNO");
    expect(result.value.responseText).toContain("1234");
  });

  it("returns error when daemon API fails", async () => {
    const mockFetch = createMockFetch(400, { error: "Invalid bot token" });
    const client = createMockDaemonClient({ status: "connected" });
    const context = createTestContext(client);

    const result = await handleChannelsAddWithToken("telegram", "bad-token", context, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Failed to add telegram");
    expect(result.error.message).toContain("Invalid bot token");
  });

  it("returns error when daemon is disconnected", async () => {
    const mockFetch = createMockFetch(201, {});
    const client = createMockDaemonClient({ status: "disconnected" });
    const context = createTestContext(client);

    const result = await handleChannelsAddWithToken("telegram", "some-token-1234567890", context, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("works for discord platform", async () => {
    const mockFetch = createMockFetch(201, {
      channel: { channelId: "discord", platform: "discord", enabled: true, state: "connecting", healthy: false },
    });
    const client = createMockDaemonClient({ status: "connected" });
    const context = createTestContext(client);

    const result = await handleChannelsAddWithToken("discord", "MTIz.abc.xyz-1234567890", context, mockFetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusMessage).toContain("Discord");
    expect(result.value.responseText).toContain("connecting");
  });
});

// ---------------------------------------------------------------------------
// handleChannelsAdd — argument-based path still works
// ---------------------------------------------------------------------------

describe("handleChannelsAdd argument path", () => {
  it("accepts token as positional argument without prompting", async () => {
    // Use a disconnected daemon so the handler fails fast (no network timeout)
    const client = createMockDaemonClient({ status: "disconnected" });
    const context = createTestContext(client);

    const args = makeArgs(["add", "telegram", "1234567890:ABCdefGHIjklMNO"]);
    const result = await handleChannelsCommand(args, context);

    // Should fail with daemon disconnected error, NOT emit a prompt signal
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });

  it("accepts token via --token flag without prompting", async () => {
    // Use a disconnected daemon so the handler fails fast (no network timeout)
    const client = createMockDaemonClient({ status: "disconnected" });
    const context = createTestContext(client);
    const args = makeArgs(["add", "telegram"], { token: "1234567890:ABCdefGHIjklMNO" });
    const result = await handleChannelsCommand(args, context);

    // Should fail with daemon disconnected error, NOT emit a prompt signal
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Daemon is disconnected");
  });
});
