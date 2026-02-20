import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../daemon/client";
import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import { Box, Text } from "../ui";

// --- Constants ---

const CARD_WIDTH = 42;
const HEADER_LABEL = "Tasks";
const HEADER_ICON = "\u{2699}"; // ⚙
const MAX_TASKS = 5;
const LINE_WIDTH = CARD_WIDTH - 4; // "│ " + " │"

// --- Types ---

export type TaskItemStatus = "pending" | "running" | "complete" | "failed";

export interface TaskItem {
  id: string;
  prompt: string;
  status: TaskItemStatus;
  result?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskPanelProps {
  tasks: readonly TaskItem[];
  selectedIndex: number | null;
  onSelect?: (index: number) => void;
  daemonBaseUrl?: string;
}

// --- Sub-agent types ---

export type SubAgentStatus = "queued" | "running" | "done" | "failed";

export interface SubAgentInfo {
  id: string;
  status: SubAgentStatus;
  stepsUsed: number;
  prompt: string;
}

export interface SubAgentStatusResponse {
  agents: SubAgentInfo[];
}

// --- Pure utility functions (exported for testability) ---

/**
 * Returns the status glyph for a task status.
 */
export function getStatusGlyph(status: TaskItemStatus): string {
  switch (status) {
    case "pending":
      return "\u25CB"; // ○
    case "running":
      return "\u25D4"; // ◔
    case "complete":
      return "\u25CF"; // ●
    case "failed":
      return "\u2716"; // ✖
  }
}

/**
 * Returns the theme token key for a task status color.
 */
export function getStatusColorToken(
  status: TaskItemStatus,
  tokens: Readonly<ThemeTokens>,
): string {
  switch (status) {
    case "pending":
      return tokens["status.warning"];
    case "running":
      return tokens["status.info"];
    case "complete":
      return tokens["status.success"];
    case "failed":
      return tokens["status.error"];
  }
}

/**
 * Returns a human-readable status label.
 */
export function getStatusLabel(status: TaskItemStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "complete":
      return "Done";
    case "failed":
      return "Failed";
  }
}

/**
 * Truncates text to a maximum length, appending ellipsis if needed.
 */
export function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}

/**
 * Formats a duration between two dates as a human-readable string.
 * Returns elapsed time from start to end (or now if end is undefined).
 */
export function formatDuration(
  startedAt: Date | undefined,
  completedAt: Date | undefined,
  now?: Date,
): string {
  if (!startedAt) return "\u2014"; // —

  const end = completedAt ?? (now ?? new Date());
  const diffMs = end.getTime() - startedAt.getTime();

  if (diffMs < 0) return "0s";
  if (diffMs < 1000) return "<1s";

  const totalSeconds = Math.floor(diffMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Pads a content line to fit within the card border.
 */
export function padTaskLine(content: string, width: number): string {
  const available = width - 4; // "│ " + " │"
  const truncated = content.length > available
    ? `${content.slice(0, available - 1)}\u2026`
    : content;

  return `\u2502 ${truncated}${" ".repeat(Math.max(0, available - truncated.length))} \u2502`;
}

/**
 * Selects the most recent tasks, limited to MAX_TASKS.
 * Tasks are sorted by createdAt descending (most recent first).
 */
export function selectRecentTasks(tasks: readonly TaskItem[]): TaskItem[] {
  return [...tasks]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_TASKS);
}

/**
 * Builds a compact summary line for a single task row.
 * Format: "○ Pending  3s  Summarize the quarterly…"
 */
export function buildTaskSummaryLine(
  task: TaskItem,
  maxWidth: number,
  now?: Date,
): string {
  const glyph = getStatusGlyph(task.status);
  const label = getStatusLabel(task.status);
  const duration = formatDuration(task.startedAt, task.completedAt, now);

  // Fixed-width columns: glyph(1) + space(1) + label(7) + space(2) + duration(5) + space(2) = 18
  const fixedPrefix = `${glyph} ${label.padEnd(7)}  ${duration.padEnd(5)}  `;
  const previewWidth = maxWidth - fixedPrefix.length;

  if (previewWidth <= 0) return fixedPrefix.trimEnd();

  const previewText = truncatePreview(task.prompt, previewWidth);
  return `${fixedPrefix}${previewText}`;
}

/**
 * Builds the expanded detail lines for a selected task.
 * Shows full prompt, result/error, and timing details.
 */
export function buildExpandedLines(
  task: TaskItem,
  width: number,
  now?: Date,
): Array<{ text: string; colorKey: "primary" | "secondary" | "muted" | "accent" | "error" }> {
  const lines: Array<{ text: string; colorKey: "primary" | "secondary" | "muted" | "accent" | "error" }> = [];
  const contentWidth = width - 4; // "│ " + " │"

  // Separator
  lines.push({
    text: padTaskLine(`${"─".repeat(contentWidth)}`, width),
    colorKey: "muted",
  });

  // Full prompt (may wrap across multiple lines)
  const promptLines = wrapText(task.prompt, contentWidth, 4);
  for (const line of promptLines) {
    lines.push({
      text: padTaskLine(line, width),
      colorKey: "primary",
    });
  }

  // Result or error
  if (task.status === "complete" && task.result) {
    lines.push({
      text: padTaskLine("", width),
      colorKey: "muted",
    });
    const resultLines = wrapText(task.result, contentWidth, 4);
    for (const line of resultLines) {
      lines.push({
        text: padTaskLine(line, width),
        colorKey: "secondary",
      });
    }
  } else if (task.status === "failed" && task.error) {
    lines.push({
      text: padTaskLine("", width),
      colorKey: "muted",
    });
    const errorLines = wrapText(`Error: ${task.error}`, contentWidth, 3);
    for (const line of errorLines) {
      lines.push({
        text: padTaskLine(line, width),
        colorKey: "error",
      });
    }
  }

  // Duration detail
  const duration = formatDuration(task.startedAt, task.completedAt, now);
  if (task.startedAt) {
    lines.push({
      text: padTaskLine(`Duration: ${duration}`, width),
      colorKey: "muted",
    });
  }

  return lines;
}

/**
 * Wraps text into lines of a maximum width.
 */
export function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (lines.length >= maxLines) break;

    const candidate = current.length > 0 ? `${current} ${word}` : word;
    if (candidate.length > maxWidth) {
      if (current.length > 0) {
        lines.push(current);
        current = word.length > maxWidth ? word.slice(0, maxWidth) : word;
      } else {
        lines.push(word.slice(0, maxWidth));
        current = "";
      }
    } else {
      current = candidate;
    }
  }

  if (current.length > 0 && lines.length < maxLines) {
    lines.push(current);
  }

  // Add ellipsis to last line if we hit the limit and there's more content
  if (lines.length === maxLines && current.length > 0 && lines[maxLines - 1] !== current) {
    const lastLine = lines[maxLines - 1];
    if (lastLine && lastLine.length < maxWidth) {
      lines[maxLines - 1] = `${lastLine}\u2026`;
    }
  }

  return lines;
}

