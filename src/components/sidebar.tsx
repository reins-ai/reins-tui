import { useMemo } from "react";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import { useConversations } from "../hooks";
import { formatRelativeTime } from "../lib";
import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";
import { formatModelDisplayName } from "./model-selector";

// --- Sidebar target width ---

export const SIDEBAR_CONTEXT_WIDTH = 40;

// --- Context section types ---

export type ConnectionHealth = "connected" | "degraded" | "offline";

export interface ContextSectionData {
  label: string;
  glyph: string;
  items: readonly ContextItem[];
}

export interface ContextItem {
  key: string;
  value: string;
  color?: "primary" | "secondary" | "muted" | "success" | "warning" | "error";
}

// --- Pure utility functions (testable) ---

export function resolveConnectionHealth(status: DaemonConnectionStatus): ConnectionHealth {
  switch (status) {
    case "connected":
      return "connected";
    case "connecting":
    case "reconnecting":
      return "degraded";
    case "disconnected":
      return "offline";
  }
}

export function getContextConnectionGlyph(health: ConnectionHealth): string {
  switch (health) {
    case "connected":
      return "●";
    case "degraded":
      return "◐";
    case "offline":
      return "○";
  }
}

export function getContextConnectionLabel(health: ConnectionHealth): string {
  switch (health) {
    case "connected":
      return "Connected";
    case "degraded":
      return "Connecting…";
    case "offline":
      return "Offline";
  }
}

export function getContextConnectionColor(health: ConnectionHealth): ContextItem["color"] {
  switch (health) {
    case "connected":
      return "success";
    case "degraded":
      return "warning";
    case "offline":
      return "error";
  }
}

export function buildModelSection(
  currentModel: string,
  currentProvider: string,
  availableModels: readonly string[],
): ContextSectionData {
  const displayName = formatModelDisplayName(currentModel);
  const items: ContextItem[] = [
    {
      key: "Model",
      value: availableModels.length > 0 ? displayName : "No models",
      color: availableModels.length > 0 ? "primary" : "muted",
    },
  ];

  if (currentProvider) {
    items.push({
      key: "Provider",
      value: currentProvider,
      color: "secondary",
    });
  }

  items.push({
    key: "Available",
    value: `${availableModels.length} model${availableModels.length !== 1 ? "s" : ""}`,
    color: "muted",
  });

  return {
    label: "Model",
    glyph: "◆",
    items,
  };
}

export function buildConnectionSection(
  connectionStatus: DaemonConnectionStatus,
): ContextSectionData {
  const health = resolveConnectionHealth(connectionStatus);
  const glyph = getContextConnectionGlyph(health);
  const label = getContextConnectionLabel(health);
  const color = getContextConnectionColor(health);

  return {
    label: "Connection",
    glyph,
    items: [
      { key: "Daemon", value: label, color },
    ],
  };
}

export function buildConversationSection(
  conversationCount: number,
  activeTitle: string | null,
  lastMessageAt: Date | null,
): ContextSectionData {
  const items: ContextItem[] = [
    {
      key: "Total",
      value: `${conversationCount} conversation${conversationCount !== 1 ? "s" : ""}`,
      color: "muted",
    },
  ];

  if (activeTitle) {
    items.unshift({
      key: "Active",
      value: truncateContextValue(activeTitle, 24),
      color: "primary",
    });
  }

  if (lastMessageAt) {
    items.push({
      key: "Last msg",
      value: formatRelativeTime(lastMessageAt),
      color: "muted",
    });
  }

  return {
    label: "Conversations",
    glyph: "◇",
    items,
  };
}

export function buildSessionSection(
  lifecycleStatus: string,
  messageCount: number,
): ContextSectionData {
  const statusDisplay = lifecycleStatus === "idle"
    ? "Ready"
    : lifecycleStatus.charAt(0).toUpperCase() + lifecycleStatus.slice(1);

  const statusColor: ContextItem["color"] = lifecycleStatus === "error"
    ? "error"
    : lifecycleStatus === "streaming" || lifecycleStatus === "thinking"
      ? "warning"
      : "muted";

  return {
    label: "Session",
    glyph: "⚡",
    items: [
      { key: "Status", value: statusDisplay, color: statusColor },
      {
        key: "Messages",
        value: `${messageCount} in thread`,
        color: "muted",
      },
    ],
  };
}

