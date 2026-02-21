import { useState } from "react";
import type {
  ActivityEvent,
  ChildAgentActivityEvent,
  CompactionActivityEvent,
  ErrorActivityEvent,
  ToolCallActivityEvent,
} from "../../state/activity-store";
import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";

// --- Constants ---

const DEFAULT_PREVIEW_LENGTH = 60;
const MAX_EXPANDED_LINES = 10;

// --- Exported helpers (pure functions for testability) ---

/**
 * Returns a category icon for a tool based on its name.
 */
export function getToolCategoryIcon(toolName: string): string {
  if (/search|web|brave|exa|google/i.test(toolName)) return "\u{1F50D}"; // 🔍
  if (/memory|remember|recall|save/i.test(toolName)) return "\u{1F4BE}"; // 💾
  if (/browser|navigate|click|screenshot/i.test(toolName)) return "\u{1F310}"; // 🌐
  if (/calendar|schedule|event|reminder/i.test(toolName)) return "\u{1F4C5}"; // 📅
  return "\u{1F527}"; // 🔧
}

/**
 * Formats a duration in milliseconds as a human-readable string.
 * Returns "< 1s", "1.2s", "12s", "2m 3s", etc.
 */
export function formatEventDuration(event: ActivityEvent): string {
  if (event.kind !== "tool_call") return "";

  const toolEvent = event as ToolCallActivityEvent;
  if (toolEvent.status === "running") return "";
  if (toolEvent.durationMs === undefined) return "";

  const ms = toolEvent.durationMs;
  if (ms < 1000) return "< 1s";

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Returns a status glyph for an activity event.
 */
export function getEventStatusGlyph(event: ActivityEvent): string {
  switch (event.kind) {
    case "tool_call": {
      const tc = event as ToolCallActivityEvent;
      if (tc.status === "running") return "\u27F3"; // ⟳
      if (tc.status === "error") return "\u2717"; // ✗
      return "\u2713"; // ✓
    }
    case "done":
      return "\u2713"; // ✓
    case "error":
      return "\u2717"; // ✗
    case "aborted":
      return "\u2717"; // ✗
    case "compaction":
      return "\u26A1"; // ⚡
    case "thinking":
      return "\u{1F4AD}"; // 💭
    case "child_agent":
      return "\u27F3"; // ⟳
  }
}

/**
 * Truncates a string to maxLength, appending ellipsis if needed.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}\u2026`;
}

/**
 * Formats a preview string for an activity event.
 * Returns a truncated summary of the event's key content.
 */
export function formatEventPreview(
  event: ActivityEvent,
  maxLength: number = DEFAULT_PREVIEW_LENGTH,
): string {
  switch (event.kind) {
    case "tool_call": {
      const tc = event as ToolCallActivityEvent;
      const argsStr = tc.toolArgs !== undefined
        ? typeof tc.toolArgs === "string"
          ? tc.toolArgs
          : JSON.stringify(tc.toolArgs)
        : "";
      if (tc.status === "error" && tc.error) {
        return truncate(tc.error, maxLength);
      }
      if (tc.status === "success" && tc.result) {
        return truncate(tc.result, maxLength);
      }
      return truncate(argsStr, maxLength);
    }
    case "compaction":
      return truncate(event.summary, maxLength);
    case "error":
      return truncate(event.error.message, maxLength);
    case "done": {
      const tokenInfo = event.totalTokensUsed !== undefined
        ? `${event.totalTokensUsed.toLocaleString()} tokens`
        : "";
      return truncate(`${event.finishReason}${tokenInfo ? ` \u00B7 ${tokenInfo}` : ""}`, maxLength);
    }
    case "aborted":
      return truncate(event.reason ?? "No reason", maxLength);
    case "child_agent":
      return truncate(`Agent: ${event.childId}`, maxLength);
    case "thinking":
      return truncate(`~${event.estimatedTokens} tokens`, maxLength);
  }
}

/**
 * Returns the event label used in the collapsed step card line.
 * For tool_call events, returns the tool name.
 * For other events, returns a descriptive label.
 */
function getEventLabel(event: ActivityEvent): string {
  switch (event.kind) {
    case "tool_call":
      return (event as ToolCallActivityEvent).toolName;
    case "compaction":
      return "Compacted";
    case "error":
      return "Error";
    case "done":
      return "Done";
    case "aborted":
      return "Aborted";
    case "child_agent":
      return "Child agent";
    case "thinking":
      return "Thinking";
  }
}

/**
 * Returns the icon for an event.
 * Tool calls use category-based icons; other events use their status glyph.
 */
function getEventIcon(event: ActivityEvent): string {
  if (event.kind === "tool_call") {
    return getToolCategoryIcon((event as ToolCallActivityEvent).toolName);
  }
  return getEventStatusGlyph(event);
}

// --- Expanded content helpers ---

/**
 * Wraps a string into lines of at most `maxWidth` characters.
 * Splits on word boundaries when possible.
 */
function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [];
  const lines: string[] = [];
  const rawLines = text.split("\n");

  for (const rawLine of rawLines) {
    if (rawLine.length <= maxWidth) {
      lines.push(rawLine);
    } else {
      let remaining = rawLine;
      while (remaining.length > maxWidth) {
        let breakAt = remaining.lastIndexOf(" ", maxWidth);
        if (breakAt <= 0) breakAt = maxWidth;
        lines.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
      }
      if (remaining.length > 0) {
        lines.push(remaining);
      }
    }
  }

  return lines;
}

