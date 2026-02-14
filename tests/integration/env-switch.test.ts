import { describe, expect, test } from "bun:test";

import { err, ok } from "../../src/daemon/contracts";
import { parseSlashCommand } from "../../src/commands/parser";
import { dispatchCommand, type CommandHandlerContext } from "../../src/commands/handlers";
import type { EnvironmentCommandContext } from "../../src/commands/handlers/types";
import { SLASH_COMMANDS } from "../../src/commands/registry";
import { DEFAULT_STATE, appReducer } from "../../src/store";
import { deriveStatusSegments } from "../../src/state/status-machine";
import type { StatusSegmentSources } from "../../src/store/types";

function createEnvironmentContext(
  overrides: Partial<EnvironmentCommandContext> = {},
): EnvironmentCommandContext {
  const availableEnvironments = ["default", "work", "personal"];

  return {
    activeEnvironment: "default",
    availableEnvironments,
    switchEnvironment: async (name: string) => {
      if (!availableEnvironments.includes(name)) {
        return err({
          code: "NOT_FOUND",
          message: `Environment '${name}' not found.`,
        });
      }

      return ok({ activeEnvironment: name, previousEnvironment: "default" });
    },
    ...overrides,
  };
}

function createCommandContext(environment: EnvironmentCommandContext): CommandHandlerContext {
  return {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default", "claude-3.5-sonnet"],
      currentModel: "default",
      setModel() {},
    },
    theme: {
      activeTheme: "reins-dark",
      listThemes: () => ["reins-dark"] as const,
      setTheme: () => true,
    },
    session: {
      activeConversationId: null,
      messages: [],
      createConversation: () => "conversation-1",
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    environment,
    memory: null,
    daemonClient: null,
  };
}

function createStatusSources(activeEnvironment: string | null): StatusSegmentSources {
  return {
    connectionStatus: "connected",
    currentModel: "default",
    activeEnvironment,
    lifecycleStatus: "idle",
    activeToolName: null,
    tokenCount: 0,
    cost: null,
    compactionActive: false,
    terminalWidth: 120,
  };
}

describe("integration/env-switch", () => {
  test("parses '/env work' into the environment command handler", () => {
    const parsed = parseSlashCommand("/env work");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.command.handlerKey).toBe("SWITCH_ENVIRONMENT");
    expect(parsed.value.args.positional).toEqual(["work"]);
  });

  test("returns success feedback when environment switch succeeds", async () => {
    const context = createCommandContext(createEnvironmentContext());
    const parsed = parseSlashCommand("/env work");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const result = await dispatchCommand(parsed.value, context);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.statusMessage).toContain("Switched to environment: work");
    expect(result.value.responseText).toContain("Switched from 'default' to 'work'");
  });

  test("returns error feedback for non-existent environment", async () => {
    const context = createCommandContext(
      createEnvironmentContext({
        availableEnvironments: ["default", "work"],
      }),
    );
    const parsed = parseSlashCommand("/env unknown");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const result = await dispatchCommand(parsed.value, context);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toContain("unknown");
  });

  test("lists available environments when '/env' has no args", async () => {
    const context = createCommandContext(
      createEnvironmentContext({
        activeEnvironment: "work",
        availableEnvironments: ["default", "work", "personal"],
      }),
    );
    const parsed = parseSlashCommand("/env");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const result = await dispatchCommand(parsed.value, context);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.statusMessage).toContain("Environment: work");
    expect(result.value.responseText).toContain("Available environments:");
    expect(result.value.responseText).toContain("* default");
    expect(result.value.responseText).toContain("* work (active)");
    expect(result.value.responseText).toContain("* personal");
  });

  test("updates status environment indicator after successful switch signal", async () => {
    const context = createCommandContext(createEnvironmentContext());
    const parsed = parseSlashCommand("/env work");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const commandResult = await dispatchCommand(parsed.value, context);
    expect(commandResult.ok).toBe(true);
    if (!commandResult.ok) {
      return;
    }

    let state = DEFAULT_STATE;
    for (const signal of commandResult.value.signals ?? []) {
      if (signal.type === "ENVIRONMENT_SWITCHED") {
        state = appReducer(state, { type: "SET_ENVIRONMENT", payload: signal.payload ?? null });
      }
    }

    expect(state.activeEnvironment).toBe("work");

    const segments = deriveStatusSegments(createStatusSources(state.activeEnvironment));
    const environmentSegment = segments.find((segment) => segment.id === "environment");

    expect(environmentSegment).toBeDefined();
    expect(environmentSegment?.content).toBe("◆ work");
  });
});
