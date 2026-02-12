import { describe, expect, test } from "bun:test";

import {
  buildStreamingText,
  getRoleColor,
  getRoleGlyph,
  getToolGlyph,
  getToolGlyphColor,
  GLYPH_REINS,
  GLYPH_USER,
  GLYPH_TOOL_RUNNING,
  GLYPH_TOOL_DONE,
  GLYPH_TOOL_ERROR,
} from "../../src/components";
import type { ThemeTokens } from "../../src/theme/theme-schema";

import reinsDarkSource from "../../src/theme/builtins/reins-dark.json";

const tokens = reinsDarkSource as unknown as Readonly<ThemeTokens>;

describe("message rendering helpers", () => {
  test("role label colors map by message role using theme tokens", () => {
    expect(getRoleColor("user", tokens)).toBe(tokens["glyph.user"]);
    expect(getRoleColor("assistant", tokens)).toBe(tokens["glyph.reins"]);
    expect(getRoleColor("system", tokens)).toBe(tokens["text.muted"]);
    expect(getRoleColor("tool", tokens)).toBe(tokens["glyph.tool.running"]);
  });

  test("role glyph mapping uses semantic diamond vocabulary", () => {
    expect(getRoleGlyph("assistant")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("user")).toBe(GLYPH_USER);
    expect(getRoleGlyph("system")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("tool")).toBe(GLYPH_TOOL_DONE);
  });

  test("tool call glyph mapping uses semantic markers", () => {
    expect(getToolGlyph("pending")).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph("running")).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph("complete")).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyph("error")).toBe(GLYPH_TOOL_ERROR);
  });

  test("tool glyph colors use dedicated theme tokens", () => {
    expect(getToolGlyphColor("running", tokens)).toBe(tokens["glyph.tool.running"]);
    expect(getToolGlyphColor("complete", tokens)).toBe(tokens["glyph.tool.done"]);
    expect(getToolGlyphColor("error", tokens)).toBe(tokens["glyph.tool.error"]);
  });

  test("streaming cursor appears only when streaming", () => {
    expect(buildStreamingText("partial", true)).toBe("partial▊");
    expect(buildStreamingText("final", false)).toBe("final");
  });
});
