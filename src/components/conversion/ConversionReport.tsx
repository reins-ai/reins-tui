import { Box, ScrollBox, Text } from "../../ui";

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

type LineKind = "h1" | "h2" | "h3" | "separator" | "table-sep" | "body";

interface ParsedLine {
  text: string;
  kind: LineKind;
}

// ---------------------------------------------------------------------------
// Markdown stripping
// ---------------------------------------------------------------------------

const TABLE_SEP_RE = /^\|[\s\-:|]+\|$/;
const DIVIDER_RE = /^-{3,}$/;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const CODE_RE = /`([^`]+)`/g;

function stripInline(text: string): string {
  return text
    .replace(BOLD_RE, "$1")
    .replace(ITALIC_RE, "$1")
    .replace(CODE_RE, "$1");
}

function parseLine(raw: string): ParsedLine {
  if (raw.startsWith("### ")) {
    return { text: stripInline(raw.slice(4)), kind: "h3" };
  }
  if (raw.startsWith("## ")) {
    return { text: stripInline(raw.slice(3)), kind: "h2" };
  }
  if (raw.startsWith("# ")) {
    return { text: stripInline(raw.slice(2)), kind: "h1" };
  }
  if (TABLE_SEP_RE.test(raw.trim())) {
    return { text: "", kind: "table-sep" };
  }
  if (DIVIDER_RE.test(raw.trim())) {
    return { text: "────────────────────────", kind: "separator" };
  }
  return { text: stripInline(raw), kind: "body" };
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

  // Normalize line endings — strip \r to handle CRLF content from OpenClaw.
  const rawLines = reportContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parsed = rawLines.map(parseLine).filter((l) => l.kind !== "table-sep");
  const truncated = parsed.length > MAX_DISPLAY_LINES;
  const displayLines = truncated ? parsed.slice(0, MAX_DISPLAY_LINES) : parsed;

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["status.success"] }} />
        <Text
          content="Conversion Report"
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>

      {/* ScrollBox with Box-wrapped lines — bare Text elements don't get their
          own row in OpenTUI flex layout; each line must be a Box child. */}
      <ScrollBox
        style={{ flexGrow: 1, marginTop: 1 }}
        scrollX={false}
        scrollY={true}
        contentOptions={{ flexDirection: "column", paddingLeft: 2 }}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{ visible: false }}
      >
        {displayLines.map((line, index) => {
          const color = line.kind === "h1"
            ? tokens["accent.primary"]
            : line.kind === "h2" || line.kind === "h3"
              ? tokens["text.primary"]
              : line.kind === "separator"
                ? tokens["text.muted"]
                : tokens["text.secondary"];

          const prefix = line.kind === "h2"
            ? "> "
            : line.kind === "h3"
              ? "  . "
              : "";

          const content = line.text.length > 0
            ? `${prefix}${line.text}`
            : " ";

          return (
            <Box key={index} style={{ flexDirection: "row" }}>
              <Text content={content} style={{ color }} />
            </Box>
          );
        })}
      </ScrollBox>

      {truncated ? (
        <Box style={{ paddingLeft: 2 }}>
          <Text
            content={`... ${parsed.length - MAX_DISPLAY_LINES} more lines. See full report at ~/.reins/`}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
