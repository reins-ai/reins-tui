import type {
  BrowserNavCard as BrowserNavCardType,
  BrowserSnapshotCard as BrowserSnapshotCardType,
  BrowserActionCard as BrowserActionCardType,
} from "../../cards/card-schemas";
import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

const CARD_WIDTH = 50;
const LINE_WIDTH = CARD_WIDTH - 4;
const SNAPSHOT_MAX_LINES = 8;
const SNAPSHOT_LINE_WIDTH = 80;

function padLine(content: string, width: number): string {
  const available = width - 4;
  if (content.length >= available) {
    return `\u2502 ${content.slice(0, available)} \u2502`;
  }

  return `\u2502 ${content}${" ".repeat(available - content.length)} \u2502`;
}

function buildBorder(
  icon: string,
  label: string,
  suffix: string,
  width: number,
): { top: string; bottom: string } {
  const headerText = `\u2500 ${icon} ${label}${suffix} `;
  const headerFill = "\u2500".repeat(Math.max(0, width - headerText.length - 2));
  const top = `\u256D${headerText}${headerFill}\u256E`;
  const bottom = `\u2570${"\u2500".repeat(width - 2)}\u256F`;
  return { top, bottom };
}

function truncateLine(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }

  return `${text.slice(0, maxWidth - 1)}\u2026`;
}

export interface BrowserNavCardProps {
  card: BrowserNavCardType;
}

export function BrowserNavCard({ card }: BrowserNavCardProps) {
  const { tokens } = useThemeTokens();

  const suffix = ` \u2014 ${card.action}`;
  const { top, bottom } = buildBorder("\u{1F310}", "browser", suffix, CARD_WIDTH);

  const lines: Array<{ text: string; color: string }> = [];

  if (card.url) {
    lines.push({
      text: padLine(`\u2192 ${truncateLine(card.url, LINE_WIDTH - 2)}`, CARD_WIDTH),
      color: tokens["accent.subtle"],
    });
  }

  if (card.title) {
    lines.push({
      text: padLine(`Title: ${truncateLine(card.title, LINE_WIDTH - 7)}`, CARD_WIDTH),
      color: tokens["text.secondary"],
    });
  }

  if (card.tabCount !== undefined) {
    lines.push({
      text: padLine(`Tabs: ${card.tabCount} open`, CARD_WIDTH),
      color: tokens["text.secondary"],
    });
  }

  if (card.message) {
    lines.push({
      text: padLine(truncateLine(card.message, LINE_WIDTH), CARD_WIDTH),
      color: tokens["text.muted"],
    });
  }

  return (
    <Box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      <Text style={{ color: tokens["border.primary"] }}>{top}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={{ color: line.color }}>
          {line.text}
        </Text>
      ))}
      <Text style={{ color: tokens["border.primary"] }}>{bottom}</Text>
    </Box>
  );
}

export interface BrowserSnapshotCardProps {
  card: BrowserSnapshotCardType;
}

function splitSnapshotLines(content: string, maxLines: number, maxWidth: number): string[] {
  const rawLines = content.split("\n");
  const result: string[] = [];

  for (const raw of rawLines) {
    if (result.length >= maxLines) {
      break;
    }

    if (raw.length <= maxWidth) {
      result.push(raw);
    } else {
      result.push(`${raw.slice(0, maxWidth - 1)}\u2026`);
    }
  }

  if (rawLines.length > maxLines) {
    const remaining = rawLines.length - maxLines;
    result.push(`... ${remaining} more lines`);
  }

  return result;
}

export function BrowserSnapshotCard({ card }: BrowserSnapshotCardProps) {
  const { tokens } = useThemeTokens();

  const elementSuffix = card.elementCount !== undefined ? ` / ${card.elementCount} elements` : "";
  const suffix = ` \u2014 ${card.format}${elementSuffix}`;
  const { top, bottom } = buildBorder("\u{1F4F8}", "browser_snapshot", suffix, CARD_WIDTH);

  const separator = `\u2502 ${"\u2500".repeat(CARD_WIDTH - 4)} \u2502`;
  const contentLines = splitSnapshotLines(card.content, SNAPSHOT_MAX_LINES, SNAPSHOT_LINE_WIDTH);

  return (
    <Box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      <Text style={{ color: tokens["border.primary"] }}>{top}</Text>
      <Text style={{ color: tokens["border.primary"] }}>{separator}</Text>
      {contentLines.map((line, index) => (
        <Text key={index} style={{ color: tokens["text.secondary"] }}>
          {padLine(truncateLine(line, LINE_WIDTH), CARD_WIDTH)}
        </Text>
      ))}
      {card.truncated ? (
        <Text style={{ color: tokens["text.muted"] }}>
          {padLine("[content truncated]", CARD_WIDTH)}
        </Text>
      ) : null}
      <Text style={{ color: tokens["border.primary"] }}>{bottom}</Text>
    </Box>
  );
}

export interface BrowserActionCardProps {
  card: BrowserActionCardType;
}

export function BrowserActionCard({ card }: BrowserActionCardProps) {
  const { tokens } = useThemeTokens();

  const refSuffix = card.ref ? ` ${card.ref}` : "";
  const suffix = ` \u2014 ${card.action}${refSuffix}`;
  const isScreenshot = card.action === "screenshot";
  const icon = isScreenshot ? "\u{1F4F7}" : "\u{1F5B1}\uFE0F";
  const { top, bottom } = buildBorder(icon, "browser_act", suffix, CARD_WIDTH);

  const lines: Array<{ text: string; color: string }> = [];

  if (card.message) {
    lines.push({
      text: padLine(`\u2713 ${truncateLine(card.message, LINE_WIDTH - 2)}`, CARD_WIDTH),
      color: tokens["status.success"],
    });
  }

  if (card.screenshotPath) {
    lines.push({
      text: padLine(`\u2713 Saved to ${truncateLine(card.screenshotPath, LINE_WIDTH - 10)}`, CARD_WIDTH),
      color: tokens["status.success"],
    });
  } else if (card.hasScreenshotData && !card.message) {
    lines.push({
      text: padLine("\u2713 Inline screenshot captured", CARD_WIDTH),
      color: tokens["status.success"],
    });
  }

  return (
    <Box style={{ flexDirection: "column", marginTop: 0, marginBottom: 0 }}>
      <Text style={{ color: tokens["border.primary"] }}>{top}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={{ color: line.color }}>
          {line.text}
        </Text>
      ))}
      <Text style={{ color: tokens["border.primary"] }}>{bottom}</Text>
    </Box>
  );
}
