import { useRef, useState } from "react";

import { InputHistory } from "../lib";
import { useThemeTokens } from "../theme";
import { Box, Input, Text, useKeyboard } from "../ui";

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

export function InputArea({ isFocused, borderColor, onSubmit }: InputAreaProps) {
  const { tokens } = useThemeTokens();
  const history = useRef(new InputHistory());
  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

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
    const error = validateMessage(input);
    if (error) {
      setValidationError(error);
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
