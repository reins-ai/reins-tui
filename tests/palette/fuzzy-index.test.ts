import { describe, expect, test } from "bun:test";

import type { SlashCommandDefinition } from "../../src/commands/registry";
import {
  createCommandSearchItems,
  createConversationSearchItems,
  createFuzzySearchIndex,
  createNoteSearchItems,
  createUnifiedSearchItems,
  matchString,
  type PaletteAction,
  type SearchableItem,
} from "../../src/palette/fuzzy-index";
import { rankSearchItems, rankSearchResults } from "../../src/palette/ranking";

describe("matchString", () => {
  test("scores exact > prefix > substring > fuzzy", () => {
    const exact = matchString("help", "help");
    const prefix = matchString("he", "help");
    const substring = matchString("elp", "help");
    const fuzzy = matchString("hlp", "help");

    expect(exact?.matchKind).toBe("exact");
    expect(prefix?.matchKind).toBe("prefix");
    expect(substring?.matchKind).toBe("substring");
    expect(fuzzy?.matchKind).toBe("fuzzy");
    expect(exact?.score ?? 0).toBeGreaterThan(prefix?.score ?? 0);
    expect(prefix?.score ?? 0).toBeGreaterThan(substring?.score ?? 0);
    expect(substring?.score ?? 0).toBeGreaterThan(fuzzy?.score ?? 0);
  });

  test("returns highlight ranges for matched characters", () => {
    const result = matchString("hlp", "help");

    expect(result?.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 4 },
    ]);
  });

  test("matches case-insensitively", () => {
    const lower = matchString("model", "Switch Model");
    const mixed = matchString("MoDeL", "switch MODEL");

    expect(lower).toEqual(mixed);
  });

  test("handles special characters without throwing", () => {
    const result = matchString("c++", "C++ Compiler");

    expect(result?.matchKind).toBe("prefix");
    expect(result?.score ?? 0).toBeGreaterThan(0);
  });
});

describe("search adapters", () => {
  const commandDefinitions: readonly SlashCommandDefinition[] = [
    {
      name: "help",
      aliases: ["h"],
      description: "List commands",
      usage: "/help [command]",
      category: "system",
      handlerKey: "HELP",
    },
  ];

  test("builds unified searchable items", () => {
    const items = createUnifiedSearchItems({
      commands: commandDefinitions,
      conversations: [
        {
          id: "conv-1",
          title: "Roadmap planning",
          model: "gpt-4.1",
          messageCount: 12,
          lastMessageAt: "2026-02-11T10:00:00.000Z",
        },
      ],
      notes: [
        {
          id: "note-1",
          title: "Sprint notes",
          excerpt: "Follow-up actions",
          tags: ["planning"],
        },
      ],
    });

    expect(items.map((item) => item.category)).toEqual(["command", "conversation", "note"]);
    expect(items[0]?.label).toBe("/help");
    expect(items[1]?.action).toEqual({ type: "conversation", conversationId: "conv-1" });
    expect(items[2]?.action).toEqual({ type: "note", noteId: "note-1" });
  });

  test("creates command items from slash registry metadata", () => {
    const items = createCommandSearchItems(commandDefinitions);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "command:help",
      label: "/help",
      description: "List commands",
      category: "command",
      keywords: ["help", "h", "/help [command]", "system", "system"],
      action: { type: "command", command: "help" },
    });
  });

  test("creates conversation and note adapters with recency metadata", () => {
    const conversations = createConversationSearchItems([
      {
        id: "conv-1",
        title: "Architecture",
        model: "gpt-4.1",
        messageCount: 20,
        updatedAt: "2026-02-11T09:00:00.000Z",
      },
    ]);

    const notes = createNoteSearchItems([
      {
        id: "note-1",
        title: "Design notes",
        tags: ["design", "api"],
        updatedAt: "2026-02-11T08:00:00.000Z",
      },
    ]);

    expect(conversations[0]?.lastUsedAt).toBe(Date.parse("2026-02-11T09:00:00.000Z"));
    expect(notes[0]?.lastUsedAt).toBe(Date.parse("2026-02-11T08:00:00.000Z"));
  });
});

describe("ranking", () => {
  const baseItems: readonly SearchableItem<PaletteAction>[] = [
    {
      id: "command:help",
      label: "/help",
      description: "List commands",
      category: "command",
      keywords: ["help", "assist"],
      action: { type: "command", command: "help" },
    },
    {
      id: "command:hello",
      label: "/hello",
      description: "Say hello",
      category: "command",
      keywords: ["hello"],
      action: { type: "command", command: "hello" },
    },
    {
      id: "conversation:release",
      label: "Release planning",
      description: "Model: gpt-4.1",
      category: "conversation",
      keywords: ["release", "planning"],
      action: { type: "conversation", conversationId: "release" },
      lastUsedAt: Date.parse("2026-02-11T10:10:00.000Z"),
    },
    {
      id: "note:release",
      label: "Release checklist",
      description: "Pre-flight checks",
      category: "note",
      keywords: ["release", "checklist"],
      action: { type: "note", noteId: "release" },
    },
  ];

  test("ranks mixed results with exact and prefix priority", () => {
    const ranked = rankSearchItems(baseItems, "he");

    expect(ranked[0]?.item.id).toBe("command:help");
    expect(ranked[0]?.matchKind).toBe("prefix");
    expect(ranked.some((item) => item.item.id === "command:hello")).toBe(true);
  });

  test("boosts recent conversations for empty query", () => {
    const ranked = rankSearchItems(baseItems, "", {
      now: () => Date.parse("2026-02-11T10:10:30.000Z"),
    });

    expect(ranked[0]?.item.id).toBe("conversation:release");
  });

  test("applies category grouping when scores tie", () => {
    const items: readonly SearchableItem<PaletteAction>[] = [
      {
        id: "note:alpha",
        label: "alpha",
        description: "note",
        category: "note",
        keywords: ["alpha"],
        action: { type: "note", noteId: "alpha" },
      },
      {
        id: "command:alpha",
        label: "alpha",
        description: "command",
        category: "command",
        keywords: ["alpha"],
        action: { type: "command", command: "alpha" },
      },
    ];

    const ranked = rankSearchItems(items, "alpha");
    expect(ranked[0]?.item.category).toBe("command");
    expect(ranked[1]?.item.category).toBe("note");
  });

  test("limits result count", () => {
    const expanded = Array.from({ length: 40 }, (_, index) => ({
      id: `command:${index}`,
      label: `command ${index}`,
      description: "generated",
      category: "command" as const,
      keywords: ["command"],
      action: { type: "command", command: `command-${index}` } as const,
    }));

    const ranked = rankSearchItems(expanded, "command", { limit: 20 });
    expect(ranked).toHaveLength(20);
  });

  test("ranks 1000 items under 50ms", () => {
    const now = Date.parse("2026-02-11T10:10:30.000Z");
    const largeDataset: SearchableItem<PaletteAction>[] = [];

    for (let index = 0; index < 1000; index += 1) {
      largeDataset.push({
        id: `conversation:${index}`,
        label: `Conversation ${index}`,
        description: `Discussion about topic ${index}`,
        category: "conversation",
        keywords: [`topic-${index}`, "discussion"],
        action: { type: "conversation", conversationId: `${index}` },
        lastUsedAt: now - index * 1000,
      });
    }

    const index = createFuzzySearchIndex(largeDataset);
    const started = performance.now();
    const ranked = rankSearchResults(index, "cnv987", { now: () => now });
    const elapsedMs = performance.now() - started;

    expect(ranked.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(50);
  });
});
