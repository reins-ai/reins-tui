import type { ChildAgentActivityEvent } from "../../state/activity-store";
import { useThemeTokens, type ThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

// --- Constants ---

const AGENT_ID_MAX_LENGTH = 12;
const STATUS_LABEL_WIDTH = 7;
const DEFAULT_WIDTH = 44;

// --- Internal derived type ---

export interface AgentState {
  childId: string;
  index: number;
  status: "running" | "done" | "failed";
  firstSeenAt: number;
  lastSeenAt: number;
  durationMs?: number;
  errorMessage?: string;
}

// --- Pure derivation function (exported for testability) ---

/**
 * Derives per-agent state from a list of child_agent activity events.
 * Agents are indexed by order of first appearance (1-based).
 * Status is determined by the latest terminal event type:
 *   - "done" → done
 *   - "error" or "aborted" → failed
 *   - anything else → running
 */
export function deriveAgentStates(
  events: ChildAgentActivityEvent[],
): AgentState[] {
  const agentMap = new Map<string, AgentState>();
  let nextIndex = 1;

  for (const event of events) {
    if (!agentMap.has(event.childId)) {
      agentMap.set(event.childId, {
        childId: event.childId,
        index: nextIndex++,
        status: "running",
        firstSeenAt: event.timestamp,
        lastSeenAt: event.timestamp,
      });
    }

    const agent = agentMap.get(event.childId)!;
    agent.lastSeenAt = event.timestamp;

    if (event.eventType === "done") {
      agent.status = "done";
      agent.durationMs = agent.lastSeenAt - agent.firstSeenAt;
    } else if (
      event.eventType === "error" ||
      event.eventType === "aborted"
    ) {
      agent.status = "failed";
      agent.durationMs = agent.lastSeenAt - agent.firstSeenAt;
      if (
        typeof event.payload === "object" &&
        event.payload !== null &&
        "error" in event.payload
      ) {
        const payload = event.payload as { error?: { message?: string } };
        agent.errorMessage = payload.error?.message;
      }
    }
  }

  return [...agentMap.values()];
}

// --- Formatting helpers ---

function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

// --- Status icon and label helpers ---

const STATUS_ICON: Record<AgentState["status"], string> = {
  done: "\u2713",   // ✓
  running: "\u27F3", // ⟳
  failed: "\u2717",  // ✗
};

const STATUS_LABEL: Record<AgentState["status"], string> = {
  done: "done",
  running: "running",
  failed: "failed",
};

// --- Props ---

export interface SubAgentGridProps {
  events: ChildAgentActivityEvent[];
  width?: number;
}

// --- Component ---

/**
 * SubAgentGrid renders a grid of parallel sub-agent progress.
 *
 * Layout:
 *   │ ── Sub-Agents ─────────────────────── │
 *   │ ⟳ agent-1   running   0.5s           │
 *   │ ✓ agent-2   done      1.2s           │
 *   │ ✗ agent-3   failed    0.3s  err msg  │
 *
 * Returns null when no events are present.
 */
export function SubAgentGrid(props: SubAgentGridProps) {
  const { events, width = DEFAULT_WIDTH } = props;
  const { tokens } = useThemeTokens();

  if (events.length === 0) {
    return null;
  }

  const agents = deriveAgentStates(events);
  const innerWidth = width - 4; // "│ " + " │"

  // Build header line: "── Sub-Agents ──────────────"
  const headerLabel = " Sub-Agents ";
  const headerDashesLeft = "\u2500\u2500"; // ──
  const remainingDashes = Math.max(
    0,
    innerWidth - headerDashesLeft.length - headerLabel.length,
  );
  const headerDashesRight = "\u2500".repeat(remainingDashes);
  const headerContent = `${headerDashesLeft}${headerLabel}${headerDashesRight}`;
  const headerLine = `\u2502 ${headerContent.slice(0, innerWidth)}${" ".repeat(Math.max(0, innerWidth - headerContent.length))} \u2502`;

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text style={{ color: tokens["text.muted"] }}>{headerLine}</Text>
      {agents.map((agent) => (
        <AgentRow
          key={agent.childId}
          agent={agent}
          innerWidth={innerWidth}
          tokens={tokens}
        />
      ))}
    </Box>
  );
}

// --- Agent row sub-component ---

interface AgentRowProps {
  agent: AgentState;
  innerWidth: number;
  tokens: Readonly<ThemeTokens>;
}

function AgentRow({ agent, innerWidth, tokens }: AgentRowProps) {
  const icon = STATUS_ICON[agent.status];
  const label = padRight(STATUS_LABEL[agent.status], STATUS_LABEL_WIDTH);
  const agentId = truncate(agent.childId, AGENT_ID_MAX_LENGTH);
  const paddedAgentId = padRight(agentId, AGENT_ID_MAX_LENGTH);
  const duration = agent.durationMs !== undefined
    ? formatDuration(agent.durationMs)
    : "";

  // Build the fixed-width prefix: "⟳ agent-id     running "
  const prefix = `${icon} ${paddedAgentId}  ${label}`;

  // Calculate remaining space for duration + error
  const prefixLen = prefix.length;
  const remaining = innerWidth - prefixLen;

  let suffix = "";
  if (duration && agent.errorMessage && remaining > duration.length + 3) {
    const errorSpace = remaining - duration.length - 2; // 2 for "  " gap
    const errorMsg = errorSpace > 3
      ? truncate(agent.errorMessage, errorSpace)
      : "";
    suffix = errorMsg
      ? `${duration}  ${errorMsg}`
      : duration;
  } else if (duration) {
    suffix = duration;
  }

  // Assemble the full content line
  const contentLine = suffix
    ? `${prefix}${suffix}`
    : prefix;

  // Pad to fill the row width
  const paddedContent = contentLine.length > innerWidth
    ? `${contentLine.slice(0, innerWidth - 1)}\u2026`
    : contentLine;
  const padded = `\u2502 ${paddedContent}${" ".repeat(Math.max(0, innerWidth - paddedContent.length))} \u2502`;

  // Determine text color based on status
  const textColor = agent.status === "done"
    ? tokens["status.success"]
    : agent.status === "failed"
      ? tokens["status.error"]
      : tokens["status.warning"];

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text style={{ color: textColor }}>{padded}</Text>
    </Box>
  );
}
