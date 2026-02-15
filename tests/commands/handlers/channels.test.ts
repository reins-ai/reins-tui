import { describe, expect, it, mock } from "bun:test";

import {
  callDaemonChannelApi,
  handleChannelsCommand,
  maskBotToken,
} from "../../../src/commands/handlers/channels";
import type { CommandHandlerContext, CommandArgs } from "../../../src/commands/handlers/types";
import { SLASH_COMMANDS } from "../../../src/commands/registry";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestContext(): CommandHandlerContext {
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
    daemonClient: null,
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

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "test-token" }, mockFetch);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.channel?.channelId).toBe("telegram");
    expect(result.data.channel?.state).toBe("connected");
  });

  it("returns error message from daemon error response", async () => {
    const mockFetch = createMockFetch(400, { error: "token is required" });

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram" }, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("token is required");
  });

  it("returns error for 404 responses", async () => {
    const mockFetch = createMockFetch(404, { error: "Channel not found: slack" });

    const result = await callDaemonChannelApi("/channels/remove", { channelId: "slack" }, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Channel not found");
  });

  it("handles network errors gracefully", async () => {
    const mockFetch = mock(() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Unable to reach daemon");
  });

  it("handles timeout errors", async () => {
    const timeoutError = new DOMException("The operation was aborted", "AbortError");
    const mockFetch = mock(() => Promise.reject(timeoutError)) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("timed out");
  });

  it("handles non-JSON responses", async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500 })),
    ) as unknown as typeof fetch;

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid response");
  });

  it("falls back to HTTP status when no error field in response", async () => {
    const mockFetch = createMockFetch(500, { message: "something broke" });

    const result = await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "t" }, mockFetch);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("500");
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

  it("returns error when token is missing", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "telegram"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing bot token");
    expect(result.error.message).toContain("BotFather");
  });

  it("returns discord-specific help when token missing for discord", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "discord"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("discord.com/developers");
  });

  it("is case-insensitive for platform name", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "TELEGRAM"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Should get "missing token" error, not "unsupported platform"
    expect(result.error.message).toContain("Missing bot token");
  });

  it("returns error when token is empty string", async () => {
    const context = createTestContext();
    const args = makeArgs(["add", "telegram", "   "]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("Missing bot token");
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
  it("bare /channels shows help with updated usage", async () => {
    const context = createTestContext();
    const args = makeArgs([]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusMessage).toBe("Channels");
    expect(result.value.responseText).toContain("Channel Management");
    expect(result.value.responseText).toContain("/channels add");
    expect(result.value.responseText).toContain("<token>");
    expect(result.value.responseText).toContain("/channels remove");
    expect(result.value.responseText).toContain("/channels enable");
    expect(result.value.responseText).toContain("/channels disable");
    expect(result.value.responseText).toContain("/channels status");
    expect(result.value.responseText).toContain("telegram");
    expect(result.value.responseText).toContain("discord");
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

  it("status subcommand returns stub", async () => {
    const context = createTestContext();
    const args = makeArgs(["status"]);
    const result = await handleChannelsCommand(args, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statusMessage).toBe("Channel status");
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

    await callDaemonChannelApi("/channels/add", { platform: "telegram", token: "my-token" }, mockFetch);

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

    await callDaemonChannelApi("/channels/remove", { channelId: "discord" }, mockFetch);

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

    await callDaemonChannelApi("/channels/enable", { channelId: "telegram" }, mockFetch);

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

    await callDaemonChannelApi("/channels/disable", { channelId: "discord" }, mockFetch);

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

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, mockFetch);

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

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, mockFetch);

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

    await callDaemonChannelApi("/channels/remove", { channelId: "telegram" }, mockFetch);

    expect(capturedUrl).toBeDefined();
    expect(capturedUrl!).toContain("/channels/remove");
    // URL should start with http:// and end with the endpoint
    expect(capturedUrl!).toMatch(/^https?:\/\/.+\/channels\/remove$/);
  });
});