/**
 * Resolves a color key to a theme token value.
 */
export function resolveTaskLineColor(
  colorKey: "primary" | "secondary" | "muted" | "accent" | "error",
  tokens: Readonly<ThemeTokens>,
): string {
  switch (colorKey) {
    case "primary":
      return tokens["text.primary"];
    case "secondary":
      return tokens["text.secondary"];
    case "accent":
      return tokens["accent.primary"];
    case "muted":
      return tokens["text.muted"];
    case "error":
      return tokens["status.error"];
  }
}

// --- Sub-agent utility functions (exported for testability) ---

const AGENT_PROMPT_PREVIEW_LENGTH = 50;
const AGENT_POLL_INTERVAL_MS = 1000;

/**
 * Returns the status glyph for a sub-agent status.
 */
export function getAgentStatusGlyph(status: SubAgentStatus): string {
  switch (status) {
    case "queued":
      return "\u23F3"; // ⏳
    case "running":
      return "\u25B6"; // ▶
    case "done":
      return "\u2713"; // ✓
    case "failed":
      return "\u2717"; // ✗
  }
}

/**
 * Returns the theme token value for a sub-agent status color.
 */
export function getAgentStatusColorToken(
  status: SubAgentStatus,
  tokens: Readonly<ThemeTokens>,
): string {
  switch (status) {
    case "queued":
      return tokens["text.muted"];
    case "running":
      return tokens["status.warning"];
    case "done":
      return tokens["status.success"];
    case "failed":
      return tokens["status.error"];
  }
}

/**
 * Builds a compact summary line for a single sub-agent card.
 * Format: "▶ agent-1  running  3 steps  Summarize the quarterly…"
 */
export function buildAgentCardLine(
  agent: SubAgentInfo,
  maxWidth: number,
): string {
  const glyph = getAgentStatusGlyph(agent.status);
  const stepsText = `${agent.stepsUsed} step${agent.stepsUsed === 1 ? "" : "s"}`;

  // Fixed-width columns: glyph(1) + space(1) + id(variable) + space(2) + status(7) + space(2) + steps(variable) + space(2)
  const fixedPrefix = `${glyph} ${agent.id}  ${agent.status.padEnd(7)}  ${stepsText}  `;
  const previewWidth = maxWidth - fixedPrefix.length;

  if (previewWidth <= 0) return fixedPrefix.trimEnd();

  const previewText = truncatePreview(
    agent.prompt,
    Math.min(previewWidth, AGENT_PROMPT_PREVIEW_LENGTH),
  );
  return `${fixedPrefix}${previewText}`;
}

/**
 * Returns true when any sub-agent is still active (queued or running).
 */
export function hasActiveAgents(agents: readonly SubAgentInfo[]): boolean {
  return agents.some((a) => a.status === "queued" || a.status === "running");
}

