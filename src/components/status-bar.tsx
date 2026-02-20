import { useEffect, useMemo, useRef, useState } from "react";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import type { DaemonMode } from "../daemon/daemon-context";
import { useApp } from "../store";
import type { StatusSegment, StatusSegmentSources } from "../store/types";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";
import type { ConversationLifecycleStatus } from "../state/status-machine";
import { resolveStatusSegmentSet } from "../state/status-machine";

// --- Constants ---

export const HEARTBEAT_GLYPH = "·";
export const HEARTBEAT_PULSE_INTERVAL_MS = 2_000;
export const HEARTBEAT_RECONNECT_INTERVAL_MS = 500;
export const COMPACTION_INDICATOR_DURATION_MS = 4_000;

/** Separator glyph between status segments. */
export const SEGMENT_SEPARATOR = " │ ";

// --- Heartbeat helpers ---

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

// --- Connection helpers ---

export function getConnectionLabel(status: DaemonConnectionStatus, daemonMode?: DaemonMode): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return daemonMode === "mock" ? "⚠ Backend disconnected" : "Offline";
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

// --- Streaming lifecycle display ---

export interface LifecycleDisplay {
  glyph: string;
  label: string;
  colorToken: string;
}

/**
 * Lightweight token estimate for status display.
 * Uses a character-based heuristic so the count updates continuously during
 * streaming even before whitespace-delimited words are complete.
 */
