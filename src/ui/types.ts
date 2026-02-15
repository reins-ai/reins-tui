export type BorderSide = "top" | "right" | "bottom" | "left";

export interface BorderCharacters {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  topT: string;
  bottomT: string;
  leftT: string;
  rightT: string;
  cross: string;
}

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
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
  alignItems?: "auto" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  alignSelf?: "auto" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  overflow?: "visible" | "hidden" | "scroll";
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
  border?: boolean | BorderSide[];
  borderColor?: string;
  customBorderChars?: BorderCharacters;
  backgroundColor?: string;
  color?: string;
  fontWeight?: "normal" | "bold";
  gap?: number;
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

/**
 * Accent position for FramedBlock left-border rendering.
 * "full" draws the accent along the entire left edge.
 * "top" draws only the top portion (e.g., header accent).
 */
export type AccentPosition = "full" | "top";

/**
 * Style contract for FramedBlock — a left-border-accented surface
 * used for message blocks, input areas, and tool panels.
 */
export interface FramedBlockStyle {
  accentColor?: string;
  accentPosition?: AccentPosition;
  backgroundColor?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  marginTop?: number;
  marginBottom?: number;
}

/**
 * Style contract for ZoneShell — a layout region wrapper
 * that provides background, optional border, and spacing
 * for major UI zones (conversation, input, sidebar, status).
 */
export interface ZoneShellStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderSides?: BorderSide[];
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexDirection?: "row" | "column";
}
