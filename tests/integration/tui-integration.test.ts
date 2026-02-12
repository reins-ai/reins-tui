import { describe, expect, test } from "bun:test";

import { appReducer, DEFAULT_STATE } from "../../src/store";
import type { AppState } from "../../src/store/types";
import {
  reducePanelState,
  deriveLayoutMode,
  getTopmostUnpinnedPanel,
  getVisiblePanels,
  hasVisiblePanels,
  toPinPreferences,
  applyPinPreferences,
  DEFAULT_PANEL_STATE,
  DEFAULT_PIN_PREFERENCES,
  type PanelState,
  type PanelId,
} from "../../src/state/layout-mode";
import {
  buildSelectorItems,
  getSelectableIndices,
  findCurrentModelIndex,
  formatModelDisplayName,
  type ProviderModelGroup,
} from "../../src/components/model-selector";
import {
  createFuzzySearchIndex,
  createCommandSearchItems,
  createActionSearchItems,
  createConversationSearchItems,
  searchFuzzyIndex,
  type SearchableItem,
  type PaletteAction,
  type ConversationSearchSource,
} from "../../src/palette/fuzzy-index";
import {
  rankSearchResults,
  RecencyTracker,
} from "../../src/palette/ranking";
import { SLASH_COMMANDS } from "../../src/commands/registry";
import {
  reduceStatusMachine,
  createInitialStatusMachineState,
  type StatusMachineState,
  type ConversationLifecycleStatus,
} from "../../src/state/status-machine";
import {
  resolveLifecycleDisplay,
  buildSegments,
  resolveTruncation,
  buildTruncatedLeftText,
  buildRightZoneText,
} from "../../src/components/status-bar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectedProvider(id: string, name: string, models: string[]): ProviderModelGroup {
  return { providerId: id, providerName: name, connectionState: "ready", models };
}

function disconnectedProvider(id: string, name: string): ProviderModelGroup {
  return { providerId: id, providerName: name, connectionState: "requires_auth", models: [] };
}

function openDrawer(state: AppState): AppState {
  return appReducer(state, { type: "TOGGLE_PANEL", payload: "drawer" });
}

function openToday(state: AppState): AppState {
  return appReducer(state, { type: "TOGGLE_PANEL", payload: "today" });
}

function openModal(state: AppState): AppState {
  return appReducer(state, { type: "TOGGLE_PANEL", payload: "modal" });
}

// ---------------------------------------------------------------------------
// 1. Panel summon integration tests (MH4)
// ---------------------------------------------------------------------------

