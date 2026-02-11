import { useReducer, useCallback } from "react";

import type { DisplayMessage, DisplayToolCall } from "../store";
import { useConversation } from "../hooks";
import { useThemeTokens } from "../theme";
import type { ToolCall, ToolCallStatus } from "../tools/tool-lifecycle";
import { createInitialToolDetailState, toolDetailReducer } from "../tools/tool-detail-store";
import { Box, ScrollBox, Text } from "../ui";
import { Message } from "./message";
import { ToolInline } from "./tool-inline";

export const EXCHANGE_SEPARATOR = "─ ─ ─";

export interface ConversationPanelProps {
  isFocused: boolean;
  borderColor: string;
}

/**
 * Determine whether a separator should appear before a message.
 * A separator marks the boundary between exchanges: it appears before
 * a user message that follows an assistant or tool message, creating
 * a gentle visual break between conversational turns.
 */
export function shouldShowSeparator(messages: readonly DisplayMessage[], index: number): boolean {
  if (index === 0) return false;

  const current = messages[index];
  const previous = messages[index - 1];

  if (current.role === "user" && (previous.role === "assistant" || previous.role === "tool")) {
    return true;
  }

  return false;
}

const DISPLAY_TO_LIFECYCLE_STATUS: Record<DisplayToolCall["status"], ToolCallStatus> = {
  pending: "queued",
  running: "running",
  complete: "success",
  error: "error",
};

export function displayToolCallToToolCall(dtc: DisplayToolCall): ToolCall {
  const status = DISPLAY_TO_LIFECYCLE_STATUS[dtc.status];
  return {
    id: dtc.id,
    toolName: dtc.name,
    status,
    error: dtc.isError && dtc.result ? dtc.result : undefined,
    result: !dtc.isError && dtc.result ? dtc.result : undefined,
  };
}

function ExchangeSeparator() {
  const { tokens } = useThemeTokens();

  return (
    <Box style={{ flexDirection: "row", justifyContent: "center", marginTop: 1, marginBottom: 1 }}>
      <Text style={{ color: tokens["border.subtle"] }}>{EXCHANGE_SEPARATOR}</Text>
    </Box>
  );
}

interface InlineToolCallsProps {
  toolCalls: DisplayToolCall[];
}

function InlineToolCalls({ toolCalls }: InlineToolCallsProps) {
  const [detailState, dispatch] = useReducer(toolDetailReducer, createInitialToolDetailState());

  const handleToggle = useCallback(
    (toolCallId: string) => {
      dispatch({ type: "toggle-collapse", toolCallId });
    },
    [],
  );

  return (
    <>
      {toolCalls.map((dtc) => {
        const call = displayToolCallToToolCall(dtc);
        const isCollapsed = detailState.collapsed.has(dtc.id);

        return (
          <ToolInline
            key={dtc.id}
            call={call}
            collapsed={isCollapsed}
            onToggle={() => handleToggle(dtc.id)}
          />
        );
      })}
    </>
  );
}

export function ConversationPanel({ isFocused, borderColor }: ConversationPanelProps) {
  const { messages, isStreaming } = useConversation();
  const { tokens } = useThemeTokens();
  const hasContent = messages.some(
    (message) => message.content.trim().length > 0 || (message.toolCalls && message.toolCalls.length > 0),
  );

  return (
    <Box
      style={{
        flexGrow: 1,
        border: true,
        borderColor,
        padding: 1,
        flexDirection: "column",
      }}
    >
      <ScrollBox style={{ flexGrow: 1, flexDirection: "column" }} stickyScroll={true} stickyStart="bottom">
        {messages.length === 0 ? (
          <Box style={{ flexDirection: "column" }}>
            <Text>Welcome to Reins TUI.</Text>
            <Text>{isFocused ? "Conversation panel focused" : "Press Tab to focus conversation"}</Text>
            <Text>Messages, streaming output, and tool status will appear here.</Text>
          </Box>
        ) : (
          messages.map((message, index) => (
            <Box key={message.id} style={{ flexDirection: "column" }}>
              {shouldShowSeparator(messages, index) ? <ExchangeSeparator /> : null}
              <Message message={message} />
              {message.toolCalls && message.toolCalls.length > 0 ? (
                <InlineToolCalls toolCalls={message.toolCalls} />
              ) : null}
            </Box>
          ))
        )}

        {isStreaming && !hasContent ? <Text style={{ color: tokens["text.secondary"] }}>Generating response...</Text> : null}
      </ScrollBox>
    </Box>
  );
}
