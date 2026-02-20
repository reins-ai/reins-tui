import { useEffect, useMemo, useRef, useState } from "react";

import { dispatchCommand, type CommandResult } from "../commands/handlers";
import { parseSlashCommand } from "../commands/parser";
import { SLASH_COMMANDS } from "../commands/registry";
import type { CompletionProviderContext } from "../commands/completion";
import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../daemon/client";
import { getActiveDaemonUrl } from "../daemon/actions";
import { useDaemon } from "../daemon/daemon-context";
import { createEnvironmentClient } from "../daemon/environment-client";
import { createMemoryClient } from "../daemon/memory-client";
import { useApp } from "../store";
import { InputHistory } from "../lib";
import { useCommandCompletion } from "../hooks/use-command-completion";
import { useThemeContext, useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import type { BorderCharacters, FramedBlockStyle } from "../ui/types";
import { Box, Input, Text, useKeyboard, useRenderer } from "../ui";
import { ACCENT_BORDER_CHARS, FramedBlock, SUBTLE_BORDER_CHARS } from "../ui/primitives";
import { useConversations } from "../hooks";
import { CompletionPopup } from "./completion-popup";
import type { ConversationLifecycleStatus } from "../state/status-machine";

export interface InputAreaProps {
  isFocused: boolean;
  onSubmit(text: string): void;
  onCancelPrompt?(): void | Promise<void>;
}

export type InputSubmissionKind = "empty" | "command" | "message";

export const MAX_INPUT_LENGTH = 4000;
export const ESCAPE_CANCEL_CONFIRM_TIMEOUT_MS = 5_000;

export function isPromptCancellableLifecycle(status: ConversationLifecycleStatus): boolean {
  return status === "thinking" || status === "streaming";
}

export function getCancelPromptHint(isArmed: boolean): string {
  return isArmed ? "Press escape again" : "Esc to cancel";
}

function isUpKey(name?: string): boolean {
  return name === "up";
}

function isDownKey(name?: string): boolean {
  return name === "down";
}

function normalizeInputValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") {
      return value.plainText;
    }

    if ("value" in value && typeof value.value === "string") {
      return value.value;
    }
  }

  return "";
}

function validateMessage(text: string): string | null {
  if (text.trim().length === 0) {
    return "Message cannot be empty";
  }

  if (text.length > MAX_INPUT_LENGTH) {
    return `Message exceeds ${MAX_INPUT_LENGTH} characters`;
  }

  return null;
}

function clampText(text: string): string {
  if (text.length <= MAX_INPUT_LENGTH) {
    return text;
  }

  return text.slice(0, MAX_INPUT_LENGTH);
}

export function classifyInputSubmission(text: string): InputSubmissionKind {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return "empty";
  }

  if (text.trimStart().startsWith("/")) {
    return "command";
  }

  return "message";
}

// --- Input frame styling ---

export type InputFrameState = "focused" | "disabled" | "default";

/**
 * Resolve the visual state of the input frame based on focus and daemon mode.
 * Disabled state takes priority over focus.
 */
export function resolveInputFrameState(isFocused: boolean, daemonMode: string): InputFrameState {
  if (daemonMode === "mock") {
    return "disabled";
  }
  return isFocused ? "focused" : "default";
}

/**
 * Resolve the FramedBlock style for the input area based on its visual state.
 * Focused: accent border with input background for active composition.
 * Disabled: warning-tinted accent for offline/mock mode.
 * Default: subtle border with secondary surface for passive state.
 */
