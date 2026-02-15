import { useEffect, useState } from "react";

import { Box, Text, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  recommended: boolean;
}

const DEFAULT_MODELS: ModelEntry[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "Anthropic", recommended: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", recommended: false },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", recommended: false },
  { id: "claude-haiku-3.5", name: "Claude 3.5 Haiku", provider: "Anthropic", recommended: false },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelectionStepView({ tokens, engineState, onStepData, onRequestNext }: StepViewProps) {
  const isQuickstart = engineState.mode === "quickstart";

  // In quickstart mode, auto-select the recommended model
  const defaultIndex = DEFAULT_MODELS.findIndex((m) => m.recommended);
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex >= 0 ? defaultIndex : 0);

  // Emit step data on selection change
  useEffect(() => {
    const selected = DEFAULT_MODELS[selectedIndex];
    onStepData({
      modelId: selected.id,
      modelName: selected.name,
      provider: selected.provider,
      autoSelected: isQuickstart,
    });
  }, [selectedIndex, isQuickstart, onStepData]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (keyName === "up") {
      setSelectedIndex((prev) =>
        prev <= 0 ? DEFAULT_MODELS.length - 1 : prev - 1,
      );
      return;
    }
    if (keyName === "down") {
      setSelectedIndex((prev) =>
        (prev + 1) % DEFAULT_MODELS.length,
      );
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      onRequestNext();
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Model Selection"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content={
            isQuickstart
              ? "A recommended model has been selected for you."
              : "Choose your default AI model."
          }
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Model list */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {DEFAULT_MODELS.map((model, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box
              key={model.id}
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
                  content={model.name}
                  style={{
                    color: isSelected
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
                {model.recommended ? (
                  <Text
                    content=" (recommended)"
                    style={{ color: tokens["status.success"] }}
                  />
                ) : null}
              </Box>
              <Box style={{ paddingLeft: 4 }}>
                <Text
                  content={model.provider}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Hint */}
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Up/Down select  ·  Enter continue  ·  Esc back"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
