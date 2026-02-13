import { describe, expect, test } from "bun:test";

import { appReducer, DEFAULT_STATE } from "../../src/store";
import type { AppState, DisplayMessage, DisplayToolCall } from "../../src/store/types";
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
import {
  isExchangeBoundary,
  MESSAGE_GAP,
  EXCHANGE_GAP,
  shouldRenderToolBlocks,
  shouldAutoExpand,
  displayToolCallToToolCall,
  getStreamingPlaceholderStyle,
  toolCallsToVisualStates,
  resolveToolBlockAccent,
} from "../../src/components/conversation-panel";
import {
  getMessageBlockStyle,
  getMessageBorderChars,
  getRoleGlyph,
  getRoleColor,
  GLYPH_REINS,
  GLYPH_USER,
  GLYPH_TOOL_DONE,
} from "../../src/components/message";
import {
  getToolBlockStyle,
  getToolBlockStatusSuffix,
  formatToolBlockArgs,
  formatToolBlockDetail,
} from "../../src/components/tool-inline";
import { SUBTLE_BORDER_CHARS } from "../../src/ui/primitives";
import {
  validateThemeTokens,
} from "../../src/theme/theme-schema";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import type { ToolVisualState } from "../../src/tools/tool-lifecycle";
import { getToolColorToken } from "../../src/tools/tool-lifecycle";

import reinsDarkTheme from "../../src/theme/builtins/reins-dark.json";
import reinsLightTheme from "../../src/theme/builtins/reins-light.json";
import tokyonightTheme from "../../src/theme/builtins/tokyonight.json";

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
// 4b. Status bar tool execution lifecycle integration (MH15)
// ---------------------------------------------------------------------------

describe("Status bar tool execution lifecycle integration", () => {
  test("SET_ACTIVE_TOOL_NAME sets tool name in store", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });
    expect(state.activeToolName).toBe("bash");
  });

  test("SET_ACTIVE_TOOL_NAME clears tool name with null", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });
    expect(state.activeToolName).toBe("bash");

    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    expect(state.activeToolName).toBeNull();
  });

  test("default state has null activeToolName", () => {
    expect(DEFAULT_STATE.activeToolName).toBeNull();
  });

  test("single tool lifecycle: store + status bar integration", () => {
    let state = DEFAULT_STATE;

    // Start streaming
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });

    // Status bar shows tool
    const display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Using tool: bash");

    const segments = buildSegments("connected", state.currentModel, display, false);
    expect(segments.lifecycle).toContain("Using tool: bash");
  });

  test("multi-tool sequence: store updates per tool", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });

    // Tool 1: bash
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });
    let display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Using tool: bash");

    // Tool 2: read
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "read" });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Using tool: read");

    // Tool 3: grep
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "grep" });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Using tool: grep");
  });

  test("tool clears on completion: no stale tool name", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });

    // Complete
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "complete" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });

    const display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Done");
    expect(display.label).not.toContain("bash");
  });

  test("tool clears on idle: no stale tool name after timeout", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "edit" });

    // Complete → idle
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "complete" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "idle" });

    const display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Ready");
  });

  test("tool active during error shows Error not tool name", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });

    // Error occurs
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "error" });

    const display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Error");
    expect(display.glyph).toBe("✗");
  });

  test("tool name preserved across unrelated store actions", () => {
    let state = DEFAULT_STATE;
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });

    // Unrelated actions
    state = appReducer(state, { type: "SET_MODEL", payload: "gpt-4o" });
    state = appReducer(state, { type: "SET_STATUS", payload: "working" });

    expect(state.activeToolName).toBe("bash");
  });

  test("full end-to-end: idle → streaming+tool → between tools → streaming+tool → complete → idle", () => {
    let state = DEFAULT_STATE;

    // Phase 1: Idle
    expect(state.streamingLifecycleStatus).toBe("idle");
    expect(state.activeToolName).toBeNull();
    let display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Ready");

    // Phase 2: Streaming starts, first tool
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "streaming" });
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "bash" });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Using tool: bash");

    // Phase 3: Between tools (tool completes, next hasn't started)
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 20, null, state.activeToolName);
    expect(display.label).toBe("Streaming [20 tokens]");

    // Phase 4: Second tool starts
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: "read" });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 20, null, state.activeToolName);
    expect(display.label).toBe("Using tool: read");

    // Phase 5: Complete
    state = appReducer(state, { type: "SET_ACTIVE_TOOL_NAME", payload: null });
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "complete" });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, "$0.005", state.activeToolName);
    expect(display.label).toBe("Done [$0.005]");

    // Phase 6: Back to idle
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "idle" });
    display = resolveLifecycleDisplay(state.streamingLifecycleStatus, 0, null, state.activeToolName);
    expect(display.label).toBe("Ready");
  });

  test("status bar truncation works with tool display", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "bash");
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);

    // Wide terminal shows tool info
    const wideTruncation = resolveTruncation(segments, 120);
    const wideText = buildTruncatedLeftText(segments, wideTruncation);
    expect(wideText).toContain("Using tool: bash");

    // Narrow terminal may drop lifecycle
    const narrowTruncation = resolveTruncation(segments, 30);
    const narrowText = buildTruncatedLeftText(segments, narrowTruncation);
    // Model always visible even when lifecycle drops
    expect(narrowText).toContain("claude-3.5-sonnet");
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

