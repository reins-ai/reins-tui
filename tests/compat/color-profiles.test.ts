import { describe, expect, test } from "bun:test";

import { hexTo256, resolveTheme256 } from "../../src/theme/fallback-256";
import { createThemeRegistry, type BuiltInThemeName } from "../../src/theme/theme-registry";
import { THEME_TOKEN_NAMES, validateThemeTokens, type ThemeTokens } from "../../src/theme/theme-schema";

import daylightSource from "../../src/theme/builtins/daylight.json";
import hearthstoneSource from "../../src/theme/builtins/hearthstone.json";
import nordFrostSource from "../../src/theme/builtins/nord-frost.json";
import rosePineSource from "../../src/theme/builtins/rose-pine.json";
import solarizedWarmSource from "../../src/theme/builtins/solarized-warm.json";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const ALL_BUILTIN_THEMES: { name: BuiltInThemeName; source: unknown }[] = [
  { name: "hearthstone", source: hearthstoneSource },
  { name: "daylight", source: daylightSource },
  { name: "solarized-warm", source: solarizedWarmSource },
  { name: "nord-frost", source: nordFrostSource },
  { name: "rose-pine", source: rosePineSource },
];

// ---------------------------------------------------------------------------
// Truecolor profile: every built-in theme resolves valid hex tokens
// ---------------------------------------------------------------------------

