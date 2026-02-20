import { describe, expect, it } from "bun:test";

import { OnboardingCheckpointService } from "@reins/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleSetupCommand, resetOnboarding } from "../../../src/commands/handlers/setup";
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

describe("handleSetupCommand", () => {
  it("bare /setup emits RELAUNCH_ONBOARDING signal without reset", async () => {
    const context = createTestContext();
    const result = await runCommand("/setup", context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    expect(result.value.statusMessage).toBe("Launching setup wizard");
  });

  it("/setup reset-onboarding resets checkpoint and emits RELAUNCH_ONBOARDING", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-test-"));
    try {
      const checkpoint = new OnboardingCheckpointService({ dataRoot: tempDir });

      // Create a checkpoint file first
      await checkpoint.save({
        version: 1,
        setupComplete: true,
        mode: "quickstart",
        currentStep: null,
        completedSteps: [
          { step: "welcome", completedAt: new Date().toISOString(), mode: "quickstart" },
        ],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      // Verify checkpoint exists
      const loadBefore = await checkpoint.load();
      expect(loadBefore.ok).toBe(true);
      if (loadBefore.ok) {
        expect(loadBefore.value).not.toBeNull();
        expect(loadBefore.value?.setupComplete).toBe(true);
      }

      // Reset via the exported function
      const result = await resetOnboarding({ checkpointService: checkpoint });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toContain("reset");
      expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);

      // Verify checkpoint file was deleted
      const loadAfter = await checkpoint.load();
      expect(loadAfter.ok).toBe(true);
      if (loadAfter.ok) {
        expect(loadAfter.value).toBeNull();
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/setup reset-onboarding succeeds even when no checkpoint exists", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-test-"));
    try {
      const checkpoint = new OnboardingCheckpointService({ dataRoot: tempDir });

      const result = await resetOnboarding({ checkpointService: checkpoint });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.statusMessage).toContain("reset");
      expect(result.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("/setup unknown-subcommand returns error", async () => {
    const context = createTestContext();
    const result = await runCommand("/setup unknown-subcommand", context);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_ARGUMENT");
    expect(result.error.message).toContain("Unknown subcommand");
  });

  it("aliases /onboarding and /personality still work for bare setup", async () => {
    const context = createTestContext();

    const onboardingResult = await runCommand("/onboarding", context);
    expect(onboardingResult.ok).toBe(true);
    if (onboardingResult.ok) {
      expect(onboardingResult.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    }

    const personalityResult = await runCommand("/personality", context);
    expect(personalityResult.ok).toBe(true);
    if (personalityResult.ok) {
      expect(personalityResult.value.signals).toEqual([{ type: "RELAUNCH_ONBOARDING" }]);
    }
  });

  it("/setup reset-onboarding does not affect BYOK provider keys", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "reins-test-"));
    try {
      const checkpoint = new OnboardingCheckpointService({ dataRoot: tempDir });

      // Simulate a BYOK key file existing alongside onboarding.json
      const byokPath = join(tempDir, "byok-keys.json");
      await Bun.write(byokPath, JSON.stringify({ anthropic: "sk-ant-test-key" }));

      // Create and then reset onboarding checkpoint
      await checkpoint.save({
        version: 1,
        setupComplete: true,
        mode: "quickstart",
        currentStep: null,
        completedSteps: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const result = await resetOnboarding({ checkpointService: checkpoint });
      expect(result.ok).toBe(true);

      // Verify BYOK keys file is untouched
      const byokFile = Bun.file(byokPath);
      expect(await byokFile.exists()).toBe(true);
      const byokContent = await byokFile.json();
      expect(byokContent.anthropic).toBe("sk-ant-test-key");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("palette entry: Re-run setup", () => {
  it("palette action 'Re-run setup' exists", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.label).toBe("Re-run setup");
    expect(action!.actionKey).toBe("rerun-setup");
    expect(action!.category).toBe("settings");
  });

  it("palette action is searchable by 'setup'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("setup");
  });

  it("palette action is searchable by 'onboarding'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("onboarding");
  });

  it("palette action is searchable by 'reset'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("reset");
  });

  it("palette action is searchable by 'rerun'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("rerun");
  });

  it("palette action is searchable by 'wizard'", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.keywords).toContain("wizard");
  });

  it("palette action description mentions reset", () => {
    const action = PALETTE_ACTIONS.find((a) => a.id === "action:rerun-setup");
    expect(action).toBeDefined();
    expect(action!.description.toLowerCase()).toContain("reset");
  });
});
