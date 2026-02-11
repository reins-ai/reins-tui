import { describe, expect, test } from "bun:test";

import { hexTo256, resolveTheme256 } from "../../src/theme/fallback-256";
import { createThemeRegistry } from "../../src/theme/theme-registry";
import { THEME_TOKEN_NAMES, validateThemeTokens } from "../../src/theme/theme-schema";

import hearthstoneTheme from "../../src/theme/builtins/hearthstone.json";

describe("theme schema validation", () => {
  test("accepts a valid built-in theme", () => {
    const validation = validateThemeTokens(hearthstoneTheme);

    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error(`Expected valid theme, got ${validation.error.length} errors`);
    }

    expect(Object.keys(validation.value)).toHaveLength(THEME_TOKEN_NAMES.length);
  });

  test("rejects missing and malformed tokens", () => {
    const invalidTheme = {
      ...hearthstoneTheme,
      "text.primary": "not-a-color",
    };

    delete (invalidTheme as Record<string, string>)["surface.primary"];

    const validation = validateThemeTokens(invalidTheme);
    expect(validation.ok).toBe(false);

    if (validation.ok) {
      throw new Error("Expected validation to fail");
    }

    const errorPaths = validation.error.map((error) => error.path);
    expect(errorPaths).toContain("surface.primary");
    expect(errorPaths).toContain("text.primary");
  });
});

describe("theme fallback mapping", () => {
  test("maps all tokens to valid ANSI 256 indices", () => {
    const fallback = resolveTheme256(hearthstoneTheme);

    for (const tokenName of THEME_TOKEN_NAMES) {
      const index = fallback[tokenName];
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(16);
      expect(index).toBeLessThanOrEqual(255);
    }
  });

  test("hexTo256 resolves known colors deterministically", () => {
    expect(hexTo256("#000000")).toBe(16);
    expect(hexTo256("#ffffff")).toBe(231);
    expect(hexTo256("#ff0000")).toBe(196);
  });
});

describe("theme registry", () => {
  test("loads all built-in themes and defaults to hearthstone", () => {
    const registryResult = createThemeRegistry();
    expect(registryResult.ok).toBe(true);

    if (!registryResult.ok) {
      throw new Error(`Expected registry to load, got ${registryResult.error.length} errors`);
    }

    const registry = registryResult.value;
    expect(registry.getActiveThemeName()).toBe("hearthstone");
    expect(registry.getTheme().name).toBe("hearthstone");
    expect(registry.listThemes().sort()).toEqual([
      "daylight",
      "hearthstone",
      "nord-frost",
      "rose-pine",
      "solarized-warm",
    ]);
  });

  test("switches themes at runtime and replaces active theme object", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) {
      throw new Error("Failed to create registry");
    }

    const registry = registryResult.value;
    const previousTheme = registry.getTheme();

    const setThemeResult = registry.setTheme("rose-pine");
    expect(setThemeResult.ok).toBe(true);
    if (!setThemeResult.ok) {
      throw new Error(setThemeResult.error.message);
    }

    const nextTheme = registry.getTheme();
    expect(registry.getActiveThemeName()).toBe("rose-pine");
    expect(nextTheme.name).toBe("rose-pine");
    expect(nextTheme).not.toBe(previousTheme);
  });

  test("returns a typed error when switching to unknown theme", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) {
      throw new Error("Failed to create registry");
    }

    const setThemeResult = registryResult.value.setTheme("missing-theme");
    expect(setThemeResult.ok).toBe(false);

    if (setThemeResult.ok) {
      throw new Error("Expected setTheme to fail");
    }

    expect(setThemeResult.error.code).toBe("THEME_NOT_FOUND");
    expect(setThemeResult.error.themeName).toBe("missing-theme");
  });
});
