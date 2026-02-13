import { describe, expect, test } from "bun:test";

import {
  ProactiveMemorySettingsManager,
  PROACTIVE_FEATURES,
} from "@reins/core/memory/proactive";
import {
  handleMemorySettingsCommand,
  type MemorySettingsContext,
} from "../../src/commands/memory/memory-settings-command";
import {
  dispatchCommand,
  type CommandHandlerContext,
  type MemoryCommandContext,
  type MemoryEntry,
} from "../../src/commands/handlers";
import { parseSlashCommand } from "../../src/commands/parser";
import { SLASH_COMMANDS } from "../../src/commands/registry";
import { ok } from "../../src/daemon/contracts";

function createMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = new Date().toISOString();

  return {
    id: overrides.id ?? "mem-001-abc-def",
    content: overrides.content ?? "User prefers dark themes",
    type: overrides.type ?? "preference",
    layer: overrides.layer ?? "stm",
    importance: overrides.importance ?? 0.7,
    confidence: overrides.confidence ?? 1.0,
    tags: overrides.tags ?? [],
    entities: overrides.entities ?? [],
    source: overrides.source ?? { type: "explicit" },
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    accessedAt: overrides.accessedAt ?? now,
  };
}

function createSettingsContext(
  overrides: Partial<{ available: boolean; manager: ProactiveMemorySettingsManager }> = {},
): MemorySettingsContext {
  return {
    available: overrides.available ?? true,
    settingsManager: overrides.manager ?? new ProactiveMemorySettingsManager(),
  };
}

function createTestContext(
  overrides: Partial<{
    available: boolean;
    entries: MemoryEntry[];
    manager: ProactiveMemorySettingsManager;
  }> = {},
): CommandHandlerContext {
  const manager = overrides.manager ?? new ProactiveMemorySettingsManager();

  const memory: MemoryCommandContext = {
    available: overrides.available ?? true,
    settingsManager: manager,

    remember(input) {
      const entry = createMemoryEntry({
        content: input.content,
        type: input.type ?? "fact",
        tags: input.tags ?? [],
      });
      return ok(entry);
    },

    list() {
      return ok(overrides.entries ?? []);
    },

    show(id) {
      const entry = (overrides.entries ?? []).find(
        (e) => e.id === id || e.id.startsWith(id),
      );
      return ok(entry ?? null);
    },
  };

  return {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default"],
      currentModel: "default",
      setModel() {},
    },
    theme: {
      activeTheme: "reins-dark",
      listThemes() {
        return ["reins-dark"];
      },
      setTheme() {
        return true;
      },
    },
    session: {
      activeConversationId: "conv-123",
      messages: [],
      createConversation() {
        return "conv-new";
      },
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    memory,
    daemonClient: null,
  };
}

function runCommand(input: string, context: CommandHandlerContext) {
  const parsed = parseSlashCommand(input);
  if (!parsed.ok) {
    return parsed;
  }

  return dispatchCommand(parsed.value, context);
}

