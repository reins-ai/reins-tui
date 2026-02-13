import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createThemeRegistry, BUILTIN_THEME_NAMES } from "../../src/theme/theme-registry";
import {
  THEME_TOKEN_NAMES,
  validateThemeTokens,
  type ThemeTokenName,
} from "../../src/theme/theme-schema";

import reinsDarkTheme from "../../src/theme/builtins/reins-dark.json";
import reinsLightTheme from "../../src/theme/builtins/reins-light.json";
import tokyonightTheme from "../../src/theme/builtins/tokyonight.json";

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

// ---------------------------------------------------------------------------
// Depth and role token consumption across themes (MH6)
// ---------------------------------------------------------------------------

const ALL_THEMES = {
  "reins-dark": reinsDarkTheme,
  "reins-light": reinsLightTheme,
  tokyonight: tokyonightTheme,
} as const;

const DEPTH_TOKENS: ThemeTokenName[] = [
  "depth.panel1",
  "depth.panel2",
  "depth.panel3",
  "depth.interactive",
];

const ROLE_BORDER_TOKENS: ThemeTokenName[] = [
  "role.user.border",
  "role.assistant.border",
  "role.system.border",
];

describe("depth token consumption across themes", () => {
  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: all depth tokens are present and valid hex`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      for (const token of DEPTH_TOKENS) {
        expect(result.value[token]).toBeDefined();
        expect(result.value[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    test(`${themeName}: depth tokens form a progression (not all identical)`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const depthValues = DEPTH_TOKENS.map((token) => result.value[token]);
      const uniqueValues = new Set(depthValues);
      // At least 2 distinct depth levels for visible layering
      expect(uniqueValues.size).toBeGreaterThanOrEqual(2);
    });

    test(`${themeName}: depth.interactive differs from depth.panel1 (interactive feedback)`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      expect(result.value["depth.interactive"]).not.toBe(result.value["depth.panel1"]);
    });
  }

  test("depth tokens are included in THEME_TOKEN_NAMES schema", () => {
    for (const token of DEPTH_TOKENS) {
      expect(THEME_TOKEN_NAMES).toContain(token);
    }
  });

  test("depth tokens resolve correctly through registry for all themes", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Registry creation failed");

    const registry = registryResult.value;
    for (const themeName of BUILTIN_THEME_NAMES) {
      registry.setTheme(themeName);
      const theme = registry.getTheme();

      for (const token of DEPTH_TOKENS) {
        expect(theme.tokens[token]).toBeDefined();
        expect(theme.tokens[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
        // Fallback 256 also resolves
        expect(theme.fallback256[token]).toBeDefined();
        expect(theme.fallback256[token]).toBeGreaterThanOrEqual(16);
        expect(theme.fallback256[token]).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("role border token consumption across themes", () => {
  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: all role border tokens are present and valid hex`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      for (const token of ROLE_BORDER_TOKENS) {
        expect(result.value[token]).toBeDefined();
        expect(result.value[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    test(`${themeName}: user and assistant borders are visually distinct`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      expect(result.value["role.user.border"]).not.toBe(
        result.value["role.assistant.border"],
      );
    });

    test(`${themeName}: role borders contrast against conversation backgrounds`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const userBg = result.value["conversation.user.bg"];
      const assistantBg = result.value["conversation.assistant.bg"];

      // User border should differ from user message background
      expect(result.value["role.user.border"]).not.toBe(userBg);
      // Assistant border should differ from assistant message background
      expect(result.value["role.assistant.border"]).not.toBe(assistantBg);
    });

    test(`${themeName}: system border differs from primary surface`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      expect(result.value["role.system.border"]).not.toBe(
        result.value["surface.primary"],
      );
    });
  }

  test("role border tokens are included in THEME_TOKEN_NAMES schema", () => {
    for (const token of ROLE_BORDER_TOKENS) {
      expect(THEME_TOKEN_NAMES).toContain(token);
    }
  });

  test("role border tokens resolve correctly through registry for all themes", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Registry creation failed");

    const registry = registryResult.value;
    for (const themeName of BUILTIN_THEME_NAMES) {
      registry.setTheme(themeName);
      const theme = registry.getTheme();

      for (const token of ROLE_BORDER_TOKENS) {
        expect(theme.tokens[token]).toBeDefined();
        expect(theme.tokens[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(theme.fallback256[token]).toBeDefined();
        expect(theme.fallback256[token]).toBeGreaterThanOrEqual(16);
        expect(theme.fallback256[token]).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("theme token coverage for framed layout components", () => {
  /**
   * Framed layout components (message blocks, zone shells, input frames)
   * consume specific token groups. Verify that all required token groups
   * are present and valid across all themes.
   */

  const FRAMED_COMPONENT_TOKEN_GROUPS: Record<string, ThemeTokenName[]> = {
    "message blocks": [
      "conversation.user.bg",
      "conversation.user.text",
      "conversation.assistant.bg",
      "conversation.assistant.text",
      "role.user.border",
      "role.assistant.border",
    ],
    "input frame": [
      "input.bg",
      "input.text",
      "input.placeholder",
      "input.border",
    ],
    "sidebar panel": [
      "sidebar.bg",
      "sidebar.text",
      "sidebar.active",
      "sidebar.hover",
    ],
    "zone depth layers": [
      "depth.panel1",
      "depth.panel2",
      "depth.panel3",
      "depth.interactive",
    ],
    "status indicators": [
      "status.error",
      "status.success",
      "status.warning",
      "status.info",
    ],
  };

  for (const [groupName, tokens] of Object.entries(FRAMED_COMPONENT_TOKEN_GROUPS)) {
    for (const [themeName, source] of Object.entries(ALL_THEMES)) {
      test(`${themeName}: ${groupName} tokens are all valid`, () => {
        const result = validateThemeTokens(source);
        if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

        for (const token of tokens) {
          expect(result.value[token]).toBeDefined();
          expect(result.value[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      });
    }
  }

  test("all framed component token groups have text/bg contrast", () => {
    const contrastPairs: [ThemeTokenName, ThemeTokenName][] = [
      ["conversation.user.text", "conversation.user.bg"],
      ["conversation.assistant.text", "conversation.assistant.bg"],
      ["input.text", "input.bg"],
      ["sidebar.text", "sidebar.bg"],
      ["text.primary", "surface.primary"],
    ];

    for (const [themeName, source] of Object.entries(ALL_THEMES)) {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      for (const [textToken, bgToken] of contrastPairs) {
        expect(result.value[textToken]).not.toBe(result.value[bgToken]);
      }
    }
  });
});
