import { describe, expect, test } from "bun:test";

import { dispatchCommand, type CommandHandlerContext } from "../../src/commands/handlers";
import { parseSlashCommand } from "../../src/commands/parser";
import { SLASH_COMMANDS } from "../../src/commands/registry";
import { classifyInputSubmission } from "../../src/components/input-area";

interface MutableTestState {
  model: string;
  theme: string;
  compactMode: boolean;
  conversationCount: number;
  conversationId: string | null;
  messages: { role: "user" | "assistant" | "system"; content: string; createdAt: Date }[];
}

function createTestContext(overrides: Partial<MutableTestState> = {}): {
  context: CommandHandlerContext;
  state: MutableTestState;
} {
  const state: MutableTestState = {
    model: overrides.model ?? "default",
    theme: overrides.theme ?? "reins-dark",
    compactMode: overrides.compactMode ?? false,
    conversationCount: overrides.conversationCount ?? 1,
    conversationId: overrides.conversationId ?? "conversation-1",
    messages: overrides.messages ?? [],
  };

  const themes = ["reins-dark", "reins-light", "tokyonight"] as const;

  const context: CommandHandlerContext = {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default", "claude-3.5-sonnet", "gpt-4o", "gemini-pro"],
      get currentModel() {
        return state.model;
      },
      setModel(model: string) {
        state.model = model;
      },
    },
    theme: {
      get activeTheme() {
        return state.theme;
      },
      listThemes() {
        return themes;
      },
      setTheme(name: string) {
        if (!themes.includes(name as (typeof themes)[number])) {
          return false;
        }

        state.theme = name;
        return true;
      },
    },
    session: {
      get activeConversationId() {
        return state.conversationId;
      },
      get messages() {
        return state.messages;
      },
      createConversation() {
        state.conversationCount += 1;
        state.conversationId = `conversation-${state.conversationCount}`;
        state.messages = [];
        return state.conversationId;
      },
      clearConversation() {
        state.messages = [];
      },
    },
    view: {
      get compactMode() {
        return state.compactMode;
      },
      setCompactMode(compactMode: boolean) {
        state.compactMode = compactMode;
      },
    },
    memory: null,
    environment: null,
    daemonClient: null,
  };

  return { context, state };
}

async function runCommand(input: string, context: CommandHandlerContext) {
  const parsed = parseSlashCommand(input);
  if (!parsed.ok) {
    return parsed;
  }

  return dispatchCommand(parsed.value, context);
}

describe("slash command handlers", () => {
  test("/help includes all registered commands", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/help", context);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    for (const command of SLASH_COMMANDS) {
      expect(result.value.responseText).toContain(command.usage);
      expect(result.value.responseText).toContain(command.description);
    }
  });

  test("/model lists and switches models", async () => {
    const { context, state } = createTestContext();

    const listResult = await runCommand("/model", context);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.responseText).toContain("Available models:");
      expect(listResult.value.responseText).toContain("default (active)");
    }

    const switchResult = await runCommand("/model gpt-4o", context);
    expect(switchResult.ok).toBe(true);
    expect(state.model).toBe("gpt-4o");
  });

  test("/theme lists and switches themes", async () => {
    const { context, state } = createTestContext();

    const listResult = await runCommand("/theme", context);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value.responseText).toContain("Available themes:");
      expect(listResult.value.responseText).toContain("reins-dark (active)");
    }

    const switchResult = await runCommand("/theme reins-light", context);
    expect(switchResult.ok).toBe(true);
    expect(state.theme).toBe("reins-light");
  });

  test("session handlers return expected behavior", async () => {
    const { context, state } = createTestContext({
      messages: [
        { role: "user", content: "hello", createdAt: new Date("2026-02-11T10:00:00.000Z") },
        { role: "assistant", content: "hi", createdAt: new Date("2026-02-11T10:00:05.000Z") },
      ],
    });

    const exportResult = await runCommand("/export", context);
    expect(exportResult.ok).toBe(true);
    if (exportResult.ok) {
      expect(exportResult.value.responseText).toContain("# Conversation Export");
      expect(exportResult.value.responseText).toContain("## User");
      expect(exportResult.value.responseText).toContain("## Assistant");
    }

    const clearResult = await runCommand("/clear", context);
    expect(clearResult.ok).toBe(true);
    expect(state.messages).toHaveLength(0);

    const newResult = await runCommand("/new", context);
    expect(newResult.ok).toBe(true);
    expect(state.conversationId).toBe("conversation-2");
  });

  test("system handlers expose integration signals", async () => {
    const { context, state } = createTestContext();

    const compactResult = await runCommand("/compact", context);
    expect(compactResult.ok).toBe(true);
    expect(state.compactMode).toBe(true);

    const connectResult = await runCommand("/connect", context);
    expect(connectResult.ok).toBe(true);
    if (connectResult.ok) {
      expect(connectResult.value.signals).toEqual([{ type: "OPEN_CONNECT_FLOW" }]);
    }

    const settingsResult = await runCommand("/settings", context);
    expect(settingsResult.ok).toBe(true);
    if (settingsResult.ok) {
      expect(settingsResult.value.signals).toEqual([{ type: "OPEN_SETTINGS" }]);
    }

    const quitResult = await runCommand("/quit", context);
    expect(quitResult.ok).toBe(true);
    if (quitResult.ok) {
      expect(quitResult.value.signals).toEqual([{ type: "QUIT_TUI" }]);
    }
  });

  test("unknown command returns parser error", () => {
    const parsed = parseSlashCommand("/does-not-exist");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("UNKNOWN_COMMAND");
    }
  });
});

describe("input command routing", () => {
  test("classifies command and message submissions", () => {
    expect(classifyInputSubmission("/help")).toBe("command");
    expect(classifyInputSubmission("hello")).toBe("message");
    expect(classifyInputSubmission("   ")).toBe("empty");
    expect(classifyInputSubmission("   /theme")).toBe("command");
  });
});
