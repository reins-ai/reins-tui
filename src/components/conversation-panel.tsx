import { useReducer } from "react";

import type { DisplayMessage, DisplayToolCall } from "../store";
import { useApp } from "../store";
import { useConversation } from "../hooks";
import { useThemeTokens } from "../theme";
import type { ToolCall, ToolCallStatus } from "../tools/tool-lifecycle";
import { createInitialToolDetailState, toolDetailReducer } from "../tools/tool-detail-store";
import { Box, ScrollBox, Text } from "../ui";
import { LogoAscii } from "./logo-ascii";
import { Message } from "./message";
import { formatModelDisplayName } from "./model-selector";
import { ToolInline } from "./tool-inline";

/**
 * Determine whether a message starts a new exchange turn.
 * An exchange boundary occurs when a user message follows an assistant
 * or tool message, indicating the start of a new conversational turn.
 * Used to apply additional spacing between exchanges.
 */
export function isExchangeBoundary(messages: readonly DisplayMessage[], index: number): boolean {
  if (index === 0) return false;

  const current = messages[index];
  const previous = messages[index - 1];

  if (current.role === "user" && (previous.role === "assistant" || previous.role === "tool")) {
    return true;
  }

  return false;
}

/** Spacing (in lines) between messages within the same exchange. */
export const MESSAGE_GAP = 1;

/** Additional spacing (in lines) at exchange boundaries between turns. */
export const EXCHANGE_GAP = 2;

export interface ConversationPanelProps {
  isFocused: boolean;
  borderColor: string;
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
    args: dtc.args,
    error: dtc.isError && dtc.result ? dtc.result : undefined,
    result: !dtc.isError && dtc.result ? dtc.result : undefined,
  };
}

interface InlineToolCallsProps {
  toolCalls: DisplayToolCall[];
}

function InlineToolCalls({ toolCalls }: InlineToolCallsProps) {
  const [detailState] = useReducer(toolDetailReducer, createInitialToolDetailState());

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
          />
        );
      })}
    </>
  );
}

export function ConversationPanel({ isFocused, borderColor }: ConversationPanelProps) {
  const { messages, isStreaming, lifecycleStatus } = useConversation();
  const { state } = useApp();
  const { tokens } = useThemeTokens();
  const hasContent = messages.some(
    (message) => message.content.trim().length > 0 || (message.toolCalls && message.toolCalls.length > 0),
  );

  const modelDisplay = state.currentModel !== "default"
    ? formatModelDisplayName(state.currentModel)
    : null;

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
      {modelDisplay ? (
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text
            content="✦ "
            style={{ color: tokens["accent.primary"] }}
          />
          <Text
            content={modelDisplay}
            style={{ color: tokens["text.secondary"] }}
          />
          <Text
            content="  Ctrl+M to switch"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
      <ScrollBox style={{ flexGrow: 1, flexDirection: "column" }} stickyScroll={true} stickyStart="bottom">
        {messages.length === 0 ? (
          <Box style={{ flexDirection: "column", paddingTop: 2 }}>
            <LogoAscii variant="standard" size="full" showTagline />
            <Text style={{ color: tokens["text.muted"], marginTop: 1 }}>
              {isFocused ? "Type a message to begin" : "Press Tab to focus conversation"}
            </Text>
          </Box>
        ) : (
          messages.map((message, index) => {
            const gap = isExchangeBoundary(messages, index)
              ? EXCHANGE_GAP
              : index > 0
                ? MESSAGE_GAP
                : 0;

            return (
              <Box key={message.id} style={{ flexDirection: "column", marginTop: gap }}>
                <Message message={message} lifecycleStatus={message.isStreaming ? lifecycleStatus : undefined} />
                {message.toolCalls && message.toolCalls.length > 0 ? (
                  <InlineToolCalls toolCalls={message.toolCalls} />
                ) : null}
              </Box>
            );
          })
        )}

        {isStreaming && !hasContent ? <Text style={{ color: tokens["text.secondary"] }}>Generating response...</Text> : null}
      </ScrollBox>
    </Box>
  );
}
