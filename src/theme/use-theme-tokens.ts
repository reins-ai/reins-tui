import { useMemo } from "react";

import type { ThemeTokenName, ThemeTokens } from "./theme-schema";
import { useThemeContext, type ColorMode } from "./theme-context";
import type { SpacingSize, TextVariant } from "../ui/types";
import { SPACING_SCALE } from "../ui/types";

export type SemanticColor =
  | "primary"
  | "secondary"
  | "muted"
  | "accent"
  | "error"
  | "success"
  | "warning"
  | "info";

export type DepthLevel = "panel1" | "panel2" | "panel3" | "interactive";

export type MessageRole = "user" | "assistant" | "system";

const SEMANTIC_COLOR_MAP: Record<SemanticColor, ThemeTokenName> = {
  primary: "text.primary",
  secondary: "text.secondary",
  muted: "text.muted",
  accent: "accent.primary",
  error: "status.error",
  success: "status.success",
  warning: "status.warning",
  info: "status.info",
};

const TEXT_VARIANT_MAP: Record<TextVariant, ThemeTokenName> = {
  primary: "text.primary",
  secondary: "text.secondary",
  muted: "text.muted",
  accent: "accent.primary",
  error: "status.error",
};

const DEPTH_LEVEL_MAP: Record<DepthLevel, ThemeTokenName> = {
  panel1: "depth.panel1",
  panel2: "depth.panel2",
  panel3: "depth.panel3",
  interactive: "depth.interactive",
};

const ROLE_BORDER_MAP: Record<MessageRole, ThemeTokenName> = {
  user: "role.user.border",
  assistant: "role.assistant.border",
  system: "role.system.border",
};

export interface ResolvedTokens {
  readonly tokens: Readonly<ThemeTokens>;
  readonly colorMode: ColorMode;
  token(name: ThemeTokenName): string;
  getColor(semantic: SemanticColor): string;
  getSpacing(size: SpacingSize): number;
  getTextVariantColor(variant: TextVariant): string;
  getDepthColor(level: DepthLevel): string;
  getRoleBorder(role: MessageRole): string;
}

export function useThemeTokens(): ResolvedTokens {
  const { tokens, fallback256, colorMode } = useThemeContext();

  return useMemo<ResolvedTokens>(() => {
    const token = (name: ThemeTokenName): string => {
      if (colorMode === "256") {
        const code = fallback256[name];
        return `\x1b[38;5;${code}m`;
      }
      return tokens[name];
    };

    const getColor = (semantic: SemanticColor): string => {
      const tokenName = SEMANTIC_COLOR_MAP[semantic];
      return token(tokenName);
    };

    const getSpacing = (size: SpacingSize): number => {
      return SPACING_SCALE[size];
    };

    const getTextVariantColor = (variant: TextVariant): string => {
      const tokenName = TEXT_VARIANT_MAP[variant];
      return token(tokenName);
    };

    const getDepthColor = (level: DepthLevel): string => {
      const tokenName = DEPTH_LEVEL_MAP[level];
      return token(tokenName);
    };

    const getRoleBorder = (role: MessageRole): string => {
      const tokenName = ROLE_BORDER_MAP[role];
      return token(tokenName);
    };

    return {
      tokens,
      colorMode,
      token,
      getColor,
      getSpacing,
      getTextVariantColor,
      getDepthColor,
      getRoleBorder,
    };
  }, [tokens, fallback256, colorMode]);
}

export { SEMANTIC_COLOR_MAP, TEXT_VARIANT_MAP, DEPTH_LEVEL_MAP, ROLE_BORDER_MAP };
