import { Box, Text } from "../../ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversionReportProps {
  /** Markdown content of the report (from daemon). */
  reportContent: string | null;
  /** Whether the report is being loaded. */
  isLoading: boolean;
  /** Error loading report. */
  errorMessage?: string;
  tokens: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DISPLAY_LINES = 40;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConversionReport({
  reportContent,
  isLoading,
  errorMessage,
  tokens,
}: ConversionReportProps) {
  if (isLoading) {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
          <Text
            content="Loading conversion report..."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      </Box>
    );
  }

  if (errorMessage !== undefined) {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="x " style={{ color: tokens["status.error"] }} />
          <Text
            content={errorMessage}
            style={{ color: tokens["text.primary"] }}
          />
        </Box>
      </Box>
    );
  }

  if (reportContent === null) {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="- " style={{ color: tokens["text.muted"] }} />
          <Text
            content="No conversion report found."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      </Box>
    );
  }

  const lines = reportContent.split("\n");
  const truncated = lines.length > MAX_DISPLAY_LINES;
  const displayLines = truncated ? lines.slice(0, MAX_DISPLAY_LINES) : lines;

  return (
    <Box style={{ flexDirection: "column" }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["status.success"] }} />
        <Text
          content="Conversion Report"
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>

      <Box style={{ marginTop: 1, flexDirection: "column", paddingLeft: 2 }}>
        {displayLines.map((line, index) => (
          <Text
            key={index}
            content={line.length > 0 ? line : " "}
            style={{ color: tokens["text.secondary"] }}
          />
        ))}
      </Box>

      {truncated ? (
        <Box style={{ marginTop: 1, paddingLeft: 2 }}>
          <Text
            content={`... ${lines.length - MAX_DISPLAY_LINES} more lines. See full report at ~/.reins/`}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
