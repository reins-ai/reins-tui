import type { Conversation, ConversationSummary, MessageRole } from "@reins/core";

import type { LayoutMode, PanelState } from "../state/layout-mode";
import { DEFAULT_PANEL_STATE } from "../state/layout-mode";
import type { ConversationLifecycleStatus } from "../state/status-machine";

export type FocusedPanel = "sidebar" | "conversation" | "input";

export interface DisplayToolCall {
  id: string;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  args?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface DisplayContentBlock {
  type: "text" | "tool-call";
  toolCallId?: string;
  text?: string;
}

export interface DisplayMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: DisplayToolCall[];
  contentBlocks?: DisplayContentBlock[];
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
  activeToolName: string | null;
  isCommandPaletteOpen: boolean;
  isConnectFlowOpen: boolean;
  isModelSelectorOpen: boolean;
  currentModel: string;
  currentProvider: string;
  availableModels: string[];
  status: string;
  focusedPanel: FocusedPanel;
  layoutMode: LayoutMode;
  panels: PanelState;
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
  activeToolName: null,
  isCommandPaletteOpen: false,
  isConnectFlowOpen: false,
  isModelSelectorOpen: false,
  currentModel: "default",
  currentProvider: "",
  availableModels: [],
  status: "Ready",
  focusedPanel: "conversation",
  layoutMode: "zen",
  panels: DEFAULT_PANEL_STATE,
};
