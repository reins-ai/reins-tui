import { useCallback, useMemo, useState } from "react";

import type { ConversationSummary } from "@reins/core";

import { formatRelativeTime } from "../lib";
import { useThemeTokens } from "../theme";
import { Box, Input, ScrollBox, Text } from "../ui";
import { fuzzyMatch } from "../util/fuzzy-search";

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  selectedConversationId: string | null;
  isLoading?: boolean;
  onSelect(conversationId: string): void;
  onActivate(conversationId: string): void;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function hasUnread(conversation: ConversationSummary): boolean {
  // Heuristic: a conversation is "unread" when it has messages and
  // was updated more recently than 30 seconds ago. A proper unread
  // count would require backend tracking; this provides a visual cue
  // for freshly-active conversations.
  const thirtySecondsAgo = Date.now() - 30_000;
  return conversation.messageCount > 0 && conversation.lastMessageAt.getTime() > thirtySecondsAgo;
}

function buildPreviewLine(conversation: ConversationSummary): string {
  const parts: string[] = [];

  if (conversation.messageCount > 0) {
    parts.push(`${conversation.messageCount} msg`);
  }

  parts.push(formatRelativeTime(conversation.lastMessageAt));

  return parts.join(" · ");
}

export function ConversationList({
  conversations,
  activeConversationId,
  selectedConversationId,
  isLoading = false,
  onSelect: _onSelect,
  onActivate: _onActivate,
}: ConversationListProps) {
  const { tokens } = useThemeTokens();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const filteredConversations = useMemo(() => {
    if (searchQuery.trim().length === 0) {
      return conversations;
    }

    const results: { conversation: ConversationSummary; score: number }[] = [];

    for (const conversation of conversations) {
      const preview = buildPreviewLine(conversation);
      const result = fuzzyMatch(searchQuery, conversation.title, preview);
      if (result !== null) {
        results.push({ conversation, score: result.score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.conversation);
  }, [conversations, searchQuery]);

  if (isLoading) {
    return (
      <Box style={{ flexDirection: "column", padding: 1 }}>
        <Text content="Loading conversations..." style={{ color: tokens["text.muted"] }} />
      </Box>
    );
  }

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Box style={{ marginBottom: 1, paddingLeft: 1, paddingRight: 1 }}>
        <Input
          placeholder="Search conversations..."
          value={searchQuery}
          onInput={handleSearchInput}
          style={{ width: "100%" }}
        />
      </Box>

      {filteredConversations.length === 0 && searchQuery.trim().length > 0 ? (
        <Box style={{ padding: 1 }}>
          <Text
            content={`No matches for "${truncate(searchQuery, 20)}"`}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : filteredConversations.length === 0 ? (
        <Box style={{ flexDirection: "column", padding: 1 }}>
          <Text content="No conversations yet" style={{ color: tokens["text.muted"] }} />
          <Text content="Press Ctrl+N to start one" style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : (
        <ScrollBox
          style={{ flexGrow: 1 }}
          contentOptions={{ flexDirection: "column" }}
          scrollbarOptions={{ visible: false }}
        >
          {filteredConversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            const isSelected = conversation.id === selectedConversationId;
            const unread = hasUnread(conversation);

            return (
              <Box
                key={conversation.id}
                style={{
                  flexDirection: "column",
                  marginBottom: 1,
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: isActive
                    ? tokens["sidebar.active"]
                    : isSelected
                      ? tokens["sidebar.hover"]
                      : "transparent",
                }}
              >
                <Box style={{ flexDirection: "row" }}>
                  <Text
                    content={unread ? "• " : isSelected ? "▶ " : "  "}
                    style={{ color: unread ? tokens["accent.primary"] : tokens["accent.primary"] }}
                  />
                  <Text
                    content={truncate(conversation.title, 24)}
                    style={{
                      color: isActive ? tokens["text.primary"] : tokens["text.secondary"],
                      fontWeight: unread ? "bold" : "normal",
                    }}
                  />
                </Box>
                <Text
                  content={`  ${buildPreviewLine(conversation)}`}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            );
          })}
        </ScrollBox>
      )}
    </Box>
  );
}