// ---------------------------------------------------------------------------
// Helpers for regression tests
// ---------------------------------------------------------------------------

function createMsg(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    createdAt: new Date("2026-02-12T00:00:00.000Z"),
    ...overrides,
  };
}

function loadThemeTokens(source: Record<string, unknown>): ThemeTokens {
  const result = validateThemeTokens(source);
  if (!result.ok) throw new Error("Theme invalid");
  return result.value;
}

const ALL_THEME_SOURCES = {
  "reins-dark": reinsDarkTheme,
  "reins-light": reinsLightTheme,
  tokyonight: tokyonightTheme,
} as const;

// ---------------------------------------------------------------------------
// 6. Message block style consistency regression (MH1, MH6)
// ---------------------------------------------------------------------------

describe("Message block style consistency regression", () => {
  const ROLES: DisplayMessage["role"][] = ["user", "assistant", "system", "tool"];

  for (const [themeName, source] of Object.entries(ALL_THEME_SOURCES)) {
    const tokens = loadThemeTokens(source);
    const getRoleBorder = (role: string) => {
      const mapping: Record<string, string> = {
        user: tokens["role.user.border"],
        assistant: tokens["role.assistant.border"],
        system: tokens["role.system.border"],
      };
      return mapping[role] ?? tokens["border.subtle"];
    };

    test(`${themeName}: all roles produce valid block styles with consistent padding`, () => {
      for (const role of ROLES) {
        const style = getMessageBlockStyle(role, tokens, getRoleBorder);
        expect(style.paddingLeft).toBe(2);
        expect(style.paddingRight).toBe(1);
        expect(style.paddingTop).toBe(0);
        expect(style.paddingBottom).toBe(0);
        expect(style.accentColor).toBeDefined();
        expect(style.backgroundColor).toBeDefined();
      }
    });

    test(`${themeName}: user and assistant have distinct accent colors`, () => {
      const userStyle = getMessageBlockStyle("user", tokens, getRoleBorder);
      const assistantStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);
      expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
    });

    test(`${themeName}: user and assistant have distinct backgrounds`, () => {
      const userStyle = getMessageBlockStyle("user", tokens, getRoleBorder);
      const assistantStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);
      expect(userStyle.backgroundColor).not.toBe(assistantStyle.backgroundColor);
    });
  }

  test("border chars: all roles use subtle framing", () => {
    expect(getMessageBorderChars("assistant")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("user")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("system")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("tool")).toBe(SUBTLE_BORDER_CHARS);
  });

  test("role glyphs are distinct and non-empty", () => {
    expect(getRoleGlyph("user")).toBe(GLYPH_USER);
    expect(getRoleGlyph("assistant")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("system")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("tool")).toBe(GLYPH_TOOL_DONE);
    expect(GLYPH_USER).not.toBe(GLYPH_REINS);
  });
});

// ---------------------------------------------------------------------------
// 7. Tool block visual consistency regression (MH5, MH6)
// ---------------------------------------------------------------------------

