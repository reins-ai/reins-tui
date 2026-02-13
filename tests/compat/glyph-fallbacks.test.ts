import { describe, expect, test } from "bun:test";

import {
  GLYPH_REINS,
  GLYPH_USER,
  GLYPH_TOOL_RUNNING,
  GLYPH_TOOL_DONE,
  GLYPH_TOOL_ERROR,
  getRoleGlyph,
  getRoleColor,
  getToolGlyph,
  getToolGlyphColor,
} from "../../src/components/message";
import { isExchangeBoundary, MESSAGE_GAP, EXCHANGE_GAP } from "../../src/components/conversation-panel";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import { THEME_TOKEN_NAMES } from "../../src/theme/theme-schema";

import reinsDarkSource from "../../src/theme/builtins/reins-dark.json";
import reinsLightSource from "../../src/theme/builtins/reins-light.json";
import tokyonightSource from "../../src/theme/builtins/tokyonight.json";

describe("chat label vocabulary", () => {
  test("role labels are text-only", () => {
    expect(GLYPH_REINS).toBe("Assistant");
    expect(GLYPH_USER).toBe("User");
  });

  test("tool status labels are text-only", () => {
    expect(GLYPH_TOOL_RUNNING).toBe("Running");
    expect(GLYPH_TOOL_DONE).toBe("Done");
    expect(GLYPH_TOOL_ERROR).toBe("Failed");
  });

  test("label mapping is deterministic", () => {
    expect(getRoleGlyph("assistant")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("user")).toBe(GLYPH_USER);
    expect(getToolGlyph("running")).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph("complete")).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyph("error")).toBe(GLYPH_TOOL_ERROR);
  });
});

describe("theme token integrity", () => {
  const ALL_THEMES = [reinsDarkSource, reinsLightSource, tokyonightSource] as const;

  test("all required token names exist in built-in themes", () => {
    for (const source of ALL_THEMES) {
      const tokens = source as Record<string, string>;
      for (const tokenName of THEME_TOKEN_NAMES) {
        expect(tokens[tokenName]).toBeDefined();
      }
    }
  });

  test("role and tool color mapping uses token values", () => {
    const tokens = reinsDarkSource as unknown as Readonly<ThemeTokens>;
    expect(getRoleColor("assistant", tokens)).toBe(tokens["glyph.reins"]);
    expect(getRoleColor("user", tokens)).toBe(tokens["glyph.user"]);
    expect(getToolGlyphColor("running", tokens)).toBe(tokens["glyph.tool.running"]);
    expect(getToolGlyphColor("complete", tokens)).toBe(tokens["glyph.tool.done"]);
    expect(getToolGlyphColor("error", tokens)).toBe(tokens["glyph.tool.error"]);
  });
});

describe("spacing rhythm", () => {
  test("spacing constants stay integer and positive", () => {
    expect(Number.isInteger(MESSAGE_GAP)).toBe(true);
    expect(Number.isInteger(EXCHANGE_GAP)).toBe(true);
    expect(MESSAGE_GAP).toBeGreaterThan(0);
    expect(EXCHANGE_GAP).toBeGreaterThan(0);
  });

  test("exchange boundary detects user-after-assistant", () => {
    const messages = [
      { id: "1", role: "assistant" as const, content: "hi", isStreaming: false },
      { id: "2", role: "user" as const, content: "hello", isStreaming: false },
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("exchange boundary detects user-after-tool", () => {
    const messages = [
      { id: "1", role: "tool" as const, content: "result", isStreaming: false },
      { id: "2", role: "user" as const, content: "thanks", isStreaming: false },
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });
});