describe("ProactiveMemorySettingsManager", () => {
  test("returns default settings on construction", () => {
    const manager = new ProactiveMemorySettingsManager();
    const settings = manager.getSettings();

    expect(settings.enabled).toBe(true);
    expect(settings.priming.enabled).toBe(true);
    expect(settings.priming.maxTokens).toBe(2048);
    expect(settings.priming.maxMemories).toBe(5);
    expect(settings.priming.minRelevanceScore).toBe(0.3);
    expect(settings.briefing.enabled).toBe(true);
    expect(settings.briefing.scheduleHour).toBe(8);
    expect(settings.briefing.scheduleMinute).toBe(0);
    expect(settings.briefing.topicFilters).toEqual([]);
    expect(settings.briefing.maxSections).toBe(4);
    expect(settings.nudges.enabled).toBe(true);
    expect(settings.nudges.maxPerTurn).toBe(2);
    expect(settings.nudges.minRelevanceScore).toBe(0.5);
    expect(settings.nudges.cooldownMs).toBe(5 * 60 * 1000);
    expect(settings.patterns.enabled).toBe(true);
    expect(settings.patterns.minOccurrences).toBe(3);
    expect(settings.patterns.promotionThreshold).toBe(0.7);
  });

  test("getSettings returns a defensive copy", () => {
    const manager = new ProactiveMemorySettingsManager();
    const settings1 = manager.getSettings();
    settings1.enabled = false;
    settings1.priming.maxTokens = 999;

    const settings2 = manager.getSettings();
    expect(settings2.enabled).toBe(true);
    expect(settings2.priming.maxTokens).toBe(2048);
  });

  test("updateSettings applies partial priming changes", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.updateSettings({
      priming: { enabled: true, maxTokens: 4096, maxMemories: 10, minRelevanceScore: 0.5 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.priming.maxTokens).toBe(4096);
      expect(result.value.priming.maxMemories).toBe(10);
      expect(result.value.priming.minRelevanceScore).toBe(0.5);
    }
  });

  test("updateSettings applies partial nudge changes", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.updateSettings({
      nudges: { enabled: false, maxPerTurn: 5, minRelevanceScore: 0.8, cooldownMs: 10000 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nudges.enabled).toBe(false);
      expect(result.value.nudges.maxPerTurn).toBe(5);
    }
  });

  test("updateSettings rejects invalid priming values", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.updateSettings({
      priming: { enabled: true, maxTokens: -1, maxMemories: 5, minRelevanceScore: 0.3 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("maxTokens");
    }
  });

  test("updateSettings rejects invalid briefing schedule", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.updateSettings({
      briefing: {
        enabled: true,
        scheduleHour: 25,
        scheduleMinute: 0,
        topicFilters: [],
        maxSections: 4,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("scheduleHour");
    }
  });

  test("updateSettings rejects invalid pattern minOccurrences", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.updateSettings({
      patterns: { enabled: true, minOccurrences: 1, promotionThreshold: 0.7 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("minOccurrences");
    }
  });

  test("updateSettings updates master switch", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.updateSettings({ enabled: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.enabled).toBe(false);
      expect(result.value.priming.enabled).toBe(true);
    }
  });

  test("resetToDefaults restores all settings", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.updateSettings({
      enabled: false,
      priming: { enabled: false, maxTokens: 100, maxMemories: 1, minRelevanceScore: 0.9 },
    });

    const reset = manager.resetToDefaults();
    expect(reset.enabled).toBe(true);
    expect(reset.priming.enabled).toBe(true);
    expect(reset.priming.maxTokens).toBe(2048);
  });

  test("enableFeature enables a specific feature", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.disableFeature("nudges");
    expect(manager.getSettings().nudges.enabled).toBe(false);

    const result = manager.enableFeature("nudges");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nudges.enabled).toBe(true);
    }
  });

  test("disableFeature disables a specific feature", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.disableFeature("briefing");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.briefing.enabled).toBe(false);
      expect(result.value.priming.enabled).toBe(true);
      expect(result.value.nudges.enabled).toBe(true);
    }
  });

  test("enableFeature rejects invalid feature name", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.enableFeature("invalid");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid feature");
      expect(result.error.message).toContain("invalid");
    }
  });

  test("disableFeature rejects invalid feature name", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.disableFeature("nonexistent");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid feature");
    }
  });

  test("getFeatureEnabled returns false when master switch is off", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.updateSettings({ enabled: false });

    const result = manager.getFeatureEnabled("priming");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(false);
    }
  });

  test("getFeatureEnabled returns feature state when master is on", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.disableFeature("patterns");

    const primingResult = manager.getFeatureEnabled("priming");
    expect(primingResult.ok).toBe(true);
    if (primingResult.ok) {
      expect(primingResult.value).toBe(true);
    }

    const patternsResult = manager.getFeatureEnabled("patterns");
    expect(patternsResult.ok).toBe(true);
    if (patternsResult.ok) {
      expect(patternsResult.value).toBe(false);
    }
  });

  test("setFeatureSetting updates a specific key", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("priming", "maxTokens", 1024);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.priming.maxTokens).toBe(1024);
    }
  });

  test("setFeatureSetting rejects invalid feature", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("invalid", "key", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid feature");
    }
  });

  test("setFeatureSetting rejects invalid key", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("priming", "nonexistent", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid setting");
    }
  });

  test("setFeatureSetting rejects wrong type for boolean", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("priming", "enabled", "yes");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("boolean");
    }
  });

  test("setFeatureSetting rejects wrong type for number", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("priming", "maxTokens", "abc");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("number");
    }
  });

  test("setFeatureSetting validates after applying", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("patterns", "minOccurrences", 0);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("minOccurrences");
    }
  });

  test("setFeatureSetting handles array values", () => {
    const manager = new ProactiveMemorySettingsManager();
    const result = manager.setFeatureSetting("briefing", "topicFilters", ["work", "health"]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.briefing.topicFilters).toEqual(["work", "health"]);
    }
  });
});

