import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProviderSetupPromptProps {
  /** Called when user chooses to run setup. */
  onRunSetup: () => void;
  /** Called when user chooses to skip provider setup. */
  onSkip: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Targeted prompt shown on app restart when onboarding was completed but
 * no AI provider is configured. Offers to launch the full setup wizard
 * or skip to chat.
 *
 * This is intentionally minimal — a single y/n prompt, not the full wizard.
 */
export function ProviderSetupPrompt({ onRunSetup, onSkip }: ProviderSetupPromptProps) {
  const { tokens } = useThemeTokens();

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (keyName === "y" || keyName === "return" || keyName === "enter") {
      onRunSetup();
      return;
    }

    if (keyName === "n" || keyName === "escape" || keyName === "esc") {
      onSkip();
    }
  });

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: tokens["surface.primary"],
      }}
    >
      <Box style={{ flexDirection: "column", maxWidth: 60 }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="! " style={{ color: tokens["status.warning"] }} />
          <Text
            content="No AI provider configured"
            style={{ color: tokens["text.primary"] }}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Reins needs at least one AI provider to chat."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Would you like to set one up now?"
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
        <Box style={{ marginTop: 2 }}>
          <Text
            content="[y] Run setup  [n] Skip for now"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </Box>
  );
}
