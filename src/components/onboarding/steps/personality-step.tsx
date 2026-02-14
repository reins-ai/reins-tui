import { useCallback, useEffect, useState } from "react";

import { PERSONALITY_PRESETS, type PersonalityPreset } from "@reins/core";
import { Box, Text, Input, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

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
// Types
// ---------------------------------------------------------------------------

interface PresetOption {
  preset: PersonalityPreset;
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET_OPTIONS: PresetOption[] = [
  ...PERSONALITY_PRESETS.map((p) => ({
    preset: p.preset,
    label: p.label,
    description: p.description,
  })),
  {
    preset: "custom" as PersonalityPreset,
    label: "Custom",
    description: "Write your own personality modifier.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonalityStepView({ tokens, engineState: _engineState, onStepData }: StepViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isEditingCustom, setIsEditingCustom] = useState(false);

  const selectedOption = PRESET_OPTIONS[selectedIndex];
  const isCustomSelected = selectedOption.preset === "custom";

  // Emit step data on changes
  useEffect(() => {
    onStepData({
      personalityPreset: selectedOption.preset,
      customPrompt: isCustomSelected ? customPrompt : undefined,
    });
  }, [selectedOption.preset, isCustomSelected, customPrompt, onStepData]);

  const handleCustomInput = useCallback((value: unknown) => {
    setCustomPrompt(extractInputValue(value));
  }, []);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    // When editing custom text, only handle escape
    if (isEditingCustom) {
      if (keyName === "escape" || keyName === "esc") {
        setIsEditingCustom(false);
      }
      return;
    }

    if (keyName === "up") {
      setSelectedIndex((prev) =>
        prev <= 0 ? PRESET_OPTIONS.length - 1 : prev - 1,
      );
      return;
    }
    if (keyName === "down") {
      setSelectedIndex((prev) =>
        (prev + 1) % PRESET_OPTIONS.length,
      );
      return;
    }

    // Enter on custom option toggles edit mode
    if (keyName === "return" || keyName === "enter") {
      if (isCustomSelected && !isEditingCustom) {
        setIsEditingCustom(true);
      }
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Personality"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Choose how your AI assistant communicates."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Preset cards */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {PRESET_OPTIONS.map((option, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box
              key={option.preset}
              style={{
                flexDirection: "column",
                paddingLeft: 1,
                marginBottom: 1,
                backgroundColor: isSelected
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
                  content={option.label}
                  style={{
                    color: isSelected
                      ? tokens["accent.primary"]
                      : tokens["text.secondary"],
                  }}
                />
              </Box>
              <Box style={{ paddingLeft: 4 }}>
                <Text
                  content={option.description}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Custom prompt input */}
      {isCustomSelected ? (
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Text
            content="Custom personality modifier:"
            style={{ color: tokens["text.primary"] }}
          />
          <Box style={{ marginTop: 1, flexDirection: "row" }}>
            <Text
              content={isEditingCustom ? "> " : "  "}
              style={{ color: tokens["accent.primary"] }}
            />
            <Text
              content={customPrompt || "(press Enter to type)"}
              style={{
                color: customPrompt
                  ? tokens["text.secondary"]
                  : tokens["text.muted"],
              }}
            />
          </Box>
          {isEditingCustom ? (
            <Input
              focused
              placeholder="Describe how you want the AI to communicate..."
              value={customPrompt}
              onInput={handleCustomInput}
            />
          ) : null}
        </Box>
      ) : null}

      {/* Hint */}
      <Box style={{ marginTop: 2 }}>
        <Text
          content={
            isEditingCustom
              ? "Type your modifier . Esc done editing"
              : isCustomSelected
                ? "Up/Down select . Enter edit custom text . Tab skip"
                : "Up/Down select . Enter continue . Tab skip"
          }
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
