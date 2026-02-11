import { useEffect, useRef, useState } from "react";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";

export const HEARTBEAT_GLYPH = "·";
export const HEARTBEAT_PULSE_INTERVAL_MS = 2_000;
export const HEARTBEAT_RECONNECT_INTERVAL_MS = 500;

export type HeartbeatPhase = "bright" | "dim";

export function resolveHeartbeatColor(
  status: DaemonConnectionStatus,
  phase: HeartbeatPhase,
  tokens: Record<string, string>,
): string {
  if (status === "disconnected") {
    return tokens["text.muted"];
  }

  if (status === "connecting" || status === "reconnecting") {
    return phase === "bright" ? tokens["status.warning"] : tokens["text.muted"];
  }

  return phase === "bright" ? tokens["glyph.heartbeat"] : tokens["text.muted"];
}

export function resolveHeartbeatInterval(status: DaemonConnectionStatus): number | null {
  if (status === "disconnected") {
    return null;
  }

  if (status === "connecting" || status === "reconnecting") {
    return HEARTBEAT_RECONNECT_INTERVAL_MS;
  }

  return HEARTBEAT_PULSE_INTERVAL_MS;
}

export interface HeartbeatPulseProps {
  connectionStatus: DaemonConnectionStatus;
  compact?: boolean;
}

export function HeartbeatPulse({ connectionStatus, compact = false }: HeartbeatPulseProps) {
  const { tokens } = useThemeTokens();
  const [phase, setPhase] = useState<HeartbeatPhase>("bright");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setPhase("bright");

    const interval = resolveHeartbeatInterval(connectionStatus);
    if (interval === null) {
      return;
    }

    intervalRef.current = setInterval(() => {
      setPhase((prev) => (prev === "bright" ? "dim" : "bright"));
    }, interval);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [connectionStatus]);

  const color = resolveHeartbeatColor(connectionStatus, phase, tokens);
  const label = compact ? "" : ` ${getConnectionLabel(connectionStatus)}`;

  return (
    <Text style={{ color }}>
      {`${HEARTBEAT_GLYPH}${label}`}
    </Text>
  );
}

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
      <HeartbeatPulse connectionStatus={connectionStatus} compact={dimensions.width < 80} />
      <Text>{" "}</Text>
      <ConnectionIndicator connectionStatus={connectionStatus} />
      <Text>
        {` | ${state.status} | ${streaming} | ${dimensions.width}x${dimensions.height} | Tab/Shift+Tab focus | Ctrl+1/2/3 jump | q quit | ? help (${help})`}
      </Text>
    </Box>
  );
}
