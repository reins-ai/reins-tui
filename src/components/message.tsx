import type { DisplayMessage, DisplayToolCall } from "../store";
import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import { Box, Text } from "../ui";
import { StreamingText } from "./streaming-text";

const TOOL_STATUS_ICONS: Record<DisplayToolCall["status"], string> = {
  pending: "⏳",
  running: "⚡",
  complete: "✓",
  error: "✗",
};

export function getRoleColor(role: DisplayMessage["role"], tokens: Readonly<ThemeTokens>): string {
  const mapping: Record<DisplayMessage["role"], string> = {
    user: tokens["glyph.user"],
    assistant: tokens["accent.primary"],
    system: tokens["text.muted"],
    tool: tokens["glyph.tool.running"],
  };
  return mapping[role];
}

export function getToolStatusIcon(status: DisplayToolCall["status"]): string {
  return TOOL_STATUS_ICONS[status];
}

interface ToolCallRowProps {
  toolCall: DisplayToolCall;
}

function ToolCallRow({ toolCall }: ToolCallRowProps) {
  const { tokens } = useThemeTokens();
  const icon = getToolStatusIcon(toolCall.status);
  const color = toolCall.status === "error" || toolCall.isError ? tokens["status.error"] : tokens["text.secondary"];

  return (
    <Box style={{ flexDirection: "column", marginTop: 1 }}>
      <Text style={{ color }}>{`${icon} ${toolCall.name} [${toolCall.status}]`}</Text>
      {toolCall.result ? <Text style={{ color: tokens["text.primary"] }}>{toolCall.result}</Text> : null}
    </Box>
  );
}

export interface MessageProps {
  message: DisplayMessage;
}

export function Message({ message }: MessageProps) {
  const { tokens } = useThemeTokens();
  const roleLabel = message.role.toUpperCase();
  const roleColor = getRoleColor(message.role, tokens);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      {isUser ? (
        <Box style={{ flexDirection: "row" }}>
          <Box style={{ flexGrow: 1 }} />
          <Text style={{ color: roleColor }}>{roleLabel}</Text>
        </Box>
      ) : (
        <Text style={{ color: roleColor }}>{roleLabel}</Text>
      )}

      {isUser ? (
        <Box style={{ flexDirection: "row" }}>
          <Box style={{ flexGrow: 1 }} />
          <Text style={{ color: tokens["conversation.user.text"] }}>{message.content}</Text>
        </Box>
      ) : isSystem ? (
        <Text style={{ color: roleColor }}>{`[${message.content}]`}</Text>
      ) : (
        <StreamingText content={message.content} isStreaming={message.isStreaming} />
      )}

      {message.toolCalls?.map((toolCall) => <ToolCallRow key={toolCall.id} toolCall={toolCall} />)}
    </Box>
  );
}
