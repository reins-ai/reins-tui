import { describe, expect, test } from "bun:test";

import type { ThemeTokens, ThemeTokenName } from "../../src/theme/theme-schema";
import {
  SEMANTIC_COLOR_MAP,
  TEXT_VARIANT_MAP,
  type SemanticColor,
} from "../../src/theme/use-theme-tokens";
import type {
  AccentPosition,
  BorderCharacters,
  BorderSide,
  FramedBlockStyle,
  TextVariant,
  SpacingSize,
  ZoneShellStyle,
} from "../../src/ui/types";
import { SPACING_SCALE } from "../../src/ui/types";
import {
  ACCENT_BORDER_CHARS,
  SUBTLE_BORDER_CHARS,
  ASCII_BORDER_CHARS,
} from "../../src/ui/primitives";

const MOCK_TOKENS: ThemeTokens = {
  "surface.primary": "#1a1a2e",
  "surface.secondary": "#252540",
  "surface.tertiary": "#2e2e4a",
  "surface.elevated": "#353555",
  "text.primary": "#e8e0d4",
  "text.secondary": "#a09888",
  "text.muted": "#6b6360",
  "text.inverse": "#1a1a2e",
  "accent.primary": "#e8976c",
  "accent.secondary": "#f0c674",
  "accent.subtle": "#4a3a2e",
  "border.primary": "#4a4a6a",
  "border.subtle": "#3a3a5a",
  "border.focus": "#e8976c",
  "status.error": "#e85050",
  "status.success": "#50c878",
  "status.warning": "#f0c674",
  "status.info": "#6ca8e8",
  "glyph.reins": "#e8976c",
  "glyph.user": "#f0c674",
  "glyph.tool.running": "#6ca8e8",
  "glyph.tool.done": "#50c878",
  "glyph.tool.error": "#e85050",
  "glyph.heartbeat": "#e8976c",
  "conversation.user.bg": "#2e2e4a",
  "conversation.user.text": "#e8e0d4",
  "conversation.assistant.bg": "#1a1a2e",
  "conversation.assistant.text": "#e8e0d4",
  "sidebar.bg": "#1a1a2e",
  "sidebar.text": "#a09888",
  "sidebar.active": "#e8976c",
  "sidebar.hover": "#353555",
  "input.bg": "#252540",
  "input.text": "#e8e0d4",
  "input.placeholder": "#6b6360",
  "input.border": "#4a4a6a",
  "depth.panel1": "#1a1a2e",
  "depth.panel2": "#252540",
  "depth.panel3": "#2e2e4a",
  "depth.interactive": "#353555",
  "role.user.border": "#f0c674",
  "role.assistant.border": "#e8976c",
  "role.system.border": "#6ca8e8",
};

