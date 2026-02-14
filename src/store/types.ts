import type { Conversation, ConversationSummary, MessageRole } from "@reins/core";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import type { LayoutMode, PanelState } from "../state/layout-mode";
import { DEFAULT_PANEL_STATE } from "../state/layout-mode";
import type { ConversationLifecycleStatus } from "../state/status-machine";

export type FocusedPanel = "sidebar" | "conversation" | "input";

// --- Status segment data model ---

/**
 * Identifies a status bar segment. Ordered by display priority (highest first):
 *   connection → model → lifecycle → hints
 *
 * Connection and model are critical — they survive all truncation levels.
 * Lifecycle provides streaming/tool context. Hints are first to drop.
 */
export type StatusSegmentId = "connection" | "model" | "lifecycle" | "hints";

/**
 * Priority levels for status segments. Lower number = higher priority
 * (survives longer as width shrinks).
 */
export const STATUS_SEGMENT_PRIORITY: Record<StatusSegmentId, number> = {
  connection: 1,
  model: 2,
  lifecycle: 3,
  hints: 4,
} as const;

/**
 * All segment IDs in priority order (highest priority first).
 */
export const STATUS_SEGMENT_ORDER: readonly StatusSegmentId[] = [
  "connection",
  "model",
  "lifecycle",
  "hints",
] as const;

/**
 * A single status bar segment with its content and display metadata.
 */
export interface StatusSegment {
  id: StatusSegmentId;
  priority: number;
  content: string;
  glyph: string;
  colorToken: string;
  minWidth: number;
  visible: boolean;
}

/**
 * Width thresholds at which segments begin to drop.
 * Below each threshold, the corresponding segment is hidden.
 */
export const SEGMENT_DROP_THRESHOLDS: Record<StatusSegmentId, number> = {
  hints: 80,
  lifecycle: 50,
  model: 30,
  connection: 0,
} as const;

/**
 * Resolved set of status segments with layout metadata.
 */
export interface StatusSegmentSet {
  segments: StatusSegment[];
  visibleSegments: StatusSegment[];
  totalWidth: number;
  availableWidth: number;
}

/**
 * Input sources for deriving status segments.
 * Reuses existing state fields — no daemon contract changes.
 */
export interface StatusSegmentSources {
  connectionStatus: DaemonConnectionStatus;
  currentModel: string;
  lifecycleStatus: ConversationLifecycleStatus;
  activeToolName: string | null;
  tokenCount: number;
  cost: string | null;
  compactionActive: boolean;
  terminalWidth: number;
}

export type DisplayToolCallStatus = "pending" | "running" | "complete" | "error";

export interface DisplayToolCall {
  id: string;
  name: string;
  status: DisplayToolCallStatus;
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
  expandedToolCalls: Set<string>;
  isCommandPaletteOpen: boolean;
  isConnectFlowOpen: boolean;
  isEmbeddingSetupOpen: boolean;
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
  expandedToolCalls: new Set<string>(),
  isCommandPaletteOpen: false,
  isConnectFlowOpen: false,
  isEmbeddingSetupOpen: false,
  isModelSelectorOpen: false,
  currentModel: "default",
  currentProvider: "",
  availableModels: [],
  status: "Ready",
  focusedPanel: "conversation",
  layoutMode: "zen",
  panels: DEFAULT_PANEL_STATE,
};
