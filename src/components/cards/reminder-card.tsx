import type { ReminderCard } from "../../cards/card-schemas";
import { useThemeTokens } from "../../theme";
import type { ThemeTokens } from "../../theme/theme-schema";
import { Box, Text } from "../../ui";

const CARD_WIDTH = 34;
const HEADER_LABEL = "Reminder";
const HEADER_ICON = "\u{1F514}"; // 🔔

const PRIORITY_INDICATORS: Record<NonNullable<ReminderCard["priority"]>, string> = {
  high: "\u25B2 High",
  medium: "\u25C6 Medium",
  low: "\u25BD Low",
};

export function getPriorityColor(
  priority: ReminderCard["priority"],
  tokens: Readonly<ThemeTokens>,
): string {
  switch (priority) {
    case "high":
      return tokens["status.error"];
    case "medium":
      return tokens["status.warning"];
    case "low":
      return tokens["text.muted"];
    default:
      return tokens["text.secondary"];
  }
}

function formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDisplayTime(time: string): string {
  const parts = time.split(":");
  if (parts.length < 2) {
    return time;
  }

  const hours = Number.parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hours)) {
    return time;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${period}`;
}

function padLine(content: string, width: number): string {
  const available = width - 4;
  if (content.length >= available) {
    return `\u2502 ${content.slice(0, available)} \u2502`;
  }

  return `\u2502 ${content}${" ".repeat(available - content.length)} \u2502`;
}

export interface ReminderCardProps {
  card: ReminderCard;
}

export function ReminderCard({ card }: ReminderCardProps) {
  const { tokens } = useThemeTokens();

  const completedMarker = card.completed ? " \u2713" : "";
  const headerText = `\u2500 ${HEADER_ICON} ${HEADER_LABEL}${completedMarker} `;
  const headerFill = "\u2500".repeat(Math.max(0, CARD_WIDTH - headerText.length - 2));
  const topBorder = `\u256D${headerText}${headerFill}\u256E`;
  const bottomBorder = `\u2570${"\u2500".repeat(CARD_WIDTH - 2)}\u256F`;

  const dateDisplay = formatDisplayDate(card.dueDate);
  const timePart = card.dueTime ? ` \u00B7 ${formatDisplayTime(card.dueTime)}` : "";
  const dueLine = `Due: ${dateDisplay}${timePart}`;

  const titleColor = card.completed ? tokens["text.muted"] : tokens["text.primary"];
  const priorityColor = getPriorityColor(card.priority, tokens);

  const lines: Array<{ text: string; color: string }> = [
    { text: padLine(card.title, CARD_WIDTH), color: titleColor },
    { text: padLine(dueLine, CARD_WIDTH), color: tokens["text.secondary"] },
  ];

  if (card.priority) {
    const indicator = PRIORITY_INDICATORS[card.priority];
    lines.push({
      text: padLine(`Priority: ${indicator}`, CARD_WIDTH),
      color: priorityColor,
    });
  }

  return (
    <Box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      <Text style={{ color: tokens["border.primary"] }}>{topBorder}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={{ color: line.color }}>
          {line.text}
        </Text>
      ))}
      <Text style={{ color: tokens["border.primary"] }}>{bottomBorder}</Text>
    </Box>
  );
}
