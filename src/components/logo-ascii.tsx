import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export type LogoVariant = "standard" | "sad";
export type LogoSize = "full" | "compact";

export interface LogoAsciiProps {
  variant?: LogoVariant;
  size?: LogoSize;
  showTagline?: boolean;
}

/**
 * Full-size standard bug logo (~5 lines tall, ~7 cols wide).
 * Polished Reins bug with antennae, @ eyes, shell, and legs.
 * Centered: widest lines are 7 chars; 4-char lines get 1 space of left padding.
 */
export const LOGO_FULL_STANDARD: readonly string[] = [
  " \\ //",
  "( @ @ )",
  "--(_)--",
  " / \\\\",
  " REINS",
];

/**
 * Full-size sad bug logo — X eyes for error states.
 */
export const LOGO_FULL_SAD: readonly string[] = [
  " \\ //",
  "( X X )",
  "--(_)--",
  " / \\\\",
  " REINS",
];

/**
 * Compact standard bug logo (~4 lines tall, ~7 cols wide).
 * Same polished design without the REINS label, for narrow terminals.
 */
export const LOGO_COMPACT_STANDARD: readonly string[] = [
  " \\ //",
  "( @ @ )",
  "--(_)--",
  " / \\\\",
];

/**
 * Compact sad bug logo — X eyes for error states.
 */
export const LOGO_COMPACT_SAD: readonly string[] = [
  " \\ //",
  "( X X )",
  "--(_)--",
  " / \\\\",
];

const TAGLINE = "Your personal AI assistant";

/**
 * Select the appropriate ASCII art lines for the given variant and size.
 */
export function getLogoLines(variant: LogoVariant, size: LogoSize): readonly string[] {
  if (size === "compact") {
    return variant === "sad" ? LOGO_COMPACT_SAD : LOGO_COMPACT_STANDARD;
  }
  return variant === "sad" ? LOGO_FULL_SAD : LOGO_FULL_STANDARD;
}

/**
 * Get the maximum line width of a logo variant for layout calculations.
 */
export function getLogoWidth(variant: LogoVariant, size: LogoSize): number {
  const lines = getLogoLines(variant, size);
  return Math.max(...lines.map((line) => line.length));
}

/**
 * ASCII bug logo component with standard and sad variants.
 *
 * Uses `glyph.reins` theme token for logo color (falls back to accent.primary).
 * Supports full (wide terminal) and compact (narrow terminal) sizes.
 */
export function LogoAscii({ variant = "standard", size = "full", showTagline = false }: LogoAsciiProps) {
  const { tokens } = useThemeTokens();
  const logoColor = tokens["glyph.reins"] ?? tokens["accent.primary"];
  const taglineColor = tokens["text.muted"];
  const lines = getLogoLines(variant, size);

  return (
    <Box style={{ flexDirection: "column" }}>
      {lines.map((line, index) => (
        <Text
          key={`logo-${index}`}
          style={{ color: logoColor }}
          content={line}
        />
      ))}
      {showTagline ? (
        <Text
          style={{ color: taglineColor, marginTop: 1 }}
          content={TAGLINE}
        />
      ) : null}
    </Box>
  );
}
