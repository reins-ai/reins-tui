import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { writeUserConfig } from "@reins/core";

import { CommandPalette, type CommandPaletteDataSources, ErrorBoundary, Layout } from "./components";
import { ModelSelectorModal, type ProviderModelGroup } from "./components/model-selector";
import { ConnectFlow, type ConnectResult } from "./components/connect-flow";
import { EmbeddingSetupWizard, type EmbeddingSetupResult } from "./components/setup/embedding-setup-wizard";
import { SearchSettingsModal } from "./components/search-settings-modal";
import { OnboardingWizard, type OnboardingWizardResult } from "./components/onboarding";
import { ChannelTokenPrompt } from "./components/channel-token-prompt";
import { callDaemonChannelApi, maskBotToken } from "./commands/handlers/channels";
import { DaemonPanel } from "./components/daemon-panel";
import { IntegrationPanel } from "./components/integration-panel";
import { DaemonMemoryClient } from "./daemon/memory-client";
import { HelpScreen } from "./screens";
import { DEFAULT_DAEMON_HTTP_BASE_URL } from "./daemon/client";
import { getActiveDaemonUrl } from "./daemon/actions";
import { DaemonProvider, useDaemon } from "./daemon/daemon-context";
import type { DaemonMessage, DaemonResult, ConversationSummary as DaemonConversationSummary } from "./daemon/contracts";
import { mapConversationHistory } from "./daemon/ws-transport";
import { ConnectService } from "./providers/connect-service";
import { GreetingService, type StartupContent } from "./personalization/greeting-service";
import { createConversationStore, type ConversationStoreState } from "./state/conversation-store";
import type { StreamToolCall, TurnContentBlock } from "./state/streaming-state";
import { loadModelPreferences, saveModelPreferences } from "./state/model-persistence";
import { loadPinPreferences, savePinPreferences } from "./state/pin-persistence";
import { loadThinkingPreferences, saveThinkingPreferences } from "./state/thinking-persistence";
import { toPinPreferences, applyPinPreferences, DEFAULT_PANEL_STATE } from "./state/layout-mode";
import { useConversations, useFocus, useFirstRun } from "./hooks";
import type { PaletteAction } from "./palette/fuzzy-index";
import type { ConversationLifecycleStatus } from "./state/status-machine";
import { AppContext, DEFAULT_STATE, appReducer, useApp, createHydrationState, historyPayloadNormalizer } from "./store";
import type { DisplayContentBlock, DisplayMessage, DisplayToolCall } from "./store";
import { ThemeProvider, useThemeTokens } from "./theme";
import { Box, Text, type KeyEvent, type TerminalDimensions, useKeyboard, useRenderer, useTerminalDimensions } from "./ui";

export interface AppProps {
  version: string;
}

export function normalizeDimensions(value: unknown): TerminalDimensions {
  if (
    typeof value === "object" &&
    value !== null &&
    "width" in value &&
    "height" in value &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  ) {
    return {
      width: value.width,
      height: value.height,
    };
  }

  return {
    width: 0,
    height: 0,
  };
}

export function parseIsoDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function toStoreConversationSummary(summary: DaemonConversationSummary) {
  return {
    id: summary.id,
    title: summary.title,
    model: summary.model,
    messageCount: summary.messageCount,
    createdAt: parseIsoDate(summary.createdAt),
    lastMessageAt: parseIsoDate(summary.updatedAt),
  };
}

function toDisplayToolCallStatus(status: "running" | "complete" | "error"): DisplayToolCall["status"] {
  switch (status) {
    case "running":
      return "running";
    case "complete":
      return "complete";
    case "error":
      return "error";
  }
}

interface ToolTurnCacheEntry {
  toolCalls: DisplayToolCall[];
  contentBlocks: DisplayContentBlock[];
}

function toDisplayToolCalls(toolCalls: readonly StreamToolCall[]): DisplayToolCall[] {
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.name,
    status: toDisplayToolCallStatus(toolCall.status),
    args: toolCall.args,
    result: toolCall.error ?? toolCall.result,
    isError: toolCall.status === "error",
  }));
}

function toDisplayContentBlocks(contentBlocks: readonly TurnContentBlock[]): DisplayContentBlock[] {
  return contentBlocks.map((block) => ({
    type: block.type,
    toolCallId: block.toolCallId,
    text: block.text,
  }));
}

function resolveActiveToolTurn(streaming: ConversationStoreState["streaming"]): {
  assistantMessageId: string | null;
  toolCalls: readonly StreamToolCall[];
  contentBlocks: readonly TurnContentBlock[];
} {
  if (
    streaming.status === "thinking"
    || streaming.status === "streaming"
    || streaming.status === "complete"
    || streaming.status === "error"
  ) {
    return {
      assistantMessageId: streaming.assistantMessageId,
      toolCalls: streaming.toolCalls,
      contentBlocks: streaming.turnState.contentBlocks,
    };
  }

  return {
    assistantMessageId: null,
    toolCalls: [],
    contentBlocks: [],
  };
}

