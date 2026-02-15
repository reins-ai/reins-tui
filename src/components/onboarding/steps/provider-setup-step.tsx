import { useEffect, useState } from "react";

import { Box, Text, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

interface ProviderEntry {
  id: string;
  label: string;
  description: string;
}

const PROVIDERS: ProviderEntry[] = [
  { id: "anthropic", label: "Anthropic", description: "Claude models (Sonnet, Opus, Haiku)" },
  { id: "openai", label: "OpenAI", description: "GPT-4o, o1, o3 models" },
  { id: "google", label: "Google", description: "Gemini models" },
  { id: "ollama", label: "Ollama (Local)", description: "Local models via Ollama" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderSetupStepView({ tokens, engineState: _engineState, onStepData, onRequestNext }: StepViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());

  // Emit step data on selection change
  useEffect(() => {
    const selected = PROVIDERS[selectedIndex];
    onStepData({
      selectedProvider: selected.id,
      configuredProviders: [...configuredProviders],
    });
  }, [selectedIndex, configuredProviders, onStepData]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (keyName === "up") {
      setSelectedIndex((prev) =>
        prev <= 0 ? PROVIDERS.length - 1 : prev - 1,
      );
      return;
    }
    if (keyName === "down") {
      setSelectedIndex((prev) =>
        (prev + 1) % PROVIDERS.length,
      );
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      onRequestNext();
      return;
    }

    // Space toggles configured status (simulated)
    if (keyName === "space") {
      const provider = PROVIDERS[selectedIndex];
      setConfiguredProviders((prev) => {
        const next = new Set(prev);
        if (next.has(provider.id)) {
          next.delete(provider.id);
        } else {
          next.add(provider.id);
        }
        return next;
      });
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Provider Setup"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Connect your AI providers. Select a provider to configure its API key."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Provider list */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {PROVIDERS.map((provider, index) => {
          const isSelected = index === selectedIndex;
          const isConfigured = configuredProviders.has(provider.id);

          return (
            <Box
              key={provider.id}
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
                  content={isConfigured ? "* " : "o "}
                  style={{
                    color: isConfigured
                      ? tokens["status.success"]
                      : tokens["text.muted"],
                  }}
                />
                <Text
                  content={provider.label}
                  style={{
                    color: isSelected
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
              </Box>
              <Box style={{ paddingLeft: 6 }}>
                <Text
                  content={provider.description}
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
          content="Up/Down select  ·  Space toggle  ·  Enter continue  ·  Esc back"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
