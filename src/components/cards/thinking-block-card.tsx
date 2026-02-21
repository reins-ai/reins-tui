import { useState } from "react";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";

// --- Constants ---

const DEFAULT_WIDTH = 44;
const MAX_EXPANDED_LINES = 8;
const THINKING_ICON = "\u{1F4AD}"; // 💭
const COLLAPSE_GLYPH = "\u25BE"; // ▾
const EXPAND_GLYPH = "\u25B4"; // ▴

// --- Exported helpers (pure functions for testability) ---

/**
 * Wraps text to fit within a given width, returning at most `maxLines` lines.
 * If the content exceeds `maxLines`, the last line is truncated with a
 * `…[N more chars]` suffix indicating how much content remains.
 */
export function wrapThinkingContent(
  content: string,
  lineWidth: number,
  maxLines: number,
): string[] {
  if (lineWidth <= 0) return [];

  const lines: string[] = [];
  let remaining = content;

  while (remaining.length > 0 && lines.length < maxLines) {
    if (remaining.length <= lineWidth) {
      lines.push(remaining);
      remaining = "";
    } else {
      lines.push(remaining.slice(0, lineWidth));
      remaining = remaining.slice(lineWidth);
    }
  }

  // If there's leftover content, annotate the last line
  if (remaining.length > 0 && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const suffix = `\u2026[${remaining.length} more chars]`;
    const lastLine = lines[lastIndex]!;
    if (lastLine.length + suffix.length <= lineWidth) {
      lines[lastIndex] = `${lastLine}${suffix}`;
    } else {
      const trimTo = Math.max(0, lineWidth - suffix.length);
      lines[lastIndex] = `${lastLine.slice(0, trimTo)}${suffix}`;
    }
  }

  return lines;
}

/**
 * Pads a content string to fit within card borders.
 * Format: "│ {content padded to innerWidth} │"
 */
export function padCardLine(content: string, width: number): string {
  const innerWidth = width - 4; // "│ " + " │"
  const truncated = content.length > innerWidth
    ? `${content.slice(0, innerWidth - 1)}\u2026`
    : content;

  return `\u2502 ${truncated}${" ".repeat(Math.max(0, innerWidth - truncated.length))} \u2502`;
}

/**
 * Builds the header line for a thinking block card.
 * Format: "💭 [N] Thinking (~123 tokens)  ▾"
 */
export function buildThinkingHeader(
  stepNumber: number,
  estimatedTokens: number,
  isExpanded: boolean,
  width: number,
): string {
  const glyph = isExpanded ? EXPAND_GLYPH : COLLAPSE_GLYPH;
  const prefix = `${THINKING_ICON} [${stepNumber}] Thinking (~${estimatedTokens} tokens)`;
  const innerWidth = width - 4; // "│ " + " │"

  // Place the toggle glyph at the right edge
  const gap = Math.max(1, innerWidth - prefix.length - 1);
  return `${prefix}${" ".repeat(gap)}${glyph}`;
}

// --- Props ---

export interface ThinkingBlockCardProps {
  content: string;
  estimatedTokens: number;
  stepNumber: number;
  width?: number;
  /** Whether this card currently has keyboard focus. */
  isFocused?: boolean;
  /** Initial expand state. Default: false (collapsed). */
  isExpanded?: boolean;
  /** Called when the user toggles expand/collapse (notification to parent). */
  onToggle?: () => void;
}

// --- Component ---

/**
 * ThinkingBlockCard renders a collapsible thinking block in the activity panel.
 *
 * Collapsed view (single line):
 *   │ 💭 [N] Thinking (~123 tokens)  ▾ │
 *
 * Expanded view (multiple lines):
 *   │ 💭 [N] Thinking (~123 tokens)  ▴ │
 *   │ ── Content ─────────────────── │
 *   │   First lines of thinking...   │
 *   │   wrapped to card width...     │
 *
 * Toggle: Enter or t key when focused.
 * Expanded state persists until manually collapsed.
 */
export function ThinkingBlockCard(props: ThinkingBlockCardProps) {
  const {
    content,
    estimatedTokens,
    stepNumber,
    width = DEFAULT_WIDTH,
    isFocused = false,
    onToggle,
  } = props;
  const { tokens } = useThemeTokens();

  const [expanded, setExpanded] = useState(props.isExpanded ?? false);

  useKeyboard((keyEvent) => {
    if (!isFocused) return;

    const keyName = keyEvent.name ?? "";
    const sequence = keyEvent.sequence ?? "";

    if (keyName === "return" || sequence === "t") {
      setExpanded((prev) => !prev);
      onToggle?.();
    }
  });

  const mutedColor = tokens["text.muted"];
  const secondaryColor = tokens["text.secondary"];
  const focusBgColor = isFocused ? tokens["surface.tertiary"] : undefined;

  const headerContent = buildThinkingHeader(stepNumber, estimatedTokens, expanded, width);
  const headerLine = padCardLine(headerContent, width);

  // Content area dimensions
  const contentIndent = 2;
  const contentLineWidth = width - 4 - contentIndent; // innerWidth minus indent

  // Build the separator line: "── Content ──────────────"
  const separatorLabel = " Content ";
  const innerWidth = width - 4;
  const dashBefore = "\u2500\u2500";
  const dashAfterLength = Math.max(0, innerWidth - dashBefore.length - separatorLabel.length);
  const separatorContent = `${dashBefore}${separatorLabel}${"\u2500".repeat(dashAfterLength)}`;
  const separatorLine = padCardLine(separatorContent, width);

  // Wrap content for expanded view
  const wrappedLines = expanded
    ? wrapThinkingContent(content, contentLineWidth, MAX_EXPANDED_LINES)
    : [];

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text style={{ color: mutedColor, backgroundColor: focusBgColor }}>
        {headerLine}
      </Text>
      {expanded ? (
        <>
          <Text style={{ color: mutedColor, backgroundColor: focusBgColor }}>
            {separatorLine}
          </Text>
          {wrappedLines.map((line, index) => {
            const indented = `${" ".repeat(contentIndent)}${line}`;
            return (
              <Text key={index} style={{ color: secondaryColor, backgroundColor: focusBgColor }}>
                {padCardLine(indented, width)}
              </Text>
            );
          })}
        </>
      ) : null}
    </Box>
  );
}