/**
 * Formats a section header line for the expanded view.
 * Example: "── Args ──────────────────────"
 */
function formatSectionHeader(label: string, innerWidth: number): string {
  const prefix = `\u2500\u2500 ${label} `;
  const fillLen = Math.max(0, innerWidth - prefix.length);
  return `${prefix}${"\u2500".repeat(fillLen)}`;
}

/**
 * Stringifies a value for display in the expanded view.
 * Objects are pretty-printed with 2-space indent.
 */
function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Produces the expanded content lines for an activity event.
 * Each line is at most `innerWidth` characters.
 * Returns at most MAX_EXPANDED_LINES lines.
 */
export function formatExpandedLines(event: ActivityEvent, innerWidth: number): string[] {
  const lines: string[] = [];

  switch (event.kind) {
    case "tool_call": {
      const tc = event as ToolCallActivityEvent;
      const argsStr = stringifyValue(tc.toolArgs);
      if (argsStr) {
        lines.push(formatSectionHeader("Args", innerWidth));
        lines.push(...wrapText(argsStr, innerWidth).map((l) => `  ${l}`));
      }
      if (tc.status === "error" && tc.error) {
        lines.push(formatSectionHeader("Error", innerWidth));
        lines.push(...wrapText(tc.error, innerWidth - 2).map((l) => `  ${l}`));
      } else if (tc.status === "success" && tc.result) {
        lines.push(formatSectionHeader("Result", innerWidth));
        lines.push(...wrapText(tc.result, innerWidth - 2).map((l) => `  ${l}`));
      }
      break;
    }
    case "compaction": {
      const ce = event as CompactionActivityEvent;
      lines.push(formatSectionHeader("Summary", innerWidth));
      lines.push(...wrapText(ce.summary, innerWidth - 2).map((l) => `  ${l}`));
      lines.push(`  Before: ~${ce.beforeTokenEstimate.toLocaleString()} tokens`);
      lines.push(`  After:  ~${ce.afterTokenEstimate.toLocaleString()} tokens`);
      break;
    }
    case "error": {
      const ee = event as ErrorActivityEvent;
      lines.push(formatSectionHeader("Error", innerWidth));
      lines.push(...wrapText(ee.error.message, innerWidth - 2).map((l) => `  ${l}`));
      if (ee.code) lines.push(`  Code: ${ee.code}`);
      if (ee.retryable !== undefined) lines.push(`  Retryable: ${ee.retryable ? "yes" : "no"}`);
      break;
    }
    case "done":
      lines.push(formatSectionHeader("Details", innerWidth));
      lines.push(`  Finish reason: ${event.finishReason}`);
      if (event.totalTokensUsed !== undefined) {
        lines.push(`  Tokens used: ${event.totalTokensUsed.toLocaleString()}`);
      }
      break;
    case "aborted":
      lines.push(formatSectionHeader("Details", innerWidth));
      lines.push(`  Reason: ${event.reason ?? "No reason"}`);
      lines.push(`  Initiated by: ${event.initiatedBy}`);
      break;
    case "child_agent": {
      const ca = event as ChildAgentActivityEvent;
      lines.push(formatSectionHeader("Child Agent", innerWidth));
      lines.push(`  ID: ${ca.childId}`);
      lines.push(`  Event: ${ca.eventType}`);
      const payloadStr = stringifyValue(ca.payload);
      if (payloadStr) {
        lines.push(...wrapText(payloadStr, innerWidth - 2).map((l) => `  ${l}`));
      }
      break;
    }
    case "thinking":
      lines.push(formatSectionHeader("Thinking", innerWidth));
      lines.push(...wrapText(event.content, innerWidth - 2).map((l) => `  ${l}`));
      lines.push(`  ~${event.estimatedTokens} tokens`);
      break;
  }

  return lines.slice(0, MAX_EXPANDED_LINES);
}

