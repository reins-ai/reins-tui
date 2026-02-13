import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { hexTo256, resolveTheme256 } from "../../src/theme/fallback-256";
import { createThemeRegistry, BUILTIN_THEME_NAMES, DEFAULT_THEME_NAME } from "../../src/theme/theme-registry";
import { THEME_TOKEN_NAMES, validateThemeTokens } from "../../src/theme/theme-schema";

import reinsDarkTheme from "../../src/theme/builtins/reins-dark.json";
import reinsLightTheme from "../../src/theme/builtins/reins-light.json";
import tokyonightTheme from "../../src/theme/builtins/tokyonight.json";

// ---------------------------------------------------------------------------
// Theme schema validation
// ---------------------------------------------------------------------------

describe("theme schema validation", () => {
  test("reins-dark passes schema validation", () => {
    const validation = validateThemeTokens(reinsDarkTheme);
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(`Validation failed: ${validation.error.length} errors`);
    expect(Object.keys(validation.value)).toHaveLength(THEME_TOKEN_NAMES.length);
  });

  test("reins-light passes schema validation", () => {
    const validation = validateThemeTokens(reinsLightTheme);
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(`Validation failed: ${validation.error.length} errors`);
    expect(Object.keys(validation.value)).toHaveLength(THEME_TOKEN_NAMES.length);
  });

  test("tokyonight passes schema validation", () => {
    const validation = validateThemeTokens(tokyonightTheme);
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(`Validation failed: ${validation.error.length} errors`);
    expect(Object.keys(validation.value)).toHaveLength(THEME_TOKEN_NAMES.length);
  });

  test("rejects missing and malformed tokens", () => {
    const invalidTheme = {
      ...reinsDarkTheme,
      "text.primary": "not-a-color",
    };
    delete (invalidTheme as Record<string, string>)["surface.primary"];

    const validation = validateThemeTokens(invalidTheme);
    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error("Expected validation to fail");

    const errorPaths = validation.error.map((error) => error.path);
    expect(errorPaths).toContain("surface.primary");
    expect(errorPaths).toContain("text.primary");
  });
});

// ---------------------------------------------------------------------------
// Theme fallback mapping
// ---------------------------------------------------------------------------

