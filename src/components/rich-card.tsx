import type { ReactNode } from "react";

import { useThemeTokens } from "../theme";
import { Box, FramedBlock, Text } from "../ui";
import type { AccentPosition, BorderCharacters } from "../ui/types";

export type RichCardVariant = "default" | "info" | "warning" | "error" | "success";

export interface RichCardProps {
  title?: string;
  variant?: RichCardVariant;
  compact?: boolean;
  width?: number;
  children: ReactNode;
}

export interface FramedRichCardProps {
  title?: string;
  variant?: RichCardVariant;
  compact?: boolean;
  accentPosition?: AccentPosition;
  borderChars?: BorderCharacters;
  children: ReactNode;
}

const DEFAULT_CARD_WIDTH = 34;

// Unicode box-drawing characters for full-box card rendering
const BORDER_TOP_LEFT = "\u256D"; // ╭
const BORDER_TOP_RIGHT = "\u256E"; // ╮
const BORDER_BOTTOM_LEFT = "\u2570"; // ╰
const BORDER_BOTTOM_RIGHT = "\u256F"; // ╯
const BORDER_HORIZONTAL = "\u2500"; // ─
const BORDER_VERTICAL = "\u2502"; // │

export function resolveVariantColor(
  variant: RichCardVariant,
  tokens: Record<string, string>,
): string {
  switch (variant) {
    case "error":
      return tokens["status.error"];
    case "warning":
      return tokens["status.warning"];
    case "success":
      return tokens["status.success"];
    case "info":
      return tokens["status.info"];
    case "default":
    default:
      return tokens["border.primary"];
  }
}

export function buildCardTopBorder(
  width: number,
  title?: string,
): string {
  if (!title) {
    return `${BORDER_TOP_LEFT}${BORDER_HORIZONTAL.repeat(width - 2)}${BORDER_TOP_RIGHT}`;
  }

  const headerText = `${BORDER_HORIZONTAL} ${title} `;
  const fillLength = Math.max(0, width - headerText.length - 2);
  const fill = BORDER_HORIZONTAL.repeat(fillLength);
  return `${BORDER_TOP_LEFT}${headerText}${fill}${BORDER_TOP_RIGHT}`;
}

export function buildCardBottomBorder(width: number): string {
  return `${BORDER_BOTTOM_LEFT}${BORDER_HORIZONTAL.repeat(width - 2)}${BORDER_BOTTOM_RIGHT}`;
}

export function padCardLine(content: string, width: number): string {
  const available = width - 4; // "│ " + " │"
  if (content.length >= available) {
    return `${BORDER_VERTICAL} ${content.slice(0, available)} ${BORDER_VERTICAL}`;
  }

  return `${BORDER_VERTICAL} ${content}${" ".repeat(available - content.length)} ${BORDER_VERTICAL}`;
}

export function RichCard({
  title,
  variant = "default",
  compact = false,
  width,
  children,
}: RichCardProps) {
  const { tokens } = useThemeTokens();
  const cardWidth = width ?? DEFAULT_CARD_WIDTH;
  const borderColor = resolveVariantColor(variant, tokens);
  const topBorder = buildCardTopBorder(cardWidth, title);
  const bottomBorder = buildCardBottomBorder(cardWidth);

  return (
    <Box
      style={{
        flexDirection: "column",
        marginTop: compact ? 0 : 1,
        marginBottom: compact ? 0 : 1,
      }}
    >
      <Text style={{ color: borderColor }}>{topBorder}</Text>
      <Box
        style={{
          flexDirection: "column",
          paddingLeft: 0,
          paddingRight: 0,
        }}
      >
        {children}
      </Box>
      <Text style={{ color: borderColor }}>{bottomBorder}</Text>
    </Box>
  );
}

/**
 * A left-border-accented card variant that uses the shared FramedBlock
 * primitive. Suitable for inline content panels where a full box border
 * is too heavy and a left-accent is preferred.
 */
export function FramedRichCard({
  title,
  variant = "default",
  compact = false,
  accentPosition = "full",
  borderChars,
  children,
}: FramedRichCardProps) {
  const { tokens } = useThemeTokens();
  const accentColor = resolveVariantColor(variant, tokens);

  return (
    <FramedBlock
      accentColor={accentColor}
      accentPosition={accentPosition}
      borderChars={borderChars}
      style={{
        marginTop: compact ? 0 : 1,
        marginBottom: compact ? 0 : 1,
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: title ? 0 : 0,
        paddingBottom: 0,
      }}
    >
      {title ? (
        <Text style={{ color: accentColor }}>{title}</Text>
      ) : null}
      {children}
    </FramedBlock>
  );
}
