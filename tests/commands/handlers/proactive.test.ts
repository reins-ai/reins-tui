import { describe, expect, it } from "bun:test";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  handleBriefingCommand,
  handleNudgesWithDeps,
  createBriefingHandler,
} from "../../../src/commands/handlers/proactive";
import { dispatchCommand } from "../../../src/commands/handlers";
import { parseSlashCommand } from "../../../src/commands/parser";
import { SLASH_COMMANDS, PALETTE_ACTIONS } from "../../../src/commands/registry";
import type { CommandHandlerContext } from "../../../src/commands/handlers/types";

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

// --- /briefing command ---

describe("handleBriefingCommand", () => {
  it("/briefing returns informational message when no generator is injected", async () => {
    const context = createTestContext();
    const result = await runCommand("/briefing", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toContain("unavailable");
    expect(result.value.responseText).toBeDefined();
    expect(result.value.responseText!.toLowerCase()).toContain("daemon");
  });

  it("is recognized as a valid slash command", () => {
    const parsed = parseSlashCommand("/briefing");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("briefing");
    expect(parsed.value.command.handlerKey).toBe("BRIEFING");
  });
});

describe("createBriefingHandler", () => {
  it("delivers briefing text on success", async () => {
    const briefingText = "Good morning! Here is your briefing:\n- 3 open threads\n- 1 important item";
    const handler = createBriefingHandler({
      generateBriefing: async () => ({ ok: true, value: briefingText }),
    });

    const result = await handler(
      { positional: [], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusMessage).toBe("Briefing delivered");
    expect(result.value.responseText).toBe(briefingText);
  });

  it("returns error when briefing generation fails", async () => {
    const handler = createBriefingHandler({
      generateBriefing: async () => ({
        ok: false,
        error: { message: "Memory service unavailable" },
      }),
    });

    const result = await handler(
      { positional: [], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Memory service unavailable");
  });

  it("delivers empty briefing message when nothing to report", async () => {
    const handler = createBriefingHandler({
      generateBriefing: async () => ({
        ok: true,
        value: "Good morning! Nothing to report today.",
      }),
    });

    const result = await handler(
      { positional: [], flags: {} },
      createTestContext(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.responseText).toContain("Nothing to report");
  });
});

// --- /nudges command ---

describe("handleNudgesCommand", () => {
  it("/nudges is recognized as a valid slash command", () => {
    const parsed = parseSlashCommand("/nudges");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("nudges");
    expect(parsed.value.command.handlerKey).toBe("NUDGES");
  });

  it("/nudges on|off subcommands are parsed as positional args", () => {
    const parsedOn = parseSlashCommand("/nudges on");
    expect(parsedOn.ok).toBe(true);
    if (parsedOn.ok) {
      expect(parsedOn.value.args.positional[0]).toBe("on");
    }

    const parsedOff = parseSlashCommand("/nudges off");
    expect(parsedOff.ok).toBe(true);
    if (parsedOff.ok) {
      expect(parsedOff.value.args.positional[0]).toBe("off");
    }
  });
});

describe("handleNudgesWithDeps", () => {
  it("/nudges on persists enabled state to config", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      const result = await handleNudgesWithDeps(["on"], { configPath });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toBe("Nudges enabled");
      expect(result.value.responseText).toBeDefined();
      expect(result.value.responseText!.toLowerCase()).toContain("enabled");

      // Verify persisted to file
      const file = Bun.file(configPath);
      expect(await file.exists()).toBe(true);
      const config = await file.json() as Record<string, unknown>;
      expect(config.nudgesEnabled).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/nudges off persists disabled state to config", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      const result = await handleNudgesWithDeps(["off"], { configPath });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toBe("Nudges disabled");
      expect(result.value.responseText).toBeDefined();
      expect(result.value.responseText!.toLowerCase()).toContain("disabled");

      // Verify persisted to file
      const file = Bun.file(configPath);
      expect(await file.exists()).toBe(true);
      const config = await file.json() as Record<string, unknown>;
      expect(config.nudgesEnabled).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/nudges off then /nudges on toggles correctly", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      // Disable
      const offResult = await handleNudgesWithDeps(["off"], { configPath });
      expect(offResult.ok).toBe(true);

      let config = await Bun.file(configPath).json() as Record<string, unknown>;
      expect(config.nudgesEnabled).toBe(false);

      // Re-enable
      const onResult = await handleNudgesWithDeps(["on"], { configPath });
      expect(onResult.ok).toBe(true);

      config = await Bun.file(configPath).json() as Record<string, unknown>;
      expect(config.nudgesEnabled).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/nudges with no subcommand shows current state (default: on)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      const result = await handleNudgesWithDeps([], { configPath });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toContain("on");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/nudges with no subcommand shows off when disabled", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      // First disable
      await handleNudgesWithDeps(["off"], { configPath });

      // Then check status
      const result = await handleNudgesWithDeps([], { configPath });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toContain("off");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/nudges invalid-subcommand returns error", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      const result = await handleNudgesWithDeps(["maybe"], { configPath });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unknown subcommand");
      expect(result.error.message).toContain("maybe");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves existing config fields when writing nudgesEnabled", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      // Write initial config with other fields
      await Bun.write(
        configPath,
        JSON.stringify({
          name: "James",
          provider: { mode: "byok" },
          setupComplete: true,
        }),
      );

      // Toggle nudges off
      const result = await handleNudgesWithDeps(["off"], { configPath });
      expect(result.ok).toBe(true);

      // Verify other fields preserved
      const config = await Bun.file(configPath).json() as Record<string, unknown>;
      expect(config.name).toBe("James");
      expect(config.nudgesEnabled).toBe(false);
      expect(config.setupComplete).toBe(true);
      expect((config.provider as Record<string, unknown>).mode).toBe("byok");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates config file and parent directory if they don't exist", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const nestedConfigPath = join(tempDir, "nested", "dir", "config.json");

    try {
      const result = await handleNudgesWithDeps(["off"], { configPath: nestedConfigPath });

      expect(result.ok).toBe(true);

      const file = Bun.file(nestedConfigPath);
      expect(await file.exists()).toBe(true);
      const config = await file.json() as Record<string, unknown>;
      expect(config.nudgesEnabled).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("handles case-insensitive subcommands", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-nudge-test-"));
    const configPath = join(tempDir, "config.json");

    try {
      const result = await handleNudgesWithDeps(["OFF"], { configPath });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toBe("Nudges disabled");

      const config = await Bun.file(configPath).json() as Record<string, unknown>;
      expect(config.nudgesEnabled).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

// --- Command dispatch integration ---

describe("/briefing dispatch integration", () => {
  it("/briefing dispatches through command system", async () => {
    const context = createTestContext();
    const result = await runCommand("/briefing", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Default handler returns informational message
    expect(result.value.statusMessage).toBeDefined();
  });
});

describe("/nudges dispatch integration", () => {
  it("/nudges dispatches through command system", async () => {
    const context = createTestContext();
    const result = await runCommand("/nudges", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Shows current state
    expect(result.value.statusMessage).toBeDefined();
  });
});

// --- Palette entries ---

describe("palette entry: Trigger Briefing", () => {
  it("palette action exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:trigger-briefing");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Trigger Briefing");
    expect(action!.actionKey).toBe("trigger-briefing");
    expect(action!.category).toBe("actions");
  });

  it("is searchable by 'briefing'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:trigger-briefing");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("briefing");
  });

  it("is searchable by 'morning'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:trigger-briefing");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("morning");
  });

  it("is searchable by 'summary'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:trigger-briefing");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("summary");
  });
});

describe("palette entry: Enable Nudges", () => {
  it("palette action exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:nudges-on");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Enable Nudges");
    expect(action!.actionKey).toBe("nudges-on");
    expect(action!.category).toBe("settings");
  });

  it("is searchable by 'nudges'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:nudges-on");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("nudges");
  });
});

describe("palette entry: Disable Nudges", () => {
  it("palette action exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:nudges-off");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Disable Nudges");
    expect(action!.actionKey).toBe("nudges-off");
    expect(action!.category).toBe("settings");
  });

  it("is searchable by 'nudges'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:nudges-off");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("nudges");
  });

  it("is searchable by 'disable'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:nudges-off");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("disable");
  });
});
