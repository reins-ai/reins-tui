import { useCallback, useEffect, useState } from "react";

import type { OnboardingMode } from "@reins/core";
import { Box, Text, Input, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES: { id: OnboardingMode; label: string; description: string }[] = [
  {
    id: "quickstart",
    label: "QuickStart",
    description: "Sensible defaults, minimal prompts — fastest path to a working setup.",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Granular control over every step — configure each option yourself.",
  },
];

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WelcomeStepView({ tokens, engineState: _engineState, onStepData }: StepViewProps) {
  const [nameInput, setNameInput] = useState("User");
  const [selectedModeIndex, setSelectedModeIndex] = useState(0);
  const [focusField, setFocusField] = useState<"name" | "mode">("name");

  // Emit step data on changes
  useEffect(() => {
    onStepData({
      userName: nameInput,
      selectedMode: MODES[selectedModeIndex].id,
    });
  }, [nameInput, selectedModeIndex, onStepData]);

  const handleNameInput = useCallback((value: unknown) => {
    setNameInput(extractInputValue(value));
  }, []);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (keyName === "tab" && event.shift !== true) {
      // Tab toggles focus between name and mode fields
      setFocusField((prev) => (prev === "name" ? "mode" : "name"));
      return;
    }

    if (focusField === "mode") {
      if (keyName === "up") {
        setSelectedModeIndex((prev) =>
          prev <= 0 ? MODES.length - 1 : prev - 1,
        );
        return;
      }
      if (keyName === "down") {
        setSelectedModeIndex((prev) =>
          (prev + 1) % MODES.length,
        );
        return;
      }
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      {/* Welcome message */}
      <Text
        content="Welcome to Reins!"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Let's get you set up. First, what should we call you?"
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Name input */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        <Text
          content="Your name:"
          style={{ color: focusField === "name" ? tokens["text.primary"] : tokens["text.muted"] }}
        />
        <Input
          focused={focusField === "name"}
          placeholder="User"
          value={nameInput}
          onInput={handleNameInput}
        />
      </Box>

      {/* Mode selection */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        <Text
          content="Setup mode:"
          style={{ color: focusField === "mode" ? tokens["text.primary"] : tokens["text.muted"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          {MODES.map((mode, index) => {
            const isSelected = index === selectedModeIndex;
            const isFocused = focusField === "mode";
            return (
              <Box
                key={mode.id}
                style={{
                  flexDirection: "column",
                  paddingLeft: 1,
                  marginBottom: 1,
                  backgroundColor: isSelected && isFocused
                    ? tokens["surface.elevated"]
                    : "transparent",
                }}
              >
                <Box style={{ flexDirection: "row" }}>
                  <Text
                    content={isSelected ? "> " : "  "}
                    style={{ color: tokens["accent.primary"] }}
                  />
                  <Text
                    content={mode.label}
                    style={{
                      color: isSelected ? tokens["text.primary"] : tokens["text.secondary"],
                    }}
                  />
                </Box>
                <Box style={{ paddingLeft: 4 }}>
                  <Text
                    content={mode.description}
                    style={{ color: tokens["text.muted"] }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Hint */}
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Tab switch field . Up/Down select mode . Enter continue"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
