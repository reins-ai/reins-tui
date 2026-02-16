import { describe, expect, test } from "bun:test";

import {
  buildDrawerBorderStyle,
  resolveDrawerPosition,
} from "../../src/components/drawer-panel";
import {
  buildModalTitle,
} from "../../src/components/modal-panel";
import {
  buildCardTopBorder,
  buildCardBottomBorder,
  padCardLine,
  resolveVariantColor,
  type RichCardVariant,
} from "../../src/components/rich-card";
import {
  classifyInputSubmission,
  MAX_INPUT_LENGTH,
  type InputSubmissionKind,
} from "../../src/components/input-area";
import {
  SIDEBAR_CONTEXT_WIDTH,
  resolveConnectionHealth,
  getContextConnectionGlyph,
  getContextConnectionLabel,
  getContextConnectionColor,
  buildModelSection,
  buildConnectionSection,
  buildConversationSection,
  buildSessionSection,
  truncateContextValue,
  type ConnectionHealth,
} from "../../src/components/sidebar";
import {
  getStatusGlyph,
  getStatusColorToken,
  getStatusLabel,
  findIntegration,
  type IntegrationStatus,
  type IntegrationSummary,
} from "../../src/components/integration-panel";

// ---------------------------------------------------------------------------
// Mock tokens for testing
// ---------------------------------------------------------------------------

const MOCK_TOKENS: Record<string, string> = {
  "border.primary": "#444444",
  "border.focus": "#7aa2f7",
  "status.error": "#f7768e",
  "status.warning": "#e0af68",
  "status.success": "#9ece6a",
  "status.info": "#7dcfff",
  "text.primary": "#c0caf5",
  "text.muted": "#565f89",
};

// ---------------------------------------------------------------------------
// DrawerPanel
// ---------------------------------------------------------------------------

describe("DrawerPanel", () => {
  test("buildDrawerBorderStyle returns focus color when focused", () => {
    const result = buildDrawerBorderStyle(MOCK_TOKENS, true);
    expect(result).toBe(MOCK_TOKENS["border.focus"]);
  });

  test("buildDrawerBorderStyle returns primary color when not focused", () => {
    const result = buildDrawerBorderStyle(MOCK_TOKENS, false);
    expect(result).toBe(MOCK_TOKENS["border.primary"]);
  });

  test("buildDrawerBorderStyle returns primary color when focus is undefined", () => {
    const result = buildDrawerBorderStyle(MOCK_TOKENS);
    expect(result).toBe(MOCK_TOKENS["border.primary"]);
  });

  test("resolveDrawerPosition returns left for left side", () => {
    expect(resolveDrawerPosition("left")).toBe("left");
  });

  test("resolveDrawerPosition returns right for right side", () => {
    expect(resolveDrawerPosition("right")).toBe("right");
  });
});

// ---------------------------------------------------------------------------
// ModalPanel
// ---------------------------------------------------------------------------

describe("ModalPanel", () => {
  test("buildModalTitle prepends diamond glyph", () => {
    expect(buildModalTitle("Settings")).toBe("◆ Settings");
  });

  test("buildModalTitle handles empty title", () => {
    expect(buildModalTitle("")).toBe("◆ ");
  });

  test("buildModalTitle preserves special characters in title", () => {
    expect(buildModalTitle("Model / Provider")).toBe("◆ Model / Provider");
  });
});

// ---------------------------------------------------------------------------
// RichCard
// ---------------------------------------------------------------------------

