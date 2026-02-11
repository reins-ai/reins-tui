import { useConversation } from "../hooks";
import { useThemeTokens } from "../theme";
import { Box, ScrollBox, Text } from "../ui";
import { Message } from "./message";

export interface ConversationPanelProps {
  isFocused: boolean;
  borderColor: string;
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
          messages.map((message) => <Message key={message.id} message={message} />)
        )}

        {isStreaming && !hasContent ? <Text style={{ color: tokens["text.secondary"] }}>Generating response...</Text> : null}
      </ScrollBox>
    </Box>
  );
}