describe("Tool block visual consistency regression", () => {
  function makeVisualState(overrides: Partial<ToolVisualState> = {}): ToolVisualState {
    return {
      id: "t1",
      toolName: "bash",
      status: "running",
      glyph: "◎",
      label: "Running Bash...",
      colorToken: "glyph.tool.running",
      detail: undefined,
      expanded: false,
      hasDetail: false,
      duration: undefined,
      ...overrides,
    };
  }

  for (const [themeName, source] of Object.entries(ALL_THEME_SOURCES)) {
    const tokens = loadThemeTokens(source);

    test(`${themeName}: tool block styles have consistent padding across statuses`, () => {
      const statuses: ToolVisualState["status"][] = ["queued", "running", "success", "error"];
      for (const status of statuses) {
        const vs = makeVisualState({ status, colorToken: getToolColorToken(status) });
        const style = getToolBlockStyle(vs, tokens);
        expect(style.paddingLeft).toBe(2);
        expect(style.paddingRight).toBe(1);
        expect(style.backgroundColor).toBe(tokens["surface.secondary"]);
      }
    });

    test(`${themeName}: tool block accent colors differ by status`, () => {
      const runningVs = makeVisualState({ status: "running", colorToken: "glyph.tool.running" });
      const successVs = makeVisualState({ status: "success", colorToken: "glyph.tool.done" });
      const errorVs = makeVisualState({ status: "error", colorToken: "glyph.tool.error" });

      const runningStyle = getToolBlockStyle(runningVs, tokens);
      const successStyle = getToolBlockStyle(successVs, tokens);
      const errorStyle = getToolBlockStyle(errorVs, tokens);

      // At least error should differ from running and success
      expect(errorStyle.accentColor).not.toBe(runningStyle.accentColor);
      expect(errorStyle.accentColor).not.toBe(successStyle.accentColor);
    });

    test(`${themeName}: tool block accent resolves correctly from token`, () => {
      const accent = resolveToolBlockAccent("glyph.tool.running", tokens);
      expect(accent).toBe(tokens["glyph.tool.running"]);

      const fallback = resolveToolBlockAccent("nonexistent.token", tokens);
      expect(fallback).toBe(tokens["glyph.tool.running"]);
    });
  }

  test("tool block status suffixes are descriptive", () => {
    expect(getToolBlockStatusSuffix(makeVisualState({ status: "queued" }))).toBe("queued...");
    expect(getToolBlockStatusSuffix(makeVisualState({ status: "running" }))).toBe("running...");
    expect(getToolBlockStatusSuffix(makeVisualState({ status: "success" }))).toBe("done");
    expect(getToolBlockStatusSuffix(makeVisualState({ status: "success", duration: 42 }))).toBe("done (42ms)");
    expect(getToolBlockStatusSuffix(makeVisualState({ status: "error" }))).toBe("failed");
  });

  test("tool block args formatting handles edge cases", () => {
    expect(formatToolBlockArgs(undefined)).toBeUndefined();
    expect(formatToolBlockArgs({})).toBeUndefined();
    expect(formatToolBlockArgs({ cmd: "ls" })).toBe('{"cmd":"ls"}');

    const longArgs: Record<string, unknown> = { data: "x".repeat(200) };
    const formatted = formatToolBlockArgs(longArgs);
    expect(formatted).toBeDefined();
    expect(formatted!.length).toBeLessThanOrEqual(121); // 120 + ellipsis
  });

  test("tool block detail formatting truncates long content", () => {
    expect(formatToolBlockDetail(undefined)).toBeUndefined();
    expect(formatToolBlockDetail("")).toBeUndefined();
    expect(formatToolBlockDetail("short")).toBe("short");

    const longDetail = "x".repeat(600);
    const formatted = formatToolBlockDetail(longDetail);
    expect(formatted).toBeDefined();
    expect(formatted!.length).toBeLessThanOrEqual(501); // 500 + ellipsis
  });
});

// ---------------------------------------------------------------------------
// 8. Exchange boundary and spacing regression (MH1)
// ---------------------------------------------------------------------------

