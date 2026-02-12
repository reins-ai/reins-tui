import { useMemo } from "react";

import type { ThemeTokenName, ThemeTokens } from "./theme-schema";
import { useThemeContext, type ColorMode } from "./theme-context";

export interface ResolvedTokens {
  readonly tokens: Readonly<ThemeTokens>;
  readonly colorMode: ColorMode;
  token(name: ThemeTokenName): string;
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

    return {
      tokens,
      colorMode,
      token,
    };
  }, [tokens, fallback256, colorMode]);
}
