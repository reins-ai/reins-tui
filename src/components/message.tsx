import type { DisplayMessage, DisplayToolCall } from "../store";
import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import { Box, Text } from "../ui";
import { StreamingText } from "./streaming-text";

// Prose-style glyph vocabulary
export const GLYPH_REINS = "◆";
export const GLYPH_USER = "◇";
export const GLYPH_TOOL_RUNNING = "◎";
export const GLYPH_TOOL_DONE = "✦";
export const GLYPH_TOOL_ERROR = "✧";

const TOOL_GLYPH_MAP: Record<DisplayToolCall["status"], string> = {
  pending: GLYPH_TOOL_RUNNING,
  running: GLYPH_TOOL_RUNNING,
  complete: GLYPH_TOOL_DONE,
  error: GLYPH_TOOL_ERROR,
};

export function getRoleGlyph(role: DisplayMessage["role"]): string {
  switch (role) {
    case "assistant":
      return GLYPH_REINS;
    case "user":
      return GLYPH_USER;
    case "system":
      return GLYPH_REINS;
    case "tool":
      return GLYPH_TOOL_DONE;
  }
}

export function getRoleColor(role: DisplayMessage["role"], tokens: Readonly<ThemeTokens>): string {
  const mapping: Record<DisplayMessage["role"], string> = {
    user: tokens["glyph.user"],
    assistant: tokens["glyph.reins"],
    system: tokens["text.muted"],
    tool: tokens["glyph.tool.running"],
  };
  return mapping[role];
}

export function getToolGlyph(status: DisplayToolCall["status"]): string {
  return TOOL_GLYPH_MAP[status];
}

export function getToolGlyphColor(status: DisplayToolCall["status"], tokens: Readonly<ThemeTokens>): string {
  switch (status) {
    case "pending":
    case "running":
      return tokens["glyph.tool.running"];
    case "complete":
      return tokens["glyph.tool.done"];
    case "error":
      return tokens["glyph.tool.error"];
  }
}

interface ToolCallAnchorProps {
  toolCall: DisplayToolCall;
}

export function ToolCallAnchor({ toolCall }: ToolCallAnchorProps) {
  const { tokens } = useThemeTokens();
  const glyph = getToolGlyph(toolCall.status);
  const glyphColor = getToolGlyphColor(toolCall.status, tokens);
  const labelColor = toolCall.status === "error" || toolCall.isError
    ? tokens["glyph.tool.error"]
    : tokens["text.secondary"];

  return (
    <Box style={{ flexDirection: "column", marginLeft: 2 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: glyphColor }}>{glyph}</Text>
        <Text style={{ color: labelColor }}>{` ${toolCall.name}`}</Text>
        {toolCall.status === "running" ? (
          <Text style={{ color: tokens["text.muted"] }}>{" ..."}</Text>
        ) : null}
      </Box>
      {toolCall.result && toolCall.status === "error" ? (
        <Box style={{ marginLeft: 2 }}>
          <Text style={{ color: tokens["glyph.tool.error"] }}>{toolCall.result}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export interface MessageProps {
  message: DisplayMessage;
}

export function Message({ message }: MessageProps) {
  const { tokens } = useThemeTokens();
  const glyph = getRoleGlyph(message.role);
  const glyphColor = getRoleColor(message.role, tokens);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <Box style={{ flexDirection: "column", marginBottom: 0 }}>
      {isUser ? (
        <Box style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Text style={{ color: tokens["conversation.user.text"] }}>{message.content}</Text>
          <Text>{" "}</Text>
          <Text style={{ color: glyphColor }}>{glyph}</Text>
        </Box>
      ) : isSystem ? (
        <Box style={{ flexDirection: "row" }}>
          <Text style={{ color: glyphColor }}>{glyph}</Text>
          <Text style={{ color: tokens["text.muted"] }}>{` ${message.content}`}</Text>
        </Box>
      ) : (
        <Box style={{ flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text style={{ color: glyphColor }}>{glyph}</Text>
            <Text>{" "}</Text>
          </Box>
          <Box style={{ marginLeft: 2 }}>
            <StreamingText content={message.content} isStreaming={message.isStreaming} />
          </Box>
        </Box>
      )}

      {message.toolCalls?.map((toolCall) => (
        <ToolCallAnchor key={toolCall.id} toolCall={toolCall} />
      ))}
    </Box>
  );
}