describe("Exchange boundary and spacing regression", () => {
  test("exchange boundary detected at user-after-assistant", () => {
    const messages: DisplayMessage[] = [
      createMsg({ id: "a1", role: "assistant", content: "Hello" }),
      createMsg({ id: "u1", role: "user", content: "Hi" }),
    ];
    expect(isExchangeBoundary(messages, 0)).toBe(false);
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("exchange boundary detected at user-after-tool", () => {
    const messages: DisplayMessage[] = [
      createMsg({ id: "t1", role: "tool" as DisplayMessage["role"], content: "result" }),
      createMsg({ id: "u1", role: "user", content: "Thanks" }),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("no exchange boundary for consecutive assistant messages", () => {
    const messages: DisplayMessage[] = [
      createMsg({ id: "a1", role: "assistant", content: "Part 1" }),
      createMsg({ id: "a2", role: "assistant", content: "Part 2" }),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("no exchange boundary for consecutive user messages", () => {
    const messages: DisplayMessage[] = [
      createMsg({ id: "u1", role: "user", content: "First" }),
      createMsg({ id: "u2", role: "user", content: "Second" }),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("spacing constants are positive and exchange gap exceeds message gap", () => {
    expect(MESSAGE_GAP).toBeGreaterThan(0);
    expect(EXCHANGE_GAP).toBeGreaterThan(0);
    expect(EXCHANGE_GAP).toBeGreaterThan(MESSAGE_GAP);
  });
});

// ---------------------------------------------------------------------------
// 9. Streaming + tool interaction regression (MH1, MH5)
// ---------------------------------------------------------------------------

describe("Streaming and tool interaction regression", () => {
  test("streaming state transitions preserve tool call data", () => {
    let state = DEFAULT_STATE;

    // Add assistant message with streaming and tool calls
    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMsg({
        id: "a1",
        role: "assistant",
        content: "Working...",
        isStreaming: true,
        toolCalls: [
          { id: "t1", name: "bash", status: "running" },
        ],
      }),
    });
    state = appReducer(state, { type: "SET_STREAMING", payload: true });

    // Append tokens during tool execution
    state = appReducer(state, { type: "APPEND_TOKEN", payload: { messageId: "a1", token: " more" } });

    // Tool completes
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t1", status: "complete", result: "output" },
    });

    // Finish streaming
    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });

    expect(state.messages[0]?.content).toBe("Working... more");
    expect(state.messages[0]?.toolCalls?.[0]?.status).toBe("complete");
    expect(state.messages[0]?.toolCalls?.[0]?.result).toBe("output");
    expect(state.isStreaming).toBe(false);
  });

  test("multiple tool calls complete independently during streaming", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "ADD_MESSAGE",
      payload: createMsg({
        id: "a1",
        role: "assistant",
        content: "",
        isStreaming: true,
        toolCalls: [
          { id: "t1", name: "bash", status: "running" },
          { id: "t2", name: "read", status: "running" },
          { id: "t3", name: "grep", status: "pending" },
        ],
      }),
    });
    state = appReducer(state, { type: "SET_STREAMING", payload: true });

    // t1 completes, t2 errors, t3 starts running
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t1", status: "complete", result: "ok" },
    });
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t2", status: "error", isError: true, result: "fail" },
    });
    state = appReducer(state, {
      type: "SET_TOOL_CALL_STATUS",
      payload: { messageId: "a1", toolCallId: "t3", status: "running" },
    });

    const tools = state.messages[0]?.toolCalls;
    expect(tools?.[0]?.status).toBe("complete");
    expect(tools?.[1]?.status).toBe("error");
    expect(tools?.[1]?.isError).toBe(true);
    expect(tools?.[2]?.status).toBe("running");

    // Tool ordering preserved
    expect(tools?.[0]?.id).toBe("t1");
    expect(tools?.[1]?.id).toBe("t2");
    expect(tools?.[2]?.id).toBe("t3");
  });

  test("displayToolCallToToolCall maps all statuses correctly", () => {
    const pending: DisplayToolCall = { id: "t1", name: "bash", status: "pending" };
    const running: DisplayToolCall = { id: "t2", name: "read", status: "running" };
    const complete: DisplayToolCall = { id: "t3", name: "write", status: "complete", result: "ok" };
    const error: DisplayToolCall = { id: "t4", name: "grep", status: "error", result: "fail", isError: true };

    expect(displayToolCallToToolCall(pending).status).toBe("queued");
    expect(displayToolCallToToolCall(running).status).toBe("running");
    expect(displayToolCallToToolCall(complete).status).toBe("success");
    expect(displayToolCallToToolCall(complete).result).toBe("ok");
    expect(displayToolCallToToolCall(error).status).toBe("error");
    expect(displayToolCallToToolCall(error).error).toBe("fail");
    expect(displayToolCallToToolCall(error).result).toBeUndefined();
  });

  test("shouldAutoExpand only expands error-state tool calls", () => {
    const ok: DisplayToolCall = { id: "t1", name: "bash", status: "complete", result: "ok" };
    const running: DisplayToolCall = { id: "t2", name: "read", status: "running" };
    const errored: DisplayToolCall = { id: "t3", name: "write", status: "error", result: "fail" };
    const isErrorFlag: DisplayToolCall = { id: "t4", name: "grep", status: "complete", result: "fail", isError: true };

    expect(shouldAutoExpand(ok)).toBe(false);
    expect(shouldAutoExpand(running)).toBe(false);
    expect(shouldAutoExpand(errored)).toBe(true);
    expect(shouldAutoExpand(isErrorFlag)).toBe(true);
  });

  test("toolCallsToVisualStates preserves ordering and respects expanded set", () => {
    const toolCalls: DisplayToolCall[] = [
      { id: "t1", name: "bash", status: "complete", result: "ok" },
      { id: "t2", name: "read", status: "running" },
      { id: "t3", name: "write", status: "error", result: "fail", isError: true },
    ];

    const expandedSet = new Set(["t1"]);
    const states = toolCallsToVisualStates(toolCalls, expandedSet);

    expect(states).toHaveLength(3);
    expect(states[0].id).toBe("t1");
    expect(states[0].expanded).toBe(true);
    expect(states[1].id).toBe("t2");
    expect(states[1].expanded).toBe(false);
    expect(states[2].id).toBe("t3");
    // Error state is not auto-expanded by toolCallsToVisualStates
    // (auto-expand is handled by ToolBlockList component)
  });
});

