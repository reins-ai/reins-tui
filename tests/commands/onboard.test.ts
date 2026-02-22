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

describe("handleOnboardCommand", () => {
  it("/onboard emits RELAUNCH_ONBOARDING signal", async () => {
    const context = createTestContext();
    const result = await runCommand("/onboard", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    expect(result.value.statusMessage).toBe("Launching setup wizard");
  });

  it("/onboard persona emits OPEN_PERSONA_EDITOR signal", async () => {
    const context = createTestContext();
    const result = await runCommand("/onboard persona", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "OPEN_PERSONA_EDITOR" }]);
    expect(result.value.statusMessage).toBe("Opening persona editor");
  });

  it("/onboard reset-onboarding returns a Result without throwing", async () => {
    const context = createTestContext();
    const result = await runCommand("/onboard reset-onboarding", context);

    // The handler calls OnboardingCheckpointService.reset() which touches the
    // filesystem. In a test environment this may succeed or fail gracefully —
    // either way the handler must return a well-formed Result, never throw.
    expect(typeof result.ok).toBe("boolean");

    if (result.ok) {
      expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
      expect(result.value.statusMessage).toContain("reset");
    } else {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
    }
  });

  it("/onboard unknown returns err with INVALID_ARGUMENT", async () => {
    const context = createTestContext();
    const result = await runCommand("/onboard unknown", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("unknown");
  });
});

describe("handleOnboardCommand — aliases", () => {
  it("/setup emits RELAUNCH_ONBOARDING signal (alias)", async () => {
    const context = createTestContext();
    const result = await runCommand("/setup", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    expect(result.value.statusMessage).toBe("Launching setup wizard");
  });

  it("/onboarding emits RELAUNCH_ONBOARDING signal (alias for /onboard)", async () => {
    const context = createTestContext();
    const result = await runCommand("/onboarding", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
  });

  it("/setup persona emits OPEN_PERSONA_EDITOR signal (alias subcommand forwarding)", async () => {
    const context = createTestContext();
    const result = await runCommand("/setup persona", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "OPEN_PERSONA_EDITOR" }]);
    expect(result.value.statusMessage).toBe("Opening persona editor");
  });

  it("/setup unknown returns err with INVALID_ARGUMENT", async () => {
    const context = createTestContext();
    const result = await runCommand("/setup unknown", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
  });
});

describe("onboard command registry", () => {
  it("parser resolves /onboard to correct command definition", () => {
    const parsed = parseSlashCommand("/onboard");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("onboard");
    expect(parsed.value.command.handlerKey).toBe("ONBOARD");
    expect(parsed.value.command.aliases).toEqual(["onboarding"]);
  });

  it("parser resolves /onboarding alias to onboard definition", () => {
    const parsed = parseSlashCommand("/onboarding");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("onboard");
    expect(parsed.value.command.handlerKey).toBe("ONBOARD");
  });

  it("/setup is registered as a separate command aliasing onboard behavior", () => {
    const parsed = parseSlashCommand("/setup");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("setup");
    expect(parsed.value.command.handlerKey).toBe("SETUP");
  });
});