describe("ProactiveMemorySettingsManager serialization", () => {
  test("serialize produces valid JSON", () => {
    const manager = new ProactiveMemorySettingsManager();
    const json = manager.serialize();
    const parsed = JSON.parse(json);

    expect(parsed.enabled).toBe(true);
    expect(parsed.priming.maxTokens).toBe(2048);
  });

  test("deserialize restores settings from JSON", () => {
    const original = new ProactiveMemorySettingsManager();
    original.updateSettings({
      enabled: false,
      nudges: { enabled: false, maxPerTurn: 10, minRelevanceScore: 0.9, cooldownMs: 1000 },
    });

    const json = original.serialize();
    const result = ProactiveMemorySettingsManager.deserialize(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const restored = result.value.getSettings();
      expect(restored.enabled).toBe(false);
      expect(restored.nudges.enabled).toBe(false);
      expect(restored.nudges.maxPerTurn).toBe(10);
      expect(restored.nudges.minRelevanceScore).toBe(0.9);
    }
  });

  test("serialize/deserialize round-trip preserves all settings", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.updateSettings({
      priming: { enabled: false, maxTokens: 512, maxMemories: 3, minRelevanceScore: 0.1 },
      briefing: {
        enabled: true,
        scheduleHour: 9,
        scheduleMinute: 30,
        topicFilters: ["work", "health"],
        maxSections: 2,
      },
      nudges: { enabled: true, maxPerTurn: 1, minRelevanceScore: 0.7, cooldownMs: 60000 },
      patterns: { enabled: false, minOccurrences: 5, promotionThreshold: 0.9 },
    });

    const json = manager.serialize();
    const result = ProactiveMemorySettingsManager.deserialize(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const restored = result.value.getSettings();
      const original = manager.getSettings();

      expect(restored).toEqual(original);
    }
  });

  test("deserialize rejects invalid JSON", () => {
    const result = ProactiveMemorySettingsManager.deserialize("not json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Failed to parse");
    }
  });

  test("deserialize rejects invalid settings values", () => {
    const invalid = JSON.stringify({
      enabled: true,
      priming: { enabled: true, maxTokens: -1, maxMemories: 5, minRelevanceScore: 0.3 },
      briefing: { enabled: true, scheduleHour: 8, scheduleMinute: 0, topicFilters: [], maxSections: 4 },
      nudges: { enabled: true, maxPerTurn: 2, minRelevanceScore: 0.5, cooldownMs: 300000 },
      patterns: { enabled: true, minOccurrences: 3, promotionThreshold: 0.7 },
    });

    const result = ProactiveMemorySettingsManager.deserialize(invalid);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid settings");
    }
  });
});

describe("/memory settings command via dispatch", () => {
  test("shows current settings", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("Proactive Memory Settings");
      expect(result.value.responseText).toContain("Master Switch:");
      expect(result.value.responseText).toContain("Priming");
      expect(result.value.responseText).toContain("Briefing");
      expect(result.value.responseText).toContain("Nudges");
      expect(result.value.responseText).toContain("Patterns");
      expect(result.value.statusMessage).toContain("Proactive memory settings");
    }
  });

  test("enables a feature", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.disableFeature("nudges");
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings enable nudges", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("nudges");
      expect(result.value.responseText).toContain("enabled");
    }

    expect(manager.getSettings().nudges.enabled).toBe(true);
  });

  test("disables a feature", () => {
    const manager = new ProactiveMemorySettingsManager();
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings disable briefing", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("briefing");
      expect(result.value.responseText).toContain("disabled");
    }

    expect(manager.getSettings().briefing.enabled).toBe(false);
  });

  test("enables master switch when no feature specified", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.updateSettings({ enabled: false });
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings enable", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("enabled");
    }

    expect(manager.getSettings().enabled).toBe(true);
  });

  test("disables master switch when no feature specified", () => {
    const manager = new ProactiveMemorySettingsManager();
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings disable", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("disabled");
    }

    expect(manager.getSettings().enabled).toBe(false);
  });

  test("sets a specific setting value", () => {
    const manager = new ProactiveMemorySettingsManager();
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings set priming maxTokens 4096", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("priming.maxTokens");
      expect(result.value.responseText).toContain("4096");
    }

    expect(manager.getSettings().priming.maxTokens).toBe(4096);
  });

  test("sets a boolean setting value", () => {
    const manager = new ProactiveMemorySettingsManager();
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings set nudges enabled false", context);

    expect(result.ok).toBe(true);
    expect(manager.getSettings().nudges.enabled).toBe(false);
  });

  test("resets settings to defaults", () => {
    const manager = new ProactiveMemorySettingsManager();
    manager.updateSettings({ enabled: false });
    manager.disableFeature("priming");
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings reset", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.statusMessage).toContain("reset");
      expect(result.value.responseText).toContain("Proactive Memory Settings");
    }

    expect(manager.getSettings().enabled).toBe(true);
    expect(manager.getSettings().priming.enabled).toBe(true);
  });

  test("returns error for invalid feature name on enable", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings enable invalid", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Invalid feature");
    }
  });

  test("returns error for invalid feature name on disable", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings disable nonexistent", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Invalid feature");
    }
  });

  test("returns error for missing feature in set", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings set", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing feature name");
    }
  });

  test("returns error for missing key in set", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings set priming", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing setting key");
    }
  });

  test("returns error for missing value in set", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings set priming maxTokens", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing value");
    }
  });

  test("returns error for invalid setting key", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings set priming nonexistent 42", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Invalid setting");
    }
  });

  test("returns error for invalid setting value type", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings set priming maxTokens notanumber", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("finite number");
    }
  });

  test("returns error for unknown settings action", () => {
    const context = createTestContext();
    const result = runCommand("/memory settings unknown", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unknown settings action");
    }
  });

  test("returns error when memory service unavailable", () => {
    const context = createTestContext({ available: false });
    const result = runCommand("/memory settings", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });

  test("works with /mem alias", () => {
    const context = createTestContext();
    const result = runCommand("/mem settings", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("Proactive Memory Settings");
    }
  });

  test("validation rejects out-of-range relevance score", () => {
    const manager = new ProactiveMemorySettingsManager();
    const context = createTestContext({ manager });
    const result = runCommand("/memory settings set nudges minRelevanceScore 1.5", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("minRelevanceScore");
    }
  });
});