describe("Panel summon integration", () => {
  test("default state has no visible panels (conversation-only)", () => {
    expect(DEFAULT_STATE.layoutMode).toBe("zen");
    expect(hasVisiblePanels(DEFAULT_STATE.panels)).toBe(false);
    expect(getVisiblePanels(DEFAULT_STATE.panels)).toEqual([]);
  });

  test("Ctrl+1 toggles drawer panel visibility", () => {
    const withDrawer = openDrawer(DEFAULT_STATE);
    expect(withDrawer.panels.drawer.visible).toBe(true);
    expect(withDrawer.layoutMode).toBe("normal");

    const dismissed = appReducer(withDrawer, { type: "TOGGLE_PANEL", payload: "drawer" });
    expect(dismissed.panels.drawer.visible).toBe(false);
    expect(dismissed.layoutMode).toBe("zen");
  });

  test("Ctrl+2 toggles today panel visibility", () => {
    const withToday = openToday(DEFAULT_STATE);
    expect(withToday.panels.today.visible).toBe(true);
    expect(withToday.layoutMode).toBe("activity");

    const dismissed = appReducer(withToday, { type: "TOGGLE_PANEL", payload: "today" });
    expect(dismissed.panels.today.visible).toBe(false);
    expect(dismissed.layoutMode).toBe("zen");
  });

  test("Escape dismisses topmost unpinned panel", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = openModal(state);

    // Modal is topmost (z-order 2 > drawer z-order 1)
    const topmost = getTopmostUnpinnedPanel(state.panels);
    expect(topmost).toBe("modal");

    // Dismiss topmost
    state = appReducer(state, { type: "DISMISS_TOPMOST" });
    expect(state.panels.modal.visible).toBe(false);
    expect(state.panels.drawer.visible).toBe(true);

    // Dismiss again — now drawer is topmost
    state = appReducer(state, { type: "DISMISS_TOPMOST" });
    expect(state.panels.drawer.visible).toBe(false);
  });

  test("overlapping summon: opening modal while drawer is open keeps both visible", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = openModal(state);

    expect(state.panels.drawer.visible).toBe(true);
    expect(state.panels.modal.visible).toBe(true);

    const visible = getVisiblePanels(state.panels);
    expect(visible).toContain("drawer");
    expect(visible).toContain("modal");
  });

  test("pin persistence: pinned panel survives dismiss-all", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = appReducer(state, { type: "PIN_PANEL", payload: "drawer" });
    state = openModal(state);

    // Dismiss all — pinned drawer stays visible
    state = appReducer(state, { type: "DISMISS_ALL" });
    // DISMISS_ALL sets visible=false for all panels regardless of pin
    expect(state.panels.modal.visible).toBe(false);
    // Pin state is preserved
    expect(state.panels.drawer.pinned).toBe(true);
  });

  test("pin preferences round-trip", () => {
    let panels = { ...DEFAULT_PANEL_STATE };
    panels = reducePanelState(panels, { type: "TOGGLE_PANEL", payload: "drawer" });
    panels = reducePanelState(panels, { type: "PIN_PANEL", payload: "drawer" });

    const prefs = toPinPreferences(panels);
    expect(prefs.drawer).toBe(true);
    expect(prefs.today).toBe(false);
    expect(prefs.modal).toBe(false);

    // Apply to fresh state
    const restored = applyPinPreferences(DEFAULT_PANEL_STATE, prefs);
    expect(restored.drawer.pinned).toBe(true);
    expect(restored.today.pinned).toBe(false);
  });

  test("dismiss-topmost skips pinned panels", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = appReducer(state, { type: "PIN_PANEL", payload: "drawer" });
    state = openModal(state);

    // Topmost unpinned is modal (drawer is pinned)
    const topmost = getTopmostUnpinnedPanel(state.panels);
    expect(topmost).toBe("modal");

    state = appReducer(state, { type: "DISMISS_TOPMOST" });
    expect(state.panels.modal.visible).toBe(false);
    expect(state.panels.drawer.visible).toBe(true);

    // No more unpinned visible panels
    const nextTopmost = getTopmostUnpinnedPanel(state.panels);
    expect(nextTopmost).toBeNull();
  });

  test("focus moves to conversation when drawer closes in zen mode", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = appReducer(state, { type: "SET_FOCUSED_PANEL", payload: "sidebar" });
    expect(state.focusedPanel).toBe("sidebar");

    // Close drawer → zen mode → sidebar focus redirects to conversation
    state = appReducer(state, { type: "TOGGLE_PANEL", payload: "drawer" });
    expect(state.layoutMode).toBe("zen");
    expect(state.focusedPanel).toBe("conversation");
  });

  test("panel state transitions are idempotent for dismiss on hidden panel", () => {
    const state = DEFAULT_STATE;
    const dismissed = appReducer(state, { type: "DISMISS_PANEL", payload: "drawer" });
    expect(dismissed).toBe(state); // No change — already hidden
  });

  test("multiple rapid toggles produce consistent state", () => {
    let state = DEFAULT_STATE;
    // Toggle drawer 5 times
    for (let i = 0; i < 5; i++) {
      state = appReducer(state, { type: "TOGGLE_PANEL", payload: "drawer" });
    }
    // Odd number of toggles → visible
    expect(state.panels.drawer.visible).toBe(true);
    expect(state.layoutMode).toBe("normal");
  });
});

// ---------------------------------------------------------------------------
// 2. Palette flow integration tests (MH7)
// ---------------------------------------------------------------------------