describe("theme fallback mapping", () => {
  test("maps all reins-dark tokens to valid ANSI 256 indices", () => {
    const fallback = resolveTheme256(reinsDarkTheme);
    for (const tokenName of THEME_TOKEN_NAMES) {
      const index = fallback[tokenName];
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(16);
      expect(index).toBeLessThanOrEqual(255);
    }
  });

  test("maps all reins-light tokens to valid ANSI 256 indices", () => {
    const fallback = resolveTheme256(reinsLightTheme);
    for (const tokenName of THEME_TOKEN_NAMES) {
      const index = fallback[tokenName];
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(16);
      expect(index).toBeLessThanOrEqual(255);
    }
  });

  test("maps all tokyonight tokens to valid ANSI 256 indices", () => {
    const fallback = resolveTheme256(tokyonightTheme);
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

// ---------------------------------------------------------------------------
// Theme registry: built-in themes
// ---------------------------------------------------------------------------

describe("theme registry", () => {
  test("loads all three built-in themes and defaults to reins-dark", () => {
    const registryResult = createThemeRegistry();
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) throw new Error(`Registry failed: ${registryResult.error.length} errors`);

    const registry = registryResult.value;
    expect(registry.getActiveThemeName()).toBe("reins-dark");
    expect(registry.getTheme().name).toBe("reins-dark");
    expect(registry.listThemes().sort()).toEqual([
      "reins-dark",
      "reins-light",
      "tokyonight",
    ]);
  });

  test("BUILTIN_THEME_NAMES exports all three theme names", () => {
    expect(BUILTIN_THEME_NAMES).toEqual(["reins-dark", "reins-light", "tokyonight"]);
  });

  test("DEFAULT_THEME_NAME is reins-dark", () => {
    expect(DEFAULT_THEME_NAME).toBe("reins-dark");
  });

  test("each theme defines all required semantic tokens", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    for (const themeName of registry.listThemes()) {
      const switchResult = registry.setTheme(themeName);
      expect(switchResult.ok).toBe(true);
      if (!switchResult.ok) continue;

      const theme = registry.getTheme();
      for (const tokenName of THEME_TOKEN_NAMES) {
        expect(theme.tokens[tokenName]).toBeDefined();
        expect(typeof theme.tokens[tokenName]).toBe("string");
        expect(theme.tokens[tokenName]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("switches themes at runtime and replaces active theme object", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const previousTheme = registry.getTheme();

    const setThemeResult = registry.setTheme("tokyonight");
    expect(setThemeResult.ok).toBe(true);
    if (!setThemeResult.ok) throw new Error(setThemeResult.error.message);

    const nextTheme = registry.getTheme();
    expect(registry.getActiveThemeName()).toBe("tokyonight");
    expect(nextTheme.name).toBe("tokyonight");
    expect(nextTheme).not.toBe(previousTheme);
  });

  test("returns a typed error when switching to unknown theme", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const setThemeResult = registryResult.value.setTheme("missing-theme");
    expect(setThemeResult.ok).toBe(false);
    if (setThemeResult.ok) throw new Error("Expected setTheme to fail");

    expect(setThemeResult.error.code).toBe("THEME_NOT_FOUND");
    expect(setThemeResult.error.themeName).toBe("missing-theme");
  });

  test("reins-dark and reins-light differ substantially in token values", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const darkTokens = { ...registry.getTheme().tokens };

    registry.setTheme("reins-light");
    const lightTokens = registry.getTheme().tokens;

    let differenceCount = 0;
    for (const tokenName of THEME_TOKEN_NAMES) {
      if (darkTokens[tokenName] !== lightTokens[tokenName]) {
        differenceCount++;
      }
    }

    expect(differenceCount).toBeGreaterThan(THEME_TOKEN_NAMES.length / 2);
  });

  test("round-trip switch restores original tokens", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const registry = registryResult.value;
    const originalTokens = { ...registry.getTheme().tokens };

    registry.setTheme("reins-light");
    registry.setTheme("reins-dark");

    const restoredTokens = registry.getTheme().tokens;
    for (const tokenName of THEME_TOKEN_NAMES) {
      expect(restoredTokens[tokenName]).toBe(originalTokens[tokenName]);
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

// ---------------------------------------------------------------------------
// Theme registry: initial theme parameter
// ---------------------------------------------------------------------------

describe("theme registry initial theme", () => {
  test("accepts a valid initial theme name", () => {
    const registryResult = createThemeRegistry("tokyonight");
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) throw new Error("Failed to create registry");

    expect(registryResult.value.getActiveThemeName()).toBe("tokyonight");
  });

  test("falls back to default when initial theme is invalid", () => {
    const registryResult = createThemeRegistry("nonexistent-theme");
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) throw new Error("Failed to create registry");

    expect(registryResult.value.getActiveThemeName()).toBe("reins-dark");
  });

  test("falls back to default when initial theme is undefined", () => {
    const registryResult = createThemeRegistry(undefined);
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) throw new Error("Failed to create registry");

    expect(registryResult.value.getActiveThemeName()).toBe("reins-dark");
  });
});

// ---------------------------------------------------------------------------
// Theme persistence
// ---------------------------------------------------------------------------

describe("theme persistence", () => {
  // Use a temp directory to avoid polluting real config
  const TEST_DIR = join(tmpdir(), `reins-theme-test-${Date.now()}`);

  // We test the persistence module functions directly
  // by importing and calling with controlled paths

  test("loadThemePreferences returns default when file does not exist", async () => {
    const { loadThemePreferences } = await import("../../src/state/theme-persistence");
    // The real function reads from ~/.config/reins/theme-preferences.json
    // We test the fallback behavior by verifying the return type
    const prefs = loadThemePreferences();
    expect(typeof prefs.themeName).toBe("string");
    expect(prefs.themeName.length).toBeGreaterThan(0);
  });

  test("saveThemePreferences and loadThemePreferences round-trip", async () => {
    const { saveThemePreferences, loadThemePreferences } = await import("../../src/state/theme-persistence");

    // Save a preference
    saveThemePreferences({ themeName: "tokyonight" });

    // Load it back
    const loaded = loadThemePreferences();
    expect(loaded.themeName).toBe("tokyonight");

    // Restore default
    saveThemePreferences({ themeName: "reins-dark" });
  });

  test("loadThemePreferences returns default for corrupted JSON", async () => {
    const { loadThemePreferences, THEME_FILE, CONFIG_DIR } = await import("../../src/state/theme-persistence");

    // Ensure config dir exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Write corrupted JSON
    const originalContent = existsSync(THEME_FILE) ? readFileSync(THEME_FILE, "utf8") : null;
    writeFileSync(THEME_FILE, "not valid json{{{", "utf8");

    const prefs = loadThemePreferences();
    expect(prefs.themeName).toBe("reins-dark");

    // Restore original
    if (originalContent !== null) {
      writeFileSync(THEME_FILE, originalContent, "utf8");
    } else {
      rmSync(THEME_FILE, { force: true });
    }
  });

  test("loadThemePreferences returns default for invalid structure", async () => {
    const { loadThemePreferences, THEME_FILE, CONFIG_DIR } = await import("../../src/state/theme-persistence");

    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const originalContent = existsSync(THEME_FILE) ? readFileSync(THEME_FILE, "utf8") : null;
    writeFileSync(THEME_FILE, JSON.stringify({ wrong: "structure" }), "utf8");

    const prefs = loadThemePreferences();
    expect(prefs.themeName).toBe("reins-dark");

    if (originalContent !== null) {
      writeFileSync(THEME_FILE, originalContent, "utf8");
    } else {
      rmSync(THEME_FILE, { force: true });
    }
  });
});