/**
 * Fetches sub-agent status from the daemon.
 */
async function fetchAgentStatus(baseUrl: string): Promise<SubAgentInfo[]> {
  const response = await fetch(`${baseUrl}/api/agents/status`);
  if (!response.ok) {
    return [];
  }
  const data = (await response.json()) as SubAgentStatusResponse;
  return data.agents;
}

/**
 * Hook that polls /api/agents/status at ~1s intervals while agents are active.
 * Stops polling when all agents are done/failed or the array is empty.
 */
export function useSubAgentPolling(
  daemonBaseUrl: string,
): readonly SubAgentInfo[] {
  const [agents, setAgents] = useState<SubAgentInfo[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentsRef = useRef<SubAgentInfo[]>([]);

  const doFetch = useCallback(async () => {
    try {
      const result = await fetchAgentStatus(daemonBaseUrl);
      agentsRef.current = result;
      setAgents(result);
    } catch {
      // Silently ignore fetch errors — daemon may be unreachable
    }
  }, [daemonBaseUrl]);

  useEffect(() => {
    // Initial fetch
    void doFetch();

    // Start polling
    intervalRef.current = setInterval(() => {
      // Check if we should continue polling based on latest state
      const current = agentsRef.current;
      if (current.length === 0 || !hasActiveAgents(current)) {
        // Stop polling when no active agents
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      void doFetch();
    }, AGENT_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [doFetch]);

  return agents;
}

// --- Component ---

/**
 * TaskPanel renders an inline card showing the 5 most recent background tasks.
 *
 * Each task row displays a status glyph, status label, duration, and a
 * truncated preview of the task prompt. Selecting a task expands it to
 * show the full prompt and result/error.
 *
 * This is an inline card (not a modal overlay). It appears in the
 * Today panel area alongside briefing and calendar cards.
 */
export function TaskPanel(props: TaskPanelProps) {
  const { tasks, selectedIndex, daemonBaseUrl } = props;
  const { tokens } = useThemeTokens();

  const resolvedBaseUrl = daemonBaseUrl ?? DEFAULT_DAEMON_HTTP_BASE_URL;
  const agents = useSubAgentPolling(resolvedBaseUrl);

  if (tasks.length === 0 && agents.length === 0) {
    return null;
  }

  const recentTasks = selectRecentTasks(tasks);

  const headerText = `\u2500 ${HEADER_ICON} ${HEADER_LABEL} `;
  const headerFill = "\u2500".repeat(Math.max(0, CARD_WIDTH - headerText.length - 2));
  const topBorder = `\u256D${headerText}${headerFill}\u256E`;
  const bottomBorder = `\u2570${"\u2500".repeat(CARD_WIDTH - 2)}\u256F`;

  // Sub-agent section header and border
  const agentHeaderText = `\u2500 Sub-Agents `;
  const agentHeaderFill = "\u2500".repeat(Math.max(0, LINE_WIDTH - agentHeaderText.length));
  const agentSectionSeparator = `\u2502 ${agentHeaderText}${agentHeaderFill} \u2502`;

  return (
    <Box style={{ flexDirection: "column", marginTop: 1, marginBottom: 1 }}>
      <Text style={{ color: tokens["accent.primary"] }}>{topBorder}</Text>
      {recentTasks.map((task, index) => {
        const isSelected = selectedIndex === index;
        const statusColor = getStatusColorToken(task.status, tokens);
        const summaryContent = buildTaskSummaryLine(task, LINE_WIDTH);
        const summaryLine = padTaskLine(summaryContent, CARD_WIDTH);

        const rowBgColor = isSelected ? tokens["surface.tertiary"] : undefined;

        return (
          <Box key={task.id} style={{ flexDirection: "column" }}>
            <Text
              style={{
                color: statusColor,
                backgroundColor: rowBgColor,
              }}
            >
              {summaryLine}
            </Text>
            {isSelected
              ? buildExpandedLines(task, CARD_WIDTH).map((line, lineIndex) => (
                  <Text
                    key={lineIndex}
                    style={{
                      color: resolveTaskLineColor(line.colorKey, tokens),
                      backgroundColor: rowBgColor,
                    }}
                  >
                    {line.text}
                  </Text>
                ))
              : null}
          </Box>
        );
      })}
      {agents.length > 0 ? (
        <>
          <Text style={{ color: tokens["text.muted"] }}>{agentSectionSeparator}</Text>
          {agents.map((agent) => {
            const agentColor = getAgentStatusColorToken(agent.status, tokens);
            const cardContent = buildAgentCardLine(agent, LINE_WIDTH);
            const cardLine = padTaskLine(cardContent, CARD_WIDTH);

            return (
              <Text
                key={agent.id}
                style={{ color: agentColor }}
              >
                {cardLine}
              </Text>
            );
          })}
        </>
      ) : null}
      <Text style={{ color: tokens["accent.primary"] }}>{bottomBorder}</Text>
    </Box>
  );
}