describe("truecolor profile: built-in theme validation", () => {
  for (const { name, source } of ALL_BUILTIN_THEMES) {
    describe(`theme: ${name}`, () => {
      test("passes schema validation", () => {
        const result = validateThemeTokens(source);
        expect(result.ok).toBe(true);
      });

      test(`contains all ${THEME_TOKEN_NAMES.length} semantic tokens`, () => {
        const result = validateThemeTokens(source);
        if (!result.ok) throw new Error(`Validation failed for ${name}`);

        const tokenKeys = Object.keys(result.value);
        expect(tokenKeys).toHaveLength(THEME_TOKEN_NAMES.length);

        for (const tokenName of THEME_TOKEN_NAMES) {
          expect(tokenKeys).toContain(tokenName);
        }
      });

      test("all token values are valid 6-char hex colors", () => {
        const result = validateThemeTokens(source);
        if (!result.ok) throw new Error(`Validation failed for ${name}`);

        for (const tokenName of THEME_TOKEN_NAMES) {
          const value = result.value[tokenName];
          expect(HEX_COLOR_PATTERN.test(value)).toBe(true);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 256-color fallback profile: every theme maps to valid ANSI indices
// ---------------------------------------------------------------------------

describe("256-color fallback profile", () => {
  for (const { name, source } of ALL_BUILTIN_THEMES) {
    describe(`theme: ${name}`, () => {
      const tokens = source as unknown as ThemeTokens;

      test("hexTo256 produces valid 0-255 indices for every token", () => {
        for (const tokenName of THEME_TOKEN_NAMES) {
          const index = hexTo256(tokens[tokenName]);
          expect(Number.isInteger(index)).toBe(true);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThanOrEqual(255);
        }
      });

      test("resolveTheme256 maps all semantic tokens", () => {
        const fallback = resolveTheme256(tokens);
        const fallbackKeys = Object.keys(fallback);

        expect(fallbackKeys).toHaveLength(THEME_TOKEN_NAMES.length);

        for (const tokenName of THEME_TOKEN_NAMES) {
          expect(tokenName in fallback).toBe(true);
        }
      });

      test("no tokens are lost in fallback conversion", () => {
        const fallback = resolveTheme256(tokens);

        for (const tokenName of THEME_TOKEN_NAMES) {
          const index = fallback[tokenName];
          expect(index).toBeDefined();
          expect(typeof index).toBe("number");
          expect(Number.isNaN(index)).toBe(false);
        }
      });

      test("fallback indices stay within 16-255 color cube/grayscale range", () => {
        const fallback = resolveTheme256(tokens);

        for (const tokenName of THEME_TOKEN_NAMES) {
          const index = fallback[tokenName];
          // ANSI 256 extended colors: 16-231 (color cube) + 232-255 (grayscale)
          expect(index).toBeGreaterThanOrEqual(16);
          expect(index).toBeLessThanOrEqual(255);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Theme switching: verify token values change and no stale tokens remain
// ---------------------------------------------------------------------------

describe("theme switching correctness", () => {
  test("switching from hearthstone to daylight changes token values", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const hearthstoneTokens = { ...registry.getTheme().tokens };

    const switchResult = registry.setTheme("daylight");
    if (!switchResult.ok) throw new Error("Failed to switch to daylight");

    const daylightTokens = registry.getTheme().tokens;

    // Themes must differ on at least some tokens
    let differenceCount = 0;
    for (const tokenName of THEME_TOKEN_NAMES) {
      if (hearthstoneTokens[tokenName] !== daylightTokens[tokenName]) {
        differenceCount++;
      }
    }

    // Hearthstone (dark) and Daylight (light) should differ substantially
    expect(differenceCount).toBeGreaterThan(THEME_TOKEN_NAMES.length / 2);
  });

  test("round-trip switch: hearthstone → daylight → hearthstone restores original tokens", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const originalTokens = { ...registry.getTheme().tokens };

    registry.setTheme("daylight");
    registry.setTheme("hearthstone");

    const restoredTokens = registry.getTheme().tokens;

    for (const tokenName of THEME_TOKEN_NAMES) {
      expect(restoredTokens[tokenName]).toBe(originalTokens[tokenName]);
    }
  });

  test("switching themes also updates 256-color fallback", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const hearthstoneFallback = { ...registry.getTheme().fallback256 };

    registry.setTheme("daylight");
    const daylightFallback = registry.getTheme().fallback256;

    // Fallback indices should also differ between dark and light themes
    let differenceCount = 0;
    for (const tokenName of THEME_TOKEN_NAMES) {
      if (hearthstoneFallback[tokenName] !== daylightFallback[tokenName]) {
        differenceCount++;
      }
    }

    expect(differenceCount).toBeGreaterThan(0);
  });

  test("active theme name updates after switch", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    expect(registry.getActiveThemeName()).toBe("hearthstone");

    registry.setTheme("nord-frost");
    expect(registry.getActiveThemeName()).toBe("nord-frost");

    registry.setTheme("rose-pine");
    expect(registry.getActiveThemeName()).toBe("rose-pine");
  });

  test("rapid sequential switching settles on final theme", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const themes: BuiltInThemeName[] = [
      "daylight",
      "solarized-warm",
      "nord-frost",
      "rose-pine",
      "hearthstone",
    ];

    for (const theme of themes) {
      registry.setTheme(theme);
    }

    expect(registry.getActiveThemeName()).toBe("hearthstone");
    expect(registry.getTheme().name).toBe("hearthstone");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: invalid theme names, corrupted palettes
// ---------------------------------------------------------------------------

describe("theme edge cases", () => {
  test("invalid theme name returns THEME_NOT_FOUND error", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const result = registryResult.value.setTheme("nonexistent-theme");
    expect(result.ok).toBe(false);

    if (result.ok) throw new Error("Expected error");
    expect(result.error.code).toBe("THEME_NOT_FOUND");
    expect(result.error.themeName).toBe("nonexistent-theme");
  });

  test("invalid theme name does not change active theme", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    registry.setTheme("nonexistent-theme");

    expect(registry.getActiveThemeName()).toBe("hearthstone");
    expect(registry.getTheme().name).toBe("hearthstone");
  });

  test("corrupted palette with missing tokens fails validation", () => {
    const corrupted = { ...hearthstoneSource } as Record<string, string>;
    delete corrupted["surface.primary"];
    delete corrupted["text.primary"];

    const result = validateThemeTokens(corrupted);
    expect(result.ok).toBe(false);

    if (result.ok) throw new Error("Expected validation failure");
    const errorPaths = result.error.map((e) => e.path);
    expect(errorPaths).toContain("surface.primary");
    expect(errorPaths).toContain("text.primary");
  });

  test("corrupted palette with invalid hex values fails validation", () => {
    const corrupted = { ...hearthstoneSource, "accent.primary": "not-hex" };

    const result = validateThemeTokens(corrupted);
    expect(result.ok).toBe(false);

    if (result.ok) throw new Error("Expected validation failure");
    const errorPaths = result.error.map((e) => e.path);
    expect(errorPaths).toContain("accent.primary");
  });

  test("null input fails validation gracefully", () => {
    const result = validateThemeTokens(null);
    expect(result.ok).toBe(false);
  });

  test("array input fails validation gracefully", () => {
    const result = validateThemeTokens([1, 2, 3]);
    expect(result.ok).toBe(false);
  });

  test("empty object fails validation with missing token errors", () => {
    const result = validateThemeTokens({});
    expect(result.ok).toBe(false);

    if (result.ok) throw new Error("Expected validation failure");
    expect(result.error.length).toBe(THEME_TOKEN_NAMES.length);
  });

  test("extra unknown tokens are flagged as errors", () => {
    const withExtra = { ...hearthstoneSource, "unknown.token": "#ff0000" };

    const result = validateThemeTokens(withExtra);
    expect(result.ok).toBe(false);

    if (result.ok) throw new Error("Expected validation failure");
    const errorPaths = result.error.map((e) => e.path);
    expect(errorPaths).toContain("unknown.token");
  });
});

// ---------------------------------------------------------------------------
// hexTo256 determinism: known color mappings
// ---------------------------------------------------------------------------

describe("hexTo256 determinism", () => {
  test("pure black maps to index 16", () => {
    expect(hexTo256("#000000")).toBe(16);
  });

  test("pure white maps to index 231", () => {
    expect(hexTo256("#ffffff")).toBe(231);
  });

  test("pure red maps to index 196", () => {
    expect(hexTo256("#ff0000")).toBe(196);
  });

  test("pure green maps to index 46", () => {
    expect(hexTo256("#00ff00")).toBe(46);
  });

  test("pure blue maps to index 21", () => {
    expect(hexTo256("#0000ff")).toBe(21);
  });

  test("mid-gray maps to grayscale range", () => {
    const index = hexTo256("#808080");
    expect(index).toBeGreaterThanOrEqual(232);
    expect(index).toBeLessThanOrEqual(255);
  });

  test("same input always produces same output", () => {
    const color = "#e8976c";
    const first = hexTo256(color);
    const second = hexTo256(color);
    const third = hexTo256(color);

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  test("similar colors map to nearby indices", () => {
    const a = hexTo256("#e89060");
    const b = hexTo256("#e8976c");
    // Both are warm oranges; should be in similar color cube region
    expect(Math.abs(a - b)).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// Cross-theme consistency: all themes produce complete fallback maps
// ---------------------------------------------------------------------------

describe("cross-theme fallback consistency", () => {
  test("all themes produce fallback maps with identical key sets", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const themes = registry.listThemes();

    const keySets: string[][] = [];

    for (const themeName of themes) {
      registry.setTheme(themeName);
      const fallback = registry.getTheme().fallback256;
      keySets.push(Object.keys(fallback).sort());
    }

    const referenceKeys = keySets[0];
    for (let i = 1; i < keySets.length; i++) {
      expect(keySets[i]).toEqual(referenceKeys);
    }
  });

  test("resolved theme objects are frozen (immutable)", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();

    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.tokens)).toBe(true);
    expect(Object.isFrozen(theme.fallback256)).toBe(true);
  });
});
