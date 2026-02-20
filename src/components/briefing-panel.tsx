import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import { Box, Text } from "../ui";

// --- Constants ---

const CARD_WIDTH = 42;
const HEADER_LABEL = "Morning Briefing";
const HEADER_ICON = "\u2600"; // ☀
const DISMISS_HINT = "d dismiss";
const CONTENT_MAX_LINES = 6;
const LINE_WIDTH = CARD_WIDTH - 4; // "│ " + " │"

// --- Types ---

export interface BriefingSection {
  sectionType: string;
  text: string;
}

export interface BriefingData {
  messages: BriefingSection[];
  totalItems: number;
  timestamp: Date;
  isEmpty: boolean;
}

export interface BriefingPanelProps {
  briefing: BriefingData | null;
  channelsConfigured: boolean;
  dismissedDates: ReadonlySet<string>;
  onDismiss?: (dateKey: string) => void;
}

// --- Pure utility functions (exported for testability) ---

/**
 * Derives a date key from a briefing timestamp for dismiss tracking.
 * Format: YYYY-MM-DD
 */
export function getBriefingDateKey(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Determines whether the briefing panel should be visible.
 * Returns false when:
 * - No briefing data
 * - Briefing is empty (no items)
 * - External channels are configured (briefing delivered there instead)
 * - Briefing for this date has been dismissed
 */
export function shouldShowBriefing(
  briefing: BriefingData | null,
  channelsConfigured: boolean,
  dismissedDates: ReadonlySet<string>,
): boolean {
  if (!briefing) return false;
  if (briefing.isEmpty) return false;
  if (channelsConfigured) return false;

  const dateKey = getBriefingDateKey(briefing.timestamp);
  if (dismissedDates.has(dateKey)) return false;

  return true;
}

/**
 * Formats a briefing timestamp into a human-readable time string.
 */
export function formatBriefingTime(timestamp: Date): string {
  const hours = timestamp.getHours();
  const minutes = String(timestamp.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${period}`;
}

/**
 * Resolves the section icon for a briefing section type.
 */
export function getSectionIcon(sectionType: string): string {
  switch (sectionType) {
    case "open_threads":
      return "\u{1F4CB}"; // 📋
    case "high_importance":
      return "\u{26A0}\u{FE0F}"; // ⚠️
    case "recent_decisions":
      return "\u{2705}"; // ✅
    case "upcoming":
      return "\u{1F4C5}"; // 📅
    case "empty":
      return "\u{2728}"; // ✨
    default:
      return "\u{1F4CC}"; // 📌
  }
}

/**
 * Truncates a line to fit within the card width, adding ellipsis if needed.
 */
export function truncateLine(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return `${text.slice(0, maxWidth - 1)}\u2026`;
}

/**
 * Pads a content line to fit within the card border.
 */
export function padBriefingLine(content: string, width: number): string {
  const available = width - 4; // "│ " + " │"
  const truncated = content.length > available
    ? `${content.slice(0, available - 1)}\u2026`
    : content;

  return `\u2502 ${truncated}${" ".repeat(Math.max(0, available - truncated.length))} \u2502`;
}

/**
 * Builds the card lines from briefing messages.
 * Returns an array of { text, colorKey } for rendering.
 */
export function buildBriefingLines(
  briefing: BriefingData,
): Array<{ text: string; colorKey: "primary" | "secondary" | "muted" | "accent" }> {
  const lines: Array<{ text: string; colorKey: "primary" | "secondary" | "muted" | "accent" }> = [];

  // Time line
  const timeText = `Generated at ${formatBriefingTime(briefing.timestamp)}`;
  lines.push({
    text: padBriefingLine(timeText, CARD_WIDTH),
    colorKey: "muted",
  });

  // Empty separator
  lines.push({
    text: padBriefingLine("", CARD_WIDTH),
    colorKey: "muted",
  });

  let lineCount = 2;

  for (const message of briefing.messages) {
    if (lineCount >= CONTENT_MAX_LINES) break;

    // Extract first line of the message text as a summary
    const firstLine = message.text.split("\n")[0] ?? message.text;
    const displayText = truncateLine(firstLine, LINE_WIDTH);

    lines.push({
      text: padBriefingLine(displayText, CARD_WIDTH),
      colorKey: "secondary",
    });
    lineCount++;
  }

  // Items count
  if (lineCount < CONTENT_MAX_LINES + 2) {
    lines.push({
      text: padBriefingLine("", CARD_WIDTH),
      colorKey: "muted",
    });
    const countText = `${briefing.totalItems} item${briefing.totalItems !== 1 ? "s" : ""} total`;
    lines.push({
      text: padBriefingLine(countText, CARD_WIDTH),
      colorKey: "muted",
    });
  }

  return lines;
}

/**
 * Resolves a color key to a theme token value.
 */
export function resolveLineColor(
  colorKey: "primary" | "secondary" | "muted" | "accent",
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
  }
}

// --- Component ---

/**
 * BriefingPanel renders a dismissible card showing the morning briefing.
 *
 * Visibility rules:
 * - Only rendered when a non-empty briefing exists
 * - Hidden when external channels (Telegram/Discord) are configured
 * - Hidden once dismissed for the current briefing date
 *
 * This is an inline card, not a modal overlay. It appears in the
 * conversation area or Today panel when conditions are met.
 */
export function BriefingPanel(props: BriefingPanelProps) {
  const { briefing, channelsConfigured, dismissedDates } = props;
  const { tokens } = useThemeTokens();

  if (!shouldShowBriefing(briefing, channelsConfigured, dismissedDates)) {
    return null;
  }

  // briefing is guaranteed non-null by shouldShowBriefing
  const data = briefing as BriefingData;

  const headerText = `\u2500 ${HEADER_ICON} ${HEADER_LABEL} `;
  const headerFill = "\u2500".repeat(Math.max(0, CARD_WIDTH - headerText.length - 2));
  const topBorder = `\u256D${headerText}${headerFill}\u256E`;
  const bottomBorder = `\u2570${"\u2500".repeat(CARD_WIDTH - 2)}\u256F`;

  const lines = buildBriefingLines(data);

  // Dismiss hint line — shown when dismiss handler is available
  const hintLine = props.onDismiss
    ? padBriefingLine(DISMISS_HINT, CARD_WIDTH)
    : null;

  return (
    <Box style={{ flexDirection: "column", marginTop: 1, marginBottom: 1 }}>
      <Text style={{ color: tokens["accent.primary"] }}>{topBorder}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={{ color: resolveLineColor(line.colorKey, tokens) }}>
          {line.text}
        </Text>
      ))}
      {hintLine ? (
        <Text style={{ color: tokens["text.muted"] }}>{hintLine}</Text>
      ) : null}
      <Text style={{ color: tokens["accent.primary"] }}>{bottomBorder}</Text>
    </Box>
  );
}
