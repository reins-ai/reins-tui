import { describe, expect, test } from "bun:test";

import {
  dispatchCommand,
  type CommandHandlerContext,
  type MemoryCommandContext,
  type MemoryEntry,
  type MemoryType,
} from "../../src/commands/handlers";
import { parseSlashCommand } from "../../src/commands/parser";
import { SLASH_COMMANDS } from "../../src/commands/registry";
import { ok, err } from "../../src/daemon/contracts";
import {
  setupReducer,
  INITIAL_SETUP_STATE,
  EMBEDDING_PROVIDERS,
  type SetupState,
  type SetupAction,
  type SetupStep,
} from "../../src/components/setup/embedding-setup-wizard";
import type { MemoryCapabilitiesResponse } from "../../src/daemon/memory-client";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "mem-001-abc-def",
    content: overrides.content ?? "Test memory",
    type: overrides.type ?? "fact",
    layer: overrides.layer ?? "stm",
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 1.0,
    tags: overrides.tags ?? [],
    entities: overrides.entities ?? [],
    source: overrides.source ?? { type: "explicit" },
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    accessedAt: overrides.accessedAt ?? now,
  };
}

function createMockMemoryContext(
  overrides: Partial<{ available: boolean }> = {},
): MemoryCommandContext {
  return {
    available: overrides.available ?? true,
    async remember(input) {
      return ok(createMemoryEntry({ content: input.content, type: input.type ?? "fact" }));
    },
    async list() {
      return ok([]);
    },
    async show(id) {
      return ok(id === "mem-001" ? createMemoryEntry() : null);
    },
  };
}