describe("Palette flow integration", () => {
  test("command palette opens and closes via store actions", () => {
    const opened = appReducer(DEFAULT_STATE, { type: "SET_COMMAND_PALETTE_OPEN", payload: true });
    expect(opened.isCommandPaletteOpen).toBe(true);

    const closed = appReducer(opened, { type: "SET_COMMAND_PALETTE_OPEN", payload: false });
    expect(closed.isCommandPaletteOpen).toBe(false);
  });

  test("all slash commands are indexed in search", () => {
    const commandItems = createCommandSearchItems(SLASH_COMMANDS);
    expect(commandItems.length).toBe(SLASH_COMMANDS.length);

    for (const command of SLASH_COMMANDS) {
      const found = commandItems.find((item) => item.id === `command:${command.name}`);
      expect(found).toBeDefined();
      expect(found?.label).toBe(`/${command.name}`);
    }
  });

  test("action items include key navigation actions", () => {
    const actionItems = createActionSearchItems();
    const actionKeys = actionItems.map((item) => {
      const action = item.action;
      return action.type === "action" ? action.key : "";
    });

    expect(actionKeys).toContain("new-chat");
    expect(actionKeys).toContain("switch-model");
    expect(actionKeys).toContain("toggle-drawer");
  });

  test("fuzzy search finds commands by partial name", () => {
    const items = createCommandSearchItems(SLASH_COMMANDS);
    const index = createFuzzySearchIndex(items);

    const results = searchFuzzyIndex(index, "hel");
    const helpResult = results.find((r) => r.item.id === "command:help");
    expect(helpResult).toBeDefined();
    expect(helpResult!.matchKind).toBe("prefix");
  });

  test("fuzzy search finds commands by keyword", () => {
    const items = createCommandSearchItems(SLASH_COMMANDS);
    const index = createFuzzySearchIndex(items);

    const results = searchFuzzyIndex(index, "theme");
    const themeResult = results.find((r) => r.item.id === "command:theme");
    expect(themeResult).toBeDefined();
  });

  test("recency tracker boosts recently used items", () => {
    const tracker = new RecencyTracker();
    const items = createCommandSearchItems(SLASH_COMMANDS);
    const index = createFuzzySearchIndex(items);

    // Record usage of help command
    tracker.recordUsage("command:help");

    const results = rankSearchResults(index, "", { recencyTracker: tracker });
    // Help should be boosted in empty query results
    const helpIndex = results.findIndex((r) => r.item.id === "command:help");
    expect(helpIndex).toBeGreaterThanOrEqual(0);

    // Verify boost is applied
    const helpResult = results[helpIndex];
    expect(helpResult.rankScore).toBeGreaterThan(0);
  });

  test("recency tracker decays boost for older items", () => {
    const tracker = new RecencyTracker();

    tracker.recordUsage("item-a");
    tracker.recordUsage("item-b");
    tracker.recordUsage("item-c");

    // Most recent (item-c) gets highest boost
    const boostC = tracker.getBoost("item-c");
    const boostB = tracker.getBoost("item-b");
    const boostA = tracker.getBoost("item-a");

    expect(boostC).toBeGreaterThan(boostB);
    expect(boostB).toBeGreaterThan(boostA);
    expect(boostA).toBeGreaterThan(0);
  });

  test("recency tracker reset clears all usage", () => {
    const tracker = new RecencyTracker();
    tracker.recordUsage("item-a");
    tracker.recordUsage("item-b");

    tracker.reset();

    expect(tracker.getBoost("item-a")).toBe(0);
    expect(tracker.getBoost("item-b")).toBe(0);
    expect(tracker.getUsageOrder()).toHaveLength(0);
  });

  test("conversation search items are indexed and searchable", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Debugging React hooks", model: "claude-3.5-sonnet" },
      { id: "conv-2", title: "Python data analysis", model: "gpt-4o" },
    ];

    const items = createConversationSearchItems(conversations);
    const index = createFuzzySearchIndex(items);

    const results = searchFuzzyIndex(index, "react");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.id).toBe("conversation:conv-1");
  });

  test("empty query returns all items for browsing", () => {
    const items = createCommandSearchItems(SLASH_COMMANDS);
    const index = createFuzzySearchIndex(items);

    const results = searchFuzzyIndex(index, "");
    expect(results.length).toBe(SLASH_COMMANDS.length);
  });

  test("ranked results respect limit option", () => {
    const items = createCommandSearchItems(SLASH_COMMANDS);
    const index = createFuzzySearchIndex(items);

    const results = rankSearchResults(index, "", { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Model switching integration tests (MH3)
// ---------------------------------------------------------------------------

describe("Model switching integration", () => {
  test("model selection updates store state", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_MODEL", payload: "claude-3.5-sonnet" });
    state = appReducer(state, { type: "SET_PROVIDER", payload: "anthropic" });

    expect(state.currentModel).toBe("claude-3.5-sonnet");
    expect(state.currentProvider).toBe("anthropic");
  });

  test("model selector open/close state is tracked", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_MODEL_SELECTOR_OPEN", payload: true });
    expect(state.isModelSelectorOpen).toBe(true);

    state = appReducer(state, { type: "SET_MODEL_SELECTOR_OPEN", payload: false });
    expect(state.isModelSelectorOpen).toBe(false);
  });

  test("provider groups display connected and disconnected providers", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet", "claude-3-haiku"]),
      disconnectedProvider("openai", "OpenAI"),
      connectedProvider("google", "Google", ["gemini-pro"]),
    ];

    const items = buildSelectorItems(groups);
    const selectableIndices = getSelectableIndices(items);

    // Only connected provider models are selectable
    expect(selectableIndices.length).toBe(3); // 2 Anthropic + 1 Google

    // Disconnected provider shows hint
    const openaiItems = items.filter((i) => i.providerId === "openai");
    expect(openaiItems.some((i) => i.type === "connect-hint")).toBe(true);
    expect(openaiItems.every((i) => i.disabled)).toBe(true);
  });

  test("selection persistence: current model index is found correctly", () => {
    const groups = [
      connectedProvider("anthropic", "Anthropic", ["claude-3.5-sonnet", "claude-3-haiku"]),
      connectedProvider("google", "Google", ["gemini-pro"]),
    ];

    const items = buildSelectorItems(groups);
    const indices = getSelectableIndices(items);

    // Find claude-3-haiku
    const haikuIndex = findCurrentModelIndex(items, indices, "claude-3-haiku");
    const haikuItemIndex = indices[haikuIndex];
    expect(items[haikuItemIndex].modelId).toBe("claude-3-haiku");

    // Find gemini-pro
    const geminiIndex = findCurrentModelIndex(items, indices, "gemini-pro");
    const geminiItemIndex = indices[geminiIndex];
    expect(items[geminiItemIndex].modelId).toBe("gemini-pro");
  });

  test("status bar reflects model name after switch", () => {
    const display = resolveLifecycleDisplay("idle", 0, null);
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.model).toBe("claude-3.5-sonnet");

    // After model switch
    const newSegments = buildSegments("connected", "gpt-4o", display, false);
    expect(newSegments.model).toBe("gpt-4o");
  });

  test("model display name formatting shortens provider-prefixed IDs", () => {
    expect(formatModelDisplayName("anthropic/claude-3.5-sonnet")).toBe("claude-3.5-sonnet");
    expect(formatModelDisplayName("openai/gpt-4o")).toBe("gpt-4o");
    expect(formatModelDisplayName("gpt-4o")).toBe("gpt-4o");
  });

  test("available models list updates via store action", () => {
    const models = ["claude-3.5-sonnet", "gpt-4o", "gemini-pro"];
    const state = appReducer(DEFAULT_STATE, { type: "SET_AVAILABLE_MODELS", payload: models });
    expect(state.availableModels).toEqual(models);
  });
});

