import type { ReactNode } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";

export interface ModalPanelProps {
  visible: boolean;
  title?: string;
  width?: number;
  height?: number;
  onClose: () => void;
  children: ReactNode;
}

export function buildModalTitle(title: string): string {
  return `◆ ${title}`;
}

export function ModalPanel({
  visible,
  title,
  width,
  height,
  onClose,
  children,
}: ModalPanelProps) {
  const { tokens } = useThemeTokens();

  useKeyboard((event) => {
    if (!visible) {
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

  const containerWidth = width ?? "100%";
  const containerHeight = height ?? "100%";

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: tokens["surface.primary"],
        flexDirection: "column",
        paddingTop: 2,
        paddingLeft: 4,
        paddingRight: 4,
      }}
    >
      <Box
        style={{
          width: containerWidth,
          height: containerHeight,
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
            <Text
              content="  Esc close"
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        ) : null}
        <Box style={{ flexDirection: "column", flexGrow: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
