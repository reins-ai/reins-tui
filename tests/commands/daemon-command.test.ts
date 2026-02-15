import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const createdDirectories: string[] = [];
const originalHome = process.env.HOME;
const originalDataRoot = process.env.REINS_DATA_ROOT;

async function createTempHomeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "reins-daemon-command-"));
  createdDirectories.push(directory);
  return directory;
}

describe("handleDaemonCommand", () => {
  beforeEach(async () => {
    const tempHome = await createTempHomeDirectory();
    process.env.HOME = tempHome;
    process.env.REINS_DATA_ROOT = join(tempHome, ".config", "reins");
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    process.env.REINS_DATA_ROOT = originalDataRoot;

    while (createdDirectories.length > 0) {
      const directory = createdDirectories.pop();
      if (!directory) continue;
      await rm(directory, { recursive: true, force: true });
    }
  });

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

  it("/daemon add uses canonical transport probe for stored profile", async () => {
    const context = createTestContext();
    const result = await runCommand("/daemon add tail https://node.ts.net", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const statusResult = await runCommand("/daemon status", context);
    expect(statusResult.ok).toBe(true);
    if (!statusResult.ok) return;

    expect(statusResult.value.responseText).toContain("Transport: tailscale");
  });

  it("/daemon switch remote returns success message", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(JSON.stringify({ healthy: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    try {
      const remoteUrl = `http://127.0.0.1:${server.port}`;
      const context = createTestContext();
      const addResult = await runCommand(`/daemon add remote ${remoteUrl}`, context);
      expect(addResult.ok).toBe(true);

      const result = await runCommand("/daemon switch remote", context);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toContain("remote");
      expect(result.value.responseText).toContain("remote");
    } finally {
      server.stop(true);
    }
  });

  it("/daemon switch keeps current default when target is unreachable", async () => {
    const context = createTestContext();
    const addLocalResult = await runCommand("/daemon add local http://localhost:7433", context);
    expect(addLocalResult.ok).toBe(true);

    const addBadResult = await runCommand("/daemon add bad http://127.0.0.1:1", context);
    expect(addBadResult.ok).toBe(true);

    const switchResult = await runCommand("/daemon switch bad", context);
    expect(switchResult.ok).toBe(false);
    if (switchResult.ok) return;
    expect(switchResult.error.message).toContain("Default profile unchanged");

    const statusResult = await runCommand("/daemon status", context);
    expect(statusResult.ok).toBe(true);
    if (!statusResult.ok) return;
    expect(statusResult.value.responseText).toContain("Address: http://localhost:7433");
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
    const addDefaultResult = await runCommand("/daemon add local http://localhost:7433", context);
    expect(addDefaultResult.ok).toBe(true);

    const addResult = await runCommand("/daemon add staging http://staging.example:7433", context);
    expect(addResult.ok).toBe(true);

    const result = await runCommand("/daemon remove staging", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("staging");
    expect(result.value.statusMessage).toContain("removed");
    expect(result.value.responseText).toContain("staging");
  });

  it("/daemon remove default profile promotes a fallback profile", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(JSON.stringify({ healthy: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    try {
      const remoteUrl = `http://127.0.0.1:${server.port}`;
      const context = createTestContext();

      const addLocalResult = await runCommand("/daemon add local http://localhost:7433", context);
      expect(addLocalResult.ok).toBe(true);

      const addRemoteResult = await runCommand(`/daemon add remote ${remoteUrl}`, context);
      expect(addRemoteResult.ok).toBe(true);

      const switchRemoteResult = await runCommand("/daemon switch remote", context);
      expect(switchRemoteResult.ok).toBe(true);

      const removeDefaultResult = await runCommand("/daemon remove remote", context);
      expect(removeDefaultResult.ok).toBe(true);

      const statusResult = await runCommand("/daemon status", context);
      expect(statusResult.ok).toBe(true);
      if (!statusResult.ok) return;

      expect(statusResult.value.responseText).toContain("Address: http://localhost:7433");
      expect(statusResult.value.responseText).toContain("Profiles: local*");
    } finally {
      server.stop(true);
    }
  });

  it("/daemon status returns connection info", async () => {
    const context = createTestContext();
    const addResult = await runCommand("/daemon add local http://localhost:7433", context);
    expect(addResult.ok).toBe(true);

    const result = await runCommand("/daemon status", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Daemon status");
    expect(result.value.responseText).toContain("Daemon Status");
    expect(result.value.responseText).toContain("Connection:");
    expect(result.value.responseText).toContain("Transport:");
    expect(result.value.responseText).toContain("Profiles:");
  });

  it("/daemon token show returns masked token info", async () => {
    const context = createTestContext();
    const addResult = await runCommand("/daemon add local http://localhost:7433", context);
    expect(addResult.ok).toBe(true);

    const result = await runCommand("/daemon token show", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Daemon token");
    expect(result.value.responseText).toContain("Profile:");
    expect(result.value.responseText).toContain("Token:");
  });

  it("/daemon token with no action defaults to show", async () => {
    const context = createTestContext();
    const addResult = await runCommand("/daemon add local http://localhost:7433", context);
    expect(addResult.ok).toBe(true);

    const result = await runCommand("/daemon token", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Daemon token");
    expect(result.value.responseText).toContain("Token:");
  });

  it("/daemon token rotate returns success", async () => {
    const context = createTestContext();
    const addResult = await runCommand("/daemon add local http://localhost:7433", context);
    expect(addResult.ok).toBe(true);

    const result = await runCommand("/daemon token rotate", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Token rotated");
    expect(result.value.responseText).toContain("rotated");
    expect(result.value.responseText).toContain("rm_");
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
