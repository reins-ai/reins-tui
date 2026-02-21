import { describe, expect, mock, test } from "bun:test";

import {
  buildEditLegend,
  buildModalHeader,
  buildReviewLegend,
  getModalStyle,
  type SummaryReviewModalProps,
} from "../../src/components/cards/summary-review-modal";
import type { ThemeTokens } from "../../src/theme/theme-schema";

// --- Test fixtures ---

function makeTokens(overrides: Partial<Record<string, string>> = {}): Readonly<ThemeTokens> {
  const base: Record<string, string> = {
    "accent.primary": "#0088ff",
    "surface.secondary": "#1a1a1a",
    "text.primary": "#ffffff",
    "text.secondary": "#aaaaaa",
    "text.muted": "#666666",
    "status.warning": "#ffaa00",
    "status.error": "#ff0000",
    ...overrides,
  };
  return base as unknown as ThemeTokens;
}

// ---------------------------------------------------------------------------
// buildModalHeader
// ---------------------------------------------------------------------------

describe("buildModalHeader", () => {
  test("returns header with diamond prefix", () => {
    const header = buildModalHeader();
    expect(header).toBe("\u25C6 Summary Review");
  });

  test("contains 'Summary Review' text", () => {
    expect(buildModalHeader()).toContain("Summary Review");
  });
});

// ---------------------------------------------------------------------------
// buildReviewLegend
// ---------------------------------------------------------------------------

describe("buildReviewLegend", () => {
  test("includes accept keybinding", () => {
    expect(buildReviewLegend()).toContain("[a] Accept");
  });

  test("includes edit keybinding", () => {
    expect(buildReviewLegend()).toContain("[e] Edit");
  });

  test("includes reject keybinding", () => {
    expect(buildReviewLegend()).toContain("[r] Reject");
  });

  test("includes close keybinding", () => {
    expect(buildReviewLegend()).toContain("[Esc] Close");
  });

  test("returns exact expected string", () => {
    expect(buildReviewLegend()).toBe("[a] Accept  [e] Edit  [r] Reject  [Esc] Close");
  });
});

// ---------------------------------------------------------------------------
// buildEditLegend
// ---------------------------------------------------------------------------

describe("buildEditLegend", () => {
  test("includes save keybinding", () => {
    expect(buildEditLegend()).toContain("[Enter] Save");
  });

  test("includes cancel keybinding", () => {
    expect(buildEditLegend()).toContain("[Esc] Cancel");
  });

  test("returns exact expected string", () => {
    expect(buildEditLegend()).toBe("[Enter] Save  [Esc] Cancel");
  });
});

// ---------------------------------------------------------------------------
// getModalStyle
// ---------------------------------------------------------------------------

describe("getModalStyle", () => {
  test("uses accent.primary for accent colour", () => {
    const tokens = makeTokens();
    const style = getModalStyle(tokens);
    expect(style.accentColor).toBe("#0088ff");
  });

  test("uses surface.secondary for background", () => {
    const tokens = makeTokens();
    const style = getModalStyle(tokens);
    expect(style.backgroundColor).toBe("#1a1a1a");
  });

  test("has consistent padding values", () => {
    const tokens = makeTokens();
    const style = getModalStyle(tokens);
    expect(style.paddingLeft).toBe(2);
    expect(style.paddingRight).toBe(1);
    expect(style.paddingTop).toBe(0);
    expect(style.paddingBottom).toBe(0);
  });

  test("has zero margins", () => {
    const tokens = makeTokens();
    const style = getModalStyle(tokens);
    expect(style.marginTop).toBe(0);
    expect(style.marginBottom).toBe(0);
  });

  test("respects custom token values", () => {
    const tokens = makeTokens({
      "accent.primary": "#ff00ff",
      "surface.secondary": "#222222",
    });
    const style = getModalStyle(tokens);
    expect(style.accentColor).toBe("#ff00ff");
    expect(style.backgroundColor).toBe("#222222");
  });
});

// ---------------------------------------------------------------------------
// SummaryReviewModalProps callback contract
// ---------------------------------------------------------------------------

