import type { CalendarEventCard } from "../../cards/card-schemas";
import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

const CARD_WIDTH = 34;
const HEADER_LABEL = "Calendar";
const HEADER_ICON = "\u{1F4C5}"; // 📅

function formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  const available = width - 4; // "│ " + " │"
  if (content.length >= available) {
    return `\u2502 ${content.slice(0, available)} \u2502`;
  }

  return `\u2502 ${content}${" ".repeat(available - content.length)} \u2502`;
}

export interface CalendarCardProps {
  card: CalendarEventCard;
}

export function CalendarCard({ card }: CalendarCardProps) {
  const { tokens } = useThemeTokens();

  const headerText = `\u2500 ${HEADER_ICON} ${HEADER_LABEL} `;
  const headerFill = "\u2500".repeat(Math.max(0, CARD_WIDTH - headerText.length - 2));
  const topBorder = `\u256D${headerText}${headerFill}\u256E`;
  const bottomBorder = `\u2570${"\u2500".repeat(CARD_WIDTH - 2)}\u256F`;

  const dateDisplay = formatDisplayDate(card.date);
  const timePart = card.time ? ` \u00B7 ${formatDisplayTime(card.time)}` : "";
  const dateLine = `${dateDisplay}${timePart}`;

  const lines: string[] = [
    padLine(card.title, CARD_WIDTH),
    padLine(dateLine, CARD_WIDTH),
  ];

  if (card.duration) {
    lines.push(padLine(`Duration: ${card.duration}`, CARD_WIDTH));
  }

  if (card.location) {
    lines.push(padLine(`\u{1F4CD} ${card.location}`, CARD_WIDTH));
  }

  return (
    <Box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      <Text style={{ color: tokens["border.primary"] }}>{topBorder}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={{ color: index === 0 ? tokens["text.primary"] : tokens["text.secondary"] }}>
          {line}
        </Text>
      ))}
      <Text style={{ color: tokens["border.primary"] }}>{bottomBorder}</Text>
    </Box>
  );
}
