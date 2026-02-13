import type { ReactNode } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard, useTerminalDimensions } from "../ui";

export interface ModalPanelProps {
  visible: boolean;
  title?: string;
  hint?: string;
  width?: number;
  height?: number;
  closeOnEscape?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function buildModalTitle(title: string): string {
  return `◆ ${title}`;
}

interface ModalFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDimension(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function resolveModalFrame(
  terminalWidth: number,
  terminalHeight: number,
  requestedWidth: number,
  requestedHeight: number,
): ModalFrame {
  const safeTerminalWidth = Math.max(terminalWidth, 40);
  const safeTerminalHeight = Math.max(terminalHeight, 12);

  const maxWidth = Math.max(24, safeTerminalWidth - 4);
  const maxHeight = Math.max(8, safeTerminalHeight - 4);

  const width = clamp(requestedWidth, 24, maxWidth);
  const height = clamp(requestedHeight, 8, maxHeight);

  return {
    width,
    height,
    left: Math.max(1, Math.floor((safeTerminalWidth - width) / 2)),
    top: Math.max(1, Math.floor((safeTerminalHeight - height) / 2)),
  };
}

export function ModalPanel({
  visible,
  title,
  hint,
  width,
  height,
  closeOnEscape = true,
  onClose,
  children,
}: ModalPanelProps) {
  const { tokens } = useThemeTokens();
  const terminalDimensions = useTerminalDimensions();
  const terminalWidth = normalizeDimension((terminalDimensions as { width?: unknown })?.width);
  const terminalHeight = normalizeDimension((terminalDimensions as { height?: unknown })?.height);

  useKeyboard((event) => {
    if (!visible || !closeOnEscape) {
      return;
    }

    const keyName = event.name ?? "";
    if (keyName === "escape" || keyName === "esc") {
      onClose();
    }
  });

  if (!visible) {
    return null;
  }

  const frame = resolveModalFrame(
    terminalWidth,
    terminalHeight,
    width ?? 96,
    height ?? 28,
  );
  const resolvedHint = hint ?? (closeOnEscape ? "Esc close" : "");

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
      }}
    >
      <Box
        style={{
          position: "absolute",
          top: frame.top,
          left: frame.left,
          width: frame.width,
          height: frame.height,
          border: true,
          borderColor: tokens["border.focus"],
          backgroundColor: tokens["surface.secondary"],
          padding: 1,
          flexDirection: "column",
        }}
      >
        {title ? (
          <Box style={{ flexDirection: "row", marginBottom: 1 }}>
            <Text
              content={buildModalTitle(title)}
              style={{ color: tokens["accent.primary"] }}
            />
            {resolvedHint.length > 0 ? (
              <Text
                content={`  ${resolvedHint}`}
                style={{ color: tokens["text.muted"] }}
              />
            ) : null}
          </Box>
        ) : null}
        <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
