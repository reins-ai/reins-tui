import { adaptToolOutput } from "../cards/card-adapters";
import type { ConversationLifecycleStatus } from "../state/status-machine";
import type { DisplayMessage, DisplayToolCall } from "../store";
import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import { buildSimplifiedToolText } from "../lib/tool-output";
import type { MessageRole } from "../theme/use-theme-tokens";
import type { FramedBlockStyle } from "../ui/types";
import { Box, Text } from "../ui";
import { FramedBlock, SUBTLE_BORDER_CHARS } from "../ui/primitives";
import { CardRenderer } from "./cards";
import { MarkdownText } from "./markdown-text";
import { StreamingText } from "./streaming-text";
import { ThinkingBlock } from "./thinking-block";

// Chat label vocabulary (text-only, symbol-free)
export const GLYPH_REINS = "Assistant";
export const GLYPH_USER = "User";
export const GLYPH_TOOL_RUNNING = "Running";
export const GLYPH_TOOL_DONE = "Done";
export const GLYPH_TOOL_ERROR = "Failed";
export const CANCELLED_INTERACTION_TEXT = "This interaction has been cancelled";

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

/**
 * Resolve the FramedBlock style for a message based on its role.
 * User messages get a subtle border with user-specific background;
 * assistant messages get an accent border with assistant background.
 * System messages use a muted, minimal treatment.
 */