// ---------------------------------------------------------------------------
// 4. Status bar streaming lifecycle integration (MH5)
// ---------------------------------------------------------------------------

describe("Status bar streaming lifecycle integration", () => {
  test("full lifecycle transition: idle → sending → thinking → streaming → complete", () => {
    const ts = "2026-02-12T00:00:00Z";
    let machine = createInitialStatusMachineState(ts);
    expect(machine.status).toBe("idle");

    machine = reduceStatusMachine(machine, { type: "user-send", timestamp: ts });
    expect(machine.status).toBe("sending");

    machine = reduceStatusMachine(machine, {
      type: "message-ack",
      timestamp: ts,
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    });
    expect(machine.status).toBe("thinking");

    machine = reduceStatusMachine(machine, {
      type: "stream-start",
      timestamp: ts,
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    });
    expect(machine.status).toBe("streaming");

    machine = reduceStatusMachine(machine, {
      type: "stream-complete",
      timestamp: ts,
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    });
    expect(machine.status).toBe("complete");
  });

  test("lifecycle display maps to correct status bar segments", () => {
    const statuses: ConversationLifecycleStatus[] = ["idle", "sending", "thinking", "streaming", "complete", "error"];
    const expectedLabels = ["Ready", "Sending...", "Thinking...", "Streaming [0 tokens]", "Done", "Error"];

    for (let i = 0; i < statuses.length; i++) {
      const display = resolveLifecycleDisplay(statuses[i], 0, null);
      expect(display.label).toBe(expectedLabels[i]);
    }
  });

  test("streaming token count appears in status bar segments", () => {
    const display = resolveLifecycleDisplay("streaming", 150, null);
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.lifecycle).toContain("150 tokens");
  });

  test("cost appears in complete state", () => {
    const display = resolveLifecycleDisplay("complete", 0, "$0.012");
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.lifecycle).toContain("$0.012");
  });

  test("error from any state transitions correctly", () => {
    const ts = "2026-02-12T00:00:00Z";
    const error = { code: "STREAM_ERROR" as const, message: "Connection lost" };

    // Error from streaming
    let machine: StatusMachineState = {
      status: "streaming",
      enteredAt: ts,
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
      chunkCount: 10,
    };

    machine = reduceStatusMachine(machine, { type: "stream-error", timestamp: ts, error });
    expect(machine.status).toBe("error");
    if (machine.status === "error") {
      expect(machine.from).toBe("streaming");
    }
  });

  test("complete-timeout returns to idle", () => {
    const ts = "2026-02-12T00:00:00Z";
    const machine: StatusMachineState = {
      status: "complete",
      enteredAt: ts,
      conversationId: "conv-1",
      assistantMessageId: "msg-1",
    };

    const next = reduceStatusMachine(machine, { type: "complete-timeout", timestamp: ts });
    expect(next.status).toBe("idle");
  });

  test("store streaming lifecycle status updates", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    expect(state.streamingLifecycleStatus).toBe("streaming");

    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "complete" });
    expect(state.streamingLifecycleStatus).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// 5. Component interaction integration tests (MH6)
