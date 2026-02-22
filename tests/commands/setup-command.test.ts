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

describe("handleSetupCommand", () => {
  it("/setup emits RELAUNCH_ONBOARDING signal", async () => {
    const context = createTestContext();
    const result = await runCommand("/setup", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    expect(result.value.statusMessage).toBe("Launching setup wizard");
  });

  it("/onboarding alias resolves to setup handler", async () => {
    const context = createTestContext();
    const result = await runCommand("/onboarding", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
  });

  it("/personality alias resolves to setup handler", async () => {
    const context = createTestContext();
    const result = await runCommand("/personality", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
  });

  it("parser resolves /setup to correct command definition", () => {
    const parsed = parseSlashCommand("/setup");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("setup");
    expect(parsed.value.command.handlerKey).toBe("SETUP");
    expect(parsed.value.command.aliases).toEqual(["personality"]);
  });

  it("parser resolves /onboarding alias to onboard definition", () => {
    const parsed = parseSlashCommand("/onboarding");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("onboard");
    expect(parsed.value.command.handlerKey).toBe("ONBOARD");
  });
});
