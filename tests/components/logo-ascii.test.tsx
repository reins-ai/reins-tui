import { describe, expect, test } from "bun:test";

import {
  LOGO_FULL_STANDARD,
  LOGO_FULL_SAD,
  LOGO_COMPACT_STANDARD,
  LOGO_COMPACT_SAD,
  getLogoLines,
  getLogoWidth,
  type LogoVariant,
  type LogoSize,
} from "../../src/components/logo-ascii";
import type { ThemeTokens } from "../../src/theme/theme-schema";

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
};

describe("LogoAscii", () => {
  describe("standard variant", () => {
    test("full standard logo has multiple lines", () => {
      expect(LOGO_FULL_STANDARD.length).toBeGreaterThanOrEqual(8);
    });

    test("full standard logo contains REINS text", () => {
      const hasReins = LOGO_FULL_STANDARD.some((line) => line.includes("REINS"));
      expect(hasReins).toBe(true);
    });

    test("full standard logo contains O eyes (not X)", () => {
      const hasNormalEyes = LOGO_FULL_STANDARD.some((line) => line.includes("O  O"));
      expect(hasNormalEyes).toBe(true);
    });

    test("full standard logo contains antennae", () => {
      const hasAntennae = LOGO_FULL_STANDARD.some(
        (line) => line.includes("\\") && line.includes("/"),
      );
      expect(hasAntennae).toBe(true);
    });

    test("compact standard logo has fewer lines than full", () => {
      expect(LOGO_COMPACT_STANDARD.length).toBeLessThan(LOGO_FULL_STANDARD.length);
    });

    test("compact standard logo contains REINS text", () => {
      const hasReins = LOGO_COMPACT_STANDARD.some((line) => line.includes("REINS"));
      expect(hasReins).toBe(true);
    });
  });

  describe("sad variant", () => {
    test("full sad logo has same line count as full standard", () => {
      expect(LOGO_FULL_SAD.length).toBe(LOGO_FULL_STANDARD.length);
    });

    test("full sad logo contains X eyes", () => {
      const hasXEyes = LOGO_FULL_SAD.some((line) => line.includes("X  X"));
      expect(hasXEyes).toBe(true);
    });

    test("full sad logo does not contain O eyes", () => {
      const hasNormalEyes = LOGO_FULL_SAD.some((line) => line.includes("O  O"));
      expect(hasNormalEyes).toBe(false);
    });

    test("full sad logo has droopy antennae (pipes instead of slashes)", () => {
      const secondLine = LOGO_FULL_SAD[1];
      expect(secondLine).toContain("|  |");
    });

    test("compact sad logo contains X eyes", () => {
      const hasXEyes = LOGO_COMPACT_SAD.some((line) => line.includes("X X"));
      expect(hasXEyes).toBe(true);
    });

    test("compact sad logo contains REINS text", () => {
      const hasReins = LOGO_COMPACT_SAD.some((line) => line.includes("REINS"));
      expect(hasReins).toBe(true);
    });
  });

  describe("getLogoLines selection", () => {
    test("returns full standard for standard + full", () => {
      expect(getLogoLines("standard", "full")).toBe(LOGO_FULL_STANDARD);
    });

    test("returns full sad for sad + full", () => {
      expect(getLogoLines("sad", "full")).toBe(LOGO_FULL_SAD);
    });

    test("returns compact standard for standard + compact", () => {
      expect(getLogoLines("standard", "compact")).toBe(LOGO_COMPACT_STANDARD);
    });

    test("returns compact sad for sad + compact", () => {
      expect(getLogoLines("sad", "compact")).toBe(LOGO_COMPACT_SAD);
    });
  });

  describe("getLogoWidth", () => {
    test("full logo is wider than compact logo", () => {
      const fullWidth = getLogoWidth("standard", "full");
      const compactWidth = getLogoWidth("standard", "compact");
      expect(fullWidth).toBeGreaterThan(compactWidth);
    });

    test("full standard and full sad have same width", () => {
      const standardWidth = getLogoWidth("standard", "full");
      const sadWidth = getLogoWidth("sad", "full");
      expect(standardWidth).toBe(sadWidth);
    });

    test("full logo width is reasonable for terminal display", () => {
      const width = getLogoWidth("standard", "full");
      expect(width).toBeGreaterThan(10);
      expect(width).toBeLessThan(40);
    });

    test("compact logo width fits narrow terminals", () => {
      const width = getLogoWidth("standard", "compact");
      expect(width).toBeLessThan(20);
    });
  });

  describe("theme color mapping", () => {
    test("glyph.reins token exists for logo coloring", () => {
      expect(MOCK_TOKENS["glyph.reins"]).toBeDefined();
      expect(MOCK_TOKENS["glyph.reins"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    test("accent.primary exists as fallback for logo color", () => {
      expect(MOCK_TOKENS["accent.primary"]).toBeDefined();
      expect(MOCK_TOKENS["accent.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    test("text.muted exists for tagline color", () => {
      expect(MOCK_TOKENS["text.muted"]).toBeDefined();
      expect(MOCK_TOKENS["text.muted"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe("all variants and sizes", () => {
    const variants: LogoVariant[] = ["standard", "sad"];
    const sizes: LogoSize[] = ["full", "compact"];

    for (const variant of variants) {
      for (const size of sizes) {
        test(`${variant}/${size} has non-empty lines`, () => {
          const lines = getLogoLines(variant, size);
          expect(lines.length).toBeGreaterThan(0);
          for (const line of lines) {
            expect(line.length).toBeGreaterThan(0);
          }
        });

        test(`${variant}/${size} contains REINS branding`, () => {
          const lines = getLogoLines(variant, size);
          const hasReins = lines.some((line) => line.includes("REINS"));
          expect(hasReins).toBe(true);
        });
      }
    }
  });

  describe("visual differentiation", () => {
    test("standard and sad full variants differ in eye region", () => {
      const standardStr = LOGO_FULL_STANDARD.join("\n");
      const sadStr = LOGO_FULL_SAD.join("\n");
      expect(standardStr).not.toBe(sadStr);
    });

    test("standard and sad compact variants differ", () => {
      const standardStr = LOGO_COMPACT_STANDARD.join("\n");
      const sadStr = LOGO_COMPACT_SAD.join("\n");
      expect(standardStr).not.toBe(sadStr);
    });

    test("sad variant has frown instead of smile in full size", () => {
      const standardMouth = LOGO_FULL_STANDARD.some((line) => line.includes("\\__/"));
      const sadMouth = LOGO_FULL_SAD.some((line) => line.includes("/--\\"));
      expect(standardMouth).toBe(true);
      expect(sadMouth).toBe(true);
    });
  });
});