export function estimateTokenCount(content: string): number {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function resolveLifecycleDisplay(
  status: ConversationLifecycleStatus,
  tokenCount: number,
  cost: string | null,
  activeToolName?: string | null,
): LifecycleDisplay {
  switch (status) {
    case "idle":
      return { glyph: "●", label: "Ready", colorToken: "status.success" };
    case "sending":
      return { glyph: "◐", label: "Sending...", colorToken: "status.warning" };
    case "thinking":
      return { glyph: "◑", label: "Thinking...", colorToken: "status.warning" };
    case "streaming":
      if (activeToolName) {
        return {
          glyph: "⚙",
          label: `Using tool: ${activeToolName}`,
          colorToken: "status.warning",
        };
      }
      return {
        glyph: "▶",
        label: `Streaming [${tokenCount} tokens]`,
        colorToken: "status.info",
      };
    case "complete": {
      const costSuffix = cost ? ` [${cost}]` : "";
      return { glyph: "✓", label: `Done${costSuffix}`, colorToken: "status.success" };
    }
    case "error":
      return { glyph: "✗", label: "Error", colorToken: "status.error" };
  }
}

// --- Two-zone layout helpers ---

export interface StatusBarSegments {
  heartbeat: string;
  connection: string;
  model: string;
  lifecycle: string;
  hint: string;
}

export function buildSegments(
  connectionStatus: DaemonConnectionStatus,
  modelName: string,
  lifecycleDisplay: LifecycleDisplay,
  compactionActive: boolean,
  daemonMode?: DaemonMode,
): StatusBarSegments {
  const connectionGlyph = getConnectionGlyph(connectionStatus);
  const heartbeat = HEARTBEAT_GLYPH;
  const connection = `${connectionGlyph} ${getConnectionLabel(connectionStatus, daemonMode)}`;
  const model = modelName;
  const compactionSuffix = compactionActive ? " ⚡ Compacted" : "";
  const lifecycle = `${lifecycleDisplay.glyph} ${lifecycleDisplay.label}${compactionSuffix}`;
  const hint = "Ctrl+K palette";

  return { heartbeat, connection, model, lifecycle, hint };
}

export function buildLeftZoneText(segments: StatusBarSegments, includeHeartbeat: boolean): string {
  const parts: string[] = [];
  if (includeHeartbeat) {
    parts.push(segments.heartbeat);
  }
  parts.push(segments.connection);
  parts.push(segments.model);
  parts.push(segments.lifecycle);
  return parts.join(" │ ");
}

export function buildRightZoneText(segments: StatusBarSegments): string {
  return segments.hint;
}

/**
 * Determine which segments to show based on available width.
 * Truncation priority (first to drop → last to drop):
 *   shortcut hint → heartbeat → lifecycle detail → model (always visible)
 *
 * Returns: { showHint, showHeartbeat, showLifecycle }
 */
export interface TruncationResult {
  showHint: boolean;
  showHeartbeat: boolean;
  showLifecycle: boolean;
}

export function resolveTruncation(
  segments: StatusBarSegments,
  terminalWidth: number,
): TruncationResult {
  // Padding: 1 left + 1 right = 2, separator between zones = 3 (" │ ")
  const PADDING = 2;
  const ZONE_SEPARATOR = 3;

  // Full layout: left zone + zone separator + right zone
  const fullLeft = buildLeftZoneText(segments, true);
  const fullRight = buildRightZoneText(segments);
  const fullWidth = fullLeft.length + ZONE_SEPARATOR + fullRight.length + PADDING;

  if (fullWidth <= terminalWidth) {
    return { showHint: true, showHeartbeat: true, showLifecycle: true };
  }

  // Drop hint first
  const noHintWidth = fullLeft.length + PADDING;
  if (noHintWidth <= terminalWidth) {
    return { showHint: false, showHeartbeat: true, showLifecycle: true };
  }

  // Drop heartbeat
  const noHeartbeatLeft = buildLeftZoneText(segments, false);
  const noHeartbeatWidth = noHeartbeatLeft.length + PADDING;
  if (noHeartbeatWidth <= terminalWidth) {
    return { showHint: false, showHeartbeat: false, showLifecycle: true };
  }

  // Drop lifecycle detail — show only model + connection
  return { showHint: false, showHeartbeat: false, showLifecycle: false };
}

export function buildTruncatedLeftText(
  segments: StatusBarSegments,
  truncation: TruncationResult,
): string {
  const parts: string[] = [];
  if (truncation.showHeartbeat) {
    parts.push(segments.heartbeat);
  }
  parts.push(segments.connection);
  parts.push(segments.model);
  if (truncation.showLifecycle) {
    parts.push(segments.lifecycle);
  }
  return parts.join(" │ ");
}

// --- Segment grouping helpers ---

/**
 * Split resolved segments into left (connection, model, lifecycle) and
 * right (hints) groups. Only visible segments are included.
 * This produces stable two-zone layout with no drifting separators.
 */
export function groupSegments(
  visibleSegments: StatusSegment[],
): { left: StatusSegment[]; right: StatusSegment[] } {
  const left: StatusSegment[] = [];
  const right: StatusSegment[] = [];

  for (const seg of visibleSegments) {
    if (seg.id === "hints") {
      right.push(seg);
    } else {
      left.push(seg);
    }
  }

  return { left, right };
}

/**
 * Build display text for a group of segments joined by separators.
 */
export function buildGroupText(segments: StatusSegment[]): string {
  return segments.map((s) => s.content).join(SEGMENT_SEPARATOR);
}

// --- HeartbeatPulse component ---

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

// --- ConnectionIndicator component ---

export interface ConnectionIndicatorProps {
  connectionStatus: DaemonConnectionStatus;
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

// --- StatusBar component ---

export interface StatusBarProps {
  version: string;
  dimensions: TerminalDimensions;
  showHelp: boolean;
  connectionStatus?: DaemonConnectionStatus;
  daemonMode?: DaemonMode;
  tokenCount?: number;
  cost?: string | null;
  compactionActive?: boolean;
  /** Optional persona display name (e.g. "Alex"). Shown in header when provided. */
  personaName?: string;
  /** Optional persona avatar emoji (e.g. "🤖"). Shown alongside persona name. */
  personaAvatar?: string;
}

export function StatusBar({
  dimensions,
  connectionStatus = "disconnected",
  tokenCount,
  cost = null,
  compactionActive: compactionProp,
  personaName,
  personaAvatar,
}: StatusBarProps) {
  const { state } = useApp();
  const { tokens } = useThemeTokens();

  const resolvedTokenCount = useMemo(() => {
    if (typeof tokenCount === "number") {
      return tokenCount;
    }

    if (state.streamingLifecycleStatus !== "streaming") {
      return 0;
    }

    const streamingMessage = state.streamingMessageId
      ? state.messages.find((message) => message.id === state.streamingMessageId)
      : [...state.messages].reverse().find((message) => message.role === "assistant" && message.isStreaming);

    return estimateTokenCount(streamingMessage?.content ?? "");
  }, [tokenCount, state.messages, state.streamingLifecycleStatus, state.streamingMessageId]);

  // Compaction auto-dismiss: if compactionProp goes true, show for COMPACTION_INDICATOR_DURATION_MS
  const [compactionVisible, setCompactionVisible] = useState(false);
  const compactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (compactionProp) {
      setCompactionVisible(true);

      if (compactionTimerRef.current !== null) {
        clearTimeout(compactionTimerRef.current);
      }

      compactionTimerRef.current = setTimeout(() => {
        setCompactionVisible(false);
        compactionTimerRef.current = null;
      }, COMPACTION_INDICATOR_DURATION_MS);
    }

    return () => {
      if (compactionTimerRef.current !== null) {
        clearTimeout(compactionTimerRef.current);
        compactionTimerRef.current = null;
      }
    };
  }, [compactionProp]);

  // Build segment sources from app state
  const sources: StatusSegmentSources = {
    connectionStatus,
    currentModel: state.currentModel,
    activeEnvironment: state.activeEnvironment,
    lifecycleStatus: state.streamingLifecycleStatus,
    activeToolName: state.activeToolName,
    tokenCount: resolvedTokenCount,
    cost,
    compactionActive: compactionVisible,
    thinkingLevel: state.thinkingLevel,
    terminalWidth: dimensions.width,
  };

  // Resolve segments with width-aware visibility
  const segmentSet = resolveStatusSegmentSet(sources);
  const { left, right } = groupSegments(segmentSet.visibleSegments);

  // Build persona badge when name is provided
  const personaBadge = personaName
    ? `${personaAvatar ?? "🤖"} ${personaName}`
    : null;

  // Render per-segment colored spans for the left group
  const leftElements = left.flatMap((seg, i) => {
    const color = tokens[seg.colorToken as keyof typeof tokens] ?? tokens["text.primary"];
    const separator = i < left.length - 1 ? SEGMENT_SEPARATOR : "";

    if (seg.id === "connection" && seg.glyph.length > 0) {
      const label = seg.content.substring(seg.glyph.length + 1);
      return [
        <Text key={`${seg.id}-glyph`} content={seg.glyph} style={{ color }} />,
        <Text key={`${seg.id}-label`} content={` ${label}`} style={{ color: tokens["text.primary"] }} />,
        separator
          ? <Text key={`${seg.id}-sep`} content={separator} style={{ color: tokens["text.muted"] }} />
          : null,
      ];
    }

    return <Text key={seg.id} content={`${seg.content}${separator}`} style={{ color }} />;
  });

  // Right group: hints in muted color
  const hasRight = right.length > 0;

  return (
    <Box style={{
      height: 1,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
    }}>
      <Box style={{ flexGrow: 1, flexDirection: "row" }}>
        {personaBadge && (
          <>
            <Text style={{ color: tokens["text.primary"] }}>
              {personaBadge}
            </Text>
            <Text style={{ color: tokens["text.muted"] }}>
              {SEGMENT_SEPARATOR}
            </Text>
          </>
        )}
        {leftElements}
      </Box>
      {hasRight && (
        <Box>
          <Text style={{ color: tokens["text.muted"] }}>
            {buildGroupText(right)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
