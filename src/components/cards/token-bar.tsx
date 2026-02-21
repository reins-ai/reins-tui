import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

// --- Constants ---

/** Width of the progress bar in characters. */
const BAR_WIDTH = 10;

/** Character used for filled portion of the progress bar. */
const FILLED_CHAR = "\u2593"; // ▓

/** Character used for empty portion of the progress bar. */
const EMPTY_CHAR = "\u2591"; // ░

// --- Colour threshold boundaries ---

/** Below this utilisation, the bar is muted/dim. */
const THRESHOLD_NORMAL = 0.70;

/** Between THRESHOLD_NORMAL and this, the bar is amber/yellow. */
const THRESHOLD_AMBER = 0.85;

/** Between THRESHOLD_AMBER and this, the bar is orange (yellow + bold). */
const THRESHOLD_ORANGE = 0.95;

/** Above THRESHOLD_ORANGE, the bar is red + bold. */

// --- Exported pure helpers (for testability) ---

/**
 * Build the progress bar string from a utilisation ratio (0–1).
 * Returns a string of exactly `BAR_WIDTH` characters using filled
 * and empty block characters.
 */
export function buildProgressBar(utilisation: number): string {
  const clamped = Math.max(0, Math.min(1, utilisation));
  const filled = Math.round(clamped * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return FILLED_CHAR.repeat(filled) + EMPTY_CHAR.repeat(empty);
}

/**
 * Format a token count with locale-aware thousand separators.
 * Example: 1247 → "1,247"
 */
export function formatTokenCount(count: number): string {
  return count.toLocaleString();
}

/**
 * Build the full token label string.
 * Example: "1,247 / 200,000 tokens"
 */
export function buildTokenLabel(used: number, limit: number): string {
  return `${formatTokenCount(used)} / ${formatTokenCount(limit)} tokens`;
}

/**
 * Determine the colour threshold tier for a given utilisation ratio.
 * Returns a tier name used to select the appropriate colour and weight.
 */
export type TokenBarTier = "normal" | "amber" | "orange" | "danger";

export function getTokenBarTier(utilisation: number): TokenBarTier {
  if (utilisation >= THRESHOLD_ORANGE) {
    return "danger";
  }
  if (utilisation >= THRESHOLD_AMBER) {
    return "orange";
  }
  if (utilisation >= THRESHOLD_NORMAL) {
    return "amber";
  }
  return "normal";
}

// --- Component ---

export interface TokenBarProps {
  /** Number of tokens currently used. */
  used: number;
  /** Maximum token limit for the context window. */
  limit: number;
  /** Utilisation ratio (0–1). */
  utilisation: number;
}

/**
 * Pure presentational component that renders a token usage progress bar.
 * Colour changes at defined utilisation thresholds to signal context pressure.
 *
 * Format: `1,247 / 200,000 tokens  ▓░░░░░░░░░`
 */
export function TokenBar({ used, limit, utilisation }: TokenBarProps) {
  const { tokens } = useThemeTokens();

  const tier = getTokenBarTier(utilisation);
  const bar = buildProgressBar(utilisation);
  const label = buildTokenLabel(used, limit);

  const tierStyles: Record<TokenBarTier, { color: string; fontWeight: "bold" | "normal" }> = {
    normal: { color: tokens["text.muted"], fontWeight: "normal" },
    amber: { color: tokens["status.warning"], fontWeight: "normal" },
    orange: { color: tokens["status.warning"], fontWeight: "bold" },
    danger: { color: tokens["status.error"], fontWeight: "bold" },
  };

  const style = tierStyles[tier];

  return (
    <Box style={{ flexDirection: "row" }}>
      <Text
        content={`${label}  ${bar}`}
        style={{ color: style.color, fontWeight: style.fontWeight }}
      />
    </Box>
  );
}
