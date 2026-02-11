import { useCallback, useMemo, useReducer, useRef, useState } from "react";

import { CommandPalette, ErrorBoundary, getNextModel, HelpScreen, Layout } from "./components";
import { useConversations, useFocus } from "./hooks";
import { DEFAULT_COMMANDS, type Command } from "./lib";
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

  const executeCommand = (command: Command) => {
    switch (command.action) {
      case "NEW_CONVERSATION":
        conversationManager.createConversation();
        dispatch({ type: "SET_STATUS", payload: "Started a new conversation" });
        break;
      case "CLEAR_MESSAGES":
        dispatch({ type: "CLEAR_MESSAGES" });
        dispatch({ type: "SET_STATUS", payload: "Cleared messages" });
        break;
      case "SWITCH_MODEL": {
        const nextModel = getNextModel(state.currentModel);
        dispatch({ type: "SET_MODEL", payload: nextModel });
        dispatch({ type: "SET_STATUS", payload: `Model set to ${nextModel}` });
        break;
      }
      case "TOGGLE_HELP": {
        setShowHelp((current) => {
          const next = !current;
          dispatch({ type: "SET_STATUS", payload: next ? "Help enabled" : "Help disabled" });
          return next;
        });
        break;
      }
      case "FOCUS_SIDEBAR":
        focus.focusPanel("sidebar");
        dispatch({ type: "SET_STATUS", payload: "Focused sidebar" });
        break;
      case "FOCUS_CONVERSATION":
        focus.focusPanel("conversation");
        dispatch({ type: "SET_STATUS", payload: "Focused conversation" });
        break;
      case "FOCUS_INPUT":
        focus.focusPanel("input");
        dispatch({ type: "SET_STATUS", payload: "Focused input" });
        break;
      case "QUIT":
        exitApp();
        break;
      default:
        dispatch({ type: "SET_STATUS", payload: `Executed ${command.label}` });
    }

    setCommandPaletteOpen(false);
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

    if (state.isCommandPaletteOpen) {
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
        commands={DEFAULT_COMMANDS}
        onClose={() => setCommandPaletteOpen(false)}
        onExecute={executeCommand}
      />
      <HelpScreen isOpen={showHelp} />
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
