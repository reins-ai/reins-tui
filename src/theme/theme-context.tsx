import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { ThemeTokens256 } from "./fallback-256";
import { createThemeRegistry, type ResolvedTheme, type ThemeRegistry } from "./theme-registry";
import type { ThemeTokens } from "./theme-schema";

export type ColorMode = "truecolor" | "256";

export interface ThemeContextValue {
  theme: ResolvedTheme;
  colorMode: ColorMode;
  tokens: Readonly<ThemeTokens>;
  fallback256: Readonly<ThemeTokens256>;
  registry: ThemeRegistry;
  setTheme(name: string): boolean;
  setColorMode(mode: ColorMode): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function detectColorMode(): ColorMode {
  const colorterm = process.env["COLORTERM"];
  if (colorterm === "truecolor" || colorterm === "24bit") {
    return "truecolor";
  }

  const term = process.env["TERM"];
  if (term?.includes("256color")) {
    return "256";
  }

  return "truecolor";
}

export interface ThemeProviderProps {
  children: ReactNode;
  initialColorMode?: ColorMode;
}

export function ThemeProvider({ children, initialColorMode }: ThemeProviderProps) {
  const registry = useMemo(() => {
    const result = createThemeRegistry();
    if (!result.ok) {
      throw new Error(`Failed to initialize theme registry: ${result.error.map((e) => e.message).join(", ")}`);
    }
    return result.value;
  }, []);

  const [theme, setThemeState] = useState<ResolvedTheme>(() => registry.getTheme());
  const [colorMode, setColorMode] = useState<ColorMode>(() => initialColorMode ?? detectColorMode());

  const setTheme = (name: string): boolean => {
    const result = registry.setTheme(name);
    if (!result.ok) {
      return false;
    }
    setThemeState(result.value);
    return true;
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colorMode,
      tokens: theme.tokens,
      fallback256: theme.fallback256,
      registry,
      setTheme,
      setColorMode,
    }),
    [theme, colorMode, registry],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
