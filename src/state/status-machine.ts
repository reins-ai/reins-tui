import type { DaemonClientError, DaemonConnectionStatus } from "../daemon/contracts";
import {
  STATUS_SEGMENT_PRIORITY,
  STATUS_SEGMENT_ORDER,
  SEGMENT_DROP_THRESHOLDS,
  type StatusSegment,
  type StatusSegmentId,
  type StatusSegmentSet,
  type StatusSegmentSources,
} from "../store/types";

export type ConversationLifecycleStatus = "idle" | "sending" | "thinking" | "streaming" | "complete" | "error";

export type StatusMachineState =
  | {
      status: "idle";
      enteredAt: string;
    }
  | {
      status: "sending";
      enteredAt: string;
      userMessageId?: string;
    }
  | {
      status: "thinking";
      enteredAt: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      status: "streaming";
      enteredAt: string;
      conversationId: string;
      assistantMessageId: string;
      chunkCount: number;
    }
  | {
      status: "complete";
      enteredAt: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      status: "error";
      enteredAt: string;
      from: ConversationLifecycleStatus;
      error: DaemonClientError;
    };

export type StatusMachineEvent =
  | {
      type: "user-send";
      timestamp: string;
      userMessageId?: string;
    }
  | {
      type: "message-ack";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-start";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-chunk";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "tool-call-start";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "tool-call-complete";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-complete";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-error";
      timestamp: string;
      error: DaemonClientError;
    }
  | {
      type: "complete-timeout";
      timestamp: string;
    }
  | {
      type: "dismiss-error";
      timestamp: string;
    }
  | {
      type: "reset";
      timestamp: string;
    };

export function createInitialStatusMachineState(timestamp: string): StatusMachineState {
  return {
    status: "idle",
    enteredAt: timestamp,
  };
}

export function reduceStatusMachine(state: StatusMachineState, event: StatusMachineEvent): StatusMachineState {
  switch (event.type) {
    case "reset":
      return {
        status: "idle",
        enteredAt: event.timestamp,
      };
    case "stream-error":
      return {
        status: "error",
        enteredAt: event.timestamp,
        from: state.status,
        error: event.error,
      };
    case "user-send":
      if (state.status !== "idle" && state.status !== "complete" && state.status !== "error") {
        return state;
      }

      return {
        status: "sending",
        enteredAt: event.timestamp,
        userMessageId: event.userMessageId,
      };
    case "message-ack":
      if (state.status !== "sending") {
        return state;
      }

      return {
        status: "thinking",
        enteredAt: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
      };
    case "stream-start":
      if (state.status !== "thinking") {
        return state;
      }

      return {
        status: "streaming",
        enteredAt: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
        chunkCount: 0,
      };
    case "stream-chunk":
      if (state.status === "thinking") {
        return {
          status: "streaming",
          enteredAt: event.timestamp,
          conversationId: event.conversationId,
          assistantMessageId: event.assistantMessageId,
          chunkCount: 1,
        };
      }

      if (state.status !== "streaming") {
        return state;
      }

      return {
        ...state,
        chunkCount: state.chunkCount + 1,
      };
    case "tool-call-start":
    case "tool-call-complete":
      if (state.status === "thinking") {
        return {
          status: "streaming",
          enteredAt: event.timestamp,
          conversationId: event.conversationId,
          assistantMessageId: event.assistantMessageId,
          chunkCount: 0,
        };
      }

      return state;
    case "stream-complete":
      if (state.status !== "thinking" && state.status !== "streaming") {
        return state;
      }

      return {
        status: "complete",
        enteredAt: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
      };
    case "complete-timeout":
      if (state.status !== "complete") {
        return state;
      }

      return {
        status: "idle",
        enteredAt: event.timestamp,
      };
    case "dismiss-error":
      if (state.status !== "error") {
        return state;
      }

      return {
        status: "idle",
        enteredAt: event.timestamp,
      };
    default:
      return state;
  }
}

// --- Status segment derivation ---

/**
 * Connection glyph for status segment display.
 */
function connectionGlyph(status: DaemonConnectionStatus): string {
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

/**
 * Connection label for status segment display.
 */
function connectionLabel(status: DaemonConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Backend";
    case "disconnected":
      return "Backend Offline";
    case "connecting":
      return "Backend Connecting...";
    case "reconnecting":
      return "Backend Reconnecting...";
  }
}

/**
 * Color token for connection status.
 */
function connectionColorToken(status: DaemonConnectionStatus): string {
  switch (status) {
    case "connected":
      return "status.success";
    case "disconnected":
      return "status.error";
    case "connecting":
    case "reconnecting":
      return "status.warning";
  }
}

/**
 * Derive lifecycle segment content from conversation state.
 */
function lifecycleContent(
  status: ConversationLifecycleStatus,
  activeToolName: string | null,
  tokenCount: number,
  cost: string | null,
  compactionActive: boolean,
): { glyph: string; label: string; colorToken: string } {
  let glyph: string;
  let label: string;
  let colorToken: string;

  switch (status) {
    case "idle":
      glyph = "●";
      label = "Ready";
      colorToken = "status.success";
      break;
    case "sending":
      glyph = "◐";
      label = "Sending...";
      colorToken = "status.warning";
      break;
    case "thinking":
      glyph = "◑";
      label = "Thinking...";
      colorToken = "status.warning";
      break;
    case "streaming":
      if (activeToolName) {
        glyph = "⚙";
        label = `Using tool: ${activeToolName}`;
        colorToken = "status.warning";
      } else {
        glyph = "▶";
        label = `Streaming [${tokenCount} tokens]`;
        colorToken = "status.info";
      }
      break;
    case "complete": {
      const costSuffix = cost ? ` [${cost}]` : "";
      glyph = "✓";
      label = `Done${costSuffix}`;
      colorToken = "status.success";
      break;
    }
    case "error":
      glyph = "✗";
      label = "Error";
      colorToken = "status.error";
      break;
  }

  if (compactionActive) {
    label = `${label} ⚡ Compacted`;
  }

  return { glyph, label, colorToken };
}

