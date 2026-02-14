import { describe, expect, it } from "bun:test";

import { dispatchCommand, type CommandHandlerContext } from "../../src/commands/handlers";
import { parseSlashCommand } from "../../src/commands/parser";
import { SLASH_COMMANDS } from "../../src/commands/registry";

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

describe("handleDaemonCommand", () => {
  it("bare /daemon emits OPEN_DAEMON_PANEL signal", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "OPEN_DAEMON_PANEL" }]);
    expect(result.value.statusMessage).toBe("Daemon panel");
  });

  it("/daemon add with missing args returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon add", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing arguments");
  });

  it("/daemon add with name only returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon add local", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing arguments");
  });

  it("/daemon add local http://localhost:7433 returns success message", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon add local http://localhost:7433", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("local");
    expect(result.value.statusMessage).toContain("created");
    expect(result.value.responseText).toContain("local");
    expect(result.value.responseText).toContain("http://localhost:7433");
  });

  it("/daemon switch remote returns success message", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon switch remote", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("remote");
    expect(result.value.responseText).toContain("remote");
  });

  it("/daemon switch with missing name returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon switch", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing profile name");
  });

  it("/daemon remove with missing name returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon remove", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Missing profile name");
  });

  it("/daemon remove staging returns success message", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon remove staging", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("staging");
    expect(result.value.statusMessage).toContain("removed");
    expect(result.value.responseText).toContain("staging");
  });

  it("/daemon status returns connection info", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon status", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Daemon status");
    expect(result.value.responseText).toContain("Daemon Status");
    expect(result.value.responseText).toContain("Connection:");
    expect(result.value.responseText).toContain("Transport:");
  });

  it("/daemon token show returns masked token info", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon token show", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Daemon token");
    expect(result.value.responseText).toContain("rm_");
    expect(result.value.responseText).toContain("****");
  });

  it("/daemon token with no action defaults to show", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon token", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Daemon token");
    expect(result.value.responseText).toContain("rm_");
  });

  it("/daemon token rotate returns success", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon token rotate", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Token rotated");
    expect(result.value.responseText).toContain("rotated successfully");
  });

  it("unknown subcommand returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon foobar", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unknown subcommand");
    expect(result.error.message).toContain("foobar");
  });

  it("/daemon alias /d works", async () => {
    const context = createTestContext();
    const result = await runCommand("/d", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "OPEN_DAEMON_PANEL" }]);
  });

  it("/daemon token with unknown action returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon token delete", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unknown token action");
  });
});
