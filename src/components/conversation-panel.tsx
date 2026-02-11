import type { DisplayMessage } from "../store";
import { useConversation } from "../hooks";
import { useThemeTokens } from "../theme";
import { Box, ScrollBox, Text } from "../ui";
import { Message } from "./message";

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

function ExchangeSeparator() {
  const { tokens } = useThemeTokens();

  return (
    <Box style={{ flexDirection: "row", justifyContent: "center", marginTop: 1, marginBottom: 1 }}>
      <Text style={{ color: tokens["border.subtle"] }}>{EXCHANGE_SEPARATOR}</Text>
    </Box>
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
            </Box>
          ))
        )}

        {isStreaming && !hasContent ? <Text style={{ color: tokens["text.secondary"] }}>Generating response...</Text> : null}
      </ScrollBox>
    </Box>
  );
}
