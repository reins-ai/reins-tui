import { Box, Text, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Feature data
// ---------------------------------------------------------------------------

interface FeatureItem {
  title: string;
  detail: string;
}

const FEATURES: FeatureItem[] = [
  {
    title: "Slash commands",
    detail: "/help  /model  /clear  /history  /setup",
  },
  {
    title: "Keyboard shortcuts",
    detail: "Ctrl+K command palette  ·  Esc close  ·  Arrow keys navigate",
  },
  {
    title: "Built-in tools",
    detail: "Calendar, Reminders, and Notes — ask your AI to use them",
  },
  {
    title: "Multiple AI providers",
    detail: "Chat with Claude, GPT, Gemini, or local models via Ollama",
  },
  {
    title: "Need help?",
    detail: "Type /help or press Ctrl+K and search for \"Help\"",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeatureDiscoveryStepView({
  tokens,
  engineState: _engineState,
  onStepData: _onStepData,
  onRequestNext,
}: StepViewProps) {
  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (keyName === "return" || keyName === "enter") {
      onRequestNext();
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="You're all set!"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Here's what you can do with Reins:"
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {FEATURES.map((feature) => (
          <Box
            key={feature.title}
            style={{ flexDirection: "column", marginBottom: 1 }}
          >
            <Box style={{ flexDirection: "row" }}>
              <Text
                content="  * "
                style={{ color: tokens["accent.primary"] }}
              />
              <Text
                content={feature.title}
                style={{ color: tokens["text.primary"] }}
              />
            </Box>
            <Box style={{ paddingLeft: 4 }}>
              <Text
                content={feature.detail}
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          </Box>
        ))}
      </Box>

      <Box style={{ marginTop: 2 }}>
        <Text
          content="Press Enter to start chatting"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
