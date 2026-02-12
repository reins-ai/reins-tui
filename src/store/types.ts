import type { Conversation, ConversationSummary, MessageRole } from "@reins/core";

import type { LayoutMode } from "../state/layout-mode";
import type { ConversationLifecycleStatus } from "../state/status-machine";

export type FocusedPanel = "sidebar" | "conversation" | "input";

export interface DisplayToolCall {
  id: string;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  result?: string;
  isError?: boolean;
}

export interface DisplayMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: DisplayToolCall[];
  isStreaming?: boolean;
  createdAt: Date;
}

export interface AppState {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  conversationFilter: string;
  messages: DisplayMessage[];
  streamingMessageId: string | null;
  isStreaming: boolean;
  streamingLifecycleStatus: ConversationLifecycleStatus;
  isCommandPaletteOpen: boolean;
  isConnectFlowOpen: boolean;
  currentModel: string;
  status: string;
  focusedPanel: FocusedPanel;
  layoutMode: LayoutMode;
}

export const DEFAULT_STATE: AppState = {
  conversations: [],
  activeConversationId: null,
  activeConversation: null,
  conversationFilter: "",
  messages: [],
  streamingMessageId: null,
  isStreaming: false,
  streamingLifecycleStatus: "idle",
  isCommandPaletteOpen: false,
  isConnectFlowOpen: false,
  currentModel: "default",
  status: "Ready",
  focusedPanel: "conversation",
  layoutMode: "normal",
};
