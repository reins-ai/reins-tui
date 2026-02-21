import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ActivityEvent,
  ActivityStats,
  ChildAgentActivityEvent,
  CompactionActivityEvent,
  ErrorActivityEvent,
  ToolCallActivityEvent,
} from "../state/activity-store";

// --- Types ---

export type ExportFormat = "json" | "markdown";

export interface ExportResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

// --- Filename generation ---

/**
 * Generates the export filename for an activity log.
 * Pattern: ~/reins-activity-YYYY-MM-DD-HH-MM-SS.{json,md}
 */
export function generateExportFilename(
  format: ExportFormat,
  now: Date = new Date(),
): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("-");

  const ext = format === "json" ? "json" : "md";
  const home = homedir();
  return join(home, `reins-activity-${timestamp}.${ext}`);
}

// --- JSON export ---

/**
 * Converts activity events to a pretty-printed JSON string.
 */
export function eventsToJson(events: ActivityEvent[]): string {
  return JSON.stringify(events, null, 2);
}

// --- Markdown export ---

/**
 * Formats a timestamp as a human-readable date string.
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Computes summary stats from events for the markdown header.
 */
function computeStats(events: ActivityEvent[]): ActivityStats {
  let totalToolCalls = 0;
  let totalTokensUsed = 0;
  let totalWallMs = 0;

  for (const event of events) {
    if (event.kind === "tool_call") {
      const tc = event as ToolCallActivityEvent;
      if (tc.status !== "running") {
        totalToolCalls += 1;
        totalWallMs += tc.durationMs ?? 0;
      }
    }
    if (event.kind === "done" && event.totalTokensUsed !== undefined) {
      totalTokensUsed += event.totalTokensUsed;
    }
  }

  return { totalToolCalls, totalTokensUsed, totalWallMs };
}

/**
 * Formats a single event as a markdown section.
 */
function formatEventMarkdown(event: ActivityEvent, index: number): string {
  const lines: string[] = [];

  switch (event.kind) {
    case "tool_call": {
      const tc = event as ToolCallActivityEvent;
      const statusGlyph = tc.status === "success" ? "\u2713" : tc.status === "error" ? "\u2717" : "\u27F3";
      const durationStr = tc.durationMs !== undefined ? ` ${(tc.durationMs / 1000).toFixed(1)}s` : "";
      lines.push(`### [${index + 1}] tool_call: ${tc.toolName} (${statusGlyph}${durationStr})`);
      if (tc.toolArgs !== undefined) {
        const argsStr = typeof tc.toolArgs === "string" ? tc.toolArgs : JSON.stringify(tc.toolArgs, null, 2);
        lines.push(`**Args:** \`${argsStr}\``);
      }
      if (tc.status === "success" && tc.result) {
        lines.push(`**Result:** \`${tc.result}\``);
      }
      if (tc.status === "error" && tc.error) {
        lines.push(`**Error:** \`${tc.error}\``);
      }
      break;
    }
    case "compaction": {
      const ce = event as CompactionActivityEvent;
      lines.push(`### [${index + 1}] compaction (\u26A1)`);
      lines.push(`**Summary:** ${ce.summary}`);
      lines.push(`**Before:** ~${ce.beforeTokenEstimate.toLocaleString()} tokens`);
      lines.push(`**After:** ~${ce.afterTokenEstimate.toLocaleString()} tokens`);
      break;
    }
    case "error": {
      const ee = event as ErrorActivityEvent;
      lines.push(`### [${index + 1}] error (\u2717)`);
      lines.push(`**Message:** ${ee.error.message}`);
      if (ee.code) lines.push(`**Code:** ${ee.code}`);
      if (ee.retryable !== undefined) lines.push(`**Retryable:** ${ee.retryable ? "yes" : "no"}`);
      break;
    }
    case "done":
      lines.push(`### [${index + 1}] done (\u2713)`);
      lines.push(`**Finish reason:** ${event.finishReason}`);
      if (event.totalTokensUsed !== undefined) {
        lines.push(`**Tokens used:** ${event.totalTokensUsed.toLocaleString()}`);
      }
      break;
    case "aborted":
      lines.push(`### [${index + 1}] aborted (\u2717)`);
      lines.push(`**Reason:** ${event.reason ?? "No reason"}`);
      lines.push(`**Initiated by:** ${event.initiatedBy}`);
      break;
    case "child_agent": {
      const ca = event as ChildAgentActivityEvent;
      lines.push(`### [${index + 1}] child_agent: ${ca.childId} (\u27F3)`);
      lines.push(`**Event type:** ${ca.eventType}`);
      if (ca.payload !== undefined) {
        const payloadStr = typeof ca.payload === "string" ? ca.payload : JSON.stringify(ca.payload, null, 2);
        lines.push(`**Payload:** \`${payloadStr}\``);
      }
      break;
    }
    case "thinking":
      lines.push(`### [${index + 1}] thinking (\u{1F4AD})`);
      lines.push(`**Tokens:** ~${event.estimatedTokens}`);
      lines.push(`**Content:** ${event.content}`);
      break;
  }

  return lines.join("\n");
}

/**
 * Converts activity events to a Markdown string.
 */
export function eventsToMarkdown(events: ActivityEvent[]): string {
  const now = new Date();
  const stats = computeStats(events);
  const lines: string[] = [];

  lines.push("# Reins Activity Log");
  lines.push(`Generated: ${formatTimestamp(now.getTime())}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Tool calls: ${stats.totalToolCalls}`);
  lines.push(`- Total tokens: ${stats.totalTokensUsed.toLocaleString()}`);
  lines.push(`- Duration: ${(stats.totalWallMs / 1000).toFixed(1)}s`);
  lines.push("");
  lines.push("## Events");
  lines.push("");

  for (let i = 0; i < events.length; i++) {
    lines.push(formatEventMarkdown(events[i]!, i));
    lines.push("");
  }

  return lines.join("\n");
}

// --- File export ---

/**
 * Exports activity events to a file.
 * JSON format: pretty-printed array of events.
 * Markdown format: structured document with summary and event sections.
 */
export async function exportActivityLog(
  events: ActivityEvent[],
  format: ExportFormat,
): Promise<ExportResult> {
  try {
    const filePath = generateExportFilename(format);
    const content = format === "json"
      ? eventsToJson(events)
      : eventsToMarkdown(events);

    await Bun.write(filePath, content);

    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
