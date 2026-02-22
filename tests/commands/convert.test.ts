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

describe("handleConvertCommand", () => {
  it("/convert emits OPEN_CONVERT_FLOW signal", async () => {
    const context = createTestContext();
    const result = await runCommand("/convert", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "OPEN_CONVERT_FLOW" }]);
    expect(result.value.statusMessage).toBe("Opening OpenClaw conversion wizard");
  });

  it("/convert report returns ok with statusMessage and responseText when daemon unavailable", async () => {
    const context = createTestContext();
    const result = await runCommand("/convert report", context);

    // With no daemon running, the handler falls back to getActiveDaemonUrl()
    // and the fetch fails gracefully — returning an ok Result with a
    // user-friendly message rather than throwing.
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(typeof result.value.statusMessage).toBe("string");
    expect(result.value.statusMessage.length).toBeGreaterThan(0);
    expect(typeof result.value.responseText).toBe("string");
  });

  it("/convert unknown returns err with INVALID_ARGUMENT", async () => {
    const context = createTestContext();
    const result = await runCommand("/convert unknown", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("unknown");
  });
});

describe("convert command registry", () => {
  it("/convert is registered in the command registry", () => {
    const definition = SLASH_COMMANDS.find((cmd) => cmd.name === "convert");

    expect(definition).toBeDefined();
    expect(definition!.handlerKey).toBe("CONVERT");
    expect(definition!.category).toBe("system");
  });

  it("parser resolves /convert to correct command definition", () => {
    const parsed = parseSlashCommand("/convert");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.command.name).toBe("convert");
    expect(parsed.value.command.handlerKey).toBe("CONVERT");
  });

  it("/convert usage text includes report subcommand", () => {
    const definition = SLASH_COMMANDS.find((cmd) => cmd.name === "convert");

    expect(definition).toBeDefined();
    expect(definition!.usage).toContain("report");
  });
});
