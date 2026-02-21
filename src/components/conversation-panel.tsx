import { useMemo, useRef } from "react";

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
import { ErrorCard } from "./cards/error-card";
import { isErrorCardCandidate } from "./cards/error-card";
import { LogoAscii } from "./logo-ascii";
import { getMessageBlockStyle, getMessageBorderChars, Message } from "./message";
import { ThinkingBlock } from "./thinking-block";
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

// ---------------------------------------------------------------------------
// Memory notification types and helpers
// ---------------------------------------------------------------------------

export interface MemoryNotification {
  callId: string;
  contentPreview: string;
  memoryId: string;
  dismissed: boolean;
}

/**
 * Extract a "remember" result from a tool message content string.
 * Returns the memory id and content if the tool result represents
 * a successful remember action, or null otherwise.
 */
export function extractRememberResult(content: string): { id: string; content: string } | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "action" in parsed &&
      (parsed as { action: unknown }).action === "remember" &&
      "memory" in parsed
    ) {
      const memory = (parsed as { memory: unknown }).memory;
      if (
        typeof memory === "object" &&
        memory !== null &&
        "id" in memory &&
        "content" in memory &&
        typeof (memory as { id: unknown }).id === "string" &&
        typeof (memory as { content: unknown }).content === "string"
      ) {
        return {
          id: (memory as { id: string }).id,
          content: (memory as { content: string }).content,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function MemoryNotificationBar({
  notification,
  tokens,
  onView,
  onUndo,
}: {
  notification: MemoryNotification;
  tokens: Readonly<ThemeTokens>;
  onView?: (memoryId: string) => void;
  onUndo?: (memoryId: string) => void;
}) {
  if (notification.dismissed) return null;

  const preview = notification.contentPreview.length > 40
    ? notification.contentPreview.slice(0, 40) + "..."
    : notification.contentPreview;

  return (
    <Box style={{ flexDirection: "row", marginTop: 0 }}>
      <Text content="💾 " style={{ color: tokens["status.info"] }} />
      <Text content="Remembered: " style={{ color: tokens["status.info"] }} />
      <Text content={`"${preview}"`} style={{ color: tokens["text.secondary"] }} />
      {onView ? (
        <Text content="  [view]" style={{ color: tokens["accent.secondary"] }} />
      ) : null}
      {onUndo ? (
        <Text content="  [undo]" style={{ color: tokens["text.muted"] }} />
      ) : null}
    </Box>
  );
}

export interface ConversationPanelProps {
  isFocused: boolean;
  borderColor: string;
  version: string;
  onViewMemory?: (memoryId: string) => void;
  onUndoMemory?: (memoryId: string) => void;
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
 * Determine whether a completed tool call should auto-collapse to a
 * single summary line. Tool calls auto-collapse after completion
 * unless the user has explicitly toggled them open. Running tool
 * calls stay expanded; error-state blocks always stay expanded.
 */
export function shouldAutoCollapse(dtc: DisplayToolCall, expandedSet: ReadonlySet<string>): boolean {
  if (shouldAutoExpand(dtc)) {
    return false;
  }
  if (dtc.status === "pending" || dtc.status === "running") {
    return false;
  }
  // Completed — collapse unless user explicitly expanded
  return !expandedSet.has(dtc.id);
}

/**
 * Renders a list of tool calls as standalone ToolBlock components.
 * Each block gets its own FramedBlock with lifecycle-aware styling.
 * Used when tool calls should appear as distinct visual blocks
 * rather than inline anchors within a message.
 *
 * Running blocks are expanded to show progress. Completed blocks
 * auto-collapse to a single summary line with timing. Error-state
 * blocks are always expanded to preserve diagnostics visibility.
 * Users can toggle individual blocks via the expandedSet.
 */
export function ToolBlockList({ toolCalls, expandedSet }: ToolBlockListProps) {
  const entries = toolCalls.map((dtc) => {
    const isAutoExpand = shouldAutoExpand(dtc);
    const isRunning = dtc.status === "pending" || dtc.status === "running";
    const expanded = isAutoExpand || isRunning || expandedSet.has(dtc.id);
    const collapsed = shouldAutoCollapse(dtc, expandedSet);
    const visualState = displayToolCallToVisualState(dtc, expanded);
    const showErrorCard = isErrorCardCandidate(dtc);
    return { dtc, visualState, collapsed, showErrorCard };
  });

  return (
    <>
      {entries.map(({ dtc, visualState, collapsed, showErrorCard }, index) => (
        <Box key={visualState.id} style={{ flexDirection: "column", marginTop: index === 0 ? 0 : adjustedBlockGap(MESSAGE_GAP) }}>
          <ToolBlock visualState={visualState} collapsed={collapsed} />
          {showErrorCard ? (
            <Box style={{ marginTop: adjustedBlockGap(MESSAGE_GAP) }}>
              <ErrorCard toolCall={dtc} />
            </Box>
          ) : null}
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

export function ConversationPanel({
  isFocused,
  borderColor: _borderColor,
  version,
  onViewMemory,
  onUndoMemory,
}: ConversationPanelProps) {
  const { messages, isStreaming, lifecycleStatus } = useConversation();
  const { state } = useApp();
  const { tokens, getRoleBorder } = useThemeTokens();
  const expandedToolCalls = state.expandedToolCalls;
  const thinkingVisible = state.thinkingVisible;
  const showEmptyState = messages.length === 0 && !isStreaming;
  const hasContent = messages.some(
    (message) => message.content.trim().length > 0 || (message.toolCalls && message.toolCalls.length > 0),
  );

  // Track dismissed memory notifications across renders
  const dismissedNotificationsRef = useRef<Set<string>>(new Set());

  // Detect memory "remember" tool results from messages
  const memoryNotifications = useMemo(() => {
    const notifications: MemoryNotification[] = [];
    for (const message of messages) {
      if (message.role !== "tool" as string) continue;
      if (!message.toolCalls || message.toolCalls.length === 0) {
        // Tool result messages may not have toolCalls — check content directly
        const result = extractRememberResult(message.content);
        if (result) {
          notifications.push({
            callId: message.id,
            contentPreview: result.content,
            memoryId: result.id,
            dismissed: dismissedNotificationsRef.current.has(message.id),
          });
        }
        continue;
      }
      for (const tc of message.toolCalls) {
        if (tc.name === "memory" && tc.status === "complete" && tc.result) {
          const result = extractRememberResult(tc.result);
          if (result) {
            notifications.push({
              callId: tc.id,
              contentPreview: result.content,
              memoryId: result.id,
              dismissed: dismissedNotificationsRef.current.has(tc.id),
            });
          }
        }
      }
    }
    return notifications;
  }, [messages]);

  // Build a map of message id → notifications for inline rendering
  const notificationsByMessageId = useMemo(() => {
    const map = new Map<string, MemoryNotification[]>();
    for (const notification of memoryNotifications) {
      // Associate notification with the message that contains it
      for (const message of messages) {
        if (message.id === notification.callId) {
          const existing = map.get(message.id) ?? [];
          existing.push(notification);
          map.set(message.id, existing);
          break;
        }
        if (message.toolCalls?.some((tc) => tc.id === notification.callId)) {
          const existing = map.get(message.id) ?? [];
          existing.push(notification);
          map.set(message.id, existing);
          break;
        }
      }
    }
    return map;
  }, [memoryNotifications, messages]);

  return (
    <Box style={{ flexGrow: 1, minHeight: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 1, marginRight: SCROLLBAR_GUTTER }}>
        <Text
          content={`Reins v${version}`}
          style={{ color: tokens["text.primary"], fontWeight: "bold" }}
        />
      </Box>
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
                      wasCancelled: false,
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
                    const isAutoExpand = shouldAutoExpand(toolCall);
                    const isRunning = toolCall.status === "pending" || toolCall.status === "running";
                    const expanded = isAutoExpand || isRunning || expandedToolCalls.has(toolCall.id);
                    const collapsed = shouldAutoCollapse(toolCall, expandedToolCalls);
                    const visualState = displayToolCallToVisualState(toolCall, expanded);
                    const marginTop = renderedBlockCount === 0 ? 0 : adjustedBlockGap(MESSAGE_GAP);
                    renderedBlockCount += 1;

                    const showErrorCard = isErrorCardCandidate(toolCall);

                    return (
                      <Box key={`${message.id}-tool-${toolCall.id}`} style={{ flexDirection: "column", marginTop }}>
                        <ToolBlock visualState={visualState} collapsed={collapsed} />
                        {showErrorCard ? (
                          <Box style={{ marginTop: adjustedBlockGap(MESSAGE_GAP) }}>
                            <ErrorCard toolCall={toolCall} />
                          </Box>
                        ) : null}
                      </Box>
                    );
                  }

                  if (block.type === "thinking" && thinkingVisible && block.text) {
                    const marginTop = renderedBlockCount === 0 ? 0 : adjustedBlockGap(MESSAGE_GAP);
                    renderedBlockCount += 1;
                    const thinkingBlockStyle = getMessageBlockStyle("assistant", tokens, getRoleBorder);
                    const thinkingBorderChars = getMessageBorderChars("assistant");

                    return (
                      <Box key={`${message.id}-thinking-${blockIndex}`} style={{ flexDirection: "column", marginTop }}>
                        <FramedBlock style={thinkingBlockStyle} borderChars={thinkingBorderChars}>
                          <ThinkingBlock
                            content={block.text}
                            isStreaming={message.isStreaming && lifecycleStatus === "thinking"}
                          />
                        </FramedBlock>
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
                    thinkingVisible={thinkingVisible}
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
                {useOrderedBlocks && message.wasCancelled ? (
                  <Box style={{ marginTop: adjustedBlockGap(MESSAGE_GAP) }}>
                    <Message
                      message={{
                        ...message,
                        content: "",
                        toolCalls: undefined,
                        contentBlocks: undefined,
                        isStreaming: false,
                      }}
                      lifecycleStatus={undefined}
                    />
                  </Box>
                ) : null}
                {/* Memory "Remembered" notifications */}
                {(notificationsByMessageId.get(message.id) ?? []).map((notification) => (
                  <Box key={`mem-notif-${notification.callId}`} style={{ marginTop: adjustedBlockGap(MESSAGE_GAP) }}>
                    <MemoryNotificationBar
                      notification={notification}
                      tokens={tokens}
                      onView={onViewMemory}
                      onUndo={onUndoMemory}
                    />
                  </Box>
                ))}
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