describe("RichCard", () => {
  test("resolveVariantColor returns error token for error variant", () => {
    expect(resolveVariantColor("error", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.error"]);
  });

  test("resolveVariantColor returns warning token for warning variant", () => {
    expect(resolveVariantColor("warning", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("resolveVariantColor returns success token for success variant", () => {
    expect(resolveVariantColor("success", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.success"]);
  });

  test("resolveVariantColor returns info token for info variant", () => {
    expect(resolveVariantColor("info", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.info"]);
  });

  test("resolveVariantColor returns border.primary for default variant", () => {
    expect(resolveVariantColor("default", MOCK_TOKENS)).toBe(MOCK_TOKENS["border.primary"]);
  });

  test("all variant types resolve to a non-empty color", () => {
    const variants: RichCardVariant[] = ["default", "info", "warning", "error", "success"];
    for (const variant of variants) {
      const color = resolveVariantColor(variant, MOCK_TOKENS);
      expect(color.length).toBeGreaterThan(0);
    }
  });

  test("buildCardTopBorder without title produces clean border", () => {
    const border = buildCardTopBorder(20);
    expect(border.startsWith("\u256D")).toBe(true);
    expect(border.endsWith("\u256E")).toBe(true);
    expect(border.length).toBe(20);
  });

  test("buildCardTopBorder with title includes title text", () => {
    const border = buildCardTopBorder(34, "Calendar");
    expect(border).toContain("Calendar");
    expect(border.startsWith("\u256D")).toBe(true);
    expect(border.endsWith("\u256E")).toBe(true);
  });

  test("buildCardBottomBorder produces correct width", () => {
    const border = buildCardBottomBorder(20);
    expect(border.startsWith("\u2570")).toBe(true);
    expect(border.endsWith("\u256F")).toBe(true);
    expect(border.length).toBe(20);
  });

  test("padCardLine pads short content to fill width", () => {
    const line = padCardLine("Hello", 20);
    expect(line.startsWith("\u2502 ")).toBe(true);
    expect(line.endsWith(" \u2502")).toBe(true);
    // "│ " (2) + content + padding + " │" (2) = 20
    expect(line.length).toBe(20);
  });

  test("padCardLine truncates long content to fit width", () => {
    const longContent = "A".repeat(50);
    const line = padCardLine(longContent, 20);
    expect(line.startsWith("\u2502 ")).toBe(true);
    expect(line.endsWith(" \u2502")).toBe(true);
    // Should not exceed width
    expect(line.length).toBe(20);
  });

  test("padCardLine handles empty content", () => {
    const line = padCardLine("", 20);
    expect(line.startsWith("\u2502 ")).toBe(true);
    expect(line.endsWith(" \u2502")).toBe(true);
    expect(line.length).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// InputArea refinements
// ---------------------------------------------------------------------------

describe("InputArea exports", () => {
  test("MAX_INPUT_LENGTH is exported and equals 4000", () => {
    expect(MAX_INPUT_LENGTH).toBe(4000);
  });

  test("classifyInputSubmission returns empty for whitespace", () => {
    expect(classifyInputSubmission("")).toBe("empty");
    expect(classifyInputSubmission("   ")).toBe("empty");
  });

  test("classifyInputSubmission returns command for slash prefix", () => {
    expect(classifyInputSubmission("/help")).toBe("command");
    expect(classifyInputSubmission("  /model")).toBe("command");
  });

  test("classifyInputSubmission returns message for regular text", () => {
    expect(classifyInputSubmission("hello world")).toBe("message");
    expect(classifyInputSubmission("what is the weather?")).toBe("message");
  });

  test("InputSubmissionKind type covers all cases", () => {
    const kinds: InputSubmissionKind[] = ["empty", "command", "message"];
    expect(kinds.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Sidebar context panel utilities
// ---------------------------------------------------------------------------

describe("Sidebar context panel", () => {
  test("SIDEBAR_CONTEXT_WIDTH is 40 chars", () => {
    expect(SIDEBAR_CONTEXT_WIDTH).toBe(40);
  });

  describe("resolveConnectionHealth", () => {
    test("maps connected status to connected health", () => {
      expect(resolveConnectionHealth("connected")).toBe("connected");
    });

    test("maps connecting status to degraded health", () => {
      expect(resolveConnectionHealth("connecting")).toBe("degraded");
    });

    test("maps reconnecting status to degraded health", () => {
      expect(resolveConnectionHealth("reconnecting")).toBe("degraded");
    });

    test("maps disconnected status to offline health", () => {
      expect(resolveConnectionHealth("disconnected")).toBe("offline");
    });
  });

  describe("getContextConnectionGlyph", () => {
    test("returns filled circle for connected", () => {
      expect(getContextConnectionGlyph("connected")).toBe("●");
    });

    test("returns half circle for degraded", () => {
      expect(getContextConnectionGlyph("degraded")).toBe("◐");
    });

    test("returns empty circle for offline", () => {
      expect(getContextConnectionGlyph("offline")).toBe("○");
    });
  });

  describe("getContextConnectionLabel", () => {
    test("returns Connected for connected health", () => {
      expect(getContextConnectionLabel("connected")).toBe("Connected");
    });

    test("returns Connecting… for degraded health", () => {
      expect(getContextConnectionLabel("degraded")).toBe("Connecting…");
    });

    test("returns Offline for offline health", () => {
      expect(getContextConnectionLabel("offline")).toBe("Offline");
    });
  });

  describe("getContextConnectionColor", () => {
    test("returns success for connected", () => {
      expect(getContextConnectionColor("connected")).toBe("success");
    });

    test("returns warning for degraded", () => {
      expect(getContextConnectionColor("degraded")).toBe("warning");
    });

    test("returns error for offline", () => {
      expect(getContextConnectionColor("offline")).toBe("error");
    });
  });

  describe("truncateContextValue", () => {
    test("returns short values unchanged", () => {
      expect(truncateContextValue("hello", 10)).toBe("hello");
    });

    test("truncates long values with ellipsis", () => {
      const result = truncateContextValue("a very long model name here", 10);
      expect(result.length).toBe(10);
      expect(result.endsWith("…")).toBe(true);
    });

    test("returns exact-length values unchanged", () => {
      expect(truncateContextValue("12345", 5)).toBe("12345");
    });
  });

  describe("buildModelSection", () => {
    test("includes model display name when models available", () => {
      const section = buildModelSection("anthropic/claude-3.5-sonnet", "anthropic", ["anthropic/claude-3.5-sonnet"]);
      expect(section.label).toBe("Model");
      expect(section.glyph).toBe("◆");
      const modelItem = section.items.find((i) => i.key === "Model");
      expect(modelItem).toBeDefined();
      expect(modelItem!.value).toBe("claude-3.5-sonnet");
      expect(modelItem!.color).toBe("primary");
    });

    test("shows No models when no models available", () => {
      const section = buildModelSection("default", "", []);
      const modelItem = section.items.find((i) => i.key === "Model");
      expect(modelItem!.value).toBe("No models");
      expect(modelItem!.color).toBe("muted");
    });

    test("includes provider when set", () => {
      const section = buildModelSection("claude-3.5-sonnet", "anthropic", ["claude-3.5-sonnet"]);
      const providerItem = section.items.find((i) => i.key === "Provider");
      expect(providerItem).toBeDefined();
      expect(providerItem!.value).toBe("anthropic");
    });

    test("omits provider when empty", () => {
      const section = buildModelSection("default", "", []);
      const providerItem = section.items.find((i) => i.key === "Provider");
      expect(providerItem).toBeUndefined();
    });

    test("includes available model count", () => {
      const section = buildModelSection("m1", "p", ["m1", "m2", "m3"]);
      const availItem = section.items.find((i) => i.key === "Available");
      expect(availItem!.value).toBe("3 models");
    });

    test("uses singular for single model", () => {
      const section = buildModelSection("m1", "p", ["m1"]);
      const availItem = section.items.find((i) => i.key === "Available");
      expect(availItem!.value).toBe("1 model");
    });
  });

  describe("buildConnectionSection", () => {
    test("shows connected state correctly", () => {
      const section = buildConnectionSection("connected");
      expect(section.label).toBe("Connection");
      expect(section.glyph).toBe("●");
      expect(section.items[0].value).toBe("Connected");
      expect(section.items[0].color).toBe("success");
    });

    test("shows connecting state as degraded", () => {
      const section = buildConnectionSection("connecting");
      expect(section.glyph).toBe("◐");
      expect(section.items[0].value).toBe("Connecting…");
      expect(section.items[0].color).toBe("warning");
    });

    test("shows disconnected state as offline", () => {
      const section = buildConnectionSection("disconnected");
      expect(section.glyph).toBe("○");
      expect(section.items[0].value).toBe("Offline");
      expect(section.items[0].color).toBe("error");
    });
  });

  describe("buildConversationSection", () => {
    test("shows conversation count", () => {
      const section = buildConversationSection(5, null, null);
      expect(section.label).toBe("Conversations");
      expect(section.glyph).toBe("◇");
      const totalItem = section.items.find((i) => i.key === "Total");
      expect(totalItem!.value).toBe("5 conversations");
    });

    test("uses singular for single conversation", () => {
      const section = buildConversationSection(1, null, null);
      const totalItem = section.items.find((i) => i.key === "Total");
      expect(totalItem!.value).toBe("1 conversation");
    });

    test("includes active conversation title when present", () => {
      const section = buildConversationSection(3, "My Chat", null);
      const activeItem = section.items.find((i) => i.key === "Active");
      expect(activeItem).toBeDefined();
      expect(activeItem!.value).toBe("My Chat");
      expect(activeItem!.color).toBe("primary");
    });

    test("omits active when no active conversation", () => {
      const section = buildConversationSection(3, null, null);
      const activeItem = section.items.find((i) => i.key === "Active");
      expect(activeItem).toBeUndefined();
    });

    test("truncates long active conversation titles", () => {
      const longTitle = "A".repeat(30);
      const section = buildConversationSection(1, longTitle, null);
      const activeItem = section.items.find((i) => i.key === "Active");
      expect(activeItem!.value.length).toBe(24);
      expect(activeItem!.value.endsWith("…")).toBe(true);
    });
  });

  describe("buildSessionSection", () => {
    test("shows Ready for idle status", () => {
      const section = buildSessionSection("idle", 0);
      expect(section.label).toBe("Session");
      expect(section.glyph).toBe("⚡");
      const statusItem = section.items.find((i) => i.key === "Status");
      expect(statusItem!.value).toBe("Ready");
      expect(statusItem!.color).toBe("muted");
    });

    test("shows Streaming with warning color", () => {
      const section = buildSessionSection("streaming", 5);
      const statusItem = section.items.find((i) => i.key === "Status");
      expect(statusItem!.value).toBe("Streaming");
      expect(statusItem!.color).toBe("warning");
    });

    test("shows Error with error color", () => {
      const section = buildSessionSection("error", 3);
      const statusItem = section.items.find((i) => i.key === "Status");
      expect(statusItem!.value).toBe("Error");
      expect(statusItem!.color).toBe("error");
    });

    test("includes message count", () => {
      const section = buildSessionSection("idle", 12);
      const msgItem = section.items.find((i) => i.key === "Messages");
      expect(msgItem!.value).toBe("12 in thread");
    });

    test("capitalizes lifecycle status", () => {
      const section = buildSessionSection("thinking", 1);
      const statusItem = section.items.find((i) => i.key === "Status");
      expect(statusItem!.value).toBe("Thinking");
      expect(statusItem!.color).toBe("warning");
    });
  });

  describe("ConnectionHealth type coverage", () => {
    test("all health states have glyphs, labels, and colors", () => {
      const states: ConnectionHealth[] = ["connected", "degraded", "offline"];
      for (const health of states) {
        expect(getContextConnectionGlyph(health).length).toBeGreaterThan(0);
        expect(getContextConnectionLabel(health).length).toBeGreaterThan(0);
        expect(getContextConnectionColor(health)).toBeDefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// IntegrationPanel — status indicators and helpers
// ---------------------------------------------------------------------------

describe("IntegrationPanel", () => {
  const ALL_STATUSES: IntegrationStatus[] = [
    "connected",
    "error",
    "auth_expired",
    "suspended",
    "disconnected",
  ];

  describe("getStatusGlyph", () => {
    test("returns filled circle for connected", () => {
      expect(getStatusGlyph("connected")).toBe("●");
    });

    test("returns filled circle for error", () => {
      expect(getStatusGlyph("error")).toBe("●");
    });

    test("returns triangle for auth_expired", () => {
      expect(getStatusGlyph("auth_expired")).toBe("▲");
    });

    test("returns empty circle for suspended", () => {
      expect(getStatusGlyph("suspended")).toBe("○");
    });

    test("returns empty circle for disconnected", () => {
      expect(getStatusGlyph("disconnected")).toBe("○");
    });

    test("all statuses return a non-empty glyph", () => {
      for (const status of ALL_STATUSES) {
        expect(getStatusGlyph(status).length).toBeGreaterThan(0);
      }
    });
  });

  describe("getStatusColorToken", () => {
    test("returns success token for connected", () => {
      expect(getStatusColorToken("connected")).toBe("status.success");
    });

    test("returns error token for error", () => {
      expect(getStatusColorToken("error")).toBe("status.error");
    });

    test("returns warning token for auth_expired", () => {
      expect(getStatusColorToken("auth_expired")).toBe("status.warning");
    });

    test("returns muted token for suspended", () => {
      expect(getStatusColorToken("suspended")).toBe("text.muted");
    });

    test("returns muted token for disconnected", () => {
      expect(getStatusColorToken("disconnected")).toBe("text.muted");
    });

    test("all statuses return a non-empty token name", () => {
      for (const status of ALL_STATUSES) {
        expect(getStatusColorToken(status).length).toBeGreaterThan(0);
      }
    });
  });

  describe("getStatusLabel", () => {
    test("returns Connected for connected", () => {
      expect(getStatusLabel("connected")).toBe("Connected");
    });

    test("returns Error for error", () => {
      expect(getStatusLabel("error")).toBe("Error");
    });

    test("returns Auth Expired for auth_expired", () => {
      expect(getStatusLabel("auth_expired")).toBe("Auth Expired");
    });

    test("returns Suspended for suspended", () => {
      expect(getStatusLabel("suspended")).toBe("Suspended");
    });

    test("returns Not Connected for disconnected", () => {
      expect(getStatusLabel("disconnected")).toBe("Not Connected");
    });

    test("all statuses return a non-empty label", () => {
      for (const status of ALL_STATUSES) {
        expect(getStatusLabel(status).length).toBeGreaterThan(0);
      }
    });
  });

  describe("findIntegration", () => {
    const connected: IntegrationSummary[] = [
      {
        id: "obsidian",
        name: "Obsidian",
        status: "connected",
        version: "1.0.0",
        description: "Notes",
        category: "productivity",
        operations: [{ name: "search", description: "Search notes" }],
      },
      {
        id: "gmail",
        name: "Gmail",
        status: "auth_expired",
        version: "1.0.0",
        description: "Email",
        category: "communication",
        operations: [],
      },
    ];

    const available: IntegrationSummary[] = [
      {
        id: "slack",
        name: "Slack",
        status: "disconnected",
        version: "1.0.0",
        description: "Chat",
        category: "communication",
        operations: [],
      },
    ];

    test("finds integration in connected list", () => {
      const result = findIntegration(connected, available, "obsidian");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Obsidian");
    });

    test("finds integration in available list", () => {
      const result = findIntegration(connected, available, "slack");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Slack");
    });

    test("returns null for unknown id", () => {
      const result = findIntegration(connected, available, "unknown");
      expect(result).toBeNull();
    });

    test("returns null for null id", () => {
      const result = findIntegration(connected, available, null);
      expect(result).toBeNull();
    });

    test("prefers connected over available when id exists in both", () => {
      const duplicateAvailable: IntegrationSummary[] = [
        {
          id: "obsidian",
          name: "Obsidian (Available)",
          status: "disconnected",
          version: "2.0.0",
          description: "Duplicate",
          category: "productivity",
          operations: [],
        },
      ];
      const result = findIntegration(connected, duplicateAvailable, "obsidian");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Obsidian");
      expect(result!.version).toBe("1.0.0");
    });

    test("returns null for empty lists", () => {
      const result = findIntegration([], [], "obsidian");
      expect(result).toBeNull();
    });
  });

  describe("status indicator color mapping", () => {
    test("connected maps to green (success)", () => {
      const token = getStatusColorToken("connected");
      expect(MOCK_TOKENS[token]).toBe(MOCK_TOKENS["status.success"]);
    });

    test("error maps to red (error)", () => {
      const token = getStatusColorToken("error");
      expect(MOCK_TOKENS[token]).toBe(MOCK_TOKENS["status.error"]);
    });

    test("auth_expired maps to yellow (warning)", () => {
      const token = getStatusColorToken("auth_expired");
      expect(MOCK_TOKENS[token]).toBe(MOCK_TOKENS["status.warning"]);
    });

    test("suspended maps to gray (muted)", () => {
      const token = getStatusColorToken("suspended");
      expect(MOCK_TOKENS[token]).toBe(MOCK_TOKENS["text.muted"]);
    });
  });
});
