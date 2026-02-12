import { createElement, type ReactElement, type ReactNode } from "react";

import type { Style } from "./types";

interface BaseProps {
  style?: Style;
  children?: ReactNode;
}

interface BoxProps extends BaseProps {}

interface TextProps extends BaseProps {
  content?: string;
}

interface ScrollBoxProps extends BaseProps {
  stickyScroll?: boolean;
  stickyStart?: "top" | "bottom";
}

interface InputProps extends BaseProps {
  placeholder?: string;
  focused?: boolean;
  value?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

interface TextareaProps extends BaseProps {
  placeholder?: string;
  focused?: boolean;
  initialValue?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export function Box({ children, ...props }: BoxProps): ReactElement {
  return createElement("box", props, children);
}

export function Text({ content, children, ...props }: TextProps): ReactElement {
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
