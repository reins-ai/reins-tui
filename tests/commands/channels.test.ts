import { describe, expect, it } from "bun:test";

import { dispatchCommand, type CommandHandlerContext } from "../../src/commands/handlers";
import { parseSlashCommand } from "../../src/commands/parser";
import { getSlashCommandByNameOrAlias, SLASH_COMMANDS } from "../../src/commands/registry";

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

async function runCommand(input: string, context: CommandHandlerContext) {
  const parsed = parseSlashCommand(input);
  if (!parsed.ok) {
    return parsed;
  }

  return dispatchCommand(parsed.value, context);
}

describe("channels command registration", () => {
  it("is registered in SLASH_COMMANDS", () => {
    const names = SLASH_COMMANDS.map((cmd) => cmd.name);
    expect(names).toContain("channels");
  });

  it("has system category", () => {
    const cmd = SLASH_COMMANDS.find((c) => c.name === "channels");
    expect(cmd?.category).toBe("system");
  });

  it("has CHANNELS handler key", () => {
    const cmd = SLASH_COMMANDS.find((c) => c.name === "channels");
    expect(cmd?.handlerKey).toBe("CHANNELS");
  });

  it("has ch alias", () => {
    const cmd = SLASH_COMMANDS.find((c) => c.name === "channels");
    expect(cmd?.aliases).toContain("ch");
  });

  it("resolves /channels by name", () => {
    const cmd = getSlashCommandByNameOrAlias("channels");
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe("channels");
  });

  it("resolves /ch alias", () => {
    const cmd = getSlashCommandByNameOrAlias("ch");
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe("channels");
  });

  it("is case-insensitive", () => {
    const cmd = getSlashCommandByNameOrAlias("CHANNELS");
    expect(cmd).not.toBeNull();
    expect(cmd?.name).toBe("channels");
  });
});

describe("channels command parsing", () => {
  it("parses /channels with no subcommand", () => {
    const result = parseSlashCommand("/channels");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual([]);
  });

  it("parses /channels add telegram", () => {
    const result = parseSlashCommand("/channels add telegram");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual(["add", "telegram"]);
  });

  it("parses /channels remove discord", () => {
    const result = parseSlashCommand("/channels remove discord");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual(["remove", "discord"]);
  });

  it("parses /channels enable telegram", () => {
    const result = parseSlashCommand("/channels enable telegram");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual(["enable", "telegram"]);
  });

  it("parses /channels disable discord", () => {
    const result = parseSlashCommand("/channels disable discord");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual(["disable", "discord"]);
  });

  it("parses /channels status", () => {
    const result = parseSlashCommand("/channels status");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual(["status"]);
  });

  it("parses /ch alias with subcommand", () => {
    const result = parseSlashCommand("/ch status");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.command.name).toBe("channels");
    expect(result.value.args.positional).toEqual(["status"]);
  });
});

describe("handleChannelsCommand", () => {
  it("bare /channels shows help text", async () => {
    const context = createTestContext();
    const result = await runCommand("/channels", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Channels");
    expect(result.value.responseText).toContain("Channel Management");
    expect(result.value.responseText).toContain("/channels add");
    expect(result.value.responseText).toContain("/channels remove");
    expect(result.value.responseText).toContain("/channels enable");
    expect(result.value.responseText).toContain("/channels disable");
    expect(result.value.responseText).toContain("/channels status");
    expect(result.value.responseText).toContain("telegram");
    expect(result.value.responseText).toContain("discord");
  });

  it("bare /ch alias shows help text", async () => {
    const context = createTestContext();
    const result = await runCommand("/ch", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Channels");
    expect(result.value.responseText).toContain("Channel Management");
  });

  it("unknown subcommand returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/channels foobar", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unknown subcommand");
    expect(result.error.message).toContain("foobar");
  });

  describe("add subcommand", () => {
    it("requires bot token for telegram", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels add telegram", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing bot token");
    });

    it("requires bot token for discord", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels add discord", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing bot token");
    });

    it("returns error when platform is missing", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels add", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing platform");
    });

    it("returns error for unsupported platform", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels add slack", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unsupported platform");
      expect(result.error.message).toContain("slack");
    });

    it("is case-insensitive for platform name", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels add TELEGRAM", context);

      // Should get "missing token" error, not "unsupported platform"
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.message).toContain("Missing bot token");
    });
  });

  describe("remove subcommand", () => {
    it("returns error when platform is missing", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels remove", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing platform");
    });

    it("returns error for unsupported platform", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels remove whatsapp", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unsupported platform");
    });
  });

  describe("enable subcommand", () => {
    it("returns error when platform is missing", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels enable", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing platform");
    });

    it("returns error for unsupported platform", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels enable signal", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unsupported platform");
    });
  });

  describe("disable subcommand", () => {
    it("returns error when platform is missing", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels disable", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing platform");
    });

    it("returns error for unsupported platform", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels disable irc", context);

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unsupported platform");
    });
  });

  describe("status subcommand", () => {
    it("returns stub response", async () => {
      const context = createTestContext();
      const result = await runCommand("/channels status", context);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toBe("Channel status");
    });
  });
});
