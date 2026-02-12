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
 * Full-size standard bug logo (~11 lines tall, ~26 cols wide).
 * A stylized beetle/bug with antennae, shell, and legs.
 */
export const LOGO_FULL_STANDARD: readonly string[] = [
  "      \\    /",
  "       \\  /",
  "    .--====--.",
  "   / /      \\ \\",
  "  | |  O  O  | |",
  " -| |        | |-",
  "  | |  \\__/  | |",
  "   \\ \\      / /",
  "  --'========`--",
  "   /   REINS   \\",
  "  '------+------'",
];

/**
 * Full-size sad bug logo — droopy antennae and X eyes for error states.
 */
export const LOGO_FULL_SAD: readonly string[] = [
  "      \\    /",
  "       |  |",
  "    .--====--.",
  "   / /      \\ \\",
  "  | |  X  X  | |",
  " -| |        | |-",
  "  | |  /--\\  | |",
  "   \\ \\      / /",
  "  --'========`--",
  "   /   REINS   \\",
  "  '------+------'",
];

/**
 * Compact standard bug logo (~5 lines tall, ~14 cols wide).
 * Simplified for narrow terminals.
 */
export const LOGO_COMPACT_STANDARD: readonly string[] = [
  "  \\ /",
  " (O O)",
  " /| |\\",
  " \\___/",
  " REINS",
];

/**
 * Compact sad bug logo — X eyes for error states.
 */
export const LOGO_COMPACT_SAD: readonly string[] = [
  "  | |",
  " (X X)",
  " /| |\\",
  " /---\\",
  " REINS",
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