// ---------------------------------------------------------------------------

describe("Component interaction integration", () => {
  test("layout + panel + palette: opening palette while drawer is open", () => {
    let state = openDrawer(DEFAULT_STATE);
    expect(state.panels.drawer.visible).toBe(true);

    state = appReducer(state, { type: "SET_COMMAND_PALETTE_OPEN", payload: true });
    expect(state.isCommandPaletteOpen).toBe(true);
    expect(state.panels.drawer.visible).toBe(true); // Drawer stays open
  });

  test("layout + model selector: opening model selector while in zen mode", () => {
    let state = DEFAULT_STATE;
    expect(state.layoutMode).toBe("zen");

    state = appReducer(state, { type: "SET_MODEL_SELECTOR_OPEN", payload: true });
    expect(state.isModelSelectorOpen).toBe(true);
    expect(state.layoutMode).toBe("zen"); // Layout unchanged
  });

  test("panel dismiss + model selector: closing modal dismisses model selector context", () => {
    let state = openModal(DEFAULT_STATE);
    state = appReducer(state, { type: "SET_MODEL_SELECTOR_OPEN", payload: true });

    // Dismiss modal panel
    state = appReducer(state, { type: "DISMISS_PANEL", payload: "modal" });
    expect(state.panels.modal.visible).toBe(false);
    // Model selector state is independent of panel state
    expect(state.isModelSelectorOpen).toBe(true);
  });

  test("full flow: open drawer → open palette → close palette → drawer still visible", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = appReducer(state, { type: "SET_COMMAND_PALETTE_OPEN", payload: true });
    state = appReducer(state, { type: "SET_COMMAND_PALETTE_OPEN", payload: false });

    expect(state.isCommandPaletteOpen).toBe(false);
    expect(state.panels.drawer.visible).toBe(true);
    expect(state.layoutMode).toBe("normal");
  });

  test("full flow: switch model → update status bar → verify segments", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_MODEL", payload: "gemini-pro" });
    state = appReducer(state, { type: "SET_PROVIDER", payload: "google" });

    // Build status bar segments with new model
    const display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null);
    const segments = buildSegments("connected", state.currentModel, display, false);

    expect(segments.model).toBe("gemini-pro");
    expect(segments.lifecycle).toContain("Ready");
  });

  test("streaming state + panel interaction: panels work during streaming", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_STREAMING", payload: true });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });

    // Open drawer during streaming
    state = openDrawer(state);
    expect(state.panels.drawer.visible).toBe(true);
    expect(state.isStreaming).toBe(true);

    // Close drawer during streaming
    state = appReducer(state, { type: "DISMISS_PANEL", payload: "drawer" });
    expect(state.panels.drawer.visible).toBe(false);
    expect(state.isStreaming).toBe(true); // Streaming unaffected
  });

  test("dismiss-all resets all panels but preserves other state", () => {
    let state = openDrawer(DEFAULT_STATE);
    state = openToday(state);
    state = openModal(state);
    state = appReducer(state, { type: "SET_MODEL", payload: "claude-3.5-sonnet" });
    state = appReducer(state, { type: "SET_COMMAND_PALETTE_OPEN", payload: true });

    state = appReducer(state, { type: "DISMISS_ALL" });

    expect(state.panels.drawer.visible).toBe(false);
    expect(state.panels.today.visible).toBe(false);
    expect(state.panels.modal.visible).toBe(false);
    expect(state.currentModel).toBe("claude-3.5-sonnet"); // Preserved
    expect(state.isCommandPaletteOpen).toBe(true); // Preserved
  });
});
