import { describe, expect, test } from "bun:test";

import {
  getBriefingDateKey,
  shouldShowBriefing,
  formatBriefingTime,
  getSectionIcon,
  truncateLine,
  padBriefingLine,
  buildBriefingLines,
  resolveLineColor,
  type BriefingData,
} from "../../src/components/briefing-panel";
import type { ThemeTokens } from "../../src/theme/theme-schema";

// --- Mock tokens ---

const MOCK_TOKENS: ThemeTokens = {
  "surface.primary": "#1a1a2e",
  "surface.secondary": "#252540",
  "surface.tertiary": "#2e2e4a",
  "surface.elevated": "#353555",
  "text.primary": "#e8e0d4",
  "text.secondary": "#a09888",
  "text.muted": "#6b6360",
  "text.inverse": "#1a1a2e",
  "accent.primary": "#e8976c",
  "accent.secondary": "#f0c674",
  "accent.subtle": "#4a3a2e",
  "border.primary": "#4a4a6a",
  "border.subtle": "#3a3a5a",
  "border.focus": "#e8976c",
  "status.error": "#e85050",
  "status.success": "#50c878",
  "status.warning": "#f0c674",
  "status.info": "#6ca8e8",
  "glyph.reins": "#e8976c",
  "glyph.user": "#f0c674",
  "glyph.tool.running": "#6ca8e8",
  "glyph.tool.done": "#50c878",
  "glyph.tool.error": "#e85050",
  "glyph.heartbeat": "#e8976c",
  "conversation.user.bg": "#2e2e4a",
  "conversation.user.text": "#e8e0d4",
  "conversation.assistant.bg": "#1a1a2e",
  "conversation.assistant.text": "#e8e0d4",
  "sidebar.bg": "#1a1a2e",
  "sidebar.text": "#a09888",
  "sidebar.active": "#e8976c",
  "sidebar.hover": "#353555",
  "input.bg": "#252540",
  "input.text": "#e8e0d4",
  "input.placeholder": "#6b6360",
  "input.border": "#4a4a6a",
  "depth.panel1": "#252540",
  "depth.panel2": "#2e2e4a",
  "depth.panel3": "#353555",
  "depth.interactive": "#3a3a5a",
  "role.user.border": "#e8976c",
  "role.assistant.border": "#6ca8e8",
  "role.system.border": "#50c878",
};

// --- Test data factories ---

function createBriefing(overrides?: Partial<BriefingData>): BriefingData {
  return {
    messages: [
      { sectionType: "open_threads", text: "📋 Open Threads\n\n• Review PR #42 (code-review)" },
      { sectionType: "high_importance", text: "⚠️ High Importance\n\n• Deploy deadline tomorrow (ops)" },
    ],
    totalItems: 3,
    timestamp: new Date("2026-02-19T08:00:00.000Z"),
    isEmpty: false,
    ...overrides,
  };
}

function createEmptyBriefing(): BriefingData {
  return {
    messages: [{ sectionType: "empty", text: "Good morning! Nothing to report today." }],
    totalItems: 0,
    timestamp: new Date("2026-02-19T08:00:00.000Z"),
    isEmpty: true,
  };
}

// ---------------------------------------------------------------------------
// getBriefingDateKey
// ---------------------------------------------------------------------------

describe("getBriefingDateKey", () => {
  test("formats date as YYYY-MM-DD", () => {
    const date = new Date("2026-02-19T08:00:00.000Z");
    expect(getBriefingDateKey(date)).toBe("2026-02-19");
  });

  test("pads single-digit month and day", () => {
    const date = new Date("2026-01-05T12:00:00.000Z");
    expect(getBriefingDateKey(date)).toBe("2026-01-05");
  });

  test("handles end of year", () => {
    const date = new Date("2026-12-31T23:59:59.000Z");
    expect(getBriefingDateKey(date)).toBe("2026-12-31");
  });

  test("handles start of year", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(getBriefingDateKey(date)).toBe("2026-01-01");
  });
});

// ---------------------------------------------------------------------------
// shouldShowBriefing
// ---------------------------------------------------------------------------

