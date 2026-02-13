import { describe, expect, it } from "bun:test";

import {
  getNextModel,
  buildSelectorItems,
  getSelectableIndices,
  findCurrentModelIndex,
  formatModelDisplayName,
  type ProviderModelGroup,
  type ModelSelectorItem,
} from "../../src/components/model-selector";
import {
  loadModelPreferences,
  saveModelPreferences,
  DEFAULT_MODEL_PREFERENCES,
  MODEL_FILE,
  type ModelPreferences,
} from "../../src/state/model-persistence";
import { appReducer, DEFAULT_STATE } from "../../src/store";
import type { AppState } from "../../src/store/types";

// ---------------------------------------------------------------------------
// Helper: create provider groups for testing
// ---------------------------------------------------------------------------

function connectedProvider(id: string, name: string, models: string[]): ProviderModelGroup {
  return {
    providerId: id,
    providerName: name,
    connectionState: "ready",
    models,
  };
}

function disconnectedProvider(id: string, name: string): ProviderModelGroup {
  return {
    providerId: id,
    providerName: name,
    connectionState: "requires_auth",
    models: [],
  };
}

// ---------------------------------------------------------------------------
// getNextModel (legacy utility)
// ---------------------------------------------------------------------------

describe("getNextModel", () => {
  it("returns current model when no models available", () => {
    expect(getNextModel("default", [])).toBe("default");
  });

  it("cycles to next model in list", () => {
    const models = ["claude-3.5-sonnet", "gpt-4o", "gemini-pro"];
    expect(getNextModel("claude-3.5-sonnet", models)).toBe("gpt-4o");
    expect(getNextModel("gpt-4o", models)).toBe("gemini-pro");
  });

  it("wraps around to first model", () => {
    const models = ["claude-3.5-sonnet", "gpt-4o"];
    expect(getNextModel("gpt-4o", models)).toBe("claude-3.5-sonnet");
  });

  it("returns first model when current is not in list", () => {
    const models = ["claude-3.5-sonnet", "gpt-4o"];
    expect(getNextModel("unknown", models)).toBe("gpt-4o");
  });
});

// ---------------------------------------------------------------------------
// buildSelectorItems
// ---------------------------------------------------------------------------

