import { useCallback, useMemo, useState } from "react";

import type { ConversationSummary } from "@reins/core";

import type { DaemonClient } from "../daemon/client";
import { formatRelativeTime } from "../lib";
import { useThemeTokens } from "../theme";
import { Box, Input, ScrollBox, Text, useKeyboard } from "../ui";
import { fuzzyMatch } from "../util/fuzzy-search";
import {
  ConversationContextMenu,
  type ContextMenuAction,
  type ContextMenuMode,
} from "./cards/conversation-context-menu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  selectedConversationId: string | null;
  isLoading?: boolean;
  isFocused?: boolean;
  daemonClient?: DaemonClient | null;
  onSelect(conversationId: string): void;
  onActivate(conversationId: string): void;
  onRename(conversationId: string, newTitle: string): void;
  onDelete(conversationId: string): void;
  onArchive(conversationId: string): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  return parts.join(" \u00B7 ");
}

/**
 * Fire-and-forget a daemon mutation. Logs errors but does not revert
 * the optimistic local state update (offline-tolerant design).
 */
function fireDaemonMutation(promise: Promise<unknown> | undefined): void {
  if (promise === undefined) {
    return;
  }

  promise.catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[conversation-list] daemon mutation failed:", error);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversationList({
  conversations,
  activeConversationId,
  selectedConversationId,
  isLoading = false,
  isFocused = false,
  daemonClient,
  onSelect: _onSelect,
  onActivate,
  onRename,
  onDelete,
  onArchive,
}: ConversationListProps) {
  const { tokens } = useThemeTokens();
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenuTarget, setContextMenuTarget] = useState<string | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<ContextMenuMode>({ kind: "menu" });

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

  // --- Context menu state management ---

  const contextMenuConversation = useMemo(() => {
    if (contextMenuTarget === null) {
      return null;
    }

    return conversations.find((c) => c.id === contextMenuTarget) ?? null;
  }, [contextMenuTarget, conversations]);

  const isContextMenuOpen = contextMenuTarget !== null;

  const closeContextMenu = useCallback(() => {
    setContextMenuTarget(null);
    setContextMenuMode({ kind: "menu" });
  }, []);

  const handleContextMenuAction = useCallback(
    (action: ContextMenuAction) => {
      if (contextMenuTarget === null) {
        return;
      }

      switch (action) {
        case "open":
          onActivate(contextMenuTarget);
          closeContextMenu();
          break;
        case "rename": {
          const conversation = conversations.find((c) => c.id === contextMenuTarget);
          setContextMenuMode({
            kind: "rename",
            draft: conversation?.title ?? "",
          });
          break;
        }
        case "delete":
          if (contextMenuMode.kind === "delete-confirm") {
            // Optimistic: remove from local state immediately
            onDelete(contextMenuTarget);
            // Fire daemon mutation in background
            fireDaemonMutation(daemonClient?.deleteConversation(contextMenuTarget));
            closeContextMenu();
          } else {
            setContextMenuMode({ kind: "delete-confirm" });
          }
          break;
        case "archive":
          // Optimistic: remove from visible list immediately
          onArchive(contextMenuTarget);
          // Fire daemon mutation in background (mark as archived via title prefix)
          fireDaemonMutation(
            daemonClient?.updateConversation(contextMenuTarget, {
              title: `[archived] ${conversations.find((c) => c.id === contextMenuTarget)?.title ?? ""}`,
            }),
          );
          closeContextMenu();
          break;
      }
    },
    [closeContextMenu, contextMenuMode.kind, contextMenuTarget, conversations, daemonClient, onActivate, onArchive, onDelete],
  );

  const handleRenameSubmit = useCallback(
    (newTitle: string) => {
      if (contextMenuTarget === null) {
        return;
      }

      // Optimistic: update title in local state immediately
      onRename(contextMenuTarget, newTitle);
      // Fire daemon mutation in background
      fireDaemonMutation(
        daemonClient?.updateConversation(contextMenuTarget, { title: newTitle }),
      );
      closeContextMenu();
    },
    [closeContextMenu, contextMenuTarget, daemonClient, onRename],
  );

  // --- Keyboard handling for opening context menu ---

  useKeyboard((event) => {
    if (!isFocused || isContextMenuOpen) {
      return;
    }

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // "m" key or Enter on selected conversation opens context menu
    if ((sequence === "m" || keyName === "return") && selectedConversationId !== null) {
      setContextMenuTarget(selectedConversationId);
      setContextMenuMode({ kind: "menu" });
    }
  });

  // --- Render ---

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

      {/* Context menu overlay */}
      {isContextMenuOpen && contextMenuConversation !== null ? (
        <Box
          style={{
            flexDirection: "column",
            marginBottom: 1,
          border: true,
          borderColor: tokens["border.subtle"],
          }}
        >
          <ConversationContextMenu
            conversation={contextMenuConversation}
            mode={contextMenuMode}
            onAction={handleContextMenuAction}
            onRenameSubmit={handleRenameSubmit}
            onCancel={closeContextMenu}
          />
        </Box>
      ) : null}

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
            const isMenuTarget = conversation.id === contextMenuTarget;

            return (
              <Box
                key={conversation.id}
                style={{
                  flexDirection: "column",
                  marginBottom: 1,
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: isMenuTarget
                    ? tokens["accent.primary"]
                    : isActive
                      ? tokens["sidebar.active"]
                      : isSelected
                        ? tokens["sidebar.hover"]
                        : "transparent",
                }}
              >
                <Box style={{ flexDirection: "row" }}>
                  <Text
                    content={unread ? "\u2022 " : isSelected ? "\u25B6 " : "  "}
                    style={{ color: unread ? tokens["accent.primary"] : tokens["accent.primary"] }}
                  />
                  <Text
                    content={truncate(conversation.title, 24)}
                    style={{
                      color: isMenuTarget
                        ? tokens["text.primary"]
                        : isActive
                          ? tokens["text.primary"]
                          : tokens["text.secondary"],
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

      {/* Hint for context menu trigger */}
      {!isContextMenuOpen && filteredConversations.length > 0 ? (
        <Box style={{ paddingLeft: 1, paddingRight: 1 }}>
          <Text
            content="[m] menu \u00B7 [Enter] open"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
