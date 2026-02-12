import { createElement, type ReactElement, type ReactNode } from "react";

import { useThemeTokens } from "../theme/use-theme-tokens";
import type { Style, TextVariant } from "./types";

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