function toDisplayMessages(
  snapshot: ConversationStoreState,
  toolTurnCache: ReadonlyMap<string, ToolTurnCacheEntry> = new Map(),
): DisplayMessage[] {
  const activeToolTurn = resolveActiveToolTurn(snapshot.streaming);
  const activeToolCalls = toDisplayToolCalls(activeToolTurn.toolCalls);
  const activeContentBlocks = toDisplayContentBlocks(activeToolTurn.contentBlocks);

  return snapshot.messages.map((message: DaemonMessage) => {
    const isStreamingMessage =
      activeToolTurn.assistantMessageId !== null
      && message.id === activeToolTurn.assistantMessageId
      && (snapshot.streaming.status === "thinking" || snapshot.streaming.status === "streaming");
    const cachedToolTurn = toolTurnCache.get(message.id);
    const isActiveToolTurnMessage =
      activeToolTurn.assistantMessageId !== null
      && message.id === activeToolTurn.assistantMessageId;
    const toolCalls = isActiveToolTurnMessage && activeToolCalls.length > 0
      ? activeToolCalls
      : cachedToolTurn?.toolCalls;
    const contentBlocks = isActiveToolTurnMessage && activeContentBlocks.length > 0
      ? activeContentBlocks
      : cachedToolTurn?.contentBlocks;

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      toolCalls,
      contentBlocks,
      isStreaming: isStreamingMessage,
      createdAt: parseIsoDate(message.createdAt),
    };
  });
}

function getStatusTextForLifecycle(status: ConversationLifecycleStatus): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "sending":
      return "Sending message...";
    case "thinking":
      return "Thinking...";
    case "streaming":
      return "Streaming response...";
    case "complete":
      return "Response complete";
    case "error":
      return "Streaming error";
  }
}

function isQuitEvent(event: KeyEvent): boolean {
  return (event.name === "q" || event.sequence === "q") && event.ctrl !== true;
}

function isHelpEvent(event: KeyEvent): boolean {
  return event.sequence === "?" || (event.sequence === "/" && event.shift === true);
}

function isEscapeEvent(event: KeyEvent): boolean {
  return event.name === "escape" || event.name === "esc";
}

function isRetryEvent(event: KeyEvent): boolean {
  return (event.name === "r" || event.sequence === "r") && event.ctrl !== true;
}

function isCommandPaletteToggleEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "k" || event.sequence === "k");
}

function isToggleActivityEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "a" || event.sequence === "\x01");
}

function isToggleZenEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "z" || event.sequence === "\x1a");
}

function isFocusForwardEvent(event: KeyEvent): boolean {
  return event.name === "tab" && event.shift !== true;
}

function isFocusBackwardEvent(event: KeyEvent): boolean {
  return event.name === "tab" && event.shift === true;
}

function isNewConversationEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "n" || event.sequence === "n");
}

function isToggleDrawerEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "1" || event.sequence === "1");
}

function isToggleTodayEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "2" || event.sequence === "2");
}

function isCycleThinkingEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "t" || event.sequence === "\x14");
}

function isToggleModelSelectorEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "m" || event.sequence === "\x0d" || event.sequence === "m");
}

function isToggleIntegrationPanelEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "i" || event.sequence === "\x09" || event.sequence === "i");
}

function resolveDirectPanelFocus(event: KeyEvent) {
  if (event.ctrl !== true) {
    return null;
  }

  if (event.name === "3" || event.sequence === "3") {
    return "input" as const;
  }

  return null;
}

function destroyRenderer(renderer: unknown): void {
  if (
    typeof renderer === "object" &&
    renderer !== null &&
    "destroy" in renderer &&
    typeof renderer.destroy === "function"
  ) {
    renderer.destroy();
  }
}

interface AppViewProps {
  version: string;
  dimensions: TerminalDimensions;
}

