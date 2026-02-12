import type { ReactNode } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export type RichCardVariant = "default" | "info" | "warning" | "error" | "success";

export interface RichCardProps {
  title?: string;
  variant?: RichCardVariant;
  compact?: boolean;
  width?: number;
  children: ReactNode;
}

const DEFAULT_CARD_WIDTH = 34;

// Unicode box-drawing characters
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