describe("handleMemorySettingsCommand direct invocation", () => {
  test("returns error when not available", () => {
    const settingsContext = createSettingsContext({ available: false });
    const args = { positional: ["settings"], flags: {} };
    const result = handleMemorySettingsCommand(args, settingsContext);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });

  test("shows settings with empty positional after 'settings'", () => {
    const settingsContext = createSettingsContext();
    const args = { positional: ["settings"], flags: {} };
    const result = handleMemorySettingsCommand(args, settingsContext);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("Proactive Memory Settings");
    }
  });

  test("set command updates and confirms", () => {
    const manager = new ProactiveMemorySettingsManager();
    const settingsContext = createSettingsContext({ manager });
    const args = {
      positional: ["settings", "set", "briefing", "scheduleHour", "10"],
      flags: {},
    };
    const result = handleMemorySettingsCommand(args, settingsContext);

    expect(result.ok).toBe(true);
    expect(manager.getSettings().briefing.scheduleHour).toBe(10);
  });

  test("boolean parsing accepts on/off/1/0", () => {
    const manager = new ProactiveMemorySettingsManager();
    const settingsContext = createSettingsContext({ manager });

    const offResult = handleMemorySettingsCommand(
      { positional: ["settings", "set", "priming", "enabled", "off"], flags: {} },
      settingsContext,
    );
    expect(offResult.ok).toBe(true);
    expect(manager.getSettings().priming.enabled).toBe(false);

    const onResult = handleMemorySettingsCommand(
      { positional: ["settings", "set", "priming", "enabled", "on"], flags: {} },
      settingsContext,
    );
    expect(onResult.ok).toBe(true);
    expect(manager.getSettings().priming.enabled).toBe(true);

    const zeroResult = handleMemorySettingsCommand(
      { positional: ["settings", "set", "priming", "enabled", "0"], flags: {} },
      settingsContext,
    );
    expect(zeroResult.ok).toBe(true);
    expect(manager.getSettings().priming.enabled).toBe(false);

    const oneResult = handleMemorySettingsCommand(
      { positional: ["settings", "set", "priming", "enabled", "1"], flags: {} },
      settingsContext,
    );
    expect(oneResult.ok).toBe(true);
    expect(manager.getSettings().priming.enabled).toBe(true);
  });
});

describe("existing memory commands still work", () => {
  test("/remember still works", () => {
    const context = createTestContext();
    const result = runCommand("/remember User likes TypeScript", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.statusMessage).toContain("Memory saved");
    }
  });

  test("/memory list still works", () => {
    const entries = [createMemoryEntry({ id: "mem-001" })];
    const context = createTestContext({ entries });
    const result = runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001");
    }
  });

  test("/memory show still works", () => {
    const entries = [createMemoryEntry({ id: "mem-001-abc-def" })];
    const context = createTestContext({ entries });
    const result = runCommand("/memory show mem-001", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001-abc-def");
    }
  });

  test("unknown subcommand error message includes settings", () => {
    const context = createTestContext();
    const result = runCommand("/memory delete mem-001", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("settings");
    }
  });
});
