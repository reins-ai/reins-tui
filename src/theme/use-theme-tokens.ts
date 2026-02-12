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

export interface ResolvedTokens {
  readonly tokens: Readonly<ThemeTokens>;
  readonly colorMode: ColorMode;
  token(name: ThemeTokenName): string;
  getColor(semantic: SemanticColor): string;
  getSpacing(size: SpacingSize): number;
  getTextVariantColor(variant: TextVariant): string;
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

    return {
      tokens,
      colorMode,
      token,
      getColor,
      getSpacing,
      getTextVariantColor,
    };
  }, [tokens, fallback256, colorMode]);
}

export { SEMANTIC_COLOR_MAP, TEXT_VARIANT_MAP };
