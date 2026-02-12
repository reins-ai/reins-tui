import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { CommandPalette, type CommandPaletteDataSources, ErrorBoundary, Layout } from "./components";
import { ModelSelectorModal, type ProviderModelGroup } from "./components/model-selector";
import { ConnectFlow, type ConnectResult } from "./components/connect-flow";
import { HelpScreen } from "./screens";
import { DEFAULT_DAEMON_HTTP_BASE_URL } from "./daemon/client";
import { DaemonProvider, useDaemon } from "./daemon/daemon-context";
import type { DaemonMessage, DaemonResult, ConversationSummary as DaemonConversationSummary } from "./daemon/contracts";
import { ConnectService } from "./providers/connect-service";
import { GreetingService, type StartupContent } from "./personalization/greeting-service";
import { createConversationStore, type ConversationStoreState } from "./state/conversation-store";
import { loadModelPreferences, saveModelPreferences } from "./state/model-persistence";
import { loadPinPreferences, savePinPreferences } from "./state/pin-persistence";
import { toPinPreferences, applyPinPreferences, DEFAULT_PANEL_STATE } from "./state/layout-mode";
import { useConversations, useFocus } from "./hooks";
import type { PaletteAction } from "./palette/fuzzy-index";
import type { ConversationLifecycleStatus } from "./state/status-machine";
import { AppContext, DEFAULT_STATE, appReducer, useApp } from "./store";
import type { DisplayMessage, DisplayToolCall } from "./store";
import { ThemeProvider, useThemeTokens } from "./theme";
import { type KeyEvent, type TerminalDimensions, useKeyboard, useRenderer, useTerminalDimensions } from "./ui";

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

function toDisplayMessages(snapshot: ConversationStoreState): DisplayMessage[] {
  const activeToolCalls =
    snapshot.streaming.status === "thinking"
      ? snapshot.streaming.toolCalls
      : snapshot.streaming.status === "streaming"
        ? snapshot.streaming.toolCalls
        : snapshot.streaming.status === "complete"
          ? snapshot.streaming.toolCalls
          : snapshot.streaming.status === "error"
            ? snapshot.streaming.toolCalls
            : [];

  const assistantMessageId =
    snapshot.streaming.status === "thinking"
      ? snapshot.streaming.assistantMessageId
      : snapshot.streaming.status === "streaming"
        ? snapshot.streaming.assistantMessageId
        : snapshot.streaming.status === "complete"
          ? snapshot.streaming.assistantMessageId
          : snapshot.streaming.status === "error"
            ? snapshot.streaming.assistantMessageId
            : null;

  return snapshot.messages.map((message: DaemonMessage) => {
    const isStreamingMessage =
      assistantMessageId !== null
      && message.id === assistantMessageId
      && (snapshot.streaming.status === "thinking" || snapshot.streaming.status === "streaming");

    const toolCalls =
      assistantMessageId !== null && message.id === assistantMessageId && activeToolCalls.length > 0
        ? activeToolCalls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            status: toDisplayToolCallStatus(toolCall.status),
            result: toolCall.error ?? toolCall.result,
            isError: toolCall.status === "error",
          }))
        : undefined;

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      toolCalls,
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

function isToggleModelSelectorEvent(event: KeyEvent): boolean {
  return event.ctrl === true && (event.name === "m" || event.sequence === "\x0d" || event.sequence === "m");
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
  const [showHelp, setShowHelp] = useState(false);
  const [startupContent, setStartupContent] = useState<StartupContent | null>(null);
  const renderer = useRenderer();
  const isExitingRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(state.activeConversationId);
  const conversationStoreRef = useRef(createConversationStore({ daemonClient }));

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
    const unsubscribe = conversationStoreRef.current.subscribe((snapshot) => {
      dispatch({ type: "SET_MESSAGES", payload: toDisplayMessages(snapshot) });
      dispatch({
        type: "SET_STREAMING_LIFECYCLE_STATUS",
        payload: snapshot.streaming.lifecycle.status,
      });
      dispatch({
        type: "SET_STREAMING",
        payload:
          snapshot.streaming.lifecycle.status === "sending"
          || snapshot.streaming.lifecycle.status === "thinking"
          || snapshot.streaming.lifecycle.status === "streaming",
      });
      dispatch({ type: "SET_STATUS", payload: getStatusTextForLifecycle(snapshot.streaming.lifecycle.status) });

      if (snapshot.conversationId && snapshot.conversationId !== activeConversationIdRef.current) {
        dispatch({ type: "SET_ACTIVE_CONVERSATION", payload: snapshot.conversationId });
      }
    });

    return () => {
      unsubscribe();
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

      const converted: DisplayMessage[] = result.value.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: parseIsoDate(message.createdAt),
      }));
      dispatch({ type: "SET_MESSAGES", payload: converted });
    };

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [daemonClient, dispatch, state.activeConversationId]);

  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${DEFAULT_DAEMON_HTTP_BASE_URL}/api/models`);
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
        const authResponse = await fetch(`${DEFAULT_DAEMON_HTTP_BASE_URL}/api/providers/auth/list`);
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
  }, [dispatch]);

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
    });

    if (!sendResult.ok) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `✧ ${sendResult.error.message}`,
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

  const handleConnectComplete = useCallback(async (result: ConnectResult) => {
    dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: false });
    if (result.success && result.connection) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `✦ ${result.connection.providerName} connected.`,
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
          content: `✧ Connection failed: ${result.error.message}`,
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

    if (state.isConnectFlowOpen || state.isModelSelectorOpen) {
      return;
    }

    // Escape dismisses topmost unpinned panel before any other action
    if (isEscapeEvent(event)) {
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

    if (isFocusForwardEvent(event)) {
      focus.focusNext();
      return;
    }

    if (isFocusBackwardEvent(event)) {
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
      <HelpScreen isOpen={showHelp} startup={startupContent} />
      {state.isConnectFlowOpen ? (
        <ConnectFlow
          connectService={connectService}
          onComplete={handleConnectComplete}
          onCancel={handleConnectCancel}
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
