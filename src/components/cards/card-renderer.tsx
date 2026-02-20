import type { ContentCard } from "../../cards/card-schemas";
import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";
import { BrowserActionCard, BrowserNavCard, BrowserSnapshotCard } from "./browser-card";
import { CalendarCard } from "./calendar-card";
import { NoteCard } from "./note-card";
import { ReminderCard } from "./reminder-card";

export interface CardRendererProps {
  card: ContentCard;
}

export function CardRenderer({ card }: CardRendererProps) {
  const { tokens } = useThemeTokens();

  switch (card.type) {
    case "calendar-event":
      return <CalendarCard card={card} />;
    case "note":
      return <NoteCard card={card} />;
    case "reminder":
      return <ReminderCard card={card} />;
    case "browser-nav":
      return <BrowserNavCard card={card} />;
    case "browser-snapshot":
      return <BrowserSnapshotCard card={card} />;
    case "browser-action":
      return <BrowserActionCard card={card} />;
    case "plain-text":
      return (
        <Box style={{ marginLeft: 2 }}>
          <Text style={{ color: tokens["text.secondary"] }}>{card.content}</Text>
        </Box>
      );
  }
}
