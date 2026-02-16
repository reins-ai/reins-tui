import type { CompletionSuggestion } from "../commands/completion";
import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export interface CompletionPopupProps {
  readonly visible: boolean;
  readonly suggestions: readonly CompletionSuggestion[];
  readonly selectedIndex: number;
  readonly maxVisible?: number;
}

const DEFAULT_MAX_VISIBLE = 8;

const KIND_GLYPHS: Record<CompletionSuggestion["kind"], string> = {
  command: "/",
  subcommand: "▸",
  argument: "◆",
  flag: "⚑",
  "flag-value": "◇",
};

interface SuggestionRowProps {
  readonly suggestion: CompletionSuggestion;
  readonly isSelected: boolean;
}

function SuggestionRow({ suggestion, isSelected }: SuggestionRowProps) {
  const { tokens } = useThemeTokens();

  const bgColor = isSelected ? tokens["surface.elevated"] : "transparent";
  const labelColor = isSelected ? tokens["accent.primary"] : tokens["text.primary"];
  const glyph = KIND_GLYPHS[suggestion.kind];
  const displayLabel = suggestion.kind === "command"
    ? suggestion.label.replace(/^\//, "")
    : suggestion.label;

  // Truncate detail to avoid overflow
  const detail = suggestion.detail
    ? suggestion.detail.length > 40
      ? suggestion.detail.slice(0, 39) + "…"
      : suggestion.detail
    : "";

  return (
    <Box
      style={{
        flexDirection: "row",
        backgroundColor: bgColor,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <Text
        content={isSelected ? "▸ " : "  "}
        style={{ color: tokens["accent.primary"] }}
      />
      <Text
        content={`${glyph} `}
        style={{ color: tokens["text.secondary"] }}
      />
      <Text
        content={displayLabel}
        style={{ color: labelColor }}
      />
      {detail.length > 0 ? (
        <Text
          content={`  ${detail}`}
          style={{ color: tokens["text.muted"] }}
        />
      ) : null}
    </Box>
  );
}

/**
 * Completion popup rendered directly above the input FramedBlock.
 *
 * Rendered as a normal flow element before the input in a column container.
 * When there are no suggestions, returns null (takes up no space).
 * This avoids absolute positioning complexity in terminal TUI layout.
 */
export function CompletionPopup({
  visible,
  suggestions,
  selectedIndex,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: CompletionPopupProps) {
  const { tokens } = useThemeTokens();

  if (!visible || suggestions.length === 0) {
    return null;
  }

  // Compute the visible window of suggestions around the selected index
  const total = suggestions.length;
  const visibleCount = Math.min(total, maxVisible);
  let startIndex = 0;

  if (total > visibleCount) {
    const halfWindow = Math.floor(visibleCount / 2);
    startIndex = Math.max(0, Math.min(selectedIndex - halfWindow, total - visibleCount));
  }

  const visibleSuggestions = suggestions.slice(startIndex, startIndex + visibleCount);

  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = startIndex + visibleCount < total;

  return (
    <Box
      style={{
        flexDirection: "column",
        width: "100%",
        border: ["left"],
        borderColor: tokens["border.focus"],
        backgroundColor: tokens["surface.secondary"],
        paddingLeft: 2,
        paddingRight: 1,
        marginBottom: 0,
      }}
    >
      {/* Hint row */}
      <Box
        style={{
          flexDirection: "row",
          paddingRight: 1,
        }}
      >
        <Box style={{ flexGrow: 1 }}>
          <Text
            content="Tab accept · ↑↓ navigate · Esc dismiss"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
        <Text
          content={`${total} result${total === 1 ? "" : "s"}`}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>

      {/* Scroll indicator (above) */}
      {hasMoreAbove ? (
        <Box style={{ paddingLeft: 1 }}>
          <Text content="↑ more" style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}

      {/* Suggestion rows */}
      {visibleSuggestions.map((suggestion, visualIndex) => {
        const actualIndex = startIndex + visualIndex;
        return (
          <SuggestionRow
            key={`${suggestion.kind}-${suggestion.label}-${actualIndex}`}
            suggestion={suggestion}
            isSelected={actualIndex === selectedIndex}
          />
        );
      })}

      {/* Scroll indicator (below) */}
      {hasMoreBelow ? (
        <Box style={{ paddingLeft: 1 }}>
          <Text content="↓ more" style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}
    </Box>
  );
}