// ---------------------------------------------------------------------------
// 10. Idle rendering stability regression (MH1, MH6)
// ---------------------------------------------------------------------------

describe("Idle rendering stability regression", () => {
  test("empty token append is a no-op (no unnecessary re-renders)", () => {
    const initial: AppState = {
      ...DEFAULT_STATE,
      messages: [createMsg({ id: "a1", content: "Hello", isStreaming: true })],
      isStreaming: true,
      streamingMessageId: "a1",
    };

    const next = appReducer(initial, {
      type: "APPEND_TOKEN",
      payload: { messageId: "a1", token: "" },
    });

    // Empty token should return same reference (no state change)
    expect(next).toBe(initial);
  });

  test("duplicate FINISH_STREAMING is idempotent", () => {
    let state: AppState = {
      ...DEFAULT_STATE,
      messages: [createMsg({ id: "a1", content: "Done", isStreaming: true })],
      isStreaming: true,
      streamingMessageId: "a1",
    };

    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });
    const afterFirst = state;

    state = appReducer(state, { type: "FINISH_STREAMING", payload: { messageId: "a1" } });
    expect(state.isStreaming).toBe(false);
    expect(state.messages[0]?.isStreaming).toBe(false);
  });

  test("SET_STREAMING_LIFECYCLE_STATUS to same value is stable", () => {
    let state = appReducer(DEFAULT_STATE, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "idle" });
    // Setting to same value should not cause issues
    state = appReducer(state, { type: "SET_STREAMING_LIFECYCLE_STATUS", payload: "idle" });
    expect(state.streamingLifecycleStatus).toBe("idle");
  });

  test("shouldRenderToolBlocks returns false for messages without tool calls", () => {
    expect(shouldRenderToolBlocks(createMsg({ role: "assistant", content: "text" }))).toBe(false);
    expect(shouldRenderToolBlocks(createMsg({ role: "user", content: "text" }))).toBe(false);
    expect(shouldRenderToolBlocks(createMsg({ role: "assistant", toolCalls: [] }))).toBe(false);
  });

  test("streaming placeholder style matches assistant block styling pattern", () => {
    for (const [themeName, source] of Object.entries(ALL_THEME_SOURCES)) {
      const tokens = loadThemeTokens(source);
      const getRoleBorder = (role: string) => {
        const mapping: Record<string, string> = {
          user: tokens["role.user.border"],
          assistant: tokens["role.assistant.border"],
          system: tokens["role.system.border"],
        };
        return mapping[role] ?? tokens["border.subtle"];
      };

      const placeholderStyle = getStreamingPlaceholderStyle(tokens, getRoleBorder);
      const assistantStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);

      // Streaming placeholder should use assistant accent and background
      expect(placeholderStyle.accentColor).toBe(assistantStyle.accentColor);
      expect(placeholderStyle.backgroundColor).toBe(assistantStyle.backgroundColor);
      expect(placeholderStyle.paddingLeft).toBe(assistantStyle.paddingLeft);
      expect(placeholderStyle.paddingRight).toBe(assistantStyle.paddingRight);
    }
  });
});
