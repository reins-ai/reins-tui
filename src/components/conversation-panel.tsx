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
    args: dtc.args,
    error: dtc.isError && dtc.result ? dtc.result : undefined,
    result: !dtc.isError && dtc.result ? dtc.result : undefined,
  };
}

function ExchangeSeparator() {
  const { tokens } = useThemeTokens();

  return (
    <Box style={{ flexDirection: "row", marginTop: 1, marginBottom: 1 }}>
      <Text style={{ color: tokens["border.subtle"] }}>{EXCHANGE_SEPARATOR}</Text>
    </Box>
  );
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
          messages.map((message, index) => (
            <Box key={message.id} style={{ flexDirection: "column" }}>
              {shouldShowSeparator(messages, index) ? <ExchangeSeparator /> : null}
              <Message message={message} lifecycleStatus={message.isStreaming ? lifecycleStatus : undefined} />
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
