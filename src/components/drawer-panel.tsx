import type { ReactNode } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";

export interface DrawerPanelProps {
  side: "left" | "right";
  width: number;
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function buildDrawerBorderStyle(
  tokens: Record<string, string>,
  isFocused?: boolean,
): string {
  return isFocused ? tokens["border.focus"] : tokens["border.primary"];
}

export function resolveDrawerPosition(side: "left" | "right"): "left" | "right" {
  return side;
}

export function DrawerPanel({
  side,
  width,
  visible,
  title,
  onClose,
  children,
}: DrawerPanelProps) {
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

  const positionStyle =
    side === "left"
      ? { left: 0 as number | string }
      : { right: 0 as number | string };

  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        ...positionStyle,
        width,
        height: "100%",
        backgroundColor: tokens["surface.secondary"],
        borderColor: tokens["border.primary"],
        border: true,
        flexDirection: "column",
      }}
    >
      {title ? (
        <Box
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            marginBottom: 1,
          }}
        >
          <Text
            content={title}
            style={{ color: tokens["text.primary"] }}
          />
          <Text
            content="  Esc close"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
      <Box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          padding: 1,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
