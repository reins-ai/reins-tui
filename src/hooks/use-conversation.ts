import type { MessageRole } from "@reins/core";

import type { DisplayMessage, DisplayToolCall } from "../store";
import { useApp } from "../store";

function createMessageId(): string {
  return crypto.randomUUID();
}

function createMessage(role: MessageRole, content: string, isStreaming = false): DisplayMessage {
  return {
    id: createMessageId(),
    role,
    content,
    isStreaming,
    createdAt: new Date(),
  };
}

export function useConversation() {
  const { state, dispatch } = useApp();

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    lifecycleStatus: state.streamingLifecycleStatus,

    addUserMessage(content: string): string {
      const message = createMessage("user", content);
      dispatch({ type: "ADD_MESSAGE", payload: message });
      return message.id;
    },

    startAssistantMessage(): string {
      const message = createMessage("assistant", "", true);
      dispatch({ type: "ADD_MESSAGE", payload: message });
      dispatch({ type: "SET_STREAMING", payload: true });
      return message.id;
    },

    appendToken(messageId: string, token: string): void {
      dispatch({ type: "APPEND_TOKEN", payload: { messageId, token } });
    },

    finishStreaming(messageId: string): void {
      dispatch({ type: "FINISH_STREAMING", payload: { messageId } });
      dispatch({ type: "SET_STREAMING", payload: false });
    },

    updateToolCallStatus(payload: {
      messageId: string;
      toolCallId: string;
      status: DisplayToolCall["status"];
      result?: string;
      isError?: boolean;
    }): void {
      dispatch({ type: "SET_TOOL_CALL_STATUS", payload });
    },

    toggleToolExpand(toolCallId: string): void {
      dispatch({ type: "TOGGLE_TOOL_EXPAND", payload: { toolCallId } });
    },

    collapseAllTools(): void {
      dispatch({ type: "COLLAPSE_ALL_TOOLS" });
    },

    clearMessages(): void {
      dispatch({ type: "CLEAR_MESSAGES" });
    },
  };
}