function createTestContext(
  memoryOverrides: Partial<{ available: boolean }> = {},
): CommandHandlerContext {
  const memory = createMockMemoryContext(memoryOverrides);

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

async function runCommand(input: string, context: CommandHandlerContext) {
  const parsed = parseSlashCommand(input);
  if (!parsed.ok) return parsed;
  return dispatchCommand(parsed.value, context);
}

function makeCapabilities(overrides: Partial<MemoryCapabilitiesResponse> = {}): MemoryCapabilitiesResponse {
  return {
    ready: overrides.ready ?? true,
    embeddingConfigured: overrides.embeddingConfigured ?? false,
    setupRequired: overrides.setupRequired ?? true,
    configPath: overrides.configPath ?? "/tmp/test/embedding-config.json",
    features: overrides.features ?? {
      crud: { enabled: true },
      semanticSearch: { enabled: false, reason: "Embedding provider setup is required." },
      consolidation: { enabled: false, reason: "Embedding provider setup is required." },
    },
    embedding: overrides.embedding,
  };
}

// ---------------------------------------------------------------------------
// /memory setup command handler tests
// ---------------------------------------------------------------------------

describe("/memory setup command", () => {
  test("returns OPEN_EMBEDDING_SETUP signal", async () => {
    const context = createTestContext();
    const result = await runCommand("/memory setup", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.statusMessage).toContain("Opening embedding setup wizard");
      expect(result.value.signals).toBeDefined();
      expect(result.value.signals!.length).toBe(1);
      expect(result.value.signals![0].type).toBe("OPEN_EMBEDDING_SETUP");
    }
  });

  test("works when memory service is available", async () => {
    const context = createTestContext({ available: true });
    const result = await runCommand("/memory setup", context);

    expect(result.ok).toBe(true);
  });

  test("returns error when memory service is unavailable", async () => {
    const context = createTestContext({ available: false });
    const result = await runCommand("/memory setup", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });

  test("returns error when memory context is null", async () => {
    const context = createTestContext();
    const contextWithoutMemory = { ...context, memory: null };
    const result = await runCommand("/memory setup", contextWithoutMemory);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });

  test("setup appears in unknown subcommand error message", async () => {
    const context = createTestContext();
    const result = await runCommand("/memory invalid", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("setup");
    }
  });
});

// ---------------------------------------------------------------------------
// Setup wizard state machine tests
// ---------------------------------------------------------------------------

describe("setupReducer", () => {
  describe("initial loading", () => {
    test("starts in loading step", () => {
      expect(INITIAL_SETUP_STATE.step).toBe("loading");
    });

    test("transitions to provider-select when setup is required", () => {
      const capabilities = makeCapabilities({ setupRequired: true, embeddingConfigured: false });
      const next = setupReducer(INITIAL_SETUP_STATE, {
        type: "CAPABILITIES_LOADED",
        capabilities,
      });

      expect(next.step).toBe("provider-select");
      expect(next.existingConfig).toBe(capabilities);
    });

    test("transitions to already-configured when embedding is set up", () => {
      const capabilities = makeCapabilities({
        setupRequired: false,
        embeddingConfigured: true,
        embedding: { provider: "ollama", model: "nomic-embed-text" },
      });
      const next = setupReducer(INITIAL_SETUP_STATE, {
        type: "CAPABILITIES_LOADED",
        capabilities,
      });

      expect(next.step).toBe("already-configured");
      expect(next.existingConfig?.embedding?.provider).toBe("ollama");
    });

    test("transitions to error on capabilities failure", () => {
      const next = setupReducer(INITIAL_SETUP_STATE, {
        type: "CAPABILITIES_FAILED",
        error: "Daemon not reachable",
      });

      expect(next.step).toBe("error");
      expect(next.error).toBe("Daemon not reachable");
    });
  });

  describe("provider selection", () => {
    const providerSelectState: SetupState = {
      ...INITIAL_SETUP_STATE,
      step: "provider-select",
      existingConfig: makeCapabilities(),
    };

    test("navigates down through providers", () => {
      const next = setupReducer(providerSelectState, { type: "NAVIGATE_DOWN" });
      expect(next.selectedProviderIndex).toBe(1);
    });

    test("wraps around when navigating past last provider", () => {
      const atLast = { ...providerSelectState, selectedProviderIndex: EMBEDDING_PROVIDERS.length - 1 };
      const next = setupReducer(atLast, { type: "NAVIGATE_DOWN" });
      expect(next.selectedProviderIndex).toBe(0);
    });

    test("navigates up through providers", () => {
      const atSecond = { ...providerSelectState, selectedProviderIndex: 1 };
      const next = setupReducer(atSecond, { type: "NAVIGATE_UP" });
      expect(next.selectedProviderIndex).toBe(0);
    });

    test("wraps around when navigating before first provider", () => {
      const next = setupReducer(providerSelectState, { type: "NAVIGATE_UP" });
      expect(next.selectedProviderIndex).toBe(EMBEDDING_PROVIDERS.length - 1);
    });

    test("selects provider and transitions to model-entry", () => {
      const next = setupReducer(providerSelectState, { type: "SELECT_PROVIDER" });

      expect(next.step).toBe("model-entry");
      expect(next.provider).toBe(EMBEDDING_PROVIDERS[0]);
      expect(next.modelInput).toBe(EMBEDDING_PROVIDERS[0].defaultModel);
    });

    test("ignores navigation when not in provider-select step", () => {
      const loadingState = { ...INITIAL_SETUP_STATE, step: "loading" as SetupStep };
      const next = setupReducer(loadingState, { type: "NAVIGATE_DOWN" });
      expect(next).toBe(loadingState);
    });
  });

  describe("model entry", () => {
    const modelEntryState: SetupState = {
      ...INITIAL_SETUP_STATE,
      step: "model-entry",
      provider: EMBEDDING_PROVIDERS[0],
      modelInput: EMBEDDING_PROVIDERS[0].defaultModel,
    };

    test("updates model input", () => {
      const next = setupReducer(modelEntryState, { type: "SET_MODEL", value: "custom-model" });
      expect(next.modelInput).toBe("custom-model");
    });

    test("submits model and transitions to saving", () => {
      const next = setupReducer(modelEntryState, { type: "SUBMIT_MODEL" });
      expect(next.step).toBe("saving");
    });

    test("does not submit empty model", () => {
      const emptyModel = { ...modelEntryState, modelInput: "" };
      const next = setupReducer(emptyModel, { type: "SUBMIT_MODEL" });
      expect(next.step).toBe("model-entry");
    });

    test("does not submit whitespace-only model", () => {
      const whitespace = { ...modelEntryState, modelInput: "   " };
      const next = setupReducer(whitespace, { type: "SUBMIT_MODEL" });
      expect(next.step).toBe("model-entry");
    });

    test("go back returns to provider-select", () => {
      const next = setupReducer(modelEntryState, { type: "GO_BACK" });
      expect(next.step).toBe("provider-select");
      expect(next.provider).toBeNull();
      expect(next.modelInput).toBe("");
    });
  });

  describe("save outcomes", () => {
    const savingState: SetupState = {
      ...INITIAL_SETUP_STATE,
      step: "saving",
      provider: EMBEDDING_PROVIDERS[0],
      modelInput: "nomic-embed-text",
    };

    test("transitions to success on save", () => {
      const next = setupReducer(savingState, { type: "SAVE_SUCCESS" });
      expect(next.step).toBe("success");
      expect(next.error).toBeNull();
    });

    test("transitions to error on save failure", () => {
      const next = setupReducer(savingState, {
        type: "SAVE_ERROR",
        error: "Permission denied",
      });
      expect(next.step).toBe("error");
      expect(next.error).toBe("Permission denied");
    });
  });

  describe("already-configured flow", () => {
    const configuredState: SetupState = {
      ...INITIAL_SETUP_STATE,
      step: "already-configured",
      existingConfig: makeCapabilities({
        embeddingConfigured: true,
        embedding: { provider: "openai", model: "text-embedding-3-small" },
      }),
    };

    test("reconfigure transitions to provider-select", () => {
      const next = setupReducer(configuredState, { type: "RECONFIGURE" });
      expect(next.step).toBe("provider-select");
      expect(next.selectedProviderIndex).toBe(0);
      expect(next.provider).toBeNull();
      expect(next.modelInput).toBe("");
    });
  });

  describe("error recovery", () => {
    const errorState: SetupState = {
      ...INITIAL_SETUP_STATE,
      step: "error",
      error: "Something went wrong",
    };

    test("go back from error returns to provider-select", () => {
      const next = setupReducer(errorState, { type: "GO_BACK" });
      expect(next.step).toBe("provider-select");
      expect(next.error).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Embedding provider catalog tests
// ---------------------------------------------------------------------------

describe("embedding provider catalog", () => {
  test("has at least two providers", () => {
    expect(EMBEDDING_PROVIDERS.length).toBeGreaterThanOrEqual(2);
  });

  test("ollama provider does not require API key", () => {
    const ollama = EMBEDDING_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama!.requiresApiKey).toBe(false);
  });

  test("openai provider requires API key", () => {
    const openai = EMBEDDING_PROVIDERS.find((p) => p.id === "openai");
    expect(openai).toBeDefined();
    expect(openai!.requiresApiKey).toBe(true);
  });

  test("all providers have default models", () => {
    for (const provider of EMBEDDING_PROVIDERS) {
      expect(provider.defaultModel.length).toBeGreaterThan(0);
    }
  });

  test("all providers have descriptions", () => {
    for (const provider of EMBEDDING_PROVIDERS) {
      expect(provider.description.length).toBeGreaterThan(0);
    }
  });
});
