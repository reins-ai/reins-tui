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