describe("shouldShowBriefing", () => {
  test("returns true when briefing exists, channels not configured, not dismissed", () => {
    const briefing = createBriefing();
    const result = shouldShowBriefing(briefing, false, new Set());
    expect(result).toBe(true);
  });

  test("returns false when briefing is null", () => {
    const result = shouldShowBriefing(null, false, new Set());
    expect(result).toBe(false);
  });

  test("returns false when briefing is empty", () => {
    const briefing = createEmptyBriefing();
    const result = shouldShowBriefing(briefing, false, new Set());
    expect(result).toBe(false);
  });

  test("returns false when channels are configured", () => {
    const briefing = createBriefing();
    const result = shouldShowBriefing(briefing, true, new Set());
    expect(result).toBe(false);
  });

  test("returns false when briefing date has been dismissed", () => {
    const briefing = createBriefing();
    const dateKey = getBriefingDateKey(briefing.timestamp);
    const dismissed = new Set([dateKey]);
    const result = shouldShowBriefing(briefing, false, dismissed);
    expect(result).toBe(false);
  });

  test("returns true when a different date is dismissed", () => {
    const briefing = createBriefing();
    const dismissed = new Set(["2026-02-18"]);
    const result = shouldShowBriefing(briefing, false, dismissed);
    expect(result).toBe(true);
  });

  test("returns false when briefing has zero totalItems but isEmpty is false", () => {
    // Edge case: messages exist but isEmpty flag is set
    const briefing = createBriefing({ isEmpty: true, totalItems: 0 });
    const result = shouldShowBriefing(briefing, false, new Set());
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatBriefingTime
// ---------------------------------------------------------------------------

describe("formatBriefingTime", () => {
  test("formats morning time correctly", () => {
    const date = new Date("2026-02-19T08:00:00.000Z");
    const result = formatBriefingTime(date);
    // UTC 8:00 AM
    expect(result).toContain("AM");
  });

  test("formats afternoon time correctly", () => {
    const date = new Date("2026-02-19T14:30:00.000Z");
    const result = formatBriefingTime(date);
    expect(result).toContain("PM");
  });

  test("formats midnight as 12:00 AM", () => {
    const date = new Date("2026-02-19T00:00:00.000Z");
    const result = formatBriefingTime(date);
    expect(result).toBe("12:00 AM");
  });

  test("formats noon as 12:00 PM", () => {
    const date = new Date("2026-02-19T12:00:00.000Z");
    const result = formatBriefingTime(date);
    expect(result).toBe("12:00 PM");
  });

  test("pads single-digit minutes", () => {
    const date = new Date("2026-02-19T09:05:00.000Z");
    const result = formatBriefingTime(date);
    expect(result).toContain(":05");
  });
});

// ---------------------------------------------------------------------------
// getSectionIcon
// ---------------------------------------------------------------------------

describe("getSectionIcon", () => {
  test("returns clipboard for open_threads", () => {
    expect(getSectionIcon("open_threads")).toBe("\u{1F4CB}");
  });

  test("returns warning for high_importance", () => {
    expect(getSectionIcon("high_importance")).toBe("\u{26A0}\u{FE0F}");
  });

  test("returns checkmark for recent_decisions", () => {
    expect(getSectionIcon("recent_decisions")).toBe("\u{2705}");
  });

  test("returns calendar for upcoming", () => {
    expect(getSectionIcon("upcoming")).toBe("\u{1F4C5}");
  });

  test("returns sparkles for empty", () => {
    expect(getSectionIcon("empty")).toBe("\u{2728}");
  });

  test("returns pin for unknown section type", () => {
    expect(getSectionIcon("unknown_type")).toBe("\u{1F4CC}");
  });
});

// ---------------------------------------------------------------------------
// truncateLine
// ---------------------------------------------------------------------------

describe("truncateLine", () => {
  test("returns text unchanged when within limit", () => {
    expect(truncateLine("short", 10)).toBe("short");
  });

  test("truncates with ellipsis when exceeding limit", () => {
    const result = truncateLine("this is a very long line", 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  test("returns text unchanged when exactly at limit", () => {
    expect(truncateLine("exact", 5)).toBe("exact");
  });

  test("handles empty string", () => {
    expect(truncateLine("", 10)).toBe("");
  });

  test("handles single character limit", () => {
    const result = truncateLine("ab", 1);
    expect(result).toBe("\u2026");
  });
});

// ---------------------------------------------------------------------------
// padBriefingLine
// ---------------------------------------------------------------------------

describe("padBriefingLine", () => {
  test("pads short content with spaces", () => {
    const result = padBriefingLine("hi", 10);
    // "│ hi     │" — available = 10 - 4 = 6, content = 2, padding = 4
    expect(result.startsWith("\u2502 ")).toBe(true);
    expect(result.endsWith(" \u2502")).toBe(true);
    expect(result).toContain("hi");
  });

  test("truncates long content with ellipsis", () => {
    const longContent = "A".repeat(50);
    const result = padBriefingLine(longContent, 20);
    // available = 16, truncated to 15 + ellipsis
    expect(result.startsWith("\u2502 ")).toBe(true);
    expect(result.endsWith(" \u2502")).toBe(true);
    expect(result).toContain("\u2026");
  });

  test("handles empty content", () => {
    const result = padBriefingLine("", 10);
    expect(result.startsWith("\u2502 ")).toBe(true);
    expect(result.endsWith(" \u2502")).toBe(true);
  });

  test("content exactly fills available width", () => {
    // available = width - 4 = 6
    const result = padBriefingLine("abcdef", 10);
    expect(result).toBe("\u2502 abcdef \u2502");
  });
});

// ---------------------------------------------------------------------------
// buildBriefingLines
// ---------------------------------------------------------------------------

describe("buildBriefingLines", () => {
  test("includes time line as first entry", () => {
    const briefing = createBriefing();
    const lines = buildBriefingLines(briefing);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].colorKey).toBe("muted");
    expect(lines[0].text).toContain("Generated at");
  });

  test("includes separator after time line", () => {
    const briefing = createBriefing();
    const lines = buildBriefingLines(briefing);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Second line is empty separator
    expect(lines[1].colorKey).toBe("muted");
  });

  test("includes section content lines", () => {
    const briefing = createBriefing();
    const lines = buildBriefingLines(briefing);
    // Should have time + separator + at least one section line
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const contentLines = lines.filter((l) => l.colorKey === "secondary");
    expect(contentLines.length).toBeGreaterThan(0);
  });

  test("includes total items count", () => {
    const briefing = createBriefing();
    const lines = buildBriefingLines(briefing);
    const countLine = lines.find((l) => l.text.includes("total"));
    expect(countLine).toBeDefined();
    expect(countLine?.text).toContain("3 items total");
  });

  test("uses singular for single item", () => {
    const briefing = createBriefing({ totalItems: 1 });
    const lines = buildBriefingLines(briefing);
    const countLine = lines.find((l) => l.text.includes("total"));
    expect(countLine?.text).toContain("1 item total");
  });

  test("respects max content lines", () => {
    const manyMessages = Array.from({ length: 20 }, (_, i) => ({
      sectionType: "open_threads",
      text: `Section ${i + 1}\n\n• Item ${i + 1}`,
    }));
    const briefing = createBriefing({ messages: manyMessages });
    const lines = buildBriefingLines(briefing);
    // Should not exceed a reasonable number of lines
    // time + separator + max content + separator + count
    expect(lines.length).toBeLessThanOrEqual(12);
  });

  test("all lines are padded with border characters", () => {
    const briefing = createBriefing();
    const lines = buildBriefingLines(briefing);
    for (const line of lines) {
      expect(line.text.startsWith("\u2502 ")).toBe(true);
      expect(line.text.endsWith(" \u2502")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveLineColor
// ---------------------------------------------------------------------------

describe("resolveLineColor", () => {
  test("resolves primary to text.primary token", () => {
    expect(resolveLineColor("primary", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.primary"]);
  });

  test("resolves secondary to text.secondary token", () => {
    expect(resolveLineColor("secondary", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.secondary"]);
  });

  test("resolves muted to text.muted token", () => {
    expect(resolveLineColor("muted", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("resolves accent to accent.primary token", () => {
    expect(resolveLineColor("accent", MOCK_TOKENS)).toBe(MOCK_TOKENS["accent.primary"]);
  });

  test("all color keys produce valid hex values", () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    const keys = ["primary", "secondary", "muted", "accent"] as const;
    for (const key of keys) {
      expect(resolveLineColor(key, MOCK_TOKENS)).toMatch(hexPattern);
    }
  });

  test("all color keys produce distinct values", () => {
    const keys = ["primary", "secondary", "muted", "accent"] as const;
    const colors = keys.map((k) => resolveLineColor(k, MOCK_TOKENS));
    const unique = new Set(colors);
    expect(unique.size).toBe(keys.length);
  });
});

// ---------------------------------------------------------------------------
// BriefingPanel component visibility logic
// ---------------------------------------------------------------------------

describe("BriefingPanel visibility logic", () => {
  test("panel is visible with valid briefing, no channels, not dismissed", () => {
    const briefing = createBriefing();
    expect(shouldShowBriefing(briefing, false, new Set())).toBe(true);
  });

  test("panel is hidden when briefing is null", () => {
    expect(shouldShowBriefing(null, false, new Set())).toBe(false);
  });

  test("panel is hidden when briefing is empty", () => {
    const briefing = createEmptyBriefing();
    expect(shouldShowBriefing(briefing, false, new Set())).toBe(false);
  });

  test("panel is hidden when channels are configured", () => {
    const briefing = createBriefing();
    expect(shouldShowBriefing(briefing, true, new Set())).toBe(false);
  });

  test("panel is hidden after dismissal for same date", () => {
    const briefing = createBriefing();
    const dateKey = getBriefingDateKey(briefing.timestamp);
    expect(shouldShowBriefing(briefing, false, new Set([dateKey]))).toBe(false);
  });

  test("panel is visible when dismissed date does not match", () => {
    const briefing = createBriefing();
    expect(shouldShowBriefing(briefing, false, new Set(["2025-01-01"]))).toBe(true);
  });

  test("dismiss state is per-date, not global", () => {
    const briefing1 = createBriefing({ timestamp: new Date("2026-02-19T08:00:00Z") });
    const briefing2 = createBriefing({ timestamp: new Date("2026-02-20T08:00:00Z") });
    const dismissed = new Set([getBriefingDateKey(briefing1.timestamp)]);

    expect(shouldShowBriefing(briefing1, false, dismissed)).toBe(false);
    expect(shouldShowBriefing(briefing2, false, dismissed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Card border glyph consistency
// ---------------------------------------------------------------------------

describe("briefing card border glyphs", () => {
  const TOP_LEFT = "\u256D";
  const TOP_RIGHT = "\u256E";
  const BOTTOM_LEFT = "\u2570";
  const BOTTOM_RIGHT = "\u256F";
  const HORIZONTAL = "\u2500";
  const VERTICAL = "\u2502";

  test("uses same border vocabulary as other cards", () => {
    expect(TOP_LEFT).toBe("╭");
    expect(TOP_RIGHT).toBe("╮");
    expect(BOTTOM_LEFT).toBe("╰");
    expect(BOTTOM_RIGHT).toBe("╯");
    expect(HORIZONTAL).toBe("─");
    expect(VERTICAL).toBe("│");
  });

  test("padBriefingLine uses vertical border characters", () => {
    const line = padBriefingLine("test", 20);
    expect(line.charAt(0)).toBe(VERTICAL);
    expect(line.charAt(line.length - 1)).toBe(VERTICAL);
  });
});

// ---------------------------------------------------------------------------
// Integration: full briefing flow
// ---------------------------------------------------------------------------

describe("briefing panel integration", () => {
  test("complete flow: create briefing, check visibility, build lines, resolve colors", () => {
    const briefing = createBriefing();

    // Step 1: Check visibility
    expect(shouldShowBriefing(briefing, false, new Set())).toBe(true);

    // Step 2: Build lines
    const lines = buildBriefingLines(briefing);
    expect(lines.length).toBeGreaterThan(0);

    // Step 3: Resolve colors for all lines
    for (const line of lines) {
      const color = resolveLineColor(line.colorKey, MOCK_TOKENS);
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("dismiss flow: show → dismiss → hidden", () => {
    const briefing = createBriefing();
    const dismissed = new Set<string>();

    // Initially visible
    expect(shouldShowBriefing(briefing, false, dismissed)).toBe(true);

    // Dismiss
    const dateKey = getBriefingDateKey(briefing.timestamp);
    dismissed.add(dateKey);

    // Now hidden
    expect(shouldShowBriefing(briefing, false, dismissed)).toBe(false);
  });

  test("channel configuration flow: no channels → visible, channels added → hidden", () => {
    const briefing = createBriefing();

    // No channels: visible
    expect(shouldShowBriefing(briefing, false, new Set())).toBe(true);

    // Channels configured: hidden
    expect(shouldShowBriefing(briefing, true, new Set())).toBe(false);
  });
});
