import { useThemeTokens } from "../../theme";
import type { ThemeTokens } from "../../theme/theme-schema";
import type { DisplayToolCall } from "../../store/types";
import type { FramedBlockStyle } from "../../ui/types";
import { Box, Text, useKeyboard } from "../../ui";
import { FramedBlock, SUBTLE_BORDER_CHARS } from "../../ui/primitives";

// --- Constants ---

/** Maximum length for error message display before truncation. */
const ERROR_MESSAGE_MAX_LENGTH = 200;

/** Default retry delay hint shown in the card. */
const DEFAULT_RETRY_HINT = "Retry available";

// --- Pure helpers (exported for testability) ---

/**
 * Extract a human-readable error message from a DisplayToolCall.
 * Prefers the result field when isError is true, falls back to a
 * generic message.
 */
export function extractErrorMessage(toolCall: DisplayToolCall): string {
  if (toolCall.isError && toolCall.result && toolCall.result.length > 0) {
    return toolCall.result;
  }
  return "Unknown error";
}

/**
 * Truncate an error message to a maximum length, appending an
 * ellipsis indicator when the message exceeds the limit.
 */
export function truncateErrorMessage(
  message: string,
  maxLength: number = ERROR_MESSAGE_MAX_LENGTH,
): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength)}…`;
}

/**
 * Format the tool name for display in the error card header.
 * Extracts the last segment from dotted/slashed names and
 * capitalises the first letter.
 */
export function formatErrorToolName(toolName: string): string {
  const tail = toolName.split(/[./]/).filter((part) => part.length > 0).at(-1) ?? toolName;
  const normalized = tail.replace(/[-_]+/g, " ").trim();
  if (normalized.length === 0) {
    return "Tool";
  }
  return `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
}

/**
 * Build the full error card header line.
 * Format: "✗ [tool_name] failed"
 */
export function buildErrorCardHeader(toolName: string): string {
  return `\u2717 ${formatErrorToolName(toolName)} failed`;
}

/**
 * Build the error detail line.
 * Format: "Error: [truncated message]"
 */
export function buildErrorDetailLine(errorMessage: string): string {
  return `Error: ${truncateErrorMessage(errorMessage)}`;
}

/**
 * Build the action hints line.
 * Format: "[r] retry  [i] ignore"
 */
export function buildActionHints(): string {
  return "[r] retry  [i] ignore";
}

/**
 * Resolve the FramedBlock style for an error card.
 * Uses the error accent color with a secondary surface background.
 */
export function getErrorCardStyle(tokens: Readonly<ThemeTokens>): FramedBlockStyle {
  return {
    accentColor: tokens["glyph.tool.error"],
    backgroundColor: tokens["surface.secondary"],
    paddingLeft: 2,
    paddingRight: 1,
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
  };
}

/**
 * Determine whether a DisplayToolCall should render as an error card.
 * Returns true when the tool call has an error status and an error
 * message is available.
 */
export function isErrorCardCandidate(toolCall: DisplayToolCall): boolean {
  return toolCall.status === "error" && (toolCall.isError === true || Boolean(toolCall.result));
}

// --- Props ---

export interface ErrorCardProps {
  /** The failed tool call to display. */
  toolCall: DisplayToolCall;
  /** Whether this card is focused and should respond to key bindings. */
  isFocused?: boolean;
  /** Callback invoked when the user presses [r] to retry the tool call. */
  onRetry?: (toolCallId: string, toolName: string) => void;
  /** Callback invoked when the user presses [i] to ignore the error. */
  onIgnore?: (toolCallId: string) => void;
}

// --- Component ---

/**
 * ErrorCard renders a styled error card in the chat stream when a tool
 * call fails. Provides visual feedback with the error message and
 * action hints for retry and ignore.
 *
 * Structure:
 *   │ ✗ Bash failed
 *   │   Error: Permission denied
 *   │   [r] retry  [i] ignore
 *
 * Key bindings (when focused):
 *   [r] — retry the failed tool call
 *   [i] — ignore the error and continue
 */
export function ErrorCard({
  toolCall,
  isFocused = false,
  onRetry,
  onIgnore,
}: ErrorCardProps) {
  const { tokens } = useThemeTokens();
  const blockStyle = getErrorCardStyle(tokens);

  useKeyboard((keyEvent) => {
    if (!isFocused) return;

    const sequence = keyEvent.sequence ?? "";

    if (sequence === "r" && onRetry) {
      onRetry(toolCall.id, toolCall.name);
    }

    if (sequence === "i" && onIgnore) {
      onIgnore(toolCall.id);
    }
  });

  const header = buildErrorCardHeader(toolCall.name);
  const errorMessage = extractErrorMessage(toolCall);
  const detailLine = buildErrorDetailLine(errorMessage);
  const actionHints = buildActionHints();

  return (
    <FramedBlock style={blockStyle} borderChars={SUBTLE_BORDER_CHARS}>
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: tokens["status.error"], fontWeight: "bold" }}>
          {header}
        </Text>
      </Box>

      <Box style={{ flexDirection: "row", paddingLeft: 2 }}>
        <Text style={{ color: tokens["glyph.tool.error"] }}>
          {detailLine}
        </Text>
      </Box>

      <Box style={{ flexDirection: "row", paddingLeft: 2 }}>
        <Text style={{ color: isFocused ? tokens["accent.primary"] : tokens["text.muted"] }}>
          {actionHints}
        </Text>
        {isFocused ? (
          <Text style={{ color: tokens["text.muted"] }}>
            {"  " + DEFAULT_RETRY_HINT}
          </Text>
        ) : null}
      </Box>
    </FramedBlock>
  );
}
