import { createContext, useContext } from "react";

import {
  reduceLayoutMode,
  getLayoutVisibility,
  reducePanelState,
  deriveLayoutMode,
  type LayoutModeAction,
  type LayoutMode,
  type LayoutAction,
} from "../state/layout-mode";
import type { StreamToolCall, TurnContentBlock } from "../state/streaming-state";
import type { AppState, DisplayContentBlock, DisplayMessage, DisplayToolCall, DisplayToolCallStatus, FocusedPanel } from "./types";
import { DEFAULT_STATE } from "./types";

function isFocusedPanel(value: unknown): value is FocusedPanel {
  return value === "sidebar" || value === "conversation" || value === "input";
}

function getAvailablePanels(layoutMode: LayoutMode): FocusedPanel[] {
  const visibility = getLayoutVisibility(layoutMode);
  const panels: FocusedPanel[] = [];
  if (visibility.showSidebar) panels.push("sidebar");
  if (visibility.showConversation) panels.push("conversation");
  panels.push("input");
  return panels;
}

function getNextFocusedPanel(current: FocusedPanel, layoutMode: LayoutMode = "normal"): FocusedPanel {
  const available = getAvailablePanels(layoutMode);
  const currentIndex = available.indexOf(current);
  if (currentIndex === -1) {
    return available[0];
  }

  const nextIndex = (currentIndex + 1) % available.length;
  return available[nextIndex];
}

function getPreviousFocusedPanel(current: FocusedPanel, layoutMode: LayoutMode = "normal"): FocusedPanel {
  const available = getAvailablePanels(layoutMode);
  const currentIndex = available.indexOf(current);
  if (currentIndex === -1) {
    return available[available.length - 1];
  }

  const previousIndex = (currentIndex - 1 + available.length) % available.length;
  return available[previousIndex];
}

export type AppAction =
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_CONVERSATIONS"; payload: AppState["conversations"] }
  | { type: "ADD_CONVERSATION"; payload: AppState["conversations"][number] }
  | { type: "REMOVE_CONVERSATION"; payload: string }
  | { type: "RENAME_CONVERSATION"; payload: { id: string; title: string } }
  | { type: "SET_ACTIVE_CONVERSATION"; payload: string | null }
  | { type: "SET_CONVERSATION_FILTER"; payload: string }
  | { type: "SET_FOCUSED_PANEL"; payload: FocusedPanel }
  | { type: "FOCUS_NEXT" }
  | { type: "FOCUS_PREV" }
  | { type: "SET_STREAMING"; payload: boolean }
  | { type: "SET_STREAMING_LIFECYCLE_STATUS"; payload: AppState["streamingLifecycleStatus"] }
  | { type: "SET_ACTIVE_TOOL_NAME"; payload: string | null }
  | { type: "SET_COMMAND_PALETTE_OPEN"; payload: boolean }
  | { type: "SET_CONNECT_FLOW_OPEN"; payload: boolean }
  | { type: "SET_MODEL_SELECTOR_OPEN"; payload: boolean }
  | { type: "SET_MODEL"; payload: string }
  | { type: "SET_PROVIDER"; payload: string }
  | { type: "SET_AVAILABLE_MODELS"; payload: string[] }
  | { type: "ADD_MESSAGE"; payload: DisplayMessage }
  | { type: "SET_MESSAGES"; payload: DisplayMessage[] }
  | { type: "APPEND_TOKEN"; payload: { messageId: string; token: string } }
  | {
      type: "SET_TOOL_CALL_STATUS";
      payload: {
        messageId: string;
        toolCallId: string;
        status: DisplayToolCall["status"];
        result?: string;
        isError?: boolean;
      };
    }
  | { type: "FINISH_STREAMING"; payload: { messageId: string } }
  | {
      type: "SYNC_TOOL_TURN";
      payload: {
        messageId: string;
        toolCalls: StreamToolCall[];
        contentBlocks: TurnContentBlock[];
      };
    }
  | { type: "CLEAR_MESSAGES" }
  | LayoutModeAction
  | LayoutAction;

