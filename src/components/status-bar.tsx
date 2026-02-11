import type { DaemonConnectionStatus } from "../daemon/contracts";
import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";

export interface ConnectionIndicatorProps {
  connectionStatus: DaemonConnectionStatus;
}

export function getConnectionLabel(status: DaemonConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Offline";
    case "connecting":
      return "Connecting...";
    case "reconnecting":
      return "Reconnecting...";
  }
}

export function getConnectionGlyph(status: DaemonConnectionStatus): string {
  switch (status) {
    case "connected":
      return "●";
    case "disconnected":
      return "○";
    case "connecting":
    case "reconnecting":
      return "◌";
  }
}

export function ConnectionIndicator({ connectionStatus }: ConnectionIndicatorProps) {
  const { tokens } = useThemeTokens();

  const colorMap: Record<DaemonConnectionStatus, string> = {
    connected: tokens["status.success"],
    disconnected: tokens["status.error"],
    connecting: tokens["status.warning"],
    reconnecting: tokens["status.warning"],
  };

  const color = colorMap[connectionStatus];
  const glyph = getConnectionGlyph(connectionStatus);
  const label = getConnectionLabel(connectionStatus);

  return (
    <Text style={{ color }}>
      {`${glyph} ${label}`}
    </Text>
  );
}

export interface StatusBarProps {
  version: string;
  dimensions: TerminalDimensions;
  showHelp: boolean;
  connectionStatus?: DaemonConnectionStatus;
}

export function StatusBar({ version, dimensions, showHelp, connectionStatus = "disconnected" }: StatusBarProps) {
  const { state } = useApp();
  const { tokens } = useThemeTokens();
  const streaming = state.isStreaming ? "Streaming" : "Idle";
  const help = showHelp ? "Help on" : "Help off";

  return (
    <Box style={{ height: 1, backgroundColor: tokens["surface.primary"], color: tokens["text.primary"], marginTop: 1, paddingLeft: 1 }}>
      <Text>
        {`v${version} | model ${state.currentModel} | `}
      </Text>
      <ConnectionIndicator connectionStatus={connectionStatus} />
      <Text>
        {` | ${state.status} | ${streaming} | ${dimensions.width}x${dimensions.height} | Tab/Shift+Tab focus | Ctrl+1/2/3 jump | q quit | ? help (${help})`}
      </Text>
    </Box>
  );
}