// --- Props ---

export interface StepCardProps {
  event: ActivityEvent;
  stepNumber: number;
  width: number;
  isFocused?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

// --- Component ---

/**
 * StepCard renders a single activity event as a compact card.
 *
 * Collapsed view (single line):
 *   🔧 [42] tool_name  args preview  ✓ 1.2s
 *
 * Expanded view (multi-line):
 *   🔧 [42] tool_name  ✓ 1.2s  ▼
 *   ── Args ──────────────────────
 *     { "command": "ls -la" }
 *   ── Result ─────────────────────
 *     total 8
 *     drwxr-xr-x ...
 *
 * Toggle: Enter or e key when focused.
 * Expanded state persists until manually collapsed.
 */
export function StepCard(props: StepCardProps) {
  const { event, stepNumber, width, isFocused = false, onToggle } = props;
  const { tokens } = useThemeTokens();

  const [expanded, setExpanded] = useState(props.isExpanded ?? false);

  useKeyboard((keyEvent) => {
    if (!isFocused) return;

    const keyName = keyEvent.name ?? "";
    const sequence = keyEvent.sequence ?? "";

    if (keyName === "return" || sequence === "e") {
      setExpanded((prev) => !prev);
      onToggle?.();
    }
  });

  const icon = getEventIcon(event);
  const label = getEventLabel(event);
  const statusGlyph = event.kind === "tool_call" ? getEventStatusGlyph(event) : "";
  const duration = formatEventDuration(event);
  const isError = event.kind === "error" ||
    (event.kind === "tool_call" && (event as ToolCallActivityEvent).status === "error");

  // Build the right-side suffix: status glyph + duration + expand indicator
  const suffixParts: string[] = [];
  if (statusGlyph) suffixParts.push(statusGlyph);
  if (duration) suffixParts.push(duration);
  const expandIndicator = expanded ? "\u25BC" : "\u25B6"; // ▼ or ▶
  suffixParts.push(expandIndicator);
  const suffix = suffixParts.join(" ");

  // Build the left-side prefix: icon + [stepNumber] + label
  const prefix = `${icon} [${stepNumber}] ${label}`;

  // Calculate available space for preview
  // Layout: "│ {prefix}  {preview}  {suffix} │"
  const borderChars = 4; // "│ " + " │"
  const gapChars = suffix.length > 0 ? 4 : 2; // gaps between prefix/preview/suffix
  const usedWidth = borderChars + prefix.length + gapChars + suffix.length;
  const previewWidth = Math.max(0, width - usedWidth);

  const preview = !expanded && previewWidth > 3
    ? formatEventPreview(event, previewWidth)
    : "";

  // Assemble the content line
  let contentLine: string;
  if (preview && suffix) {
    contentLine = `${prefix}  ${preview}  ${suffix}`;
  } else if (preview) {
    contentLine = `${prefix}  ${preview}`;
  } else if (suffix) {
    contentLine = `${prefix}  ${suffix}`;
  } else {
    contentLine = prefix;
  }

  // Pad to fill the card width
  const innerWidth = width - 4; // "│ " + " │"
  const paddedContent = contentLine.length > innerWidth
    ? `${contentLine.slice(0, innerWidth - 1)}\u2026`
    : contentLine;
  const padded = `\u2502 ${paddedContent}${" ".repeat(Math.max(0, innerWidth - paddedContent.length))} \u2502`;

  // Determine text color
  const textColor = isError
    ? tokens["status.error"]
    : event.kind === "done"
      ? tokens["status.success"]
      : event.kind === "tool_call" && (event as ToolCallActivityEvent).status === "running"
        ? tokens["status.warning"]
        : tokens["text.secondary"];

  // Focus highlight: slightly different color for the focused card
  const headerColor = isFocused ? tokens["accent.primary"] : textColor;

  // Build expanded content lines
  const expandedLines: string[] = expanded
    ? formatExpandedLines(event, innerWidth - 2)
    : [];

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text style={{ color: headerColor }}>{padded}</Text>
      {expandedLines.map((line, idx) => {
        const paddedLine = line.length > innerWidth
          ? `${line.slice(0, innerWidth - 1)}\u2026`
          : line;
        const expandedPadded = `\u2502 ${paddedLine}${" ".repeat(Math.max(0, innerWidth - paddedLine.length))} \u2502`;
        return (
          <Text key={idx} style={{ color: tokens["text.secondary"] }}>
            {expandedPadded}
          </Text>
        );
      })}
    </Box>
  );
}