export function getInputBlockStyle(
  frameState: InputFrameState,
  tokens: Readonly<ThemeTokens>,
): FramedBlockStyle {
  switch (frameState) {
    case "focused":
      return {
        accentColor: tokens["border.focus"],
        backgroundColor: tokens["input.bg"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
    case "disabled":
      return {
        accentColor: tokens["status.warning"],
        backgroundColor: tokens["surface.secondary"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
    case "default":
      return {
        accentColor: tokens["border.subtle"],
        backgroundColor: tokens["surface.secondary"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
  }
}

/**
 * Select the border character preset based on input frame state.
 * Focused input uses the accent (heavy) border for visual prominence;
 * other states use the subtle (light) border for quieter weight.
 */
export function getInputBorderChars(frameState: InputFrameState): BorderCharacters {
  return frameState === "focused" ? ACCENT_BORDER_CHARS : SUBTLE_BORDER_CHARS;
}

/**
 * Format the character count display string.
 * Returns a compact count when input is non-empty, empty string otherwise.
 * This keeps the count non-noisy — only visible when actively composing.
 */
export function formatCharCount(inputLength: number, maxLength: number): string {
  if (inputLength === 0) {
    return "";
  }
  return `${inputLength}/${maxLength}`;
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

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) {
    return value;
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return new Date();
  }

  return asDate;
}

export function InputArea({ isFocused, onSubmit, onCancelPrompt }: InputAreaProps) {
  const { state, dispatch } = useApp();
  const conversations = useConversations();
  const { client: daemonClient, mode: daemonMode, isConnected } = useDaemon();
  const { tokens } = useThemeTokens();
  const { registry, setTheme } = useThemeContext();
  const renderer = useRenderer();
  const history = useRef(new InputHistory());
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState(false);
  const [cancelPromptArmed, setCancelPromptArmed] = useState(false);
  const [daemonUrl, setDaemonUrl] = useState(DEFAULT_DAEMON_HTTP_BASE_URL);
  const cancelPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPromptCancellable = isPromptCancellableLifecycle(state.streamingLifecycleStatus);

  const clearCancelPromptTimer = () => {
    if (cancelPromptTimerRef.current !== null) {
      clearTimeout(cancelPromptTimerRef.current);
      cancelPromptTimerRef.current = null;
    }
  };

  const disarmCancelPrompt = () => {
    clearCancelPromptTimer();
    setCancelPromptArmed(false);
  };

  // --- Command completion ---
  const completionProviderContext: CompletionProviderContext = useMemo(() => ({
    models: state.availableModels,
    themes: () => registry.listThemes(),
    environments: state.activeEnvironment ? [state.activeEnvironment] : [],
    commands: SLASH_COMMANDS.map((c) => c.name),
  }), [state.availableModels, state.activeEnvironment, registry]);

  const [completionState, completionActions] = useCommandCompletion({
    isFocused,
    providerContext: completionProviderContext,
  });

  // Sync completion active state to the store so AppView can skip Tab focus cycling
  const prevCompletionOpenRef = useRef(false);
  useEffect(() => {
    if (completionState.isOpen !== prevCompletionOpenRef.current) {
      prevCompletionOpenRef.current = completionState.isOpen;
      dispatch({ type: "SET_COMPLETION_ACTIVE", payload: completionState.isOpen });
    }
  }, [completionState.isOpen, dispatch]);

  // Resolve active daemon URL from profile store
  useEffect(() => {
    void (async () => {
      const url = await getActiveDaemonUrl();
      setDaemonUrl(url);
    })();
  }, [isConnected]);

  const memoryClient = useMemo(
    () => createMemoryClient(isConnected, daemonUrl),
    [isConnected, daemonUrl],
  );

  const environmentClient = useMemo(
    () => createEnvironmentClient(isConnected, daemonUrl),
    [isConnected, daemonUrl],
  );

  useEffect(() => {
    if (!environmentClient) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await environmentClient.refresh();
      if (!cancelled && result.ok) {
        dispatch({ type: "SET_ENVIRONMENT", payload: result.value.activeEnvironment });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [environmentClient, dispatch]);

  useEffect(() => {
    if (!isPromptCancellable || !isFocused) {
      disarmCancelPrompt();
    }
    return () => {
      clearCancelPromptTimer();
    };
  }, [isPromptCancellable, isFocused]);

  const appendCommandResponse = (text: string) => {
    dispatch({
      type: "ADD_MESSAGE",
      payload: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text,
        createdAt: new Date(),
      },
    });
  };

  const applyCommandResult = (result: CommandResult) => {
    dispatch({ type: "SET_STATUS", payload: result.statusMessage });

    if (result.responseText) {
      appendCommandResponse(result.responseText);
    }

    for (const signal of result.signals ?? []) {
      if (signal.type === "QUIT_TUI") {
        destroyRenderer(renderer);
        process.exit(0);
      }
      if (signal.type === "OPEN_CONNECT_FLOW") {
        dispatch({ type: "SET_CONNECT_FLOW_OPEN", payload: true });
      }
      if (signal.type === "OPEN_EMBEDDING_SETUP") {
        dispatch({ type: "SET_EMBEDDING_SETUP_OPEN", payload: true });
      }
      if (signal.type === "OPEN_SEARCH_SETTINGS") {
        dispatch({ type: "SET_SEARCH_SETTINGS_OPEN", payload: true });
      }
      if (signal.type === "OPEN_DAEMON_PANEL") {
        dispatch({ type: "SET_DAEMON_PANEL_OPEN", payload: true });
      }
      if (signal.type === "OPEN_INTEGRATION_PANEL") {
        dispatch({ type: "SET_INTEGRATION_PANEL_OPEN", payload: true });
      }
      if (signal.type === "OPEN_SKILL_PANEL") {
        dispatch({ type: "SET_SKILL_PANEL_OPEN", payload: true });
      }
      if (signal.type === "OPEN_BROWSER_PANEL") {
        dispatch({ type: "SET_BROWSER_PANEL_OPEN", payload: true });
      }
      if (signal.type === "OPEN_SCHEDULE_PANEL") {
        dispatch({ type: "SET_SCHEDULE_PANEL_OPEN", payload: true });
      }
      if (signal.type === "OPEN_PERSONA_EDITOR") {
        dispatch({ type: "SET_PERSONA_EDITOR_OPEN", payload: true });
      }
      if (signal.type === "PROMPT_CHANNEL_TOKEN" && signal.payload) {
        dispatch({ type: "SET_CHANNEL_TOKEN_PROMPT", payload: { open: true, platform: signal.payload } });
      }
      if (signal.type === "RELAUNCH_ONBOARDING") {
        dispatch({ type: "SET_ONBOARDING_RERUN" });
      }
      if (signal.type === "ENVIRONMENT_SWITCHED" && signal.payload) {
        dispatch({ type: "SET_ENVIRONMENT", payload: signal.payload });
      }
      if (signal.type === "TOGGLE_THINKING_VISIBILITY") {
        dispatch({ type: "TOGGLE_THINKING_VISIBILITY" });
      }
    }
  };

  const handleCommand = async (commandInput: string): Promise<void> => {
    const parseResult = parseSlashCommand(commandInput);
    if (!parseResult.ok) {
      const message = parseResult.error.message;
      dispatch({ type: "SET_STATUS", payload: message });
      setValidationError(message);
      return;
    }

    const commandResult = await dispatchCommand(parseResult.value, {
      catalog: SLASH_COMMANDS,
      model: {
        availableModels: state.availableModels,
        currentModel: state.currentModel,
        setModel(model: string) {
          dispatch({ type: "SET_MODEL", payload: model });
        },
      },
      theme: {
        activeTheme: registry.getActiveThemeName(),
        listThemes() {
          return registry.listThemes();
        },
        setTheme,
      },
      session: {
        activeConversationId: state.activeConversationId,
        messages: state.messages.map((message) => ({
          role: message.role === "assistant" || message.role === "system" ? message.role : "user",
          content: message.content,
          createdAt: toDate(message.createdAt),
        })),
        createConversation(title?: string) {
          return conversations.createConversation(title);
        },
        clearConversation() {
          dispatch({ type: "CLEAR_MESSAGES" });
        },
      },
      view: {
        compactMode,
        setCompactMode,
      },
      environment: environmentClient,
      memory: memoryClient,
      daemonClient,
    });

    if (!commandResult.ok) {
      dispatch({ type: "SET_STATUS", payload: commandResult.error.message });
      setValidationError(commandResult.error.message);
      return;
    }

    setValidationError(null);
    applyCommandResult(commandResult.value);
  };

  useKeyboard((event) => {
    if (!isFocused) {
      return;
    }

    // --- Completion keyboard handling ---
    const keyName = event.name ?? "";

    // Tab: accept the selected completion suggestion
    if (keyName === "tab" && !event.shift && completionState.isOpen) {
      const applied = completionActions.acceptSelected();
      if (applied) {
        setInput(applied.value);
        history.current.setDraft(applied.value);
        // Trigger re-evaluation of completions for chained completion
        completionActions.update(applied.value);
      }
      return;
    }

    // Up/Down: navigate completion suggestions when popup is open
    if (isUpKey(keyName) && completionState.isOpen) {
      completionActions.moveSelection(-1);
      return;
    }

    if (isDownKey(keyName) && completionState.isOpen) {
      completionActions.moveSelection(1);
      return;
    }

    const isEscapeKey = keyName === "escape" || keyName === "esc";

    // Escape: dismiss completion popup
    if (isEscapeKey && completionState.isOpen) {
      disarmCancelPrompt();
      completionActions.dismiss();
      return;
    }

    // Escape twice to cancel active prompt while model is working
    if (isEscapeKey && isPromptCancellable) {
      if (!cancelPromptArmed) {
        setCancelPromptArmed(true);
        clearCancelPromptTimer();
        cancelPromptTimerRef.current = setTimeout(() => {
          setCancelPromptArmed(false);
          cancelPromptTimerRef.current = null;
        }, ESCAPE_CANCEL_CONFIRM_TIMEOUT_MS);
        return;
      }

      disarmCancelPrompt();
      void onCancelPrompt?.();
      return;
    }

    if (cancelPromptArmed) {
      disarmCancelPrompt();
    }

    // --- Original history navigation (only when popup is NOT open) ---
    if (isUpKey(keyName)) {
      if (input.trim().length > 0) {
        return;
      }

      history.current.setDraft(input);
      const previous = history.current.navigateUp();
      if (previous !== null) {
        setInput(previous);
      }
      return;
    }

    if (isDownKey(keyName)) {
      if (input.trim().length > 0) {
        return;
      }

      const next = history.current.navigateDown();
      if (next !== null) {
        setInput(next);
      }
    }
  });

  const handleInput = (value: string) => {
    if (!isFocused) {
      return;
    }

    const next = clampText(normalizeInputValue(value));
    if (cancelPromptArmed) {
      disarmCancelPrompt();
    }
    setInput(next);
    history.current.setDraft(next);
    completionActions.update(next);

    if (validationError !== null) {
      setValidationError(null);
    }
  };

  const handleSubmit = () => {
    if (!isFocused) {
      return;
    }

    const kind = classifyInputSubmission(input);
    if (kind === "empty") {
      setValidationError("Message cannot be empty");
      return;
    }

    const error = validateMessage(input);
    if (error) {
      setValidationError(error);
      return;
    }

    if (kind === "command") {
      disarmCancelPrompt();
      void handleCommand(input);
      history.current.push(input);
      setInput("");
      completionActions.update("");
      return;
    }

    onSubmit(input);
    disarmCancelPrompt();
    history.current.push(input);
    setInput("");
    completionActions.update("");
    setValidationError(null);
  };

  const frameState = resolveInputFrameState(isFocused, daemonMode);
  const blockStyle = getInputBlockStyle(frameState, tokens);
  const borderChars = getInputBorderChars(frameState);
  const charCount = formatCharCount(input.length, MAX_INPUT_LENGTH);

  // Build contextual hint text
  const completionHintParts: string[] = [];
  if (completionState.ghostText && isFocused) {
    completionHintParts.push(completionState.ghostText);
  }
  if (completionState.isOpen) {
    completionHintParts.push("Tab complete · ↑↓ select · Esc dismiss");
  } else if (isFocused) {
    const focusedHintParts = ["Enter to send"];
    if (isPromptCancellable) {
      focusedHintParts.push(getCancelPromptHint(cancelPromptArmed));
    }
    focusedHintParts.push("Ctrl+K palette");
    completionHintParts.push(focusedHintParts.join(" · "));
  } else {
    completionHintParts.push("Tab to focus · Ctrl+K palette");
  }

  const hintText = validationError
    ?? (daemonMode === "mock"
      ? "⚠ Daemon disconnected — start daemon for real responses"
      : completionHintParts.join("  ·  "));

  const hintColor = validationError
    ? tokens["status.error"]
    : daemonMode === "mock"
      ? tokens["status.warning"]
      : cancelPromptArmed
        ? tokens["status.success"]
      : tokens["text.muted"];

  return (
    <>
      {/* Completion popup — sits above the input in natural flow */}
      <CompletionPopup
        visible={completionState.isOpen}
        suggestions={completionState.result.suggestions}
        selectedIndex={completionState.selectedIndex}
      />
      <FramedBlock style={blockStyle} borderChars={borderChars}>
        <Input
          focused={isFocused}
          placeholder={daemonMode === "mock" ? "⚠ Daemon offline — responses are simulated" : "Type a message... (Enter to send)"}
          value={input}
          onInput={handleInput}
          onSubmit={handleSubmit}
        />
        <Box style={{ flexDirection: "row" }}>
          <Box style={{ flexGrow: 1 }}>
            <Text
              content={hintText}
              style={{ color: hintColor }}
            />
          </Box>
          {charCount ? (
            <Text
              content={charCount}
              style={{ color: tokens["text.muted"] }}
            />
          ) : null}
        </Box>
      </FramedBlock>
    </>
  );
}
