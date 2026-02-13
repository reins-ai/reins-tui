import { createElement, type ReactElement, type ReactNode } from "react";

import { useThemeTokens } from "../theme/use-theme-tokens";
import type {
  AccentPosition,
  BorderCharacters,
  BorderSide,
  FramedBlockStyle,
  Style,
  TextVariant,
  ZoneShellStyle,
} from "./types";

export interface BaseProps {
  style?: Style;
  children?: ReactNode;
}

export interface BoxProps extends BaseProps {}

export interface TextProps extends BaseProps {
  content?: string;
  variant?: TextVariant;
}

export interface ScrollBoxProps extends BaseProps {
  stickyScroll?: boolean;
  stickyStart?: "top" | "bottom";
}

export interface InputProps extends BaseProps {
  placeholder?: string;
  focused?: boolean;
  value?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export interface TextareaProps extends BaseProps {
  placeholder?: string;
  focused?: boolean;
  initialValue?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export interface DividerProps {
  style?: Style;
  char?: string;
  color?: string;
}

export function Box({ children, ...props }: BoxProps): ReactElement {
  return createElement("box", props, children);
}

export function Text({ content, children, variant, ...props }: TextProps): ReactElement {
  if (variant) {
    const { getTextVariantColor } = useThemeTokens();
    const variantColor = getTextVariantColor(variant);
    const mergedStyle: Style = { ...props.style, color: variantColor };
    return createElement("text", { ...props, style: mergedStyle }, content ?? children);
  }
  return createElement("text", props, content ?? children);
}

export function ScrollBox({ children, ...props }: ScrollBoxProps): ReactElement {
  return createElement("scrollbox", props, children);
}

export function Input({ children, ...props }: InputProps): ReactElement {
  return createElement("input", props, children);
}

export function Textarea({ children, ...props }: TextareaProps): ReactElement {
  return createElement("textarea", props, children);
}

export function Divider({ style, char = "─", color }: DividerProps): ReactElement {
  const resolvedColor = color ?? useThemeTokens().tokens["border.subtle"];
  const dividerStyle: Style = {
    width: "100%",
    ...style,
  };
  return createElement("text", { style: { ...dividerStyle, color: resolvedColor } }, char.repeat(80));
}

// --- Border character presets ---

const EMPTY_BORDER_CHARS: BorderCharacters = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
};

/**
 * Heavy vertical bar for left-border accent framing.
 * Mirrors the OpenCode SplitBorder pattern adapted for Reins.
 */
export const ACCENT_BORDER_CHARS: BorderCharacters = {
  ...EMPTY_BORDER_CHARS,
  vertical: "\u2503", // ┃
};

/**
 * Light vertical bar for subtle left-border framing.
 */
export const SUBTLE_BORDER_CHARS: BorderCharacters = {
  ...EMPTY_BORDER_CHARS,
  vertical: "\u2502", // │
};

/**
 * ASCII-safe fallback for environments that don't render Unicode box-drawing.
 */
export const ASCII_BORDER_CHARS: BorderCharacters = {
  ...EMPTY_BORDER_CHARS,
  vertical: "|",
};

// --- FramedBlock ---

export interface FramedBlockProps {
  accentColor?: string;
  accentPosition?: AccentPosition;
  backgroundColor?: string;
  borderChars?: BorderCharacters;
  style?: FramedBlockStyle;
  children?: ReactNode;
}

/**
 * A left-border-accented surface for message blocks, input areas,
 * and tool panels. Renders a box with selective left border using
 * custom border characters for the accent line.
 *
 * Default accent uses the heavy vertical bar (┃) matching the
 * OpenCode visual language adapted for Reins.
 */
export function FramedBlock({
  accentColor,
  accentPosition = "full",
  backgroundColor,
  borderChars,
  style: framedStyle,
  children,
}: FramedBlockProps): ReactElement {
  const { tokens } = useThemeTokens();

  const resolvedAccentColor = accentColor
    ?? framedStyle?.accentColor
    ?? tokens["border.focus"];

  const resolvedBg = backgroundColor
    ?? framedStyle?.backgroundColor
    ?? tokens["surface.secondary"];

  const resolvedChars = borderChars ?? ACCENT_BORDER_CHARS;

  const resolvedPosition = framedStyle?.accentPosition ?? accentPosition;

  const borderSides: BorderSide[] = resolvedPosition === "full"
    ? ["left"]
    : ["left"];

  const boxStyle: Style = {
    flexDirection: "column",
    flexGrow: 1,
    border: borderSides,
    borderColor: resolvedAccentColor,
    customBorderChars: resolvedChars,
    backgroundColor: resolvedBg,
    paddingLeft: framedStyle?.paddingLeft ?? 2,
    paddingRight: framedStyle?.paddingRight ?? 1,
    paddingTop: framedStyle?.paddingTop ?? 0,
    paddingBottom: framedStyle?.paddingBottom ?? 0,
    marginTop: framedStyle?.marginTop ?? 0,
    marginBottom: framedStyle?.marginBottom ?? 0,
  };

  return createElement("box", { style: boxStyle }, children);
}

// --- ZoneShell ---

export interface ZoneShellProps {
  borderColor?: string;
  borderSides?: BorderSide[];
  backgroundColor?: string;
  style?: ZoneShellStyle;
  children?: ReactNode;
}

/**
 * A layout region wrapper that provides background, optional border,
 * and flex behavior for major UI zones (conversation, input, sidebar,
 * status). Designed to compose with FramedBlock for nested framing.
 */
export function ZoneShell({
  borderColor,
  borderSides,
  backgroundColor,
  style: zoneStyle,
  children,
}: ZoneShellProps): ReactElement {
  const { tokens } = useThemeTokens();

  const resolvedBorderSides = borderSides ?? zoneStyle?.borderSides;
  const resolvedBorderColor = borderColor
    ?? zoneStyle?.borderColor
    ?? tokens["border.subtle"];
  const resolvedBg = backgroundColor
    ?? zoneStyle?.backgroundColor
    ?? tokens["surface.primary"];

  const hasBorder = resolvedBorderSides !== undefined && resolvedBorderSides.length > 0;

  const boxStyle: Style = {
    flexDirection: zoneStyle?.flexDirection ?? "column",
    flexGrow: zoneStyle?.flexGrow,
    flexShrink: zoneStyle?.flexShrink,
    backgroundColor: resolvedBg,
    border: hasBorder ? resolvedBorderSides : undefined,
    borderColor: hasBorder ? resolvedBorderColor : undefined,
    paddingLeft: zoneStyle?.paddingLeft ?? 0,
    paddingRight: zoneStyle?.paddingRight ?? 0,
    paddingTop: zoneStyle?.paddingTop ?? 0,
    paddingBottom: zoneStyle?.paddingBottom ?? 0,
  };

  return createElement("box", { style: boxStyle }, children);
}