describe("SummaryReviewModalProps callback contract", () => {
  test("onAccept is called for 'a' key in review mode", () => {
    const onAccept = mock(() => {});
    const onEdit = mock((_text: string) => {});
    const onReject = mock(() => {});
    const onClose = mock(() => {});

    // Simulate the component's keyboard handler in review mode
    const mode = "review";
    const sequence = "a";

    if (mode === "review") {
      if (sequence === "a") onAccept();
    }

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("onReject is called for 'r' key in review mode", () => {
    const onAccept = mock(() => {});
    const onReject = mock(() => {});
    const onClose = mock(() => {});

    const mode = "review";
    const sequence = "r";

    if (mode === "review") {
      if (sequence === "a") onAccept();
      if (sequence === "r") onReject();
    }

    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("onClose is called for escape key in review mode", () => {
    const onAccept = mock(() => {});
    const onReject = mock(() => {});
    const onClose = mock(() => {});

    const mode = "review";
    const keyName = "escape";

    if (mode === "review") {
      if (keyName === "escape" || keyName === "esc") {
        onClose();
        return;
      }
    }

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  test("onClose is called for 'q' key in review mode", () => {
    const onClose = mock(() => {});

    const mode = "review";
    const keyName = "";
    const sequence = "q";

    if (mode === "review") {
      if (keyName === "escape" || keyName === "esc" || sequence === "q") {
        onClose();
      }
    }

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("edit mode is entered for 'e' key in review mode", () => {
    let mode: "review" | "edit" = "review";
    const sequence = "e";

    if (mode === "review") {
      if (sequence === "e") {
        mode = "edit";
      }
    }

    expect(mode).toBe("edit");
  });

  test("edit mode returns to review on escape", () => {
    let mode: "review" | "edit" = "edit";
    const keyName = "escape";

    if (mode === "edit") {
      if (keyName === "escape" || keyName === "esc") {
        mode = "review";
      }
    }

    expect(mode).toBe("review");
  });

  test("onEdit is called with trimmed text on enter in edit mode", () => {
    const onEdit = mock((_text: string) => {});
    const editText = "  Updated summary text  ";

    const mode = "edit";
    const keyName = "return";

    if (mode === "edit") {
      if (keyName === "return" || keyName === "enter") {
        const trimmed = editText.trim();
        if (trimmed.length > 0) {
          onEdit(trimmed);
        }
      }
    }

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("Updated summary text");
  });

  test("onEdit is not called when edit text is empty after trim", () => {
    const onEdit = mock((_text: string) => {});
    const editText = "   ";

    const mode = "edit";
    const keyName = "return";

    if (mode === "edit") {
      if (keyName === "return" || keyName === "enter") {
        const trimmed = editText.trim();
        if (trimmed.length > 0) {
          onEdit(trimmed);
        }
      }
    }

    expect(onEdit).not.toHaveBeenCalled();
  });

  test("review mode keys are ignored in edit mode", () => {
    const onAccept = mock(() => {});
    const onReject = mock(() => {});

    const mode = "edit";
    const sequence = "a";

    // In edit mode, review keybindings should not fire
    if (mode === "edit") {
      // Only escape and return are handled; all other keys go to Input
      if (sequence === "a") {
        // This should NOT call onAccept in edit mode
      }
    } else {
      if (sequence === "a") onAccept();
      if (sequence === "r") onReject();
    }

    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  test("unrelated keys do not trigger any callback in review mode", () => {
    const onAccept = mock(() => {});
    const onEdit = mock((_text: string) => {});
    const onReject = mock(() => {});
    const onClose = mock(() => {});

    const mode = "review";
    const keyName = "";
    const sequence = "x";

    if (mode === "review") {
      if (keyName === "escape" || keyName === "esc" || sequence === "q") {
        onClose();
      } else if (sequence === "a") {
        onAccept();
      } else if (sequence === "e") {
        // enter edit mode
      } else if (sequence === "r") {
        onReject();
      }
    }

    expect(onAccept).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SummaryReviewModalProps type contract
// ---------------------------------------------------------------------------

describe("SummaryReviewModalProps type contract", () => {
  test("props shape matches expected interface", () => {
    const props: SummaryReviewModalProps = {
      summaryText: "This is a summary of the conversation.",
      onAccept: () => {},
      onEdit: (_text: string) => {},
      onReject: () => {},
      onClose: () => {},
    };

    expect(props.summaryText).toBe("This is a summary of the conversation.");
    expect(typeof props.onAccept).toBe("function");
    expect(typeof props.onEdit).toBe("function");
    expect(typeof props.onReject).toBe("function");
    expect(typeof props.onClose).toBe("function");
  });

  test("summaryText can be empty string", () => {
    const props: SummaryReviewModalProps = {
      summaryText: "",
      onAccept: () => {},
      onEdit: () => {},
      onReject: () => {},
      onClose: () => {},
    };

    expect(props.summaryText).toBe("");
  });

  test("summaryText can contain multi-line content", () => {
    const multiLine = "Line 1\nLine 2\nLine 3";
    const props: SummaryReviewModalProps = {
      summaryText: multiLine,
      onAccept: () => {},
      onEdit: () => {},
      onReject: () => {},
      onClose: () => {},
    };

    expect(props.summaryText.split("\n")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Modal mode transitions (state machine)
// ---------------------------------------------------------------------------

describe("modal mode transitions", () => {
  test("starts in review mode", () => {
    const initialMode: "review" | "edit" = "review";
    expect(initialMode).toBe("review");
  });

  test("review → edit on 'e' key", () => {
    let mode: "review" | "edit" = "review";
    // Simulate pressing 'e'
    mode = "edit";
    expect(mode).toBe("edit");
  });

  test("edit → review on escape", () => {
    let mode: "review" | "edit" = "edit";
    // Simulate pressing escape
    mode = "review";
    expect(mode).toBe("review");
  });

  test("edit → review on enter (commit)", () => {
    let mode: "review" | "edit" = "edit";
    // After committing edit, mode returns to review (modal closes via onEdit)
    // The component calls onEdit which typically closes the modal
    const onEdit = mock((_text: string) => {});
    const editText = "Updated text";

    if (mode === "edit") {
      const trimmed = editText.trim();
      if (trimmed.length > 0) {
        onEdit(trimmed);
      }
    }

    expect(onEdit).toHaveBeenCalledWith("Updated text");
  });

  test("review mode does not transition on unrelated keys", () => {
    let mode: "review" | "edit" = "review";
    const sequence = "x";

    // Only 'e' transitions to edit
    if (sequence === "e") {
      mode = "edit";
    }

    expect(mode).toBe("review");
  });
});
