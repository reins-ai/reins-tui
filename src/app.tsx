import { useCallback, useMemo, useReducer, useRef, useState } from "react";

import { CommandPalette, type CommandPaletteDataSources, ErrorBoundary, getNextModel, HelpScreen, Layout } from "./components";
import { ConnectFlow, type ConnectResult } from "./components/connect-flow";
import { ConnectService } from "./providers/connect-service";
import { useConversations, useFocus } from "./hooks";
import type { PaletteAction } from "./palette/fuzzy-index";
import { AppContext, DEFAULT_STATE, appReducer, useApp } from "./store";
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

function resolveDirectPanelFocus(event: KeyEvent) {
  if (event.ctrl !== true) {
    return null;
  }

  if (event.name === "1" || event.sequence === "1") {
    return "sidebar" as const;
  }

  if (event.name === "2" || event.sequence === "2") {
    return "conversation" as const;
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
  const focus = useFocus();
  const conversationManager = useConversations();
  const [showHelp, setShowHelp] = useState(false);
  const renderer = useRenderer();
  const isExitingRef = useRef(false);

  const closeHelp = useCallback(() => {
    setShowHelp(false);
    dispatch({ type: "SET_STATUS", payload: "Ready" });
  }, [dispatch]);

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

  const handleMessageSubmit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }

    dispatch({
      type: "ADD_MESSAGE",
      payload: {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: new Date(),
      },
    });
    dispatch({ type: "SET_STATUS", payload: "Message queued" });
  };

  const setCommandPaletteOpen = (isOpen: boolean) => {
    dispatch({ type: "SET_COMMAND_PALETTE_OPEN", payload: isOpen });
  };

  const connectService = useMemo(() => new ConnectService(), []);

  const handleConnectComplete = useCallback((result: ConnectResult) => {
    dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: false });
    if (result.success && result.connection) {
      dispatch({
        type: "ADD_MESSAGE",
        payload: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `✦ ${result.connection.providerName} connected. Models: ${result.connection.models.join(", ") || "Available"}`,
          createdAt: new Date(),
        },
      });
      dispatch({ type: "SET_STATUS", payload: `Connected to ${result.connection.providerName}` });
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
  }, [dispatch]);

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
        dispatch({ type: "SET_STATUS", payload: `Executed action: ${action.key}` });
        break;
    }
    setCommandPaletteOpen(false);
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
        conversationManager.createConversation();
        dispatch({ type: "SET_STATUS", payload: "Started a new conversation" });
        break;
      case "clear":
        dispatch({ type: "CLEAR_MESSAGES" });
        dispatch({ type: "SET_STATUS", payload: "Cleared messages" });
        break;
      case "model": {
        const nextModel = getNextModel(state.currentModel);
        dispatch({ type: "SET_MODEL", payload: nextModel });
        dispatch({ type: "SET_STATUS", payload: `Model set to ${nextModel}` });
        break;
      }
      case "quit":
        exitApp();
        break;
      default:
        dispatch({ type: "SET_STATUS", payload: `Executed /${commandName}` });
    }
  };

  useKeyboard((event) => {
    if (showHelp) {
      if (isHelpEvent(event) || isEscapeEvent(event)) {
        closeHelp();
      }
      return;
    }

    if (isCommandPaletteToggleEvent(event)) {
      setCommandPaletteOpen(!state.isCommandPaletteOpen);
      dispatch({ type: "SET_STATUS", payload: state.isCommandPaletteOpen ? "Ready" : "Command palette" });
      return;
    }

    if (state.isCommandPaletteOpen || state.isConnectFlowOpen) {
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
      conversationManager.createConversation();
      dispatch({ type: "SET_STATUS", payload: "Started a new conversation" });
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
      if (directFocusTarget === "sidebar" && state.layoutMode === "zen") {
        return;
      }
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
        onSubmitMessage={handleMessageSubmit}
      />
      <CommandPalette
        isOpen={state.isCommandPaletteOpen}
        sources={paletteSources}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={executePaletteAction}
      />
      <HelpScreen isOpen={showHelp} />
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
    <ThemeProvider>
      <AppContext.Provider value={contextValue}>
        <AppContainer version={version} dimensions={dimensions} />
      </AppContext.Provider>
    </ThemeProvider>
  );
}
