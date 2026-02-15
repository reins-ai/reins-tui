import { useCallback, useEffect, useState } from "react";
import { homedir } from "node:os";
import { join } from "node:path";

import { Box, Text, Input, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultWorkspacePath(): string {
  try {
    return join(homedir(), ".reins");
  } catch {
    return "~/.reins";
  }
}

function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") return value.plainText;
    if ("value" in value && typeof value.value === "string") return value.value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceStepView({ tokens, engineState: _engineState, onStepData, onRequestNext }: StepViewProps) {
  const defaultPath = getDefaultWorkspacePath();
  const [pathInput, setPathInput] = useState(defaultPath);
  const [isEditing, setIsEditing] = useState(false);

  // Emit step data on changes
  useEffect(() => {
    onStepData({
      workspacePath: pathInput,
      isDefault: pathInput === defaultPath,
    });
  }, [pathInput, defaultPath, onStepData]);

  const handlePathInput = useCallback((value: unknown) => {
    setPathInput(extractInputValue(value));
  }, []);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    // 'e' key toggles edit mode when not already editing
    if (keyName === "e" && !isEditing) {
      setIsEditing(true);
      return;
    }

    // Escape exits edit mode (if editing; otherwise handled by wizard shell)
    if (keyName === "escape" || keyName === "esc") {
      if (isEditing) {
        setIsEditing(false);
        return;
      }
    }

    // Enter continues (when not editing)
    if ((keyName === "return" || keyName === "enter") && !isEditing) {
      onRequestNext();
      return;
    }

    // 'r' resets to default
    if (keyName === "r" && !isEditing) {
      setPathInput(defaultPath);
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Workspace"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Choose where Reins stores its data (conversations, config, plugins)."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Current path display */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        <Text
          content="Workspace path:"
          style={{ color: tokens["text.primary"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "row" }}>
          <Text
            content={isEditing ? "> " : "  "}
            style={{ color: tokens["accent.primary"] }}
          />
          <Text
            content={pathInput}
            style={{
              color: isEditing ? tokens["text.primary"] : tokens["text.secondary"],
            }}
          />
        </Box>

        {isEditing ? (
          <Input
            focused
            placeholder={defaultPath}
            value={pathInput}
            onInput={handlePathInput}
          />
        ) : null}
      </Box>

      {/* Default indicator */}
      {pathInput === defaultPath ? (
        <Box style={{ marginTop: 1, paddingLeft: 2 }}>
          <Text
            content="(default location)"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}

      {/* Hint */}
      <Box style={{ marginTop: 2 }}>
        <Text
          content={
            isEditing
              ? "Type to edit  ·  Esc done editing"
              : "e edit path  ·  r reset to default  ·  Enter continue  ·  Esc back"
          }
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
