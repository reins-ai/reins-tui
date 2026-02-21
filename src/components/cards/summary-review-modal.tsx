import { useCallback, useState } from "react";

import { useThemeTokens } from "../../theme";
import type { ThemeTokens } from "../../theme/theme-schema";
import type { FramedBlockStyle } from "../../ui/types";
import { Box, Input, ScrollBox, Text, useKeyboard } from "../../ui";
import { FramedBlock, SUBTLE_BORDER_CHARS } from "../../ui/primitives";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummaryReviewModalProps {
  summaryText: string;
  onAccept: () => void;
  onEdit: (newText: string) => void;
  onReject: () => void;
  onClose: () => void;
}

type ModalMode = "review" | "edit";

// ---------------------------------------------------------------------------
// Pure helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Build the modal header line.
 * Format: "◆ Summary Review"
 */
export function buildModalHeader(): string {
  return "\u25C6 Summary Review";
}

/**
 * Build the keybinding legend for review mode.
 */
export function buildReviewLegend(): string {
  return "[a] Accept  [e] Edit  [r] Reject  [Esc] Close";
}

/**
 * Build the keybinding legend for edit mode.
 */
export function buildEditLegend(): string {
  return "[Enter] Save  [Esc] Cancel";
}

/**
 * Resolve the FramedBlock style for the summary review modal.
 * Uses the info accent colour with a secondary surface background.
 */
export function getModalStyle(tokens: Readonly<ThemeTokens>): FramedBlockStyle {
  return {
    accentColor: tokens["accent.primary"],
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
 * Extract a plain string from the Input component's onInput value.
 * The Input component may pass a string or an object with a plainText
 * or value property depending on the renderer.
 */
function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof (value as { plainText: unknown }).plainText === "string") {
      return (value as { plainText: string }).plainText;
    }
    if ("value" in value && typeof (value as { value: unknown }).value === "string") {
      return (value as { value: string }).value;
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SummaryReviewModal renders a bordered overlay for reviewing a compaction
 * summary. Supports three actions:
 *
 *   [a] Accept  — dismiss the modal (summary already applied)
 *   [e] Edit    — enter inline edit mode to modify the summary text
 *   [r] Reject  — revert to pre-compaction message list
 *   [Esc]/[q]   — close without action (same as accept)
 *
 * In edit mode, the summary text is shown in an Input field. Enter commits
 * the edit; Esc cancels and returns to review mode.
 */
export function SummaryReviewModal({
  summaryText,
  onAccept,
  onEdit,
  onReject,
  onClose,
}: SummaryReviewModalProps) {
  const { tokens } = useThemeTokens();
  const [mode, setMode] = useState<ModalMode>("review");
  const [editText, setEditText] = useState(summaryText);

  const handleAccept = useCallback(() => {
    onAccept();
  }, [onAccept]);

  const handleReject = useCallback(() => {
    onReject();
  }, [onReject]);

  const handleEditStart = useCallback(() => {
    setEditText(summaryText);
    setMode("edit");
  }, [summaryText]);

  const handleEditCancel = useCallback(() => {
    setMode("review");
  }, []);

  const handleEditCommit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed.length > 0) {
      onEdit(trimmed);
    }
  }, [editText, onEdit]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (mode === "edit") {
      if (keyName === "escape" || keyName === "esc") {
        handleEditCancel();
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        handleEditCommit();
        return;
      }
      // In edit mode, all other keys are handled by the Input component
      return;
    }

    // Review mode keybindings
    if (keyName === "escape" || keyName === "esc" || sequence === "q") {
      onClose();
      return;
    }
    if (sequence === "a") {
      handleAccept();
      return;
    }
    if (sequence === "e") {
      handleEditStart();
      return;
    }
    if (sequence === "r") {
      handleReject();
    }
  });

  const blockStyle = getModalStyle(tokens);
  const header = buildModalHeader();
  const legend = mode === "edit" ? buildEditLegend() : buildReviewLegend();

  return (
    <FramedBlock style={blockStyle} borderChars={SUBTLE_BORDER_CHARS}>
      <Box style={{ flexDirection: "column" }}>
        {/* Header */}
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text
            content={header}
            style={{ color: tokens["accent.primary"], fontWeight: "bold" }}
          />
        </Box>

        {/* Summary content */}
        {mode === "review" ? (
          <ScrollBox
            style={{ maxHeight: 12, minHeight: 1 }}
            scrollX={false}
            scrollY={true}
            verticalScrollbarOptions={{ visible: false }}
          >
            <Text
              content={summaryText}
              style={{ color: tokens["text.primary"] }}
            />
          </ScrollBox>
        ) : (
          <Box style={{ flexDirection: "column" }}>
            <Text
              content="Edit summary:"
              style={{ color: tokens["text.secondary"], marginBottom: 1 }}
            />
            <Box style={{ flexDirection: "row" }}>
              <Text
                content={editText || " "}
                style={{ color: tokens["text.primary"] }}
              />
            </Box>
            <Input
              focused
              placeholder=""
              value={editText}
              onInput={(value) => setEditText(extractInputValue(value))}
            />
          </Box>
        )}

        {/* Legend */}
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text
            content={legend}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </FramedBlock>
  );
}
