import { useCallback, useState } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, Input, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";
import { maskSecret } from "./connect-flow";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChannelTokenPromptProps {
  platform: string;
  onSubmit: (token: string) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") return value.plainText;
    if ("value" in value && typeof value.value === "string") return value.value;
  }
  return "";
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelTokenPrompt({ platform, onSubmit, onCancel }: ChannelTokenPromptProps) {
  const { tokens } = useThemeTokens();
  const [secretInput, setSecretInput] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = secretInput.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  }, [secretInput, onSubmit]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    if (keyName === "escape" || keyName === "esc") {
      onCancel();
      return;
    }
    if (keyName === "return" || keyName === "enter") {
      handleSubmit();
    }
  });

  const masked = maskSecret(secretInput);
  const platformLabel = capitalize(platform);

  return (
    <ModalPanel
      visible
      title={`${platformLabel} Bot Token`}
      hint="Enter confirm \u00b7 Esc cancel"
      width={72}
      height={12}
      closeOnEscape={false}
      onClose={onCancel}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text
          content={`Enter your ${platformLabel} bot token:`}
          style={{ color: tokens["text.primary"] }}
        />
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text
          content={masked || " "}
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>
      <Input
        focused
        placeholder=""
        value={secretInput}
        onInput={(value) => setSecretInput(extractInputValue(value))}
      />
    </ModalPanel>
  );
}
