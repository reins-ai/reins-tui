import { useEffect, useMemo, useState } from "react";

import { useConversations } from "../hooks";
import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Input, Box, Text, useKeyboard } from "../ui";
import { ConversationList } from "./conversation-list";
import { getNextModel, ModelSelector } from "./model-selector";

export interface SidebarProps {
  isFocused: boolean;
  borderColor: string;
}

function isEnterKey(name?: string): boolean {
  return name === "enter" || name === "return";
}

function isUpKey(name?: string): boolean {
  return name === "up";
}

function isDownKey(name?: string): boolean {
  return name === "down";
}

function isEscapeKey(name?: string): boolean {
  return name === "escape" || name === "esc";
}

function normalizeInputValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") {
      return value.plainText;
    }

    if ("value" in value && typeof value.value === "string") {
      return value.value;
    }
  }

  return "";
}

function clampIndex(index: number, size: number): number {
  if (size === 0) {
    return -1;
  }

  if (index < 0) {
    return size - 1;
  }

  if (index >= size) {
    return 0;
  }

  return index;
}

export function Sidebar({ isFocused, borderColor }: SidebarProps) {
  const { state, dispatch } = useApp();
  const { tokens } = useThemeTokens();
  const conversations = useConversations();
  const filteredConversations = useMemo(() => conversations.filteredConversations(), [conversations]);

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setSelectedIndex(-1);
      return;
    }

    if (conversations.activeId) {
      const activeIndex = filteredConversations.findIndex((conversation) => conversation.id === conversations.activeId);
      if (activeIndex !== -1) {
        setSelectedIndex(activeIndex);
        return;
      }
    }

    setSelectedIndex((current) => (current >= 0 && current < filteredConversations.length ? current : 0));
  }, [conversations.activeId, filteredConversations]);

  const selectedConversation =
    selectedIndex >= 0 && selectedIndex < filteredConversations.length ? filteredConversations[selectedIndex] : null;

  const createConversation = () => {
    const id = conversations.createConversation();
    const nextIndex = filteredConversations.findIndex((conversation) => conversation.id === id);
    setSelectedIndex(nextIndex >= 0 ? nextIndex : 0);
    setDeleteConfirmationId(null);
    setRenamingConversationId(null);
    dispatch({ type: "SET_STATUS", payload: "Created new conversation" });
  };

  const cycleModel = () => {
    if (state.availableModels.length === 0) return;
    const nextModel = getNextModel(state.currentModel, state.availableModels);
    dispatch({ type: "SET_MODEL", payload: nextModel });
    dispatch({ type: "SET_STATUS", payload: `Model set to ${nextModel}` });
  };

  useKeyboard((event) => {
    if (!isFocused || state.isCommandPaletteOpen) {
      return;
    }

    if (deleteConfirmationId) {
      if (event.name === "y" || event.sequence?.toLowerCase() === "y") {
        conversations.deleteConversation(deleteConfirmationId);
        setDeleteConfirmationId(null);
        dispatch({ type: "SET_STATUS", payload: "Conversation deleted" });
        return;
      }

      if (event.name === "n" || event.sequence?.toLowerCase() === "n" || isEscapeKey(event.name)) {
        setDeleteConfirmationId(null);
        dispatch({ type: "SET_STATUS", payload: "Delete canceled" });
      }

      return;
    }

    if (renamingConversationId) {
      if (isEscapeKey(event.name)) {
        setRenamingConversationId(null);
        setRenameValue("");
        dispatch({ type: "SET_STATUS", payload: "Rename canceled" });
        return;
      }

      if (isEnterKey(event.name)) {
        conversations.renameConversation(renamingConversationId, renameValue);
        setRenamingConversationId(null);
        setRenameValue("");
        dispatch({ type: "SET_STATUS", payload: "Conversation renamed" });
      }

      return;
    }

    if (isUpKey(event.name)) {
      setSelectedIndex((current) => clampIndex(current - 1, filteredConversations.length));
      return;
    }

    if (isDownKey(event.name)) {
      setSelectedIndex((current) => clampIndex(current + 1, filteredConversations.length));
      return;
    }

    if (isEnterKey(event.name)) {
      if (selectedConversation) {
        conversations.switchConversation(selectedConversation.id);
        dispatch({ type: "SET_STATUS", payload: `Switched to ${selectedConversation.title}` });
      } else {
        createConversation();
      }
      return;
    }

    if (event.ctrl !== true && (event.name === "d" || event.sequence?.toLowerCase() === "d") && selectedConversation) {
      setDeleteConfirmationId(selectedConversation.id);
      dispatch({ type: "SET_STATUS", payload: `Delete ${selectedConversation.title}? (y/n)` });
      return;
    }

    if (event.ctrl !== true && (event.name === "r" || event.sequence?.toLowerCase() === "r") && selectedConversation) {
      setRenamingConversationId(selectedConversation.id);
      setRenameValue(selectedConversation.title);
      dispatch({ type: "SET_STATUS", payload: `Renaming ${selectedConversation.title}` });
      return;
    }

    if (event.ctrl !== true && (event.name === "m" || event.sequence?.toLowerCase() === "m")) {
      cycleModel();
    }
  });

  return (
    <Box
      style={{
        width: 28,
        border: true,
        borderColor,
        padding: 1,
        flexDirection: "column",
      }}
    >
      <Text content={`Conversations (${conversations.conversations.length})`} />
      <Input
        focused={isFocused && !renamingConversationId && !deleteConfirmationId}
        placeholder="Search..."
        value={conversations.filter}
        onInput={(value) => {
          conversations.setFilter(normalizeInputValue(value));
        }}
      />

      <Box
        style={{
          border: true,
          borderColor: tokens["border.subtle"],
          paddingLeft: 1,
          paddingRight: 1,
          marginTop: 1,
          marginBottom: 1,
        }}
      >
        <Text content="+ New Chat (Ctrl+N)" style={{ color: tokens["status.success"] }} />
      </Box>

      {deleteConfirmationId ? (
        <Box
          style={{
            border: true,
            borderColor: tokens["status.error"],
            paddingLeft: 1,
            paddingRight: 1,
            marginBottom: 1,
            flexDirection: "column",
          }}
        >
          <Text content="Delete selected chat?" style={{ color: tokens["status.error"] }} />
          <Text content="Press Y to confirm, N to cancel" style={{ color: tokens["text.secondary"] }} />
        </Box>
      ) : null}

      {renamingConversationId ? (
        <Box
          style={{
            border: true,
            borderColor: tokens["status.warning"],
            marginBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <Text content="Rename (Enter/Esc)" style={{ color: tokens["status.warning"] }} />
          <Input
            focused={isFocused}
            value={renameValue}
            onInput={(value) => {
              setRenameValue(normalizeInputValue(value));
            }}
          />
        </Box>
      ) : null}

      <ConversationList
        conversations={filteredConversations}
        activeConversationId={conversations.activeId}
        selectedConversationId={selectedConversation?.id ?? null}
        onSelect={(conversationId) => {
          const index = filteredConversations.findIndex((conversation) => conversation.id === conversationId);
          setSelectedIndex(index);
        }}
        onActivate={(conversationId) => {
          conversations.switchConversation(conversationId);
        }}
      />

      <Box style={{ marginTop: 1 }}>
        <ModelSelector currentModel={state.currentModel} availableModels={state.availableModels} onCycleModel={cycleModel} />
      </Box>

      <Text
        content={
          isFocused
            ? "Arrows: select  Enter: open/new  R: rename  D: delete"
            : "Press Tab or Ctrl+1 to focus sidebar"
        }
        style={{ color: tokens["text.muted"] }}
      />
    </Box>
  );
}
