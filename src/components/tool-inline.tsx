import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import type { ToolCall, ToolCallStatus, ToolVisualState } from "../tools/tool-lifecycle";
import { toolCallToMessageContent } from "../tools/tool-lifecycle";
import type { FramedBlockStyle } from "../ui/types";
import { Box, Text } from "../ui";
import { FramedBlock, SUBTLE_BORDER_CHARS } from "../ui/primitives";

// --- Shared helpers (preserved for backward compatibility) ---

export interface ToolInlineProps {
  call: ToolCall;
  collapsed: boolean;
}

export function getStatusColor(status: ToolCallStatus, tokens: Readonly<ThemeTokens>): string {
  switch (status) {
    case "queued":
    case "running":
      return tokens["glyph.tool.running"];
    case "success":
      return tokens["glyph.tool.done"];
    case "error":
      return tokens["glyph.tool.error"];
  }
}

export function formatDetailSection(call: ToolCall, maxLength: number = 200): string | undefined {
  const sections: string[] = [];

  if (call.args !== undefined) {
    sections.push(`Args: ${compactStringify(call.args)}`);
  }

  if (call.result !== undefined) {
    // Use the result string directly when it's already a string (e.g. hydrated
    // history data) to avoid re-escaping decoded newlines/tabs via JSON.stringify.
    const resultText = typeof call.result === "string" ? call.result : compactStringify(call.result);
    sections.push(`Result: ${resultText}`);
  }

  if (call.error !== undefined && call.error.length > 0) {
    sections.push(`Error: ${call.error}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  const joined = sections.join("\n");
  if (joined.length <= maxLength) {
    return joined;
  }

  return `${joined.slice(0, maxLength)}...`;
}

function compactStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      return String(value);
    }
    return json;
  } catch {
    return String(value);
  }
}

// --- Legacy inline renderer (preserved for backward compatibility) ---

export function ToolInline({ call, collapsed }: ToolInlineProps) {
  const { tokens } = useThemeTokens();
  const content = toolCallToMessageContent(call);
  const statusColor = getStatusColor(call.status, tokens);
  const detail = formatDetailSection(call);
  const isExpanded = !collapsed && detail !== undefined;

  return (
    <Box style={{ flexDirection: "column", marginLeft: 2 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: tokens["text.muted"] }}>Tool</Text>
        <Text style={{ color: tokens["text.secondary"] }}>{` ${call.toolName}`}</Text>
        <Text style={{ color: statusColor }}>{`  ${content.label}`}</Text>
        {detail !== undefined ? (
          <Text style={{ color: tokens["text.muted"] }}>{collapsed ? " [+]" : " [-]"}</Text>
        ) : null}
      </Box>

      {isExpanded ? (
        <Box
          style={{
            flexDirection: "column",
            marginTop: 0,
            paddingLeft: 2,
          }}
        >
          {detail.split("\n").map((line, i) => (
            <Text key={i} style={{ color: tokens["text.muted"] }}>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

// --- Tool Block Component (lifecycle-aware framed renderer) ---

/**
 * Maximum length for args preview in the tool block header area.
 */
const TOOL_BLOCK_ARGS_MAX = 120;

/**
 * Maximum length for result/error detail in the tool block body.
 */
const TOOL_BLOCK_DETAIL_MAX = 500;

export interface ToolBlockProps {
  visualState: ToolVisualState;
}

/**
 * Resolve the FramedBlock style for a tool block based on its lifecycle status.
 * Running tools use the running accent, completed tools use the done accent,
 * and errored tools use the error accent. All share a consistent surface
 * background to distinguish tool blocks from message blocks.
 *
 * Pure function — testable without React context.
 */
export function getToolBlockStyle(
  visualState: ToolVisualState,
  tokens: Readonly<ThemeTokens>,
): FramedBlockStyle {
  const accentColor = tokens[visualState.colorToken as keyof ThemeTokens] ?? tokens["glyph.tool.running"];

  return {
    accentColor,
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
 * Format a compact args preview string for the tool block header.
 * Returns undefined if no args are present or args are empty.
 */
export function formatToolBlockArgs(
  args: Record<string, unknown> | undefined,
  maxLength: number = TOOL_BLOCK_ARGS_MAX,
): string | undefined {
  if (args === undefined || Object.keys(args).length === 0) {
    return undefined;
  }

  try {
    const json = JSON.stringify(args);
    if (json === undefined || json === "{}") {
      return undefined;
    }

    if (json.length <= maxLength) {
      return json;
    }

    return `${json.slice(0, maxLength)}…`;
  } catch {
    return undefined;
  }
}

/**
 * Format the result or error detail for the tool block body.
 * Truncates long content with an ellipsis indicator.
 */
export function formatToolBlockDetail(
  detail: string | undefined,
  maxLength: number = TOOL_BLOCK_DETAIL_MAX,
): string | undefined {
  if (detail === undefined || detail.length === 0) {
    return undefined;
  }

  if (detail.length <= maxLength) {
    return detail;
  }

  return `${detail.slice(0, maxLength)}…`;
}

/**
 * Resolve the status label suffix shown after the tool name.
 * Running shows ellipsis, success shows duration, error shows "failed".
 */
export function getToolBlockStatusSuffix(visualState: ToolVisualState): string {
  switch (visualState.status) {
    case "queued":
      return "queued...";
    case "running":
      return "running...";
    case "success":
      return visualState.duration !== undefined
        ? `done (${visualState.duration}ms)`
        : "done";
    case "error":
      return "failed";
  }
}

/**
 * ToolBlock renders a tool call as a framed block with lifecycle-aware
 * visual treatment. Distinct from message blocks: uses surface.secondary
 * background with status-driven left-border accent colors.
 *
 * Structure:
 *   ┃ Tool bash  running...
 *   ┃   {"command":"ls -la"}
 *
 *   ┃ Tool bash  done (42ms)
 *   ┃   file1.ts
 *   ┃   file2.ts
 *
 *   ┃ Tool write  failed
 *   ┃   Permission denied
 */
export function ToolBlock({ visualState }: ToolBlockProps) {
  const { tokens } = useThemeTokens();
  const blockStyle = getToolBlockStyle(visualState, tokens);
  const formattedDetail = formatToolBlockDetail(visualState.detail);

  return (
    <FramedBlock style={blockStyle} borderChars={SUBTLE_BORDER_CHARS}>
      {/* Header: tool name */}
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: tokens["text.muted"] }}>Tool</Text>
        <Text style={{ color: tokens["text.secondary"] }}>{` ${visualState.toolName}`}</Text>
      </Box>

      {/* Detail body: args, result, or error content */}
      {formattedDetail ? (
        <Box style={{ flexDirection: "column", marginTop: 0, paddingLeft: 2 }}>
          {formattedDetail.split("\n").map((line, i) => (
            <Text
              key={i}
              style={{
                color: visualState.status === "error"
                  ? tokens["glyph.tool.error"]
                  : tokens["text.muted"],
              }}
            >
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
    </FramedBlock>
  );
}
