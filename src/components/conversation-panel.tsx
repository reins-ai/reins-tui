import type { DisplayMessage, DisplayToolCall } from "../store";
import { useApp } from "../store";
import { useConversation } from "../hooks";
import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import type { MessageRole } from "../theme/use-theme-tokens";
import type { ToolCall, ToolCallStatus, ToolVisualState } from "../tools/tool-lifecycle";
import { displayToolCallToVisualState } from "../tools/tool-lifecycle";
import type { FramedBlockStyle } from "../ui/types";
import { Box, ScrollBox, Text } from "../ui";
import { ACCENT_BORDER_CHARS, FramedBlock } from "../ui/primitives";
import { LogoAscii } from "./logo-ascii";
import { Message } from "./message";
import { formatModelDisplayName } from "./model-selector";
import { ToolBlock } from "./tool-inline";

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

/**
 * Bridge between DisplayToolCall (store/UI shape) and ToolCall (lifecycle shape).
 * Used by tool rendering components to map display state into lifecycle-aware props.
 */
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

/**
 * Resolve the FramedBlock style for the streaming placeholder.
 * Uses assistant styling so the "Generating response..." indicator
 * visually belongs to the same block language as assistant messages.
 */
export function getStreamingPlaceholderStyle(
  tokens: Record<string, string>,
  getRoleBorder: (role: MessageRole) => string,
): FramedBlockStyle {
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
}

/**
 * Convert an array of DisplayToolCalls into ToolVisualState objects
 * for rendering as standalone tool blocks in the conversation flow.
 * Uses the displayToolCallToVisualState adapter from tool-lifecycle.
 */
export function toolCallsToVisualStates(
  toolCalls: readonly DisplayToolCall[],
  expandedSet?: ReadonlySet<string>,
): ToolVisualState[] {
  return toolCalls.map((dtc) => {
    const expanded = expandedSet?.has(dtc.id) ?? false;
    return displayToolCallToVisualState(dtc, expanded);
  });
}

/**
 * Resolve the accent color for a tool block from its visual state
 * color token. Falls back to glyph.tool.running if the token is
 * not found in the theme.
 */
export function resolveToolBlockAccent(
  colorToken: string,
  tokens: Readonly<ThemeTokens>,
): string {
  return tokens[colorToken as keyof ThemeTokens] ?? tokens["glyph.tool.running"];
}

/**
 * Renders a list of tool calls as standalone ToolBlock components.
 * Each block gets its own FramedBlock with lifecycle-aware styling.
 * Used when tool calls should appear as distinct visual blocks
 * rather than inline anchors within a message.
 */
export function ToolBlockList({ toolCalls }: { toolCalls: readonly DisplayToolCall[] }) {
  const visualStates = toolCallsToVisualStates(toolCalls);

  return (
    <>
      {visualStates.map((vs) => (
        <Box key={vs.id} style={{ marginTop: 0 }}>
          <ToolBlock visualState={vs} />
        </Box>
      ))}
    </>
  );
}

/**
 * Determine whether a message should render its tool calls as
 * standalone ToolBlock components rather than inline ToolCallAnchors.
 * Tool-role messages always use block rendering. Assistant messages
 * with tool calls use block rendering when the message has no
 * text content (pure tool-use turn).
 */
export function shouldRenderToolBlocks(message: DisplayMessage): boolean {
  if (!message.toolCalls || message.toolCalls.length === 0) {
    return false;
  }

  if (message.role === "tool") {
    return true;
  }

  return false;
}

export function ConversationPanel({ isFocused, borderColor }: ConversationPanelProps) {
  const { messages, isStreaming, lifecycleStatus } = useConversation();
  const { state } = useApp();
  const { tokens, getRoleBorder } = useThemeTokens();
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

            const useToolBlocks = shouldRenderToolBlocks(message);

            return (
              <Box key={message.id} style={{ flexDirection: "column", marginTop: gap }}>
                <Message
                  message={message}
                  lifecycleStatus={message.isStreaming ? lifecycleStatus : undefined}
                  renderToolBlocks={useToolBlocks}
                />
                {useToolBlocks && message.toolCalls ? (
                  <ToolBlockList toolCalls={message.toolCalls} />
                ) : null}
              </Box>
            );
          })
        )}

        {isStreaming && !hasContent ? (
          <Box style={{ marginTop: MESSAGE_GAP }}>
            <FramedBlock
              style={getStreamingPlaceholderStyle(tokens, getRoleBorder)}
              borderChars={ACCENT_BORDER_CHARS}
            >
              <Text style={{ color: tokens["text.secondary"] }}>Generating response...</Text>
            </FramedBlock>
          </Box>
        ) : null}
      </ScrollBox>
    </Box>
  );
}