function streamToolCallsToDisplay(toolCalls: StreamToolCall[]): DisplayToolCall[] {
  return [...toolCalls]
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((tc) => ({
      id: tc.id,
      name: tc.name,
      status: tc.status === "running" ? "running" as const
        : tc.status === "error" ? "error" as const
        : "complete" as const,
      args: tc.args,
      result: tc.result,
      isError: tc.status === "error",
    }));
}

function turnBlocksToDisplay(blocks: TurnContentBlock[]): DisplayContentBlock[] {
  return blocks.map((block) => ({
    type: block.type,
    toolCallId: block.toolCallId,
    text: block.text,
  }));
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_STATUS":
      return typeof action.payload === "string" ? { ...state, status: action.payload } : state;
    case "SET_CONVERSATIONS":
      return {
        ...state,
        conversations: action.payload,
      };
    case "ADD_CONVERSATION":
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      };
    case "REMOVE_CONVERSATION": {
      const nextConversations = state.conversations.filter((conversation) => conversation.id !== action.payload);
      const activeConversationId =
        state.activeConversationId === action.payload ? null : state.activeConversationId;

      return {
        ...state,
        conversations: nextConversations,
        activeConversationId,
      };
    }
    case "RENAME_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.map((conversation) =>
          conversation.id === action.payload.id ? { ...conversation, title: action.payload.title } : conversation,
        ),
      };
    case "SET_ACTIVE_CONVERSATION":
      return {
        ...state,
        activeConversationId: action.payload,
      };
    case "SET_CONVERSATION_FILTER":
      return {
        ...state,
        conversationFilter: action.payload,
      };
    case "SET_FOCUSED_PANEL":
      return isFocusedPanel(action.payload) ? { ...state, focusedPanel: action.payload } : state;
    case "FOCUS_NEXT":
      return {
        ...state,
        focusedPanel: getNextFocusedPanel(state.focusedPanel, state.layoutMode),
      };
    case "FOCUS_PREV":
      return {
        ...state,
        focusedPanel: getPreviousFocusedPanel(state.focusedPanel, state.layoutMode),
      };
    case "SET_STREAMING":
      return typeof action.payload === "boolean"
        ? { ...state, isStreaming: action.payload }
        : state;
    case "SET_STREAMING_LIFECYCLE_STATUS":
      return {
        ...state,
        streamingLifecycleStatus: action.payload,
      };
    case "SET_ACTIVE_TOOL_NAME":
      return {
        ...state,
        activeToolName: action.payload,
      };
    case "SET_COMMAND_PALETTE_OPEN":
      return typeof action.payload === "boolean"
        ? { ...state, isCommandPaletteOpen: action.payload }
        : state;
    case "SET_CONNECT_FLOW_OPEN":
      return typeof action.payload === "boolean"
        ? { ...state, isConnectFlowOpen: action.payload }
        : state;
    case "SET_MODEL_SELECTOR_OPEN":
      return typeof action.payload === "boolean"
        ? { ...state, isModelSelectorOpen: action.payload }
        : state;
    case "SET_MODEL":
      return typeof action.payload === "string"
        ? { ...state, currentModel: action.payload }
        : state;
    case "SET_PROVIDER":
      return typeof action.payload === "string"
        ? { ...state, currentProvider: action.payload }
        : state;
    case "SET_AVAILABLE_MODELS":
      return Array.isArray(action.payload)
        ? { ...state, availableModels: action.payload }
        : state;
    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
        streamingMessageId: action.payload.isStreaming ? action.payload.id : state.streamingMessageId,
      };
    case "SET_MESSAGES": {
      const streamingMessage = action.payload.find((message) => message.isStreaming);
      return {
        ...state,
        messages: action.payload,
        streamingMessageId: streamingMessage?.id ?? null,
      };
    }
    case "APPEND_TOKEN": {
      const { messageId, token } = action.payload;
      const messageIndex = state.messages.findIndex((message) => message.id === messageId);

      if (messageIndex === -1 || token.length === 0) {
        return state;
      }

      const nextMessages = [...state.messages];
      const currentMessage = nextMessages[messageIndex];

      nextMessages[messageIndex] = {
        ...currentMessage,
        content: `${currentMessage.content}${token}`,
      };

      return {
        ...state,
        messages: nextMessages,
      };
    }
    case "SET_TOOL_CALL_STATUS": {
      const { messageId, toolCallId, status, result, isError } = action.payload;
      const messageIndex = state.messages.findIndex((message) => message.id === messageId);

      if (messageIndex === -1) {
        return state;
      }

      const message = state.messages[messageIndex];
      if (!message.toolCalls || message.toolCalls.length === 0) {
        return state;
      }

      const toolCallIndex = message.toolCalls.findIndex((toolCall) => toolCall.id === toolCallId);
      if (toolCallIndex === -1) {
        return state;
      }

      const nextToolCalls = [...message.toolCalls];
      const currentToolCall = nextToolCalls[toolCallIndex];

      nextToolCalls[toolCallIndex] = {
        ...currentToolCall,
        status,
        result: result ?? currentToolCall.result,
        isError: isError ?? currentToolCall.isError,
      };

      const nextMessages = [...state.messages];
      nextMessages[messageIndex] = {
        ...message,
        toolCalls: nextToolCalls,
      };

      return {
        ...state,
        messages: nextMessages,
      };
    }
    case "SYNC_TOOL_TURN": {
      const { messageId, toolCalls, contentBlocks } = action.payload;
      const messageIndex = state.messages.findIndex((message) => message.id === messageId);

      if (messageIndex === -1) {
        return state;
      }

      const nextMessages = [...state.messages];
      const currentMessage = nextMessages[messageIndex];

      nextMessages[messageIndex] = {
        ...currentMessage,
        toolCalls: streamToolCallsToDisplay(toolCalls),
        contentBlocks: turnBlocksToDisplay(contentBlocks),
      };

      return {
        ...state,
        messages: nextMessages,
      };
    }
    case "FINISH_STREAMING": {
      const { messageId } = action.payload;
      const messageIndex = state.messages.findIndex((message) => message.id === messageId);

      if (messageIndex === -1) {
        return state;
      }

      const nextMessages = [...state.messages];
      const currentMessage = nextMessages[messageIndex];

      nextMessages[messageIndex] = {
        ...currentMessage,
        isStreaming: false,
      };

      return {
        ...state,
        messages: nextMessages,
        streamingMessageId: state.streamingMessageId === messageId ? null : state.streamingMessageId,
        isStreaming: false,
      };
    }
    case "CLEAR_MESSAGES":
      return {
        ...state,
        messages: [],
        streamingMessageId: null,
        isStreaming: false,
      };
    case "TOGGLE_PANEL":
    case "DISMISS_PANEL":
    case "PIN_PANEL":
    case "UNPIN_PANEL":
    case "DISMISS_ALL":
    case "DISMISS_TOPMOST": {
      const nextPanels = reducePanelState(state.panels, action as LayoutAction);
      if (nextPanels === state.panels) {
        return state;
      }
      const nextLayoutMode = deriveLayoutMode(nextPanels);
      const nextFocusedPanel =
        nextLayoutMode === "zen" && state.focusedPanel === "sidebar"
          ? "conversation"
          : state.focusedPanel;
      return {
        ...state,
        panels: nextPanels,
        layoutMode: nextLayoutMode,
        focusedPanel: nextFocusedPanel,
      };
    }
    case "TOGGLE_ACTIVITY":
    case "TOGGLE_ZEN":
    case "SET_LAYOUT_MODE": {
      const nextLayoutMode = reduceLayoutMode(state.layoutMode, action);
      if (nextLayoutMode === state.layoutMode) {
        return state;
      }

      return {
        ...state,
        layoutMode: nextLayoutMode,
        focusedPanel: nextLayoutMode === "zen" && state.focusedPanel === "sidebar" ? "conversation" : state.focusedPanel,
      };
    }
    default:
      return state;
  }
}

export interface AppContextValue {
  state: AppState;
  dispatch: (action: AppAction) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useApp must be used within an AppContext provider");
  }

  return context;
}

export { DEFAULT_STATE };
export type { AppState, DisplayContentBlock, DisplayMessage, DisplayToolCall, DisplayToolCallStatus, FocusedPanel };
export type { LayoutMode, PanelId, PanelState } from "../state/layout-mode";
export { getLayoutVisibility, getLayoutModeLabel } from "../state/layout-mode";
