import { useRef, useState } from "react";

import { dispatchCommand, type CommandResult } from "../commands/handlers";
import { parseSlashCommand } from "../commands/parser";
import { SLASH_COMMANDS } from "../commands/registry";
import { useDaemon } from "../daemon/daemon-context";

import { useApp } from "../store";
import { InputHistory } from "../lib";
import { useThemeContext, useThemeTokens } from "../theme";
import { Box, Input, Text, useKeyboard, useRenderer } from "../ui";
import { useConversations } from "../hooks";

export interface InputAreaProps {
  isFocused: boolean;
  borderColor: string;
  onSubmit(text: string): void;
}

const MAX_INPUT_LENGTH = 4000;

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

export function classifyInputSubmission(text: string): "empty" | "command" | "message" {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return "empty";
  }

  if (text.trimStart().startsWith("/")) {
    return "command";
  }

  return "message";
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

export function InputArea({ isFocused, borderColor, onSubmit }: InputAreaProps) {
  const { state, dispatch } = useApp();
  const conversations = useConversations();
  const { client: daemonClient } = useDaemon();
  const { tokens } = useThemeTokens();
  const { registry, setTheme } = useThemeContext();
  const renderer = useRenderer();
  const history = useRef(new InputHistory());
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState(false);

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
    }
  };

  const handleCommand = (commandInput: string): void => {
    const parseResult = parseSlashCommand(commandInput);
    if (!parseResult.ok) {
      const message = parseResult.error.message;
      dispatch({ type: "SET_STATUS", payload: message });
      setValidationError(message);
      return;
    }

    const commandResult = dispatchCommand(parseResult.value, {
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

    if (isUpKey(event.name)) {
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

    if (isDownKey(event.name)) {
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
    const next = clampText(normalizeInputValue(value));
    setInput(next);
    history.current.setDraft(next);

    if (validationError !== null) {
      setValidationError(null);
    }
  };

  const handleSubmit = () => {
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
      handleCommand(input);
      history.current.push(input);
      setInput("");
      return;
    }

    onSubmit(input);
    history.current.push(input);
    setInput("");
    setValidationError(null);
  };

  return (
    <Box
      style={{
        height: 3,
        border: true,
        borderColor,
        marginTop: 1,
        padding: 1,
        flexDirection: "column",
      }}
    >
      <Input
        focused={isFocused}
        placeholder="Type a message... (Enter to send)"
        value={input}
        onInput={handleInput}
        onSubmit={handleSubmit}
      />
      <Box style={{ flexDirection: "row" }}>
        <Text
          content={
            validationError ?? (isFocused ? "Enter to send" : "Press Tab to focus input")
          }
          style={{ color: validationError ? tokens["status.error"] : tokens["text.secondary"] }}
        />
        <Text content={` ${input.length}/${MAX_INPUT_LENGTH}`} style={{ color: tokens["text.secondary"] }} />
      </Box>
    </Box>
  );
}
