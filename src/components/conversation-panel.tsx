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
import { FramedBlock, SUBTLE_BORDER_CHARS } from "../ui/primitives";
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

/**
 * Framed chat blocks now include a bottom padding row to ensure full
 * background coverage. Keep at least one external separator line so
 * adjacent messages remain visually distinct.
 */
function adjustedBlockGap(gap: number): number {
  return Math.max(1, gap - 1);
}

/** Scrollbar hidden temporarily; no gutter needed. */
const SCROLLBAR_GUTTER = 0;

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
 * Determine whether a tool call should be auto-expanded regardless of
 * user toggle state. Error-state tool blocks always show diagnostics
 * to preserve visibility of failure information.
 */
export function shouldAutoExpand(dtc: DisplayToolCall): boolean {
  return dtc.status === "error" || (dtc.isError === true);
}

export interface ToolBlockListProps {
  toolCalls: readonly DisplayToolCall[];
  expandedSet: ReadonlySet<string>;
}

/**
 * Renders a list of tool calls as standalone ToolBlock components.
 * Each block gets its own FramedBlock with lifecycle-aware styling.
 * Used when tool calls should appear as distinct visual blocks
 * rather than inline anchors within a message.
 *
 * Error-state blocks are always expanded to preserve diagnostics
 * visibility. Other blocks respect the expandedSet toggle state.
 */
