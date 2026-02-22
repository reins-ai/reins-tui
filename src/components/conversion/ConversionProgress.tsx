import { Box, Text } from "../../ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversionProgressProps {
  /** Current category being processed. */
  currentCategory: string | null;
  /** Number of items processed so far. */
  processed: number;
  /** Total items to process. */
  total: number;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
  /** Overall conversion status. */
  status: "running" | "complete" | "error";
  /** Error message when status is "error". */
  errorMessage?: string;
  tokens: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BAR_WIDTH = 30;

function renderProgressBar(processed: number, total: number): string {
  if (total <= 0) return `[${"·".repeat(BAR_WIDTH)}]   0%`;

  const ratio = Math.min(processed / total, 1);
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const percent = Math.round(ratio * 100);

  const bar = filled > 0
    ? "=".repeat(Math.max(filled - 1, 0)) + ">"
    : "";

  return `[${bar}${"·".repeat(empty)}] ${String(percent).padStart(3)}%`;
}

function formatElapsed(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  const seconds = (ms / 1_000).toFixed(1);
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversionProgress({
  currentCategory,
  processed,
  total,
  elapsedMs,
  status,
  errorMessage,
  tokens,
}: ConversionProgressProps) {
  const barString = renderProgressBar(processed, total);

  const statusIndicator = status === "complete"
    ? "* "
    : status === "error"
      ? "x "
      : "* ";

  const statusColor = status === "complete"
    ? tokens["status.success"]
    : status === "error"
      ? tokens["status.error"]
      : tokens["glyph.tool.running"];

  return (
    <Box style={{ flexDirection: "column" }}>
      {/* Progress bar */}
      <Box style={{ flexDirection: "row" }}>
        <Text content={statusIndicator} style={{ color: statusColor }} />
        <Text
          content={barString}
          style={{ color: tokens["text.primary"] }}
        />
      </Box>

      {/* Category + counts */}
      <Box style={{ marginTop: 1, flexDirection: "row", paddingLeft: 2 }}>
        {currentCategory !== null ? (
          <Text
            content={`${currentCategory}  ·  `}
            style={{ color: tokens["accent.primary"] }}
          />
        ) : null}
        <Text
          content={`${processed} / ${total} items`}
          style={{ color: tokens["text.secondary"] }}
        />
        <Text
          content={`  ·  ${formatElapsed(elapsedMs)}`}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>

      {/* Error message */}
      {status === "error" && errorMessage !== undefined ? (
        <Box style={{ marginTop: 1, paddingLeft: 2 }}>
          <Text
            content={`Error: ${errorMessage}`}
            style={{ color: tokens["status.error"] }}
          />
        </Box>
      ) : null}

      {/* Completion message */}
      {status === "complete" ? (
        <Box style={{ marginTop: 1, paddingLeft: 2 }}>
          <Text
            content="Conversion complete."
            style={{ color: tokens["status.success"] }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
