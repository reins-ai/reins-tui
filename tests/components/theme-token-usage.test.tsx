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

// ---------------------------------------------------------------------------
// WCAG contrast ratio utilities for quantitative audit (MH6)
// ---------------------------------------------------------------------------

function hexToLinearChannel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  return (
    0.2126 * hexToLinearChannel(hex, 1) +
    0.7152 * hexToLinearChannel(hex, 3) +
    0.0722 * hexToLinearChannel(hex, 5)
  );
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Component-by-component three-theme contrast audit (MH6)
// ---------------------------------------------------------------------------

describe("three-theme contrast audit: message component", () => {
  const TEXT_BG_PAIRS: [ThemeTokenName, ThemeTokenName, number][] = [
    ["conversation.user.text", "conversation.user.bg", 4.5],
    ["conversation.assistant.text", "conversation.assistant.bg", 4.5],
    ["text.muted", "conversation.user.bg", 2.0],
    ["text.muted", "conversation.assistant.bg", 2.0],
  ];

  const GLYPH_BG_PAIRS: [ThemeTokenName, ThemeTokenName, number][] = [
    ["glyph.user", "conversation.user.bg", 2.5],
    ["glyph.reins", "conversation.assistant.bg", 2.5],
    ["glyph.tool.running", "surface.secondary", 3.0],
    ["glyph.tool.done", "surface.secondary", 3.0],
    ["glyph.tool.error", "surface.secondary", 3.0],
  ];

  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    for (const [fgToken, bgToken, minRatio] of TEXT_BG_PAIRS) {
      test(`${themeName}: ${fgToken} on ${bgToken} meets ${minRatio}:1 contrast`, () => {
        const result = validateThemeTokens(source);
        if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
        const ratio = contrastRatio(result.value[fgToken], result.value[bgToken]);
        expect(ratio).toBeGreaterThanOrEqual(minRatio);
      });
    }

    for (const [fgToken, bgToken, minRatio] of GLYPH_BG_PAIRS) {
      test(`${themeName}: ${fgToken} on ${bgToken} meets ${minRatio}:1 contrast`, () => {
        const result = validateThemeTokens(source);
        if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
        const ratio = contrastRatio(result.value[fgToken], result.value[bgToken]);
        expect(ratio).toBeGreaterThanOrEqual(minRatio);
      });
    }

    test(`${themeName}: role borders are distinguishable from message backgrounds`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const userBorderRatio = contrastRatio(
        result.value["role.user.border"],
        result.value["conversation.user.bg"],
      );
      const assistantBorderRatio = contrastRatio(
        result.value["role.assistant.border"],
        result.value["conversation.assistant.bg"],
      );
      expect(userBorderRatio).toBeGreaterThanOrEqual(2.0);
      expect(assistantBorderRatio).toBeGreaterThanOrEqual(2.0);
    });
  }
});

describe("three-theme contrast audit: input component", () => {
  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: input text readable on input background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["input.text"], result.value["input.bg"])).toBeGreaterThanOrEqual(4.5);
    });

    test(`${themeName}: input placeholder visible on input background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["input.placeholder"], result.value["input.bg"])).toBeGreaterThanOrEqual(2.5);
    });

    test(`${themeName}: focus border visible on input background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["border.focus"], result.value["input.bg"])).toBeGreaterThanOrEqual(2.0);
    });

    test(`${themeName}: hint text (text.muted) readable on input background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["text.muted"], result.value["input.bg"])).toBeGreaterThanOrEqual(2.5);
    });

    test(`${themeName}: warning accent visible on secondary surface (disabled state)`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["status.warning"], result.value["surface.secondary"])).toBeGreaterThanOrEqual(3.0);
    });
  }
});

describe("three-theme contrast audit: status bar component", () => {
  const STATUS_ON_SECONDARY: [ThemeTokenName, number][] = [
    ["status.error", 3.0],
    ["status.success", 3.0],
    ["status.warning", 3.0],
    ["status.info", 3.0],
    ["glyph.heartbeat", 3.0],
    ["text.primary", 4.5],
    ["text.muted", 2.5],
  ];

  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    for (const [token, minRatio] of STATUS_ON_SECONDARY) {
      test(`${themeName}: ${token} on surface.secondary meets ${minRatio}:1`, () => {
        const result = validateThemeTokens(source);
        if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
        const ratio = contrastRatio(result.value[token], result.value["surface.secondary"]);
        expect(ratio).toBeGreaterThanOrEqual(minRatio);
      });
    }
  }
});

describe("three-theme contrast audit: sidebar component", () => {
  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: sidebar text readable on sidebar background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["sidebar.text"], result.value["sidebar.bg"])).toBeGreaterThanOrEqual(4.5);
    });

    test(`${themeName}: accent.primary visible on sidebar background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["accent.primary"], result.value["sidebar.bg"])).toBeGreaterThanOrEqual(3.0);
    });

    test(`${themeName}: text.muted readable on sidebar background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["text.muted"], result.value["sidebar.bg"])).toBeGreaterThanOrEqual(2.5);
    });

    test(`${themeName}: sidebar active state differs from sidebar background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(result.value["sidebar.active"]).not.toBe(result.value["sidebar.bg"]);
    });
  }
});

describe("three-theme contrast audit: tool block component", () => {
  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: tool running glyph visible on tool block background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["glyph.tool.running"], result.value["surface.secondary"])).toBeGreaterThanOrEqual(3.0);
    });

    test(`${themeName}: tool done glyph visible on tool block background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["glyph.tool.done"], result.value["surface.secondary"])).toBeGreaterThanOrEqual(3.0);
    });

    test(`${themeName}: tool error glyph visible on tool block background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["glyph.tool.error"], result.value["surface.secondary"])).toBeGreaterThanOrEqual(3.0);
    });

    test(`${themeName}: tool label text readable on tool block background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["text.secondary"], result.value["surface.secondary"])).toBeGreaterThanOrEqual(3.0);
    });

    test(`${themeName}: tool detail text visible on tool block background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["text.muted"], result.value["surface.secondary"])).toBeGreaterThanOrEqual(2.5);
    });
  }
});

describe("three-theme contrast audit: border visibility", () => {
  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: border.primary visible on surface.primary`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["border.primary"], result.value["surface.primary"])).toBeGreaterThanOrEqual(1.5);
    });

    test(`${themeName}: border.subtle visible on surface.primary`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["border.subtle"], result.value["surface.primary"])).toBeGreaterThanOrEqual(1.2);
    });

    test(`${themeName}: border.focus visible on surface.primary`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);
      expect(contrastRatio(result.value["border.focus"], result.value["surface.primary"])).toBeGreaterThanOrEqual(3.0);
    });
  }
});