export function ToolBlockList({ toolCalls, expandedSet }: ToolBlockListProps) {
  const visualStates = toolCalls.map((dtc) => {
    const expanded = shouldAutoExpand(dtc) || dtc.status === "complete" || expandedSet.has(dtc.id);
    return displayToolCallToVisualState(dtc, expanded);
  });

  return (
    <>
      {visualStates.map((vs, index) => (
        <Box key={vs.id} style={{ marginTop: index === 0 ? 0 : adjustedBlockGap(MESSAGE_GAP) }}>
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

  return message.role === "tool" || message.role === "assistant";
}

function hasOrderedToolBlocks(message: DisplayMessage): boolean {
  if (!message.contentBlocks || !message.toolCalls || message.contentBlocks.length === 0) {
    return false;
  }

  const toolIds = new Set(message.toolCalls.map((toolCall) => toolCall.id));
  return message.contentBlocks.some((block) => block.type === "tool-call" && block.toolCallId !== undefined && toolIds.has(block.toolCallId));
}

export function ConversationPanel({ isFocused, borderColor: _borderColor }: ConversationPanelProps) {
  const { messages, isStreaming, lifecycleStatus } = useConversation();
  const { state } = useApp();
  const { tokens, getRoleBorder } = useThemeTokens();
  const expandedToolCalls = state.expandedToolCalls;
  const showEmptyState = messages.length === 0 && !isStreaming;
  const hasContent = messages.some(
    (message) => message.content.trim().length > 0 || (message.toolCalls && message.toolCalls.length > 0),
  );

  const modelDisplay = state.currentModel !== "default"
    ? formatModelDisplayName(state.currentModel)
    : null;

  return (
    <Box style={{ flexGrow: 1, minHeight: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}>
      {modelDisplay ? (
        <Box style={{ flexDirection: "row", marginBottom: 1, marginRight: SCROLLBAR_GUTTER }}>
          <Text style={{ color: tokens["text.muted"] }}>
            <b>Reins</b>
          </Text>
          <Text
            content=" v0.1.0"
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      ) : null}
      <ScrollBox
        style={{
          flexGrow: 1,
          minHeight: 0,
        }}
        focused={isFocused}
        scrollX={false}
        scrollY={true}
        stickyScroll={true}
        stickyStart="bottom"
        verticalScrollbarOptions={{ visible: false }}
        contentOptions={{
          flexDirection: "column",
          paddingRight: SCROLLBAR_GUTTER,
          paddingBottom: 1,
        }}
      >
        {showEmptyState ? (
          <Box style={{ flexDirection: "column", flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
            <LogoAscii variant="standard" size="full" showTagline />
            <Text style={{ color: tokens["text.muted"], marginTop: 1 }}>
              {isFocused ? "Type a message to begin" : "Press Tab to focus conversation"}
            </Text>
          </Box>
        ) : messages.length > 0 ? (
          <Box style={{ flexDirection: "column" }}>
          {messages.map((message, index) => {
            const marginTop = index === 0
              ? 0
              : adjustedBlockGap(isExchangeBoundary(messages, index) ? EXCHANGE_GAP : MESSAGE_GAP);

            const useToolBlocks = shouldRenderToolBlocks(message);
            const useOrderedBlocks = hasOrderedToolBlocks(message);

            const toolCallsById = new Map((message.toolCalls ?? []).map((toolCall) => [toolCall.id, toolCall]));

            const textBlockIndexes = (message.contentBlocks ?? [])
              .map((block, blockIndex) => block.type === "text" && (block.text?.trim().length ?? 0) > 0 ? blockIndex : -1)
              .filter((blockIndex) => blockIndex >= 0);
            const lastTextBlockIndex = textBlockIndexes.length > 0 ? textBlockIndexes[textBlockIndexes.length - 1] : -1;

            const renderedToolIds = new Set<string>();
            let renderedBlockCount = 0;

            const renderableOrderedBlocks = useOrderedBlocks
              ? (message.contentBlocks ?? []).map((block, blockIndex) => {
                  if (block.type === "text") {
                    const content = block.text?.trim() ?? "";
                    if (content.length === 0) {
                      return null;
                    }

                    const textMessage: DisplayMessage = {
                      ...message,
                      content: block.text ?? "",
                      toolCalls: undefined,
                      contentBlocks: undefined,
                      isStreaming: message.isStreaming === true && blockIndex === lastTextBlockIndex,
                    };

                    const marginTop = renderedBlockCount === 0 ? 0 : adjustedBlockGap(MESSAGE_GAP);
                    renderedBlockCount += 1;

                    return (
                      <Box key={`${message.id}-text-${blockIndex}`} style={{ flexDirection: "column", marginTop }}>
                        <Message
                          message={textMessage}
                          lifecycleStatus={textMessage.isStreaming ? lifecycleStatus : undefined}
                        />
                      </Box>
                    );
                  }

                  if (block.type === "tool-call" && block.toolCallId) {
                    const toolCall = toolCallsById.get(block.toolCallId);
                    if (!toolCall) {
                      return null;
                    }

                    renderedToolIds.add(toolCall.id);
                    const expanded = shouldAutoExpand(toolCall) || toolCall.status === "complete" || expandedToolCalls.has(toolCall.id);
                    const visualState = displayToolCallToVisualState(toolCall, expanded);
                    const marginTop = renderedBlockCount === 0 ? 0 : adjustedBlockGap(MESSAGE_GAP);
                    renderedBlockCount += 1;

                    return (
                      <Box key={`${message.id}-tool-${toolCall.id}`} style={{ flexDirection: "column", marginTop }}>
                        <ToolBlock visualState={visualState} />
                      </Box>
                    );
                  }

                  return null;
                })
              : null;

            const remainingToolCalls = (message.toolCalls ?? []).filter((toolCall) => !renderedToolIds.has(toolCall.id));

            return (
              <Box key={message.id} style={{ flexDirection: "column", marginTop }}>
                {useOrderedBlocks ? renderableOrderedBlocks : (
                  <Message
                    message={message}
                    lifecycleStatus={message.isStreaming ? lifecycleStatus : undefined}
                    renderToolBlocks={useToolBlocks}
                  />
                )}
                {useToolBlocks && remainingToolCalls.length > 0 ? (
                  <Box style={{ marginTop: adjustedBlockGap(MESSAGE_GAP) }}>
                    <ToolBlockList
                      toolCalls={remainingToolCalls}
                      expandedSet={expandedToolCalls}
                    />
                  </Box>
                ) : null}
              </Box>
            );
          })}
          </Box>
        ) : null}

      {isStreaming && !hasContent ? (
        <Box style={{ marginTop: adjustedBlockGap(MESSAGE_GAP) }}>
          <FramedBlock
            style={getStreamingPlaceholderStyle(tokens, getRoleBorder)}
            borderChars={SUBTLE_BORDER_CHARS}
          >
            <Text style={{ color: tokens["text.secondary"] }}>Generating response...</Text>
          </FramedBlock>
          </Box>
        ) : null}
      </ScrollBox>
    </Box>
  );
}
