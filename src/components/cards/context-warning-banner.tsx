import { useThemeTokens } from "../../theme";
import type { ThemeTokens } from "../../theme/theme-schema";
import type { FramedBlockStyle } from "../../ui/types";
import { Box, Text } from "../../ui";
import { FramedBlock, SUBTLE_BORDER_CHARS } from "../../ui/primitives";

// --- Constants ---

/** Warning icon prefix for the banner message. */
const WARNING_ICON = "\u26A0"; // ⚠

// --- Pure helpers (exported for testability) ---

/**
 * Format the utilisation ratio as a percentage string.
 * Example: 0.87 → "87%"
 */
export function formatUtilisationPercent(utilisation: number): string {
  const percent = Math.round(utilisation * 100);
  return `${percent}%`;
}

/**
 * Build the full warning banner message line.
 * Format: "⚠  Context at 87% — [c] compact now to free space"
 */
export function buildWarningMessage(utilisation: number): string {
  return `${WARNING_ICON}  Context at ${formatUtilisationPercent(utilisation)} \u2014 [c] compact now to free space`;
}

/**
 * Resolve the FramedBlock style for the context warning banner.
 * Uses the warning accent colour with a secondary surface background.
 */
export function getWarningBannerStyle(tokens: Readonly<ThemeTokens>): FramedBlockStyle {
  return {
    accentColor: tokens["status.warning"],
    backgroundColor: tokens["surface.secondary"],
    paddingLeft: 2,
    paddingRight: 1,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
  };
}

// --- Props ---

export interface ContextWarningBannerProps {
  /** Context utilisation ratio (0–1). */
  utilisation: number;
  /** Callback invoked when the user triggers manual compaction. */
  onCompact: () => void;
}

// --- Component ---

/**
 * ContextWarningBanner renders an inline warning in the chat stream
 * when context utilisation reaches a critical threshold. Provides a
 * visual cue with an action hint for manual compaction.
 *
 * Structure:
 *   │ ⚠  Context at 87% — [c] compact now to free space
 *
 * This component is purely presentational. Visibility logic and key
 * binding for `[c]` are handled by the parent ConversationPanel.
 */
export function ContextWarningBanner({
  utilisation,
}: ContextWarningBannerProps) {
  const { tokens } = useThemeTokens();
  const blockStyle = getWarningBannerStyle(tokens);
  const message = buildWarningMessage(utilisation);

  return (
    <FramedBlock style={blockStyle} borderChars={SUBTLE_BORDER_CHARS}>
      <Box style={{ flexDirection: "row" }}>
        <Text
          content={message}
          style={{ color: tokens["status.warning"], fontWeight: "bold" }}
        />
      </Box>
    </FramedBlock>
  );
}
