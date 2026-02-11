import type { NoteCard } from "../../cards/card-schemas";
import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

const CARD_WIDTH = 34;
const HEADER_LABEL = "Note";
const HEADER_ICON = "\u{1F4DD}"; // 📝
const CONTENT_MAX_LINES = 3;
const LINE_WIDTH = CARD_WIDTH - 4; // "│ " + " │"

function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (lines.length >= maxLines) {
      break;
    }

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

  if (lines.length === maxLines && words.length > 0) {
    const lastLine = lines[maxLines - 1];
    if (lastLine && lastLine.length > maxWidth - 1) {
      lines[maxLines - 1] = `${lastLine.slice(0, maxWidth - 1)}\u2026`;
    }
  }

  return lines;
}

function padLine(content: string, width: number): string {
  const available = width - 4;
  if (content.length >= available) {
    return `\u2502 ${content.slice(0, available)} \u2502`;
  }

  return `\u2502 ${content}${" ".repeat(available - content.length)} \u2502`;
}

export interface NoteCardProps {
  card: NoteCard;
}

export function NoteCard({ card }: NoteCardProps) {
  const { tokens } = useThemeTokens();

  const pinnedMarker = card.pinned ? " \u{1F4CC}" : "";
  const headerText = `\u2500 ${HEADER_ICON} ${HEADER_LABEL}${pinnedMarker} `;
  const headerFill = "\u2500".repeat(Math.max(0, CARD_WIDTH - headerText.length - 2));
  const topBorder = `\u256D${headerText}${headerFill}\u256E`;
  const bottomBorder = `\u2570${"\u2500".repeat(CARD_WIDTH - 2)}\u256F`;

  const contentLines = wrapText(card.content, LINE_WIDTH, CONTENT_MAX_LINES);

  const lines: string[] = [
    padLine(card.title, CARD_WIDTH),
    ...contentLines.map((line) => padLine(line, CARD_WIDTH)),
  ];

  if (card.tags && card.tags.length > 0) {
    const tagLine = card.tags.map((tag) => `#${tag}`).join(" ");
    lines.push(padLine(tagLine, CARD_WIDTH));
  }

  return (
    <Box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      <Text style={{ color: tokens["border.primary"] }}>{topBorder}</Text>
      {lines.map((line, index) => (
        <Text
          key={index}
          style={{
            color: index === 0
              ? tokens["text.primary"]
              : index > contentLines.length
                ? tokens["accent.subtle"]
                : tokens["text.secondary"],
          }}
        >
          {line}
        </Text>
      ))}
      <Text style={{ color: tokens["border.primary"] }}>{bottomBorder}</Text>
    </Box>
  );
}
