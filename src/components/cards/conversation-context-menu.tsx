import { useCallback, useState } from "react";

import type { ConversationSummary } from "@reins/core";

import { useThemeTokens } from "../../theme";
import { Box, Input, Text, useKeyboard } from "../../ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextMenuAction = "open" | "rename" | "delete" | "archive";

export type ContextMenuMode =
  | { kind: "menu" }
  | { kind: "rename"; draft: string }
  | { kind: "delete-confirm" };

export interface ConversationContextMenuProps {
  conversation: ConversationSummary;
  mode: ContextMenuMode;
  onAction(action: ContextMenuAction): void;
  onRenameSubmit(newTitle: string): void;
  onCancel(): void;
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MenuView({
  onAction,
  onCancel,
}: {
  onAction(action: ContextMenuAction): void;
  onCancel(): void;
}) {
  const { tokens } = useThemeTokens();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items: { label: string; key: string; action: ContextMenuAction }[] = [
    { label: "[o] Open", key: "o", action: "open" },
    { label: "[r] Rename", key: "r", action: "rename" },
    { label: "[a] Archive", key: "a", action: "archive" },
    { label: "[d] Delete", key: "d", action: "delete" },
  ];

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (keyName === "escape") {
      onCancel();
      return;
    }

    if (keyName === "return") {
      onAction(items[selectedIndex].action);
      return;
    }

    if (keyName === "up" || sequence === "k") {
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }

    if (keyName === "down" || sequence === "j") {
      setSelectedIndex((prev) => (prev + 1) % items.length);
      return;
    }

    // Direct key shortcuts
    for (const item of items) {
      if (sequence === item.key) {
        onAction(item.action);
        return;
      }
    }
  });

  return (
    <Box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      <Text
        content="Actions"
        style={{ color: tokens["text.primary"], fontWeight: "bold" }}
      />
      {items.map((item, index) => (
        <Text
          key={item.key}
          content={`${index === selectedIndex ? "\u25B6 " : "  "}${item.label}`}
          style={{
            color: index === selectedIndex
              ? tokens["accent.primary"]
              : item.action === "delete"
                ? tokens["status.error"]
                : tokens["text.secondary"],
          }}
        />
      ))}
      <Text
        content="  [Esc] Cancel"
        style={{ color: tokens["text.muted"] }}
      />
    </Box>
  );
}

function RenameView({
  draft,
  onSubmit,
  onCancel,
}: {
  draft: string;
  onSubmit(newTitle: string): void;
  onCancel(): void;
}) {
  const { tokens } = useThemeTokens();
  const [value, setValue] = useState(draft);

  const handleInput = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const handleSubmit = useCallback(
    (submittedValue: string) => {
      const trimmed = submittedValue.trim();
      if (trimmed.length > 0) {
        onSubmit(trimmed);
      } else {
        onCancel();
      }
    },
    [onCancel, onSubmit],
  );

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    if (keyName === "escape") {
      onCancel();
    }
  });

  return (
    <Box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      <Text
        content="Rename conversation:"
        style={{ color: tokens["text.primary"] }}
      />
      <Input
        value={value}
        onInput={handleInput}
        onSubmit={handleSubmit}
        focused={true}
        placeholder="Enter new title..."
        style={{ width: "100%" }}
      />
      <Text
        content="Enter to save \u00B7 Esc to cancel"
        style={{ color: tokens["text.muted"] }}
      />
    </Box>
  );
}

function DeleteConfirmView({
  conversationTitle,
  onConfirm,
  onCancel,
}: {
  conversationTitle: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { tokens } = useThemeTokens();

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (keyName === "escape" || sequence === "n") {
      onCancel();
      return;
    }

    if (sequence === "y") {
      onConfirm();
    }
  });

  return (
    <Box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      <Text
        content={`Delete "${truncate(conversationTitle, 30)}"?`}
        style={{ color: tokens["status.error"] }}
      />
      <Text
        content="[y] Yes  [n] No"
        style={{ color: tokens["text.secondary"] }}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConversationContextMenu({
  conversation,
  mode,
  onAction,
  onRenameSubmit,
  onCancel,
}: ConversationContextMenuProps) {
  switch (mode.kind) {
    case "menu":
      return <MenuView onAction={onAction} onCancel={onCancel} />;
    case "rename":
      return (
        <RenameView
          draft={mode.draft}
          onSubmit={onRenameSubmit}
          onCancel={onCancel}
        />
      );
    case "delete-confirm":
      return (
        <DeleteConfirmView
          conversationTitle={conversation.title}
          onConfirm={() => onAction("delete")}
          onCancel={onCancel}
        />
      );
  }
}
