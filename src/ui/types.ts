export interface Style {
  position?: "relative" | "absolute";
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  left?: number | string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  flexDirection?: "row" | "column";
  flexGrow?: number;
  flexShrink?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  border?: boolean;
  borderColor?: string;
  backgroundColor?: string;
  color?: string;
}

export type TextVariant = "primary" | "secondary" | "muted" | "accent" | "error";

export type SpacingSize = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export const SPACING_SCALE: Record<SpacingSize, number> = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
};

export interface KeyEvent {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface RendererConfig {
  exitOnCtrlC?: boolean;
  useMouse?: boolean;
  title?: string;
  autoFocus?: boolean;
}

export interface TerminalDimensions {
  width: number;
  height: number;
}
