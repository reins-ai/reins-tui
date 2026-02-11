import type { ConversationSummary } from "@reins/core";

import { formatRelativeTime } from "../lib";
import { useThemeTokens } from "../theme";
import { Box, ScrollBox, Text } from "../ui";

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  selectedConversationId: string | null;
  onSelect(conversationId: string): void;
  onActivate(conversationId: string): void;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export function ConversationList({
  conversations,
  activeConversationId,
  selectedConversationId,
  onSelect: _onSelect,
  onActivate: _onActivate,
}: ConversationListProps) {
  const { tokens } = useThemeTokens();

  if (conversations.length === 0) {
    return <Text style={{ color: tokens["text.secondary"] }}>No conversations found</Text>;
  }

  return (
    <ScrollBox style={{ flexGrow: 1, flexDirection: "column" }}>
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeConversationId;
        const isSelected = conversation.id === selectedConversationId;

        return (
          <Box
            key={conversation.id}
            style={{
              flexDirection: "column",
              marginBottom: 1,
              paddingLeft: 1,
              paddingRight: 1,
              backgroundColor: isActive ? tokens["sidebar.active"] : isSelected ? tokens["sidebar.hover"] : "transparent",
            }}
          >
            <Box style={{ flexDirection: "row" }}>
              <Text content={isSelected ? "▶ " : "  "} style={{ color: tokens["accent.primary"] }} />
              <Text content={truncate(conversation.title, 20)} style={{ color: isActive ? tokens["text.primary"] : tokens["text.secondary"] }} />
            </Box>
            <Text
              content={`  ${conversation.messageCount} msg • ${formatRelativeTime(conversation.lastMessageAt)}`}
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        );
      })}
    </ScrollBox>
  );
}