function AppView({ version, dimensions }: AppViewProps) {
  const { state, dispatch } = useApp();
  const { client: daemonClient, connectionStatus, isConnected, mode: daemonMode } = useDaemon();
  const focus = useFocus();
  const conversationManager = useConversations();
  const firstRunState = useFirstRun();
  const [showHelp, setShowHelp] = useState(false);
  const [resolvedDaemonUrl, setResolvedDaemonUrl] = useState(DEFAULT_DAEMON_HTTP_BASE_URL);

  // Resolve active daemon URL from profile store on mount and after onboarding
  useEffect(() => {
    void (async () => {
      const url = await getActiveDaemonUrl();
      setResolvedDaemonUrl(url);
    })();
  }, [state.onboardingStatus]);

  // Sync first-run detection result into app state
  useEffect(() => {
    if (firstRunState.status !== "checking") {
      dispatch({ type: "SET_ONBOARDING_STATUS", payload: firstRunState.status });
    }
  }, [firstRunState.status, dispatch]);

  const handleOnboardingComplete = useCallback((result: OnboardingWizardResult) => {
    dispatch({ type: "SET_ONBOARDING_COMPLETE" });
    void writeUserConfig({
      setupComplete: true,
      name: result.userName,
      personality: result.personality,
    });
    dispatch({
      type: "SET_STATUS",
      payload: result.skipped ? "Skipped to chat" : "Setup complete",
    });
  }, [dispatch]);

  const closeDaemonPanel = useCallback(() => {
    dispatch({ type: "SET_DAEMON_PANEL_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const closeIntegrationPanel = useCallback(() => {
    dispatch({ type: "SET_INTEGRATION_PANEL_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const [startupContent, setStartupContent] = useState<StartupContent | null>(null);
  const renderer = useRenderer();
  const isExitingRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(state.activeConversationId);
  const conversationStoreRef = useRef(createConversationStore({ daemonClient }));
  const conversationStreamIdRef = useRef<string | null>(null);
  const toolTurnCacheRef = useRef<Map<string, ToolTurnCacheEntry>>(new Map());
  const pendingMessageSnapshotRef = useRef<ConversationStoreState | null>(null);
  const messageFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLifecycleStatusRef = useRef<ConversationLifecycleStatus | null>(null);
  const lastStreamingFlagRef = useRef<boolean | null>(null);
  const lastStatusTextRef = useRef<string | null>(null);

  const [providerGroups, setProviderGroups] = useState<ProviderModelGroup[]>([]);

  // Restore pin preferences on startup
  const pinPrefsLoadedRef = useRef(false);
  useEffect(() => {
    if (pinPrefsLoadedRef.current) return;
    pinPrefsLoadedRef.current = true;
    const prefs = loadPinPreferences();
    const restoredPanels = applyPinPreferences(DEFAULT_PANEL_STATE, prefs);
    // Restore pin state but keep panels dismissed
    if (restoredPanels.drawer.pinned) dispatch({ type: "PIN_PANEL", payload: "drawer" });
    if (restoredPanels.today.pinned) dispatch({ type: "PIN_PANEL", payload: "today" });
    if (restoredPanels.modal.pinned) dispatch({ type: "PIN_PANEL", payload: "modal" });
  }, [dispatch]);

  // Restore model preferences on startup
  const modelPrefsLoadedRef = useRef(false);
  useEffect(() => {
    if (modelPrefsLoadedRef.current) return;
    modelPrefsLoadedRef.current = true;
    const prefs = loadModelPreferences();
    if (prefs.modelId !== "default") {
      dispatch({ type: "SET_MODEL", payload: prefs.modelId });
    }
    if (prefs.provider) {
      dispatch({ type: "SET_PROVIDER", payload: prefs.provider });
    }
  }, [dispatch]);

  // Restore thinking preferences on startup
  const thinkingPrefsLoadedRef = useRef(false);
  useEffect(() => {
    if (thinkingPrefsLoadedRef.current) return;
    thinkingPrefsLoadedRef.current = true;
    const prefs = loadThinkingPreferences();
    if (prefs.thinkingLevel !== "none") {
      dispatch({ type: "SET_THINKING_LEVEL", payload: prefs.thinkingLevel });
    }
    if (!prefs.thinkingVisible) {
      dispatch({ type: "TOGGLE_THINKING_VISIBILITY" });
    }
  }, [dispatch]);

  // Persist pin preferences when they change
  const prevPinRef = useRef(toPinPreferences(state.panels));
  useEffect(() => {
    const currentPins = toPinPreferences(state.panels);
    if (
      currentPins.drawer !== prevPinRef.current.drawer ||
      currentPins.today !== prevPinRef.current.today ||
      currentPins.modal !== prevPinRef.current.modal
    ) {
      prevPinRef.current = currentPins;
      savePinPreferences(currentPins);
    }
  }, [state.panels]);

  useEffect(() => {
    activeConversationIdRef.current = state.activeConversationId;
  }, [state.activeConversationId]);

  useEffect(() => {
    conversationStoreRef.current = createConversationStore({ daemonClient });
    pendingMessageSnapshotRef.current = null;
    lastLifecycleStatusRef.current = null;
    lastStreamingFlagRef.current = null;
    lastStatusTextRef.current = null;

    const clearMessageFlushTimer = () => {
      if (messageFlushTimerRef.current !== null) {
        clearTimeout(messageFlushTimerRef.current);
        messageFlushTimerRef.current = null;
      }
    };

    const flushPendingMessages = () => {
      const snapshot = pendingMessageSnapshotRef.current;
      if (!snapshot) {
        return;
      }

      pendingMessageSnapshotRef.current = null;
      dispatch({ type: "SET_MESSAGES", payload: toDisplayMessages(snapshot, toolTurnCacheRef.current) });
    };

    const unsubscribe = conversationStoreRef.current.subscribe((snapshot) => {
      if (snapshot.conversationId !== conversationStreamIdRef.current) {
        conversationStreamIdRef.current = snapshot.conversationId;
        toolTurnCacheRef.current.clear();
      }

      const activeToolTurn = resolveActiveToolTurn(snapshot.streaming);
      if (activeToolTurn.assistantMessageId !== null && activeToolTurn.toolCalls.length > 0) {
        toolTurnCacheRef.current.set(activeToolTurn.assistantMessageId, {
          toolCalls: toDisplayToolCalls(activeToolTurn.toolCalls),
          contentBlocks: toDisplayContentBlocks(activeToolTurn.contentBlocks),
        });
      }

      const lifecycleStatus = snapshot.streaming.lifecycle.status;
      const isStreamingLifecycle =
        lifecycleStatus === "sending"
        || lifecycleStatus === "thinking"
        || lifecycleStatus === "streaming";
      const statusText = getStatusTextForLifecycle(lifecycleStatus);

      pendingMessageSnapshotRef.current = snapshot;

      if (isStreamingLifecycle) {
        if (messageFlushTimerRef.current === null) {
          messageFlushTimerRef.current = setTimeout(() => {
            messageFlushTimerRef.current = null;
            flushPendingMessages();
          }, 16);
        }
      } else {
        clearMessageFlushTimer();
        flushPendingMessages();
      }

      if (lastLifecycleStatusRef.current !== lifecycleStatus) {
        lastLifecycleStatusRef.current = lifecycleStatus;
        dispatch({
          type: "SET_STREAMING_LIFECYCLE_STATUS",
          payload: lifecycleStatus,
        });
      }

      if (lastStreamingFlagRef.current !== isStreamingLifecycle) {
        lastStreamingFlagRef.current = isStreamingLifecycle;
        dispatch({
          type: "SET_STREAMING",
          payload: isStreamingLifecycle,
        });
      }

      if (lastStatusTextRef.current !== statusText) {
        lastStatusTextRef.current = statusText;
        dispatch({ type: "SET_STATUS", payload: statusText });
      }

      if (snapshot.conversationId && snapshot.conversationId !== activeConversationIdRef.current) {
        dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: snapshot.conversationId });
      }
    });

    return () => {
      unsubscribe();
      clearMessageFlushTimer();
      pendingMessageSnapshotRef.current = null;
    };
  }, [daemonClient, dispatch]);

  useEffect(() => {
    let cancelled = false;
    const greetingService = new GreetingService();

    const loadStartupContent = async () => {
      const startup = await greetingService.getFullStartup();
      if (!cancelled) {
        setStartupContent(startup);
      }
    };

    void loadStartupContent();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  useEffect(() => {
    let cancelled = false;

    const hydrateConversations = async () => {
      const listResult = await daemonClient.listConversations();
      if (!listResult.ok || cancelled) {
        return;
      }

      const conversations = listResult.value.map(toStoreConversationSummary);
      dispatch({ type: "SET_CONVERSATIONS", payload: conversations });

      if (conversations.length > 0 && !state.activeConversationId) {
        dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: conversations[0].id });
      }
    };

    void hydrateConversations();

    return () => {
      cancelled = true;
    };
  }, [daemonClient, dispatch, isConnected, state.activeConversationId]);

  useEffect(() => {
    let cancelled = false;

    if (!state.activeConversationId) {
      return;
    }

    const loadConversation = async () => {
      const result = await daemonClient.getConversation(state.activeConversationId as string);
      if (!result.ok || cancelled) {
        return;
      }

      const rawMessages = mapConversationHistory(result.value.messages);
      const hydrationState = createHydrationState();
      dispatch({
        type: "HYDRATE_HISTORY",
        payload: {
          rawMessages,
          normalizer: historyPayloadNormalizer,
          hydrationState,
        },
      });
    };

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [daemonClient, dispatch, state.activeConversationId]);

  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${resolvedDaemonUrl}/api/models`);
      if (!response.ok) return;
      const data = await response.json() as { models?: { id: string; name: string; provider: string }[] };
      const models = data.models ?? [];
      const modelIds = models.map((m) => m.id);
      if (modelIds.length > 0) {
        dispatch({ type: "SET_AVAILABLE_MODELS", payload: modelIds });
      }

      // Build provider groups from model data
      const groupMap = new Map<string, ProviderModelGroup>();
      for (const model of models) {
        const providerId = model.provider || "unknown";
        if (!groupMap.has(providerId)) {
          groupMap.set(providerId, {
            providerId,
            providerName: providerId,
            connectionState: "ready",
            models: [],
          });
        }
        groupMap.get(providerId)!.models.push(model.id);
      }

      // Also fetch provider auth list to find disconnected providers
      try {
        const authResponse = await fetch(`${resolvedDaemonUrl}/api/providers/auth/list`);
        if (authResponse.ok) {
          const authData = await authResponse.json() as {
            providers?: { provider?: string; providerName?: string; connectionState?: string; configured?: boolean }[];
          } | { provider?: string; providerName?: string; connectionState?: string; configured?: boolean }[];
          const providerList = Array.isArray(authData)
            ? authData
            : (authData as { providers?: unknown[] }).providers ?? [];

          for (const entry of providerList) {
            const raw = entry as Record<string, unknown>;
            const pid = typeof raw.provider === "string" ? raw.provider : "";
            if (!pid) continue;
            const pname = typeof raw.providerName === "string" ? raw.providerName : pid;
            const connState = typeof raw.connectionState === "string" ? raw.connectionState : "requires_auth";
            if (!groupMap.has(pid)) {
              groupMap.set(pid, {
                providerId: pid,
                providerName: pname,
                connectionState: connState as ProviderModelGroup["connectionState"],
                models: [],
              });
            }
          }
        }
      } catch {
        // Auth list fetch is best-effort
      }

      setProviderGroups(Array.from(groupMap.values()));
    } catch {
      // Daemon may not be available yet
    }
  }, [dispatch, resolvedDaemonUrl]);

  // Fetch models on startup
  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  // Auto-select first model when available models change (only if no persisted preference)
  useEffect(() => {
    if (state.availableModels.length === 0) return;
    const isCurrentValid = state.availableModels.includes(state.currentModel);
    if (!isCurrentValid || state.currentModel === "default") {
      dispatch({ type: "SET_MODEL", payload: state.availableModels[0] });
    }
  }, [state.availableModels, state.currentModel, dispatch]);

  // Persist model selection when it changes
  const prevModelRef = useRef(state.currentModel);
  useEffect(() => {
    if (state.currentModel !== prevModelRef.current && state.currentModel !== "default") {
      prevModelRef.current = state.currentModel;
      saveModelPreferences({
        modelId: state.currentModel,
        provider: state.currentProvider,
      });
    }
  }, [state.currentModel, state.currentProvider]);

  // Persist thinking preferences when they change
  const prevThinkingRef = useRef({ level: state.thinkingLevel, visible: state.thinkingVisible });
  useEffect(() => {
    if (
      state.thinkingLevel !== prevThinkingRef.current.level ||
      state.thinkingVisible !== prevThinkingRef.current.visible
    ) {
      prevThinkingRef.current = { level: state.thinkingLevel, visible: state.thinkingVisible };
      saveThinkingPreferences({
        thinkingLevel: state.thinkingLevel,
        thinkingVisible: state.thinkingVisible,
      });
    }
  }, [state.thinkingLevel, state.thinkingVisible]);

  const handleModelSelect = useCallback((modelId: string, providerId: string) => {
    dispatch({ type: "SET_MODEL", payload: modelId });
    dispatch({ type: "SET_PROVIDER", payload: providerId });
    dispatch({ type: "SET_MODEL_SELECTOR_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: `Model set to ${modelId}` });
  }, [dispatch]);

  const closeModelSelector = useCallback(() => {
    dispatch({ type: "SET_MODEL_SELECTOR_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const closeSearchSettings = useCallback(() => {
    dispatch({ type: "SET_SEARCH_SETTINGS_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const closeHelp = useCallback(() => {
    setShowHelp(false);
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const createNewConversation = useCallback(async () => {
    const createResult = await daemonClient.createConversation({
      title: "New Chat",
      model: state.currentModel,
    });

    if (!createResult.ok) {
      conversationManager.createConversation();
      dispatch({ type: "SET_STATUS", payload: "Started a new conversation" });
      return;
    }

    const summary = toStoreConversationSummary(createResult.value);
    dispatch({ type: "ADD_CONVERSATION", payload: summary });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: summary.id });
    dispatch({ type: "SET_MESSAGES", payload: [] });
    dispatch({ type: "SET_STATUS", payload: "Started a new conversation" });
  }, [conversationManager, daemonClient, dispatch, state.currentModel]);

  const exitApp = useCallback(() => {
    if (isExitingRef.current) {
      return;
    }

    isExitingRef.current = true;
    setShowHelp(false);
    dispatch({ type: "SET_COMMAND_PALETTE_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Exiting" });
    destroyRenderer(renderer);
    process.exit(0);
  }, [dispatch, renderer]);

  const handleMessageSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }

    const sendResult: DaemonResult<void> = await conversationStoreRef.current.sendUserMessage({
      conversationId: state.activeConversationId ?? undefined,
      content: trimmed,
      model: state.currentModel,
      thinkingLevel: state.thinkingLevel !== "none" ? state.thinkingLevel : undefined,
    });

    if (!sendResult.ok) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[error] ${sendResult.error.message}`,
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: sendResult.error.message });
      return;
    }

    const listResult = await daemonClient.listConversations();
    if (listResult.ok) {
      dispatch({ type: "SET_CONVERSATIONS", payload: listResult.value.map(toStoreConversationSummary) });
    }
  };

  const setCommandPaletteOpen = (isOpen: boolean) => {
    dispatch({ type: "SET_COMMAND_PALETTE_OPEN", payload: isOpen });
  };

  const connectService = useMemo(() => new ConnectService({ daemonClient }), [daemonClient]);

  const memoryClient = useMemo(
    () =>
      new DaemonMemoryClient({
        baseUrl: resolvedDaemonUrl,
      }),
    [resolvedDaemonUrl],
  );

  // First-launch embedding setup check
  const embeddingCheckDoneRef = useRef(false);
  useEffect(() => {
    if (embeddingCheckDoneRef.current || !isConnected) return;
    embeddingCheckDoneRef.current = true;

    let cancelled = false;

    void (async () => {
      const result = await memoryClient.checkCapabilities();
      if (cancelled) return;

      if (result.ok && result.value.setupRequired) {
        dispatch({ type: "SET_EMBEDDING_SETUP_OPEN", payload: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, memoryClient, dispatch]);

  const handleEmbeddingSetupComplete = useCallback((result: EmbeddingSetupResult) => {
    dispatch({ type: "SET_EMBEDDING_SETUP_OPEN", payload: false });
    if (result.configured) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[ok] Embedding provider configured: ${result.provider ?? "unknown"} (${result.model ?? "unknown"})`,
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: "Embedding provider configured" });
    }
  }, [dispatch]);

  const handleEmbeddingSetupCancel = useCallback(() => {
    dispatch({ type: "SET_EMBEDDING_SETUP_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const handleConnectComplete = useCallback(async (result: ConnectResult) => {
    dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: false });
    if (result.success && result.connection) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[ok] ${result.connection.providerName} connected.`,
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: `Connected to ${result.connection.providerName}` });

      // Fetch models from daemon now that a provider is connected
      await fetchModels();
    } else if (result.error) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[error] Connection failed: ${result.error.message}`,
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: "Connection failed" });
    }
  }, [dispatch, fetchModels]);

  const handleConnectCancel = useCallback(() => {
    dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: false });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const handleChannelTokenSubmit = useCallback(async (token: string) => {
    const platform = state.channelTokenPromptPlatform;
    dispatch({ type: "SET_CHANNEL_TOKEN_PROMPT", payload: { open: false } });

    if (!platform) return;

    dispatch({ type: "SET_STATUS", payload: `Adding ${platform} channel...` });

    const baseUrl = await getActiveDaemonUrl();
    const result = await callDaemonChannelApi(
      "/channels/add",
      { platform, token },
      60_000,
      fetch,
      baseUrl,
    );

    if (result.ok) {
      const masked = maskBotToken(token);
      const channelState = result.data.channel?.state ?? "unknown";
      const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: [
            `**${platformLabel} channel configured successfully.**`,
            "",
            `Token: ${masked}`,
            `Status: ${channelState}`,
            "",
            "Use `/channels status` to check connection state.",
          ].join("\n"),
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: `${platformLabel} channel added` });
    } else {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `[error] Failed to add ${platform} channel: ${result.error}`,
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: `Failed to add ${platform} channel` });
    }
  }, [dispatch, state.channelTokenPromptPlatform]);

  const handleChannelTokenCancel = useCallback(() => {
    dispatch({ type: "SET_CHANNEL_TOKEN_PROMPT", payload: { open: false } });
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

  const paletteSources = useMemo<CommandPaletteDataSources>(() => ({
    conversations: state.conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.lastMessageAt,
    })),
    notes: [],
  }), [state.conversations]);

  const executePaletteAction = useCallback((action: PaletteAction) => {
    setCommandPaletteOpen(false);

    switch (action.type) {
      case "command":
        handlePaletteCommand(action.command);
        break;
      case "conversation":
        dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: action.conversationId });
        dispatch({ type: "SET_STATUS", payload: "Switched conversation" });
        break;
      case "note":
        dispatch({ type: "SET_STATUS", payload: `Opening note ${action.noteId}` });
        break;
      case "action":
        handlePaletteAction(action.key);
        break;
    }
  }, [dispatch]);

  const handlePaletteCommand = (commandName: string) => {
    switch (commandName) {
      case "help":
        setShowHelp((current) => {
          const next = !current;
          dispatch({ type: "SET_STATUS", payload: next ? "Help enabled" : "Help disabled" });
          return next;
        });
        break;
      case "new":
        void createNewConversation();
        break;
      case "clear":
        dispatch({ type: "CLEAR_MESSAGES" });
        dispatch({ type: "SET_STATUS", payload: "Cleared messages" });
        break;
      case "model": {
        dispatch({ type: "SET_MODEL_SELECTOR_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Model selector" });
        break;
      }
      case "theme":
        dispatch({ type: "SET_STATUS", payload: "Theme selector" });
        break;
      case "settings":
        dispatch({ type: "SET_STATUS", payload: "Settings" });
        break;
      case "connect":
        dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Connect provider" });
        break;
      case "search-settings":
        dispatch({ type: "SET_SEARCH_SETTINGS_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Search settings" });
        break;
      case "memory-setup":
        dispatch({ type: "SET_EMBEDDING_SETUP_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Embedding setup" });
        break;
      case "daemon":
        dispatch({ type: "SET_DAEMON_PANEL_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Daemon panel" });
        break;
      case "integrations":
        dispatch({ type: "SET_INTEGRATION_PANEL_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Integrations" });
        break;
      case "thinking":
        dispatch({ type: "TOGGLE_THINKING_VISIBILITY" });
        dispatch({
          type: "SET_STATUS",
          payload: state.thinkingVisible ? "Thinking blocks hidden" : "Thinking blocks visible",
        });
        break;
      case "quit":
        exitApp();
        break;
      default:
        dispatch({ type: "SET_STATUS", payload: `Executed /${commandName}` });
    }
  };

  const handlePaletteAction = (actionKey: string) => {
    switch (actionKey) {
      case "new-chat":
        void createNewConversation();
        break;
      case "switch-conversation":
        dispatch({ type: "TOGGLE_PANEL", payload: "drawer" });
        focus.focusPanel("sidebar");
        dispatch({ type: "SET_STATUS", payload: "Drawer opened" });
        break;
      case "search-conversations":
        dispatch({ type: "TOGGLE_PANEL", payload: "drawer" });
        focus.focusPanel("sidebar");
        dispatch({ type: "SET_STATUS", payload: "Search conversations" });
        break;
      case "switch-model":
        dispatch({ type: "SET_MODEL_SELECTOR_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Model selector" });
        break;
      case "switch-theme":
        dispatch({ type: "SET_STATUS", payload: "Theme selector" });
        break;
      case "toggle-drawer":
        dispatch({ type: "TOGGLE_PANEL", payload: "drawer" });
        dispatch({ type: "SET_STATUS", payload: "Drawer toggled" });
        break;
      case "toggle-today":
        dispatch({ type: "TOGGLE_PANEL", payload: "today" });
        dispatch({ type: "SET_STATUS", payload: "Today panel toggled" });
        break;
      case "open-help":
        setShowHelp(true);
        dispatch({ type: "SET_STATUS", payload: "Help enabled" });
        break;
      case "open-settings":
        dispatch({ type: "SET_STATUS", payload: "Settings" });
        break;
      case "clear-chat":
        dispatch({ type: "CLEAR_MESSAGES" });
        dispatch({ type: "SET_STATUS", payload: "Cleared messages" });
        break;
      case "copy-last-response": {
        const lastAssistant = state.messages
          .filter((m) => m.role === "assistant")
          .pop();
        if (lastAssistant) {
          dispatch({ type: "SET_STATUS", payload: "Copied last response" });
        } else {
          dispatch({ type: "SET_STATUS", payload: "No response to copy" });
        }
        break;
      }
      case "open-integrations":
        dispatch({ type: "SET_INTEGRATION_PANEL_OPEN", payload: true });
        dispatch({ type: "SET_STATUS", payload: "Integrations" });
        break;
      default:
        dispatch({ type: "SET_STATUS", payload: `Action: ${actionKey}` });
    }
  };

  useKeyboard((event) => {
    if (showHelp) {
      if (isHelpEvent(event) || isEscapeEvent(event)) {
        closeHelp();
      }
      return;
    }

    // Ctrl+K opens palette globally — from any primary screen
    if (isCommandPaletteToggleEvent(event)) {
      // If another overlay is active, dismiss it first then open palette
      if (!state.isCommandPaletteOpen) {
        if (state.isModelSelectorOpen) {
          dispatch({ type: "SET_MODEL_SELECTOR_OPEN", payload: false });
        }
        if (state.isConnectFlowOpen) {
          dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: false });
        }
        if (state.isChannelTokenPromptOpen) {
          dispatch({ type: "SET_CHANNEL_TOKEN_PROMPT", payload: { open: false } });
        }
      }
      setCommandPaletteOpen(!state.isCommandPaletteOpen);
      dispatch({ type: "SET_STATUS", payload: state.isCommandPaletteOpen ? "Ready" : "Command palette" });
      return;
    }

    // Palette-closes-first rule: if palette is open and another shortcut fires,
    // close palette first then let the shortcut through
    if (state.isCommandPaletteOpen) {
      if (isToggleModelSelectorEvent(event) || isToggleDrawerEvent(event) || isToggleTodayEvent(event)) {
        setCommandPaletteOpen(false);
        // Fall through to let the shortcut execute below
      } else {
        // All other keys are consumed by the palette
        return;
      }
    }

    if (isToggleModelSelectorEvent(event)) {
      dispatch({ type: "SET_MODEL_SELECTOR_OPEN", payload: !state.isModelSelectorOpen });
      dispatch({ type: "SET_STATUS", payload: state.isModelSelectorOpen ? "Ready" : "Model selector" });
      return;
    }

    if (isToggleIntegrationPanelEvent(event)) {
      dispatch({ type: "SET_INTEGRATION_PANEL_OPEN", payload: !state.isIntegrationPanelOpen });
      dispatch({ type: "SET_STATUS", payload: state.isIntegrationPanelOpen ? "Ready" : "Integrations" });
      return;
    }

    if (state.isConnectFlowOpen || state.isModelSelectorOpen || state.isSearchSettingsOpen || state.isDaemonPanelOpen || state.isIntegrationPanelOpen || state.isChannelTokenPromptOpen) {
      return;
    }

    // Escape dismisses topmost unpinned panel before any other action.
    // Skip when completion popup is active — InputArea handles Esc to dismiss it.
    if (isEscapeEvent(event) && !state.isCompletionActive) {
      const hasAnyVisible = state.panels.drawer.visible || state.panels.today.visible || state.panels.modal.visible;
      if (hasAnyVisible) {
        dispatch({ type: "DISMISS_TOPMOST" });
        dispatch({ type: "SET_STATUS", payload: "Panel dismissed" });
        return;
      }
    }

    if (isToggleDrawerEvent(event)) {
      const isCurrentlyVisible = state.panels.drawer.visible;
      dispatch({ type: "TOGGLE_PANEL", payload: "drawer" });
      if (!isCurrentlyVisible) {
        focus.focusPanel("sidebar");
      }
      dispatch({
        type: "SET_STATUS",
        payload: isCurrentlyVisible ? "Drawer closed" : "Drawer opened",
      });
      return;
    }

    if (isToggleTodayEvent(event)) {
      const isCurrentlyVisible = state.panels.today.visible;
      dispatch({ type: "TOGGLE_PANEL", payload: "today" });
      dispatch({
        type: "SET_STATUS",
        payload: isCurrentlyVisible ? "Today panel closed" : "Today panel opened",
      });
      return;
    }

    if (isToggleActivityEvent(event)) {
      dispatch({ type: "TOGGLE_ACTIVITY" });
      const nextMode = state.layoutMode === "activity" ? "Normal" : "Activity";
      dispatch({ type: "SET_STATUS", payload: `${nextMode} layout` });
      return;
    }

    if (isToggleZenEvent(event)) {
      dispatch({ type: "TOGGLE_ZEN" });
      const nextMode = state.layoutMode === "zen" ? "Normal" : "Zen";
      dispatch({ type: "SET_STATUS", payload: `${nextMode} layout` });
      return;
    }

    if (isNewConversationEvent(event)) {
      void createNewConversation();
      return;
    }

    if (isCycleThinkingEvent(event)) {
      dispatch({ type: "CYCLE_THINKING_LEVEL" });
      return;
    }

    // Skip Tab focus cycling when the command completion popup is active —
    // InputArea captures Tab to accept the selected completion suggestion.
    if (isFocusForwardEvent(event) && !state.isCompletionActive) {
      focus.focusNext();
      return;
    }

    if (isFocusBackwardEvent(event) && !state.isCompletionActive) {
      focus.focusPrev();
      return;
    }

    const directFocusTarget = resolveDirectPanelFocus(event);
    if (directFocusTarget) {
      focus.focusPanel(directFocusTarget);
      return;
    }

    if (isQuitEvent(event)) {
      exitApp();
      return;
    }

    if (isHelpEvent(event)) {
      setShowHelp((current) => {
        const next = !current;
        dispatch({
          type: "SET_STATUS",
          payload: next ? "Help: Tab/Shift+Tab focus, Ctrl+1/2/3 jump" : "Ready",
        });
        return next;
      });
    }
  });

  // Onboarding: show loading screen while detection runs
  if (state.onboardingStatus === "checking") {
    return (
      <Box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text content="Loading..." />
      </Box>
    );
  }

  // Onboarding: show wizard for first-run or resume
  if (state.onboardingStatus === "first-run" || state.onboardingStatus === "resume") {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        forceRerun={state.onboardingForceRerun}
      />
    );
  }

  // Normal app render (onboardingStatus === "complete")
  return (
    <>
      <Layout
        version={version}
        dimensions={dimensions}
        showHelp={showHelp}
        connectionStatus={connectionStatus}
        daemonMode={daemonMode}
        onSubmitMessage={handleMessageSubmit}
      />
      <CommandPalette
        isOpen={state.isCommandPaletteOpen}
        sources={paletteSources}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={executePaletteAction}
      />
      <ModelSelectorModal
        visible={state.isModelSelectorOpen}
        providerGroups={providerGroups}
        currentModel={state.currentModel}
        onSelect={handleModelSelect}
        onClose={closeModelSelector}
      />
      <SearchSettingsModal
        visible={state.isSearchSettingsOpen}
        connectService={connectService}
        onClose={closeSearchSettings}
      />
      <HelpScreen isOpen={showHelp} startup={startupContent} />
      {state.isConnectFlowOpen ? (
        <ConnectFlow
          connectService={connectService}
          onComplete={handleConnectComplete}
          onCancel={handleConnectCancel}
        />
      ) : null}
      {state.isEmbeddingSetupOpen ? (
        <EmbeddingSetupWizard
          memoryClient={memoryClient}
          onComplete={handleEmbeddingSetupComplete}
          onCancel={handleEmbeddingSetupCancel}
        />
      ) : null}
      <DaemonPanel
        visible={state.isDaemonPanelOpen}
        onClose={closeDaemonPanel}
      />
      <IntegrationPanel
        visible={state.isIntegrationPanelOpen}
        onClose={closeIntegrationPanel}
      />
      {state.isChannelTokenPromptOpen && state.channelTokenPromptPlatform ? (
        <ChannelTokenPrompt
          platform={state.channelTokenPromptPlatform}
          onSubmit={handleChannelTokenSubmit}
          onCancel={handleChannelTokenCancel}
        />
      ) : null}
    </>
  );
}

interface AppContainerProps {
  version: string;
  dimensions: TerminalDimensions;
}

function AppContainer({ version, dimensions }: AppContainerProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [hasRenderError, setHasRenderError] = useState(false);
  const { tokens } = useThemeTokens();
  const renderer = useRenderer();

  useKeyboard((event) => {
    if (!hasRenderError) {
      return;
    }

    if (isRetryEvent(event)) {
      setRetryNonce((current) => current + 1);
      return;
    }

    if (isQuitEvent(event)) {
      destroyRenderer(renderer);
      process.exit(1);
    }
  });

  return (
    <ErrorBoundary retryNonce={retryNonce} onErrorChange={setHasRenderError} themeTokens={tokens}>
      <AppView version={version} dimensions={dimensions} />
    </ErrorBoundary>
  );
}

export function App({ version }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, DEFAULT_STATE);
  const rawDimensions = useTerminalDimensions();
  const dimensions = useMemo(() => normalizeDimensions(rawDimensions), [rawDimensions]);
  const contextValue = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <DaemonProvider>
      <ThemeProvider>
        <AppContext.Provider value={contextValue}>
          <AppContainer version={version} dimensions={dimensions} />
        </AppContext.Provider>
      </ThemeProvider>
    </DaemonProvider>
  );
}
