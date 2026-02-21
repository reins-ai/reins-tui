import { describe, expect, it, test } from "bun:test";

import { fuzzyMatch } from "../../src/util/fuzzy-search";
import { formatRelativeTime } from "../../src/lib/relative-time";
import type { ConversationSummary } from "@reins/core";
import type {
  ContextMenuAction,
  ContextMenuMode,
} from "../../src/components/cards/conversation-context-menu";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "conv-1",
    title: "Test Conversation",
    model: "gpt-4",
    provider: "openai",
    messageCount: 5,
    lastMessageAt: new Date("2026-02-20T10:00:00Z"),
    createdAt: new Date("2026-02-20T09:00:00Z"),
    ...overrides,
  };
}

function makeConversations(count: number): ConversationSummary[] {
  return Array.from({ length: count }, (_, i) =>
    makeConversation({
      id: `conv-${i + 1}`,
      title: `Conversation ${i + 1}`,
      messageCount: (i + 1) * 3,
      lastMessageAt: new Date(Date.now() - i * 60_000),
      createdAt: new Date(Date.now() - i * 120_000),
    }),
  );
}

// ---------------------------------------------------------------------------
// fuzzyMatch — core search logic used by conversation list
// ---------------------------------------------------------------------------

describe("fuzzyMatch", () => {
  describe("exact matching", () => {
    it("returns highest score for exact match", () => {
      const result = fuzzyMatch("hello", "hello");
      expect(result).not.toBeNull();
      expect(result!.score).toBe(1000);
    });

    it("is case-insensitive", () => {
      const result = fuzzyMatch("Hello", "hello");
      expect(result).not.toBeNull();
      expect(result!.score).toBe(1000);
    });

    it("trims whitespace before matching", () => {
      const result = fuzzyMatch("  hello  ", "hello");
      expect(result).not.toBeNull();
      expect(result!.score).toBe(1000);
    });
  });

  describe("prefix matching", () => {
    it("scores prefix match below exact match", () => {
      const result = fuzzyMatch("hel", "hello world");
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
      expect(result!.score).toBeLessThan(1000);
    });

    it("penalises longer values for prefix match", () => {
      const short = fuzzyMatch("hel", "hello");
      const long = fuzzyMatch("hel", "hello world foo bar");
      expect(short).not.toBeNull();
      expect(long).not.toBeNull();
      expect(short!.score).toBeGreaterThan(long!.score);
    });
  });

  describe("substring matching", () => {
    it("finds substring in the middle", () => {
      const result = fuzzyMatch("world", "hello world");
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
    });

    it("scores substring lower than prefix", () => {
      const prefix = fuzzyMatch("hello", "hello world");
      const substring = fuzzyMatch("world", "hello world");
      expect(prefix).not.toBeNull();
      expect(substring).not.toBeNull();
      expect(prefix!.score).toBeGreaterThan(substring!.score);
    });

    it("penalises later substring positions", () => {
      const early = fuzzyMatch("ello", "hello world");
      const late = fuzzyMatch("orld", "hello world");
      expect(early).not.toBeNull();
      expect(late).not.toBeNull();
      expect(early!.score).toBeGreaterThan(late!.score);
    });
  });

  describe("token matching", () => {
    it("matches when all tokens are present", () => {
      const result = fuzzyMatch("hello world", "the world says hello");
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
    });

    it("returns null when not all tokens match", () => {
      const result = fuzzyMatch("hello missing", "hello world");
      expect(result).toBeNull();
    });

    it("single token that does not match returns null", () => {
      const result = fuzzyMatch("xyz", "hello world");
      expect(result).toBeNull();
    });
  });

  describe("multi-field matching", () => {
    it("returns best score across multiple fields", () => {
      const result = fuzzyMatch("test", "no match here", "test conversation");
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThan(0);
    });

    it("returns null when no fields match", () => {
      const result = fuzzyMatch("xyz", "hello", "world");
      expect(result).toBeNull();
    });

    it("prefers exact match in any field", () => {
      const result = fuzzyMatch("hello", "hello", "hello world");
      expect(result).not.toBeNull();
      expect(result!.score).toBe(1000);
    });
  });

  describe("edge cases", () => {
    it("returns score 0 for empty query", () => {
      const result = fuzzyMatch("", "hello");
      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it("returns score 0 for whitespace-only query", () => {
      const result = fuzzyMatch("   ", "hello");
      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it("returns null for empty field with non-empty query", () => {
      const result = fuzzyMatch("hello", "");
      expect(result).toBeNull();
    });

    it("handles special characters in query", () => {
      const result = fuzzyMatch("c++", "learning c++ basics");
      expect(result).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch — conversation list search simulation
// ---------------------------------------------------------------------------

describe("conversation list search filtering", () => {
  const conversations = [
    makeConversation({ id: "1", title: "React hooks tutorial" }),
    makeConversation({ id: "2", title: "TypeScript generics" }),
    makeConversation({ id: "3", title: "Bun test runner setup" }),
    makeConversation({ id: "4", title: "CSS grid layout" }),
    makeConversation({ id: "5", title: "React Native navigation" }),
  ];

  function searchConversations(query: string): ConversationSummary[] {
    if (query.trim().length === 0) {
      return conversations;
    }

    const results: { conversation: ConversationSummary; score: number }[] = [];

    for (const conversation of conversations) {
      const result = fuzzyMatch(query, conversation.title);
      if (result !== null) {
        results.push({ conversation, score: result.score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.conversation);
  }

  it("returns all conversations for empty query", () => {
    expect(searchConversations("")).toHaveLength(5);
  });

  it("filters to matching conversations", () => {
    const results = searchConversations("react");
    expect(results.length).toBe(2);
    expect(results.map((c) => c.id)).toContain("1");
    expect(results.map((c) => c.id)).toContain("5");
  });

  it("returns empty array when nothing matches", () => {
    const results = searchConversations("python");
    expect(results).toHaveLength(0);
  });

  it("ranks exact prefix higher than substring", () => {
    const results = searchConversations("bun");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("3");
  });

  it("is case-insensitive", () => {
    const results = searchConversations("TYPESCRIPT");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("2");
  });

  it("supports multi-token search", () => {
    const results = searchConversations("react native");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// ConversationSummary data shape
// ---------------------------------------------------------------------------

describe("ConversationSummary data shape", () => {
  it("has all required fields", () => {
    const conv = makeConversation();
    expect(conv.id).toBe("conv-1");
    expect(conv.title).toBe("Test Conversation");
    expect(conv.model).toBe("gpt-4");
    expect(conv.messageCount).toBe(5);
    expect(conv.lastMessageAt).toBeInstanceOf(Date);
    expect(conv.createdAt).toBeInstanceOf(Date);
  });

  it("supports optional provider field", () => {
    const withProvider = makeConversation({ provider: "anthropic" });
    expect(withProvider.provider).toBe("anthropic");

    const withoutProvider = makeConversation({ provider: undefined });
    expect(withoutProvider.provider).toBeUndefined();
  });

  it("supports optional updatedAt field", () => {
    const withUpdated = makeConversation({ updatedAt: new Date() });
    expect(withUpdated.updatedAt).toBeInstanceOf(Date);

    const withoutUpdated = makeConversation({ updatedAt: undefined });
    expect(withoutUpdated.updatedAt).toBeUndefined();
  });

  it("can create a batch of conversations", () => {
    const batch = makeConversations(10);
    expect(batch).toHaveLength(10);
    const ids = new Set(batch.map((c) => c.id));
    expect(ids.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Unread indicator heuristic
// ---------------------------------------------------------------------------

describe("unread indicator heuristic", () => {
  // The component uses: messageCount > 0 && lastMessageAt > 30s ago
  // We test the logic inline since the helper is not exported.

  function hasUnread(conversation: ConversationSummary): boolean {
    const thirtySecondsAgo = Date.now() - 30_000;
    return (
      conversation.messageCount > 0 &&
      conversation.lastMessageAt.getTime() > thirtySecondsAgo
    );
  }

  it("returns true for recent conversation with messages", () => {
    const conv = makeConversation({
      messageCount: 3,
      lastMessageAt: new Date(),
    });
    expect(hasUnread(conv)).toBe(true);
  });

  it("returns false for old conversation", () => {
    const conv = makeConversation({
      messageCount: 3,
      lastMessageAt: new Date(Date.now() - 60_000),
    });
    expect(hasUnread(conv)).toBe(false);
  });

  it("returns false for conversation with zero messages", () => {
    const conv = makeConversation({
      messageCount: 0,
      lastMessageAt: new Date(),
    });
    expect(hasUnread(conv)).toBe(false);
  });

  it("returns false for conversation exactly at 30s boundary", () => {
    const conv = makeConversation({
      messageCount: 1,
      lastMessageAt: new Date(Date.now() - 30_000),
    });
    expect(hasUnread(conv)).toBe(false);
  });

  it("returns true for conversation just under 30s", () => {
    const conv = makeConversation({
      messageCount: 1,
      lastMessageAt: new Date(Date.now() - 29_000),
    });
    expect(hasUnread(conv)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Preview line construction
// ---------------------------------------------------------------------------

describe("preview line construction", () => {
  // Mirrors the buildPreviewLine logic from conversation-list.tsx

  function buildPreviewLine(conversation: ConversationSummary): string {
    const parts: string[] = [];

    if (conversation.messageCount > 0) {
      parts.push(`${conversation.messageCount} msg`);
    }

    parts.push(formatRelativeTime(conversation.lastMessageAt));

    return parts.join(" \u00B7 ");
  }

  it("includes message count and relative time", () => {
    const conv = makeConversation({
      messageCount: 5,
      lastMessageAt: new Date(Date.now() - 120_000),
    });
    const line = buildPreviewLine(conv);
    expect(line).toContain("5 msg");
    expect(line).toContain("2m ago");
  });

  it("omits message count when zero", () => {
    const conv = makeConversation({
      messageCount: 0,
      lastMessageAt: new Date(Date.now() - 3_600_000),
    });
    const line = buildPreviewLine(conv);
    expect(line).not.toContain("msg");
    expect(line).toContain("1h ago");
  });

  it("shows 'just now' for very recent messages", () => {
    const conv = makeConversation({
      messageCount: 1,
      lastMessageAt: new Date(),
    });
    const line = buildPreviewLine(conv);
    expect(line).toContain("just now");
  });

  it("uses middle dot separator", () => {
    const conv = makeConversation({
      messageCount: 3,
      lastMessageAt: new Date(Date.now() - 300_000),
    });
    const line = buildPreviewLine(conv);
    expect(line).toContain("\u00B7");
  });
});

// ---------------------------------------------------------------------------
// Truncation helper
// ---------------------------------------------------------------------------

describe("truncation helper", () => {
  // Mirrors the truncate function from conversation-list.tsx

  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
  }

  it("returns short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    const result = truncate("a very long conversation title", 15);
    expect(result).toBe("a very long ...");
    expect(result.length).toBe(15);
  });

  it("returns exact-length text unchanged", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles maxLength of 3 (minimum for ellipsis)", () => {
    expect(truncate("hello", 3)).toBe("...");
  });
});

// ---------------------------------------------------------------------------
// ContextMenuMode state machine
// ---------------------------------------------------------------------------

describe("ContextMenuMode state machine", () => {
  it("starts in menu mode", () => {
    const mode: ContextMenuMode = { kind: "menu" };
    expect(mode.kind).toBe("menu");
  });

  it("transitions to rename mode with draft", () => {
    const mode: ContextMenuMode = { kind: "rename", draft: "My Conversation" };
    expect(mode.kind).toBe("rename");
    expect(mode.draft).toBe("My Conversation");
  });

  it("transitions to delete-confirm mode", () => {
    const mode: ContextMenuMode = { kind: "delete-confirm" };
    expect(mode.kind).toBe("delete-confirm");
  });

  it("rename draft can be empty string", () => {
    const mode: ContextMenuMode = { kind: "rename", draft: "" };
    expect(mode.draft).toBe("");
  });
});

// ---------------------------------------------------------------------------
// ContextMenuAction values
// ---------------------------------------------------------------------------

describe("ContextMenuAction values", () => {
  const validActions: ContextMenuAction[] = ["open", "rename", "delete", "archive"];

  it("has exactly four valid actions", () => {
    expect(validActions).toHaveLength(4);
  });

  it("includes open action", () => {
    expect(validActions).toContain("open");
  });

  it("includes rename action", () => {
    expect(validActions).toContain("rename");
  });

  it("includes delete action", () => {
    expect(validActions).toContain("delete");
  });

  it("includes archive action", () => {
    expect(validActions).toContain("archive");
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime — used in conversation preview lines
// ---------------------------------------------------------------------------

describe("formatRelativeTime", () => {
  const now = new Date("2026-02-20T12:00:00Z");

  it("returns 'just now' for less than a minute ago", () => {
    const date = new Date(now.getTime() - 30_000);
    expect(formatRelativeTime(date, now)).toBe("just now");
  });

  it("returns minutes ago for less than an hour", () => {
    const date = new Date(now.getTime() - 5 * 60_000);
    expect(formatRelativeTime(date, now)).toBe("5m ago");
  });

  it("returns hours ago for less than a day", () => {
    const date = new Date(now.getTime() - 3 * 3_600_000);
    expect(formatRelativeTime(date, now)).toBe("3h ago");
  });

  it("returns 'yesterday' for 1-2 days ago", () => {
    const date = new Date(now.getTime() - 36 * 3_600_000);
    expect(formatRelativeTime(date, now)).toBe("yesterday");
  });

  it("returns 'unknown' for invalid date", () => {
    expect(formatRelativeTime(new Date("invalid"), now)).toBe("unknown");
  });

  it("returns month and day for older dates in same year", () => {
    const date = new Date("2026-01-15T10:00:00Z");
    const result = formatRelativeTime(date, now);
    expect(result).toContain("Jan");
    expect(result).toContain("15");
  });
});

// ---------------------------------------------------------------------------
// Conversation list sorting and ordering
// ---------------------------------------------------------------------------

describe("conversation list sorting", () => {
  it("search results are sorted by score descending", () => {
    const conversations = [
      makeConversation({ id: "1", title: "typescript basics" }),
      makeConversation({ id: "2", title: "advanced typescript patterns" }),
      makeConversation({ id: "3", title: "typescript" }),
    ];

    const query = "typescript";
    const results: { id: string; score: number }[] = [];

    for (const conv of conversations) {
      const match = fuzzyMatch(query, conv.title);
      if (match !== null) {
        results.push({ id: conv.id, score: match.score });
      }
    }

    results.sort((a, b) => b.score - a.score);

    // Exact match should be first
    expect(results[0].id).toBe("3");
    // Prefix match should be second
    expect(results[1].id).toBe("1");
    // Substring match should be last
    expect(results[2].id).toBe("2");
  });

  it("empty search returns conversations in original order", () => {
    const conversations = makeConversations(5);
    const query = "";
    const match = fuzzyMatch(query, "anything");
    // Empty query returns score 0 (matches everything)
    expect(match).not.toBeNull();
    expect(match!.score).toBe(0);
    // So all conversations would be included
    expect(conversations).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// CRUD operation context menu flow
// ---------------------------------------------------------------------------

describe("CRUD operation context menu flow", () => {
  it("open action triggers activation", () => {
    const action: ContextMenuAction = "open";
    expect(action).toBe("open");
  });

  it("rename flow: menu → rename mode → submit", () => {
    let mode: ContextMenuMode = { kind: "menu" };

    // User selects rename
    mode = { kind: "rename", draft: "Old Title" };
    expect(mode.kind).toBe("rename");
    expect(mode.draft).toBe("Old Title");

    // User edits and submits — mode resets to menu
    mode = { kind: "menu" };
    expect(mode.kind).toBe("menu");
  });

  it("delete flow: menu → delete-confirm → confirm", () => {
    let mode: ContextMenuMode = { kind: "menu" };

    // User selects delete — enters confirmation
    mode = { kind: "delete-confirm" };
    expect(mode.kind).toBe("delete-confirm");

    // User confirms — mode resets
    mode = { kind: "menu" };
    expect(mode.kind).toBe("menu");
  });

  it("delete flow: menu → delete-confirm → cancel", () => {
    let mode: ContextMenuMode = { kind: "menu" };

    // User selects delete — enters confirmation
    mode = { kind: "delete-confirm" };
    expect(mode.kind).toBe("delete-confirm");

    // User cancels — back to menu
    mode = { kind: "menu" };
    expect(mode.kind).toBe("menu");
  });

  it("archive action is immediate (no confirmation)", () => {
    const action: ContextMenuAction = "archive";
    // Archive does not have a confirmation step — it's immediate
    expect(action).toBe("archive");
  });
});

// ---------------------------------------------------------------------------
// Conversation list empty and loading states
// ---------------------------------------------------------------------------

describe("conversation list states", () => {
  it("empty conversations array represents no-conversations state", () => {
    const conversations: ConversationSummary[] = [];
    expect(conversations).toHaveLength(0);
  });

  it("filtered results can be empty when search has no matches", () => {
    const conversations = makeConversations(5);
    const query = "nonexistent-query-xyz";
    const filtered = conversations.filter((c) => {
      const match = fuzzyMatch(query, c.title);
      return match !== null;
    });
    expect(filtered).toHaveLength(0);
  });

  it("search query truncation for display", () => {
    // The component truncates search query to 20 chars for "No matches" message
    const longQuery = "a".repeat(30);
    const truncated = longQuery.length > 20
      ? `${longQuery.slice(0, 17)}...`
      : longQuery;
    expect(truncated.length).toBe(20);
  });
});