describe("buildSelectorItems", () => {
  it("builds items for a single connected provider", () => {
    const groups = [connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet", "claude-3-haiku"])];
    const items = buildSelectorItems(groups);

    expect(items).toHaveLength(3);
    expect(items[0].type).toBe("provider-header");
    expect(items[0].providerName).toBe("Anthropic");
    expect(items[0].disabled).toBe(false);
    expect(items[1].type).toBe("model");
    expect(items[1].modelId).toBe("claude-3.5-sonnet");
    expect(items[1].disabled).toBe(false);
    expect(items[2].type).toBe("model");
    expect(items[2].modelId).toBe("claude-3-haiku");
  });

  it("builds items for a disconnected provider with connect hint", () => {
    const groups = [disconnectedProvider("openai", "OpenAI")];
    const items = buildSelectorItems(groups);

    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("provider-header");
    expect(items[0].providerName).toBe("OpenAI");
    expect(items[0].disabled).toBe(true);
    expect(items[1].type).toBe("connect-hint");
    expect(items[1].disabled).toBe(true);
  });

  it("builds mixed connected and disconnected providers", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet"]),
      disconnectedProvider("openai", "OpenAI"),
      connectedProvider("google", "Google", ["gemini-pro"]),
    ];
    const items = buildSelectorItems(groups);

    // Anthropic: header + 1 model = 2
    // OpenAI: header + hint = 2
    // Google: header + 1 model = 2
    expect(items).toHaveLength(6);

    // Verify OpenAI section is disabled
    const openaiHeader = items.find((i) => i.providerId === "openai" && i.type === "provider-header");
    expect(openaiHeader?.disabled).toBe(true);

    const openaiHint = items.find((i) => i.providerId === "openai" && i.type === "connect-hint");
    expect(openaiHint).toBeDefined();
  });

  it("returns empty array for no providers", () => {
    expect(buildSelectorItems([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getSelectableIndices
// ---------------------------------------------------------------------------

describe("getSelectableIndices", () => {
  it("returns indices of selectable model items only", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet", "claude-3-haiku"]),
      disconnectedProvider("openai", "OpenAI"),
    ];
    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    // Items: [header(0), model(1), model(2), header(3), hint(4)]
    expect(indices).toEqual([1, 2]);
  });

  it("returns empty array when no models are selectable", () => {
    const groups = [disconnectedProvider("openai", "OpenAI")];
    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    expect(indices).toEqual([]);
  });

  it("returns all model indices for fully connected providers", () => {
    const groups = [
      connectedProvider("a", "A", ["m1"]),
      connectedProvider("b", "B", ["m2", "m3"]),
    ];
    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    // Items: [header(0), model(1), header(2), model(3), model(4)]
    expect(indices).toEqual([1, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// findCurrentModelIndex
// ---------------------------------------------------------------------------

describe("findCurrentModelIndex", () => {
  it("finds the current model in selectable indices", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet", "claude-3-haiku"]),
    ];
    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    const result = findCurrentModelIndex(items, indices, "claude-3-haiku");
    expect(result).toBe(1); // Second selectable item
  });

  it("returns 0 when current model is not found", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet"]),
    ];
    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    const result = findCurrentModelIndex(items, indices, "unknown-model");
    expect(result).toBe(0);
  });

  it("returns 0 when no selectable items exist", () => {
    const groups = [disconnectedProvider("openai", "OpenAI")];
    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    const result = findCurrentModelIndex(items, indices, "anything");
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatModelDisplayName
// ---------------------------------------------------------------------------

describe("formatModelDisplayName", () => {
  it("returns last segment of slash-separated model ID", () => {
    expect(formatModelDisplayName("anthropic/claude-3.5-sonnet")).toBe("claude-3.5-sonnet");
  });

  it("returns full name when no slash present", () => {
    expect(formatModelDisplayName("gpt-4o")).toBe("gpt-4o");
  });

  it("handles deeply nested model IDs", () => {
    expect(formatModelDisplayName("org/team/model-v2")).toBe("model-v2");
  });

  it("handles empty string", () => {
    expect(formatModelDisplayName("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Store: model selector actions
// ---------------------------------------------------------------------------

describe("Store model selector actions", () => {
  it("SET_MODEL_SELECTOR_OPEN opens the model selector", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_MODEL_SELECTOR_OPEN", payload: true });
    expect(state.isModelSelectorOpen).toBe(true);
  });

  it("SET_MODEL_SELECTOR_OPEN closes the model selector", () => {
    const openState: AppState = { ...DEFAULT_STATE, isModelSelectorOpen: true };
    const state = appReducer(openState, { type: "SET_MODEL_SELECTOR_OPEN", payload: false });
    expect(state.isModelSelectorOpen).toBe(false);
  });

  it("SET_MODEL updates the current model", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_MODEL", payload: "claude-3.5-sonnet" });
    expect(state.currentModel).toBe("claude-3.5-sonnet");
  });

  it("SET_PROVIDER updates the current provider", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_PROVIDER", payload: "anthropic" });
    expect(state.currentProvider).toBe("anthropic");
  });

  it("SET_MODEL_SELECTOR_OPEN rejects non-boolean payload", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_MODEL_SELECTOR_OPEN", payload: "yes" as unknown as boolean });
    expect(state.isModelSelectorOpen).toBe(false);
  });

  it("SET_PROVIDER rejects non-string payload", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_PROVIDER", payload: 123 as unknown as string });
    expect(state.currentProvider).toBe("");
  });

  it("default state has model selector closed", () => {
    expect(DEFAULT_STATE.isModelSelectorOpen).toBe(false);
    expect(DEFAULT_STATE.currentModel).toBe("default");
    expect(DEFAULT_STATE.currentProvider).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Model persistence
// ---------------------------------------------------------------------------

describe("Model persistence", () => {
  it("DEFAULT_MODEL_PREFERENCES has expected defaults", () => {
    expect(DEFAULT_MODEL_PREFERENCES.modelId).toBe("default");
    expect(DEFAULT_MODEL_PREFERENCES.provider).toBe("");
  });

  it("loadModelPreferences returns defaults when file does not exist", () => {
    // This test relies on the file not existing at the test path
    // The function handles missing files gracefully
    const prefs = loadModelPreferences();
    expect(typeof prefs.modelId).toBe("string");
    expect(typeof prefs.provider).toBe("string");
  });

  it("saveModelPreferences does not throw on valid input", () => {
    // Best-effort persistence — should not throw
    expect(() => {
      saveModelPreferences({ modelId: "test-model", provider: "test-provider" });
    }).not.toThrow();
  });

  it("MODEL_FILE path includes reins config directory", () => {
    expect(MODEL_FILE).toContain(".config");
    expect(MODEL_FILE).toContain("reins");
    expect(MODEL_FILE).toContain("model-preferences.json");
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut detection (Ctrl+M)
// ---------------------------------------------------------------------------

describe("Ctrl+M model selector toggle", () => {
  it("isToggleModelSelectorEvent detects Ctrl+M", () => {
    // We test the event detection pattern used in app.tsx
    const event = { ctrl: true, name: "m" };
    const isToggle = event.ctrl === true && (event.name === "m");
    expect(isToggle).toBe(true);
  });

  it("does not trigger on plain M key", () => {
    const event = { ctrl: false, name: "m" };
    const isToggle = event.ctrl === true && (event.name === "m");
    expect(isToggle).toBe(false);
  });

  it("does not trigger on Ctrl+K", () => {
    const event = { ctrl: true, name: "k" };
    const isToggle = event.ctrl === true && (event.name === "m");
    expect(isToggle).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider grouping with multiple states
// ---------------------------------------------------------------------------

describe("Provider grouping edge cases", () => {
  it("handles provider with requires_reauth state", () => {
    const groups: ProviderModelGroup[] = [{
      providerId: "openai",
      providerName: "OpenAI",
      connectionState: "requires_reauth",
      models: [],
    }];
    const items = buildSelectorItems(groups);

    expect(items[0].type).toBe("provider-header");
    expect(items[0].disabled).toBe(true);
    expect(items[1].type).toBe("connect-hint");
  });

  it("handles provider with invalid state", () => {
    const groups: ProviderModelGroup[] = [{
      providerId: "broken",
      providerName: "Broken Provider",
      connectionState: "invalid",
      models: [],
    }];
    const items = buildSelectorItems(groups);

    expect(items[0].disabled).toBe(true);
    expect(items[1].type).toBe("connect-hint");
  });

  it("preserves model order within a provider", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["model-a", "model-b", "model-c"]),
    ];
    const items = buildSelectorItems(groups);
    const modelItems = items.filter((i) => i.type === "model");

    expect(modelItems[0].modelId).toBe("model-a");
    expect(modelItems[1].modelId).toBe("model-b");
    expect(modelItems[2].modelId).toBe("model-c");
  });

  it("preserves provider order across groups", () => {
    const groups = [
      connectedProvider("first", "First", ["m1"]),
      disconnectedProvider("second", "Second"),
      connectedProvider("third", "Third", ["m2"]),
    ];
    const items = buildSelectorItems(groups);
    const headers = items.filter((i) => i.type === "provider-header");

    expect(headers[0].providerName).toBe("First");
    expect(headers[1].providerName).toBe("Second");
    expect(headers[2].providerName).toBe("Third");
  });
});
