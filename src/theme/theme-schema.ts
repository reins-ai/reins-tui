import type { Result } from "@reins/core";

export const THEME_TOKEN_NAMES = [
  "surface.primary",
  "surface.secondary",
  "surface.tertiary",
  "surface.elevated",
  "text.primary",
  "text.secondary",
  "text.muted",
  "text.inverse",
  "accent.primary",
  "accent.secondary",
  "accent.subtle",
  "border.primary",
  "border.subtle",
  "border.focus",
  "status.error",
  "status.success",
  "status.warning",
  "status.info",
  "glyph.reins",
  "glyph.user",
  "glyph.tool.running",
  "glyph.tool.done",
  "glyph.tool.error",
  "glyph.heartbeat",
  "conversation.user.bg",
  "conversation.user.text",
  "conversation.assistant.bg",
  "conversation.assistant.text",
  "sidebar.bg",
  "sidebar.text",
  "sidebar.active",
  "sidebar.hover",
  "input.bg",
  "input.text",
  "input.placeholder",
  "input.border",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type HexColor = `#${string}`;
export type ThemeTokens = Record<ThemeTokenName, HexColor>;

export interface ThemeValidationError {
  path: string;
  message: string;
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const TOKEN_SET = new Set<string>(THEME_TOKEN_NAMES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isThemeTokenName(value: string): value is ThemeTokenName {
  return TOKEN_SET.has(value);
}

export function validateThemeTokens(input: unknown): Result<ThemeTokens, ThemeValidationError[]> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: [{ path: "theme", message: "Theme must be a flat object of token name to hex value." }],
    };
  }

  const errors: ThemeValidationError[] = [];

  for (const tokenName of THEME_TOKEN_NAMES) {
    const value = input[tokenName];
    if (typeof value !== "string") {
      errors.push({ path: tokenName, message: "Missing required token or token is not a string." });
      continue;
    }

    if (!HEX_COLOR_PATTERN.test(value)) {
      errors.push({ path: tokenName, message: "Token value must be a 6-char hex color like #aabbcc." });
    }
  }

  for (const key of Object.keys(input)) {
    if (!isThemeTokenName(key)) {
      errors.push({ path: key, message: "Unknown token name." });
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors };
  }

  return { ok: true, value: input as ThemeTokens };
}
