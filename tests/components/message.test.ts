import { describe, expect, test } from "bun:test";

import {
  buildStreamingText,
  getMessageBlockStyle,
  getMessageBorderChars,
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
import { ACCENT_BORDER_CHARS, SUBTLE_BORDER_CHARS } from "../../src/ui/primitives";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import type { MessageRole } from "../../src/theme/use-theme-tokens";

import reinsDarkSource from "../../src/theme/builtins/reins-dark.json";
import reinsLightSource from "../../src/theme/builtins/reins-light.json";
import tokyonightSource from "../../src/theme/builtins/tokyonight.json";

const tokens = reinsDarkSource as unknown as Readonly<ThemeTokens>;
const lightTokens = reinsLightSource as unknown as Readonly<ThemeTokens>;
const tokyonightTokens = tokyonightSource as unknown as Readonly<ThemeTokens>;

/** Stub getRoleBorder that reads directly from token objects. */
function makeGetRoleBorder(t: Readonly<ThemeTokens>) {
  return (role: MessageRole): string => {
    const map: Record<MessageRole, string> = {
      user: t["role.user.border"],
      assistant: t["role.assistant.border"],
      system: t["role.system.border"],
    };
    return map[role];
  };
}

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

describe("role-specific message block styling", () => {
  const getRoleBorder = makeGetRoleBorder(tokens);

  test("user block uses role.user.border accent and conversation.user.bg background", () => {
    const style = getMessageBlockStyle("user", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["role.user.border"]);
    expect(style.backgroundColor).toBe(tokens["conversation.user.bg"]);
  });

  test("assistant block uses role.assistant.border accent and conversation.assistant.bg background", () => {
    const style = getMessageBlockStyle("assistant", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["role.assistant.border"]);
    expect(style.backgroundColor).toBe(tokens["conversation.assistant.bg"]);
  });

  test("system block uses role.system.border accent and surface.primary background", () => {
    const style = getMessageBlockStyle("system", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["role.system.border"]);
    expect(style.backgroundColor).toBe(tokens["surface.primary"]);
  });

  test("tool block uses glyph.tool.running accent and surface.secondary background", () => {
    const style = getMessageBlockStyle("tool", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["glyph.tool.running"]);
    expect(style.backgroundColor).toBe(tokens["surface.secondary"]);
  });

  test("user and assistant accent colors are distinct", () => {
    const userStyle = getMessageBlockStyle("user", tokens, getRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);
    expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
  });

  test("user and assistant background colors are distinct", () => {
    const userStyle = getMessageBlockStyle("user", tokens, getRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);
    expect(userStyle.backgroundColor).not.toBe(assistantStyle.backgroundColor);
  });

  test("all roles produce consistent padding values", () => {
    const roles: Array<"user" | "assistant" | "system" | "tool"> = ["user", "assistant", "system", "tool"];
    for (const role of roles) {
      const style = getMessageBlockStyle(role, tokens, getRoleBorder);
      expect(style.paddingLeft).toBe(2);
      expect(style.paddingRight).toBe(1);
      expect(style.paddingTop).toBe(0);
      expect(style.paddingBottom).toBe(0);
    }
  });

  test("assistant uses heavy accent border chars, user uses subtle", () => {
    expect(getMessageBorderChars("assistant")).toBe(ACCENT_BORDER_CHARS);
    expect(getMessageBorderChars("user")).toBe(SUBTLE_BORDER_CHARS);
  });

  test("system and tool use subtle border chars", () => {
    expect(getMessageBorderChars("system")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("tool")).toBe(SUBTLE_BORDER_CHARS);
  });
});

describe("role block styling across themes", () => {
  test("dark theme: user and assistant borders are distinct hex colors", () => {
    const getRoleBorder = makeGetRoleBorder(tokens);
    const userStyle = getMessageBlockStyle("user", tokens, getRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);
    expect(userStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(assistantStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
  });

  test("light theme: user and assistant borders are distinct hex colors", () => {
    const getRoleBorder = makeGetRoleBorder(lightTokens);
    const userStyle = getMessageBlockStyle("user", lightTokens, getRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", lightTokens, getRoleBorder);
    expect(userStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(assistantStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
  });

  test("tokyonight theme: user and assistant borders are distinct hex colors", () => {
    const getRoleBorder = makeGetRoleBorder(tokyonightTokens);
    const userStyle = getMessageBlockStyle("user", tokyonightTokens, getRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", tokyonightTokens, getRoleBorder);
    expect(userStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(assistantStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
  });

  test("all themes produce distinct user vs assistant backgrounds", () => {
    const themeTokenSets = [tokens, lightTokens, tokyonightTokens];
    for (const t of themeTokenSets) {
      const getRoleBorder = makeGetRoleBorder(t);
      const userStyle = getMessageBlockStyle("user", t, getRoleBorder);
      const assistantStyle = getMessageBlockStyle("assistant", t, getRoleBorder);
      expect(userStyle.backgroundColor).not.toBe(assistantStyle.backgroundColor);
    }
  });
});