export function getMessageBlockStyle(
  role: DisplayMessage["role"],
  tokens: Readonly<ThemeTokens>,
  getRoleBorder: (role: MessageRole) => string,
): FramedBlockStyle {
  switch (role) {
    case "user":
      return {
        accentColor: getRoleBorder("user"),
        backgroundColor: tokens["conversation.user.bg"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
    case "assistant":
      return {
        accentColor: getRoleBorder("assistant"),
        backgroundColor: tokens["conversation.assistant.bg"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
    case "system":
      return {
        accentColor: getRoleBorder("system"),
        backgroundColor: tokens["surface.primary"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
    case "tool":
      return {
        accentColor: tokens["glyph.tool.running"],
        backgroundColor: tokens["surface.secondary"],
        paddingLeft: 2,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0,
      };
  }
}

/**
 * Select the border character preset based on role.
 * User messages use the subtle (light) border for a quieter visual weight;
 * assistant messages use the accent (heavy) border for prominence.
 */
export function getMessageBorderChars(role: DisplayMessage["role"]) {
  switch (role) {
    case "user":
      return SUBTLE_BORDER_CHARS;
    case "assistant":
      return SUBTLE_BORDER_CHARS;
    case "system":
      return SUBTLE_BORDER_CHARS;
    case "tool":
      return SUBTLE_BORDER_CHARS;
  }
}

interface ToolCallAnchorProps {
  toolCall: DisplayToolCall;
}

const ARGS_PREVIEW_MAX_LENGTH = 120;
const RESULT_PREVIEW_MAX_LENGTH = 300;

function tryParseToolResult(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

export function formatArgsPreview(toolCall: DisplayToolCall): string | undefined {
  if (!toolCall.args || Object.keys(toolCall.args).length === 0) {
    return undefined;
  }

  const command = typeof toolCall.args.command === "string" && toolCall.args.command.trim().length > 0
    ? toolCall.args.command.trim()
    : undefined;
  if (command) {
    return `$ ${command}`;
  }

  try {
    const json = JSON.stringify(toolCall.args);
    if (json === undefined || json === "{}") {
      return undefined;
    }

    if (json.length <= ARGS_PREVIEW_MAX_LENGTH) {
      return json;
    }

    return `${json.slice(0, ARGS_PREVIEW_MAX_LENGTH)}…`;
  } catch {
    return undefined;
  }
}

export function formatResultPreview(result: string, maxLength: number = RESULT_PREVIEW_MAX_LENGTH): string {
  if (result.length <= maxLength) {
    return result;
  }

  return `${result.slice(0, maxLength)}…`;
}

export function formatToolResultPreview(
  toolCall: DisplayToolCall,
  maxLength: number = RESULT_PREVIEW_MAX_LENGTH,
): string | undefined {
  const rendered = buildSimplifiedToolText(
    toolCall.args,
    toolCall.result,
    toolCall.status === "error" ? toolCall.result : undefined,
  );
  if (!rendered) {
    return undefined;
  }

  return formatResultPreview(rendered, maxLength);
}

export function ToolCallAnchor({ toolCall }: ToolCallAnchorProps) {
  const { tokens } = useThemeTokens();
  const statusLabel = getToolGlyph(toolCall.status);
  const statusColor = getToolGlyphColor(toolCall.status, tokens);
  const toolNameColor = toolCall.status === "error" || toolCall.isError
    ? tokens["glyph.tool.error"]
    : tokens["text.secondary"];

  const card = toolCall.status === "complete" && toolCall.result && !toolCall.isError
    ? adaptToolOutput(toolCall.name, tryParseToolResult(toolCall.result))
    : null;

  const showCard = card !== null && card.type !== "plain-text";
  const isActive = toolCall.status === "pending" || toolCall.status === "running";
  const argsPreview = isActive ? formatArgsPreview(toolCall) : undefined;
  const showPlainResult = toolCall.status === "complete" && toolCall.result && !toolCall.isError && !showCard;

  return (
    <Box style={{ flexDirection: "column", marginTop: 1 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: tokens["text.muted"] }}>Tool</Text>
        <Text style={{ color: toolNameColor }}>{` ${toolCall.name}`}</Text>
        <Text style={{ color: statusColor }}>{`  ${statusLabel}`}</Text>
        {toolCall.status === "running" ? (
          <Text style={{ color: tokens["text.muted"] }}>{" ..."}</Text>
        ) : null}
      </Box>
      {argsPreview ? (
        <Box style={{ marginLeft: 2 }}>
          <Text style={{ color: tokens["text.muted"] }}>{argsPreview}</Text>
        </Box>
      ) : null}
      {showCard && card ? (
        <Box style={{ marginLeft: 2, marginTop: 0 }}>
          <CardRenderer card={card} />
        </Box>
      ) : null}
      {showPlainResult && toolCall.result ? (
        <Box style={{ flexDirection: "column", marginLeft: 2 }}>
          {(formatToolResultPreview(toolCall) ?? formatResultPreview(toolCall.result)).split("\n").map((line, i) => (
            <Text key={i} style={{ color: tokens["text.muted"] }}>{line}</Text>
          ))}
        </Box>
      ) : null}
      {toolCall.result && toolCall.status === "error" ? (
        <Box style={{ flexDirection: "column", marginLeft: 2 }}>
          {toolCall.result.split("\n").map((line, i) => (
            <Text key={i} style={{ color: tokens["glyph.tool.error"] }}>{line}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export interface MessageProps {
  message: DisplayMessage;
  lifecycleStatus?: ConversationLifecycleStatus;
  /**
   * When true, tool calls are rendered externally as standalone ToolBlock
   * components rather than inline ToolCallAnchors within this message.
   * The Message component skips its own tool call rendering in this case.
   */
  renderToolBlocks?: boolean;
  /**
   * Controls whether thinking blocks are rendered. When false, thinking
   * blocks are hidden from display but remain in the message data.
   */
  thinkingVisible?: boolean;
}

export function Message({ message, lifecycleStatus, renderToolBlocks, thinkingVisible = true }: MessageProps) {
  const { tokens, getRoleBorder } = useThemeTokens();
  const roleLabel = getRoleGlyph(message.role);
  const roleLabelColor = getRoleColor(message.role, tokens);

  const blockStyle = getMessageBlockStyle(message.role, tokens, getRoleBorder);
  const borderChars = getMessageBorderChars(message.role);
  const contentColor = message.role === "system"
    ? tokens["text.muted"]
    : message.role === "assistant"
      ? tokens["conversation.assistant.text"]
      : tokens["conversation.user.text"];

  const thinkingBlocks = thinkingVisible && message.contentBlocks
    ? message.contentBlocks.filter((block) => block.type === "thinking" && block.text)
    : [];
  const isThinkingStreaming = message.isStreaming && lifecycleStatus === "thinking";
  const hasPrimaryContent = message.content.trim().length > 0 || message.isStreaming;
  const showCancelledLine = message.role === "assistant" && message.wasCancelled === true;

  return (
    <FramedBlock style={blockStyle} borderChars={borderChars}>
      <Box style={{ flexDirection: "column" }}>
        <Text style={{ color: roleLabelColor }}><b>{roleLabel}</b></Text>
        {thinkingBlocks.map((block, index) => (
          <ThinkingBlock
            key={`thinking-${index}`}
            content={block.text ?? ""}
            isStreaming={isThinkingStreaming}
          />
        ))}
        {hasPrimaryContent ? (
          <Box style={{ marginTop: 0 }}>
            {message.role === "assistant" ? (
              message.isStreaming ? (
                <StreamingText
                  content={message.content}
                  isStreaming={message.isStreaming}
                  lifecycleStatus={lifecycleStatus}
                />
              ) : (
                <MarkdownText content={message.content} color={contentColor} />
              )
            ) : (
              <Text style={{ color: contentColor }}>{message.content}</Text>
            )}
          </Box>
        ) : null}
        {showCancelledLine ? (
          <Text style={{ color: tokens["status.error"] }}>{CANCELLED_INTERACTION_TEXT}</Text>
        ) : null}
      </Box>

      {!renderToolBlocks && message.toolCalls?.map((toolCall) => (
        <ToolCallAnchor key={toolCall.id} toolCall={toolCall} />
      ))}
    </FramedBlock>
  );
}
