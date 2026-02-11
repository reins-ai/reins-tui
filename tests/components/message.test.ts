import { describe, expect, test } from "bun:test";

import { buildStreamingText, getRoleColor, getToolStatusIcon } from "../../src/components";
import type { ThemeTokens } from "../../src/theme/theme-schema";

import hearthstoneSource from "../../src/theme/builtins/hearthstone.json";

const tokens = hearthstoneSource as unknown as Readonly<ThemeTokens>;

describe("message rendering helpers", () => {
  test("role label colors map by message role using theme tokens", () => {
    expect(getRoleColor("user", tokens)).toBe(tokens["glyph.user"]);
    expect(getRoleColor("assistant", tokens)).toBe(tokens["accent.primary"]);
    expect(getRoleColor("system", tokens)).toBe(tokens["text.muted"]);
    expect(getRoleColor("tool", tokens)).toBe(tokens["glyph.tool.running"]);
  });

  test("tool call status icon mapping", () => {
    expect(getToolStatusIcon("pending")).toBe("⏳");
    expect(getToolStatusIcon("running")).toBe("⚡");
    expect(getToolStatusIcon("complete")).toBe("✓");
    expect(getToolStatusIcon("error")).toBe("✗");
  });

  test("streaming cursor appears only when streaming", () => {
    expect(buildStreamingText("partial", true)).toBe("partial▊");
    expect(buildStreamingText("final", false)).toBe("final");
  });
});