describe("TextVariant mapping", () => {
  test("primary variant maps to text.primary token", () => {
    const tokenName = TEXT_VARIANT_MAP["primary"];
    expect(tokenName).toBe("text.primary");
    expect(MOCK_TOKENS[tokenName]).toBe("#e8e0d4");
  });

  test("secondary variant maps to text.secondary token", () => {
    const tokenName = TEXT_VARIANT_MAP["secondary"];
    expect(tokenName).toBe("text.secondary");
    expect(MOCK_TOKENS[tokenName]).toBe("#a09888");
  });

  test("muted variant maps to text.muted token", () => {
    const tokenName = TEXT_VARIANT_MAP["muted"];
    expect(tokenName).toBe("text.muted");
    expect(MOCK_TOKENS[tokenName]).toBe("#6b6360");
  });

  test("accent variant maps to accent.primary token", () => {
    const tokenName = TEXT_VARIANT_MAP["accent"];
    expect(tokenName).toBe("accent.primary");
    expect(MOCK_TOKENS[tokenName]).toBe("#e8976c");
  });

  test("error variant maps to status.error token", () => {
    const tokenName = TEXT_VARIANT_MAP["error"];
    expect(tokenName).toBe("status.error");
    expect(MOCK_TOKENS[tokenName]).toBe("#e85050");
  });

  test("all TextVariant values have valid token mappings", () => {
    const variants: TextVariant[] = ["primary", "secondary", "muted", "accent", "error"];
    for (const variant of variants) {
      const tokenName = TEXT_VARIANT_MAP[variant];
      expect(tokenName).toBeDefined();
      expect(MOCK_TOKENS[tokenName]).toBeDefined();
      expect(MOCK_TOKENS[tokenName]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("SemanticColor mapping", () => {
  test("all semantic colors map to valid theme tokens", () => {
    const semantics: SemanticColor[] = [
      "primary",
      "secondary",
      "muted",
      "accent",
      "error",
      "success",
      "warning",
      "info",
    ];
    for (const semantic of semantics) {
      const tokenName = SEMANTIC_COLOR_MAP[semantic];
      expect(tokenName).toBeDefined();
      expect(MOCK_TOKENS[tokenName]).toBeDefined();
      expect(MOCK_TOKENS[tokenName]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("success maps to status.success", () => {
    expect(SEMANTIC_COLOR_MAP["success"]).toBe("status.success");
  });

  test("warning maps to status.warning", () => {
    expect(SEMANTIC_COLOR_MAP["warning"]).toBe("status.warning");
  });

  test("info maps to status.info", () => {
    expect(SEMANTIC_COLOR_MAP["info"]).toBe("status.info");
  });
});

describe("SpacingScale", () => {
  test("none returns 0", () => {
    expect(SPACING_SCALE["none"]).toBe(0);
  });

  test("xs returns 1", () => {
    expect(SPACING_SCALE["xs"]).toBe(1);
  });

  test("sm returns 2", () => {
    expect(SPACING_SCALE["sm"]).toBe(2);
  });

  test("md returns 3", () => {
    expect(SPACING_SCALE["md"]).toBe(3);
  });

  test("lg returns 4", () => {
    expect(SPACING_SCALE["lg"]).toBe(4);
  });

  test("xl returns 6", () => {
    expect(SPACING_SCALE["xl"]).toBe(6);
  });

  test("spacing scale is monotonically increasing", () => {
    const sizes: SpacingSize[] = ["none", "xs", "sm", "md", "lg", "xl"];
    for (let i = 1; i < sizes.length; i++) {
      expect(SPACING_SCALE[sizes[i]]).toBeGreaterThan(SPACING_SCALE[sizes[i - 1]]);
    }
  });

  test("all spacing values are non-negative integers", () => {
    const sizes: SpacingSize[] = ["none", "xs", "sm", "md", "lg", "xl"];
    for (const size of sizes) {
      const value = SPACING_SCALE[size];
      expect(value).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("Token bridge getColor mapping", () => {
  test("getColor resolves semantic names to correct token paths", () => {
    const expectations: Record<SemanticColor, ThemeTokenName> = {
      primary: "text.primary",
      secondary: "text.secondary",
      muted: "text.muted",
      accent: "accent.primary",
      error: "status.error",
      success: "status.success",
      warning: "status.warning",
      info: "status.info",
    };

    for (const [semantic, expectedToken] of Object.entries(expectations)) {
      expect(SEMANTIC_COLOR_MAP[semantic as SemanticColor]).toBe(expectedToken);
    }
  });
});

describe("Primitive prop interfaces", () => {
  test("TextVariant type covers all expected variants", () => {
    const variants: TextVariant[] = ["primary", "secondary", "muted", "accent", "error"];
    expect(variants).toHaveLength(5);
    for (const v of variants) {
      expect(TEXT_VARIANT_MAP[v]).toBeDefined();
    }
  });

  test("SpacingSize type covers all expected sizes", () => {
    const sizes: SpacingSize[] = ["none", "xs", "sm", "md", "lg", "xl"];
    expect(sizes).toHaveLength(6);
    for (const s of sizes) {
      expect(SPACING_SCALE[s]).toBeDefined();
    }
  });
});