export function truncateContextValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

// --- Token color resolution ---

function resolveItemColor(
  color: ContextItem["color"],
  tokens: Record<string, string>,
): string {
  switch (color) {
    case "primary":
      return tokens["text.primary"];
    case "secondary":
      return tokens["text.secondary"];
    case "success":
      return tokens["status.success"];
    case "warning":
      return tokens["status.warning"];
    case "error":
      return tokens["status.error"];
    case "muted":
    default:
      return tokens["text.muted"];
  }
}

// --- Component props ---

export interface SidebarProps {
  isFocused: boolean;
  borderColor?: string;
  connectionStatus?: DaemonConnectionStatus;
}

export interface SidebarContentProps {
  isFocused: boolean;
  connectionStatus?: DaemonConnectionStatus;
}

// --- Section renderer ---

interface ContextSectionProps {
  section: ContextSectionData;
  tokens: Record<string, string>;
}

function ContextSection({ section, tokens }: ContextSectionProps) {
  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 0 }}>
        <Text
          content={`${section.glyph} `}
          style={{ color: tokens["accent.primary"] }}
        />
        <Text
          content={section.label}
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>
      {section.items.map((item, index) => (
        <Box key={`${item.key}-${index}`} style={{ flexDirection: "row", paddingLeft: 2 }}>
          <Text
            content={`${item.key}: `}
            style={{ color: tokens["text.muted"] }}
          />
          <Text
            content={item.value}
            style={{ color: resolveItemColor(item.color, tokens) }}
          />
        </Box>
      ))}
    </Box>
  );
}

// --- Main components ---

/**
 * Sidebar renders as a contextual information panel showing
 * model/provider info, connection health, session state, and
 * conversation summary. Conversation management is accessible
 * via the command palette (Ctrl+K) or drawer panel (Ctrl+1).
 */
export function Sidebar({ isFocused, borderColor, connectionStatus = "disconnected" }: SidebarProps) {
  return (
    <Box
      style={{
        width: SIDEBAR_CONTEXT_WIDTH,
        border: true,
        borderColor,
        padding: 1,
        flexDirection: "column",
      }}
    >
      <SidebarContent isFocused={isFocused} connectionStatus={connectionStatus} />
    </Box>
  );
}

/**
 * SidebarContent renders the contextual panel internals without
 * the outer border/width container. Designed to be placed inside
 * a DrawerPanel for the summoned panel layout.
 *
 * Shows at-a-glance operational context:
 * - Model and provider info
 * - Daemon connection health
 * - Session lifecycle state
 * - Conversation summary with active thread
 * - Keyboard hints for navigation
 */
export function SidebarContent({ isFocused, connectionStatus = "disconnected" }: SidebarContentProps) {
  const { state } = useApp();
  const { tokens } = useThemeTokens();
  const conversations = useConversations();

  const activeConversation = useMemo(() => {
    if (!conversations.activeId) return null;
    return conversations.conversations.find(
      (c) => c.id === conversations.activeId,
    ) ?? null;
  }, [conversations.activeId, conversations.conversations]);

  const modelSection = useMemo(
    () => buildModelSection(state.currentModel, state.currentProvider, state.availableModels),
    [state.currentModel, state.currentProvider, state.availableModels],
  );

  const connectionSection = useMemo(
    () => buildConnectionSection(connectionStatus),
    [connectionStatus],
  );

  const sessionSection = useMemo(
    () => buildSessionSection(state.streamingLifecycleStatus, state.messages.length),
    [state.streamingLifecycleStatus, state.messages.length],
  );

  const conversationSection = useMemo(
    () => buildConversationSection(
      conversations.conversations.length,
      activeConversation?.title ?? null,
      activeConversation?.lastMessageAt ?? null,
    ),
    [conversations.conversations.length, activeConversation],
  );

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Text
        content="Context"
        style={{ color: tokens["text.primary"], marginBottom: 1 }}
      />

      <ContextSection section={modelSection} tokens={tokens} />
      <ContextSection section={connectionSection} tokens={tokens} />
      <ContextSection section={sessionSection} tokens={tokens} />
      <ContextSection section={conversationSection} tokens={tokens} />

      <Box style={{ marginTop: 1 }}>
        <Text
          content={
            isFocused
              ? "Ctrl+K: palette  Ctrl+M: model"
              : "Ctrl+1 to focus"
          }
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