/**
 * Build a single StatusSegment from its id and content.
 */
function buildSegment(
  id: StatusSegmentId,
  glyph: string,
  content: string,
  colorToken: string,
): StatusSegment {
  return {
    id,
    priority: STATUS_SEGMENT_PRIORITY[id],
    content,
    glyph,
    colorToken,
    minWidth: SEGMENT_DROP_THRESHOLDS[id],
    visible: true,
  };
}

/**
 * Derive all status segments from application state sources.
 * Segments are returned in priority order (connection first, hints last).
 * No daemon contract changes — all inputs come from existing state fields.
 */
export function deriveStatusSegments(sources: StatusSegmentSources): StatusSegment[] {
  const connGlyph = connectionGlyph(sources.connectionStatus);
  const connLabel = connectionLabel(sources.connectionStatus);
  const connColor = connectionColorToken(sources.connectionStatus);

  const lc = lifecycleContent(
    sources.lifecycleStatus,
    sources.activeToolName,
    sources.tokenCount,
    sources.cost,
    sources.compactionActive,
  );

  return STATUS_SEGMENT_ORDER.map((id) => {
    switch (id) {
      case "connection":
        return buildSegment(id, connGlyph, `${connGlyph} ${connLabel}`, connColor);
      case "model":
        // Model segment removed - return empty segment that will be filtered out
        return buildSegment(id, "", "", "text.secondary");
      case "environment": {
        const envName = sources.activeEnvironment;
        if (!envName || envName === "default") {
          return buildSegment(id, "", "", "text.secondary");
        }
        return buildSegment(id, "◆", `◆ ${envName}`, "text.secondary");
      }
      case "lifecycle": {
        // Show lifecycle segment for warnings/errors or active states
        const showLifecycle = 
          sources.connectionStatus !== "connected" || // Show connection issues
          sources.lifecycleStatus === "error" ||      // Show errors
          sources.lifecycleStatus === "sending" ||    // Show active states
          sources.lifecycleStatus === "thinking" ||
          sources.lifecycleStatus === "streaming" ||
          sources.compactionActive;                   // Show compaction notice
        
        if (!showLifecycle) {
          return buildSegment(id, "", "", lc.colorToken);
        }
        
        // For connection issues, show connection-specific message
        if (sources.connectionStatus !== "connected") {
          const connMsg = sources.connectionStatus === "disconnected" 
            ? "Cannot reach backend"
            : `Backend ${sources.connectionStatus}...`;
          return buildSegment(id, "⚠", `⚠ ${connMsg}`, connectionColorToken(sources.connectionStatus));
        }
        
        return buildSegment(id, lc.glyph, `${lc.glyph} ${lc.label}`, lc.colorToken);
      }
      case "hints":
        return buildSegment(id, "", "Ctrl+K palette · Ctrl+M model · Ctrl+1 context", "text.muted");
    }
  });
}

/**
 * Apply width-based truncation rules to a set of segments.
 * Segments are dropped in reverse priority order (hints first, connection last).
 * Returns a StatusSegmentSet with visibility resolved.
 *
 * Drop order (first to drop → last to drop):
 *   hints → lifecycle → model → connection (never dropped)
 *
 * The algorithm is deterministic: for a given width, the same segments
 * are always visible regardless of previous state.
 */
export function resolveSegmentVisibility(
  segments: StatusSegment[],
  terminalWidth: number,
): StatusSegmentSet {
  const PADDING = 2;
  const SEPARATOR_WIDTH = 3;

  const sorted = [...segments].sort((a, b) => a.priority - b.priority);

  const visibleSegments: StatusSegment[] = [];
  let usedWidth = PADDING;

  for (const segment of sorted) {
    // Skip empty segments
    if (segment.content.trim().length === 0) {
      continue;
    }
    
    const segmentWidth = segment.content.length;
    const separatorCost = visibleSegments.length > 0 ? SEPARATOR_WIDTH : 0;
    const needed = usedWidth + separatorCost + segmentWidth;

    if (needed <= terminalWidth) {
      visibleSegments.push({ ...segment, visible: true });
      usedWidth = needed;
    }
  }

  const allSegments = sorted.map((seg) => ({
    ...seg,
    visible: visibleSegments.some((v) => v.id === seg.id),
  }));

  return {
    segments: allSegments,
    visibleSegments,
    totalWidth: usedWidth,
    availableWidth: terminalWidth,
  };
}

/**
 * Full pipeline: derive segments from sources and resolve visibility.
 * This is the primary entry point for the status bar component.
 */
export function resolveStatusSegmentSet(sources: StatusSegmentSources): StatusSegmentSet {
  const segments = deriveStatusSegments(sources);
  return resolveSegmentVisibility(segments, sources.terminalWidth);
}

/**
 * Format visible segments into a display string with separators.
 */
export function formatSegmentText(segmentSet: StatusSegmentSet): string {
  return segmentSet.visibleSegments.map((s) => s.content).join(" │ ");
}

/**
 * Check if a specific segment is visible in the resolved set.
 */
export function isSegmentVisible(segmentSet: StatusSegmentSet, id: StatusSegmentId): boolean {
  return segmentSet.visibleSegments.some((s) => s.id === id);
}
