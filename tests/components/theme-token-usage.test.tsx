import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createThemeRegistry } from "../../src/theme/theme-registry";
import { THEME_TOKEN_NAMES } from "../../src/theme/theme-schema";

const COMPONENT_DIR = resolve(import.meta.dir, "../../src/components");

const COMPONENT_FILES = [
  "layout.tsx",
  "message.tsx",
  "status-bar.tsx",
  "conversation-panel.tsx",
  "sidebar.tsx",
  "input-area.tsx",
  "streaming-text.tsx",
  "command-palette.tsx",
  "conversation-list.tsx",
  "model-selector.tsx",
  "help-screen.tsx",
  "error-boundary.tsx",
  "tool-inline.tsx",
];

const HEX_COLOR_LITERAL = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/g;

function readComponent(filename: string): string {
  return readFileSync(resolve(COMPONENT_DIR, filename), "utf-8");
}

function findHardcodedColors(source: string): string[] {
  const matches = source.match(HEX_COLOR_LITERAL);
  return matches ?? [];
}

function isInCommentOrImport(source: string, hexMatch: string): boolean {
  const lines = source.split("\n");
  for (const line of lines) {
    if (!line.includes(hexMatch)) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;
    if (trimmed.startsWith("import ")) return true;
  }
  return false;
}

function isNullishCoalesceFallback(source: string, hexMatch: string): boolean {
  const lines = source.split("\n");
  for (const line of lines) {
    if (!line.includes(hexMatch)) continue;
    if (line.includes("??")) return true;
  }
  return false;
}

function findRenderPathColors(source: string, filename: string): string[] {
  const colors = findHardcodedColors(source);
  return colors.filter((color) => {
    if (isInCommentOrImport(source, color)) return false;
    if (filename === "error-boundary.tsx" && isNullishCoalesceFallback(source, color)) return false;
    return true;
  });
}

describe("ThemeProvider initialization", () => {
  test("theme registry creates successfully with all built-in themes", () => {
    const result = createThemeRegistry();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const registry = result.value;
    expect(registry.getActiveThemeName()).toBe("reins-dark");
    expect(registry.listThemes()).toContain("reins-dark");
    expect(registry.listThemes()).toContain("reins-light");
    expect(registry.listThemes()).toContain("tokyonight");
  });

  test("resolved theme contains all expected token names", () => {
    const result = createThemeRegistry();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const theme = result.value.getTheme();
    for (const tokenName of THEME_TOKEN_NAMES) {
      expect(theme.tokens[tokenName]).toBeDefined();
      expect(typeof theme.tokens[tokenName]).toBe("string");
      expect(theme.tokens[tokenName]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("resolved theme includes 256-color fallback for all tokens", () => {
    const result = createThemeRegistry();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const theme = result.value.getTheme();
    for (const tokenName of THEME_TOKEN_NAMES) {
      expect(theme.fallback256[tokenName]).toBeDefined();
      expect(typeof theme.fallback256[tokenName]).toBe("number");
      expect(theme.fallback256[tokenName]).toBeGreaterThanOrEqual(0);
      expect(theme.fallback256[tokenName]).toBeLessThanOrEqual(255);
    }
  });

  test("theme switching works and returns new resolved theme", () => {
    const result = createThemeRegistry();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const registry = result.value;
    const switchResult = registry.setTheme("reins-light");
    expect(switchResult.ok).toBe(true);
    if (!switchResult.ok) return;

    expect(registry.getActiveThemeName()).toBe("reins-light");
    expect(switchResult.value.name).toBe("reins-light");
  });
});

describe("no hardcoded hex color literals in component render paths", () => {
  for (const filename of COMPONENT_FILES) {
    test(`${filename} contains no hardcoded hex colors in render path`, () => {
      const source = readComponent(filename);
      const renderPathColors = findRenderPathColors(source, filename);

      if (renderPathColors.length > 0) {
        const uniqueColors = [...new Set(renderPathColors)];
        throw new Error(
          `Found ${renderPathColors.length} hardcoded hex color(s) in ${filename}: ${uniqueColors.join(", ")}. ` +
          "All colors should use theme tokens via useThemeTokens().",
        );
      }

      expect(renderPathColors).toHaveLength(0);
    });
  }
});

describe("components import theme tokens", () => {
  // Exclude streaming-text (no tokens needed) and help-screen (migrated to screens/, re-export shim)
  const COMPONENTS_NEEDING_TOKENS = COMPONENT_FILES.filter(
    (f) => f !== "streaming-text.tsx" && f !== "help-screen.tsx",
  );

  for (const filename of COMPONENTS_NEEDING_TOKENS) {
    test(`${filename} imports useThemeTokens or receives theme tokens via props`, () => {
      const source = readComponent(filename);
      const hasThemeImport = source.includes("useThemeTokens") || source.includes("ThemeTokens");
      expect(hasThemeImport).toBe(true);
    });
  }

  test("screens/help-screen.tsx imports useThemeTokens", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../src/screens/help-screen.tsx"), "utf-8");
    const hasThemeImport = source.includes("useThemeTokens") || source.includes("ThemeTokens");
    expect(hasThemeImport).toBe(true);
  });
});

describe("app root wraps with ThemeProvider", () => {
  test("app.tsx imports and uses ThemeProvider", () => {
    const appSource = readFileSync(resolve(import.meta.dir, "../../src/app.tsx"), "utf-8");
    expect(appSource).toContain("ThemeProvider");
    expect(appSource).toContain("<ThemeProvider>");
  });
});
