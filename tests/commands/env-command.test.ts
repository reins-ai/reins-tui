import { describe, expect, it } from "bun:test";

import { ok, err } from "../../src/daemon/contracts";
import { handleEnvironmentCommand } from "../../src/commands/handlers/environment";
import type {
  CommandArgs,
  CommandHandlerContext,
  EnvironmentCommandContext,
} from "../../src/commands/handlers/types";
import { SLASH_COMMANDS } from "../../src/commands/registry";

function makeArgs(positional: string[] = [], flags: Record<string, string | boolean> = {}): CommandArgs {
  return { positional, flags };
}

function makeEnvironmentContext(overrides: Partial<EnvironmentCommandContext> = {}): EnvironmentCommandContext {
  return {
    activeEnvironment: "default",
    availableEnvironments: ["default", "work", "personal"],
    switchEnvironment: async (name: string) =>
      ok({ activeEnvironment: name, previousEnvironment: "default" }),
    ...overrides,
  };
}

function makeContext(env: EnvironmentCommandContext | null = null): CommandHandlerContext {
  return {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["claude-3.5-sonnet"],
      currentModel: "claude-3.5-sonnet",
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
      createConversation: () => "conv-1",
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    environment: env,
    memory: null,
    daemonClient: null,
  };
}

describe("handleEnvironmentCommand", () => {
  describe("when environment context is unavailable", () => {
    it("returns UNSUPPORTED error", async () => {
      const result = await handleEnvironmentCommand(makeArgs(), makeContext(null));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED");
        expect(result.error.message).toContain("not available");
      }
    });
  });

  describe("listing environments (no args)", () => {
    it("returns active environment in status message", async () => {
      const env = makeEnvironmentContext({ activeEnvironment: "work" });
      const result = await handleEnvironmentCommand(makeArgs(), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.statusMessage).toContain("work");
      }
    });

    it("lists all available environments in response text", async () => {
      const env = makeEnvironmentContext({
        activeEnvironment: "default",
        availableEnvironments: ["default", "work", "personal"],
      });
      const result = await handleEnvironmentCommand(makeArgs(), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responseText).toContain("default");
        expect(result.value.responseText).toContain("work");
        expect(result.value.responseText).toContain("personal");
      }
    });

    it("marks the active environment in the list", async () => {
      const env = makeEnvironmentContext({ activeEnvironment: "work" });
      const result = await handleEnvironmentCommand(makeArgs(), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responseText).toContain("work (active)");
      }
    });
  });

  describe("switching environments", () => {
    it("switches to a valid environment", async () => {
      const env = makeEnvironmentContext();
      const result = await handleEnvironmentCommand(makeArgs(["work"]), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.statusMessage).toContain("work");
        expect(result.value.responseText).toContain("Switched from");
        expect(result.value.responseText).toContain("work");
      }
    });

    it("emits ENVIRONMENT_SWITCHED signal on success", async () => {
      const env = makeEnvironmentContext();
      const result = await handleEnvironmentCommand(makeArgs(["work"]), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.signals).toBeDefined();
        const signal = result.value.signals!.find((s) => s.type === "ENVIRONMENT_SWITCHED");
        expect(signal).toBeDefined();
        expect(signal!.payload).toBe("work");
      }
    });

    it("returns NOT_FOUND for unknown environment", async () => {
      const env = makeEnvironmentContext();
      const result = await handleEnvironmentCommand(makeArgs(["nonexistent"]), makeContext(env));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
        expect(result.error.message).toContain("nonexistent");
      }
    });

    it("handles already-active environment gracefully", async () => {
      const env = makeEnvironmentContext({ activeEnvironment: "work" });
      const result = await handleEnvironmentCommand(makeArgs(["work"]), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.statusMessage).toContain("Already using");
        expect(result.value.signals).toBeUndefined();
      }
    });

    it("resolves environment names case-insensitively", async () => {
      const env = makeEnvironmentContext();
      const result = await handleEnvironmentCommand(makeArgs(["WORK"]), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.statusMessage).toContain("work");
      }
    });

    it("trims whitespace from environment name", async () => {
      const env = makeEnvironmentContext();
      const result = await handleEnvironmentCommand(makeArgs(["  work  "]), makeContext(env));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.statusMessage).toContain("work");
      }
    });

    it("propagates switch errors from the environment context", async () => {
      const env = makeEnvironmentContext({
        switchEnvironment: async () =>
          err({ code: "NOT_FOUND" as const, message: "Environment config missing" }),
      });
      const result = await handleEnvironmentCommand(makeArgs(["work"]), makeContext(env));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("config missing");
      }
    });
  });
});
