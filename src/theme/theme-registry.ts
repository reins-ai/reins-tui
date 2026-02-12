import type { Result } from "@reins/core";

import { resolveTheme256, type ThemeTokens256 } from "./fallback-256";
import { validateThemeTokens, type ThemeTokens, type ThemeValidationError } from "./theme-schema";

import daylightSource from "./builtins/daylight.json";
import hearthstoneSource from "./builtins/hearthstone.json";
import nordFrostSource from "./builtins/nord-frost.json";
import rosePineSource from "./builtins/rose-pine.json";
import solarizedWarmSource from "./builtins/solarized-warm.json";

export type BuiltInThemeName = "hearthstone" | "daylight" | "solarized-warm" | "nord-frost" | "rose-pine";

export interface ResolvedTheme {
  name: string;
  tokens: Readonly<ThemeTokens>;
  fallback256: Readonly<ThemeTokens256>;
}

export interface ThemeRegistryError {
  code: "THEME_NOT_FOUND" | "THEME_INVALID";
  themeName: string;
  message: string;
  validationErrors?: ThemeValidationError[];
}

const BUILTIN_THEME_SOURCES: Record<BuiltInThemeName, unknown> = {
  hearthstone: hearthstoneSource,
  daylight: daylightSource,
  "solarized-warm": solarizedWarmSource,
  "nord-frost": nordFrostSource,
  "rose-pine": rosePineSource,
};

const DEFAULT_THEME_NAME: BuiltInThemeName = "hearthstone";

function freezeTokens(tokens: ThemeTokens): Readonly<ThemeTokens> {
  return Object.freeze({ ...tokens });
}

function freezeFallback(tokens256: ThemeTokens256): Readonly<ThemeTokens256> {
  return Object.freeze({ ...tokens256 });
}

function buildResolvedTheme(name: string, tokens: ThemeTokens): ResolvedTheme {
  const immutableTokens = freezeTokens(tokens);
  const fallback256 = freezeFallback(resolveTheme256(tokens));

  return Object.freeze({
    name,
    tokens: immutableTokens,
    fallback256,
  });
}

export class ThemeRegistry {
  private readonly themes = new Map<string, Readonly<ThemeTokens>>();
  private activeThemeName: string;
  private activeTheme: ResolvedTheme;

  private constructor(themes: Map<string, Readonly<ThemeTokens>>, activeThemeName: string) {
    this.themes = themes;
    this.activeThemeName = activeThemeName;

    const activeTokens = this.themes.get(activeThemeName);
    if (!activeTokens) {
      throw new Error(`Theme '${activeThemeName}' is not loaded.`);
    }

    this.activeTheme = buildResolvedTheme(activeThemeName, activeTokens as ThemeTokens);
  }

  static create(): Result<ThemeRegistry, ThemeRegistryError[]> {
    const loadedThemes = new Map<string, Readonly<ThemeTokens>>();
    const errors: ThemeRegistryError[] = [];

    for (const [themeName, source] of Object.entries(BUILTIN_THEME_SOURCES)) {
      const validation = validateThemeTokens(source);
      if (!validation.ok) {
        errors.push({
          code: "THEME_INVALID",
          themeName,
          message: `Built-in theme '${themeName}' failed validation.`,
          validationErrors: validation.error,
        });
        continue;
      }

      loadedThemes.set(themeName, freezeTokens(validation.value));
    }

    if (!loadedThemes.has(DEFAULT_THEME_NAME)) {
      errors.push({
        code: "THEME_NOT_FOUND",
        themeName: DEFAULT_THEME_NAME,
        message: `Default theme '${DEFAULT_THEME_NAME}' is not available.`,
      });
    }

    if (errors.length > 0) {
      return { ok: false, error: errors };
    }

    return {
      ok: true,
      value: new ThemeRegistry(loadedThemes, DEFAULT_THEME_NAME),
    };
  }

  getTheme(): ResolvedTheme {
    return this.activeTheme;
  }

  setTheme(name: string): Result<ResolvedTheme, ThemeRegistryError> {
    const tokens = this.themes.get(name);
    if (!tokens) {
      return {
        ok: false,
        error: {
          code: "THEME_NOT_FOUND",
          themeName: name,
          message: `Theme '${name}' does not exist.`,
        },
      };
    }

    this.activeThemeName = name;
    this.activeTheme = buildResolvedTheme(name, tokens as ThemeTokens);

    return { ok: true, value: this.activeTheme };
  }

  listThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  getActiveThemeName(): string {
    return this.activeThemeName;
  }
}

export function createThemeRegistry(): Result<ThemeRegistry, ThemeRegistryError[]> {
  return ThemeRegistry.create();
}
