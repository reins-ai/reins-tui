import { describe, expect, test } from "bun:test";

import {
  PALETTE_ACTIONS,
  SLASH_COMMANDS,
  type PaletteActionDefinition,
} from "../../src/commands/registry";
import {
  createActionSearchItems,
  createCommandSearchItems,
  createConversationSearchItems,
  createFuzzySearchIndex,
  type ConversationSearchSource,
  type FuzzySearchIndex,
  type PaletteAction,
  type SearchableItem,
  type SearchCategory,
} from "../../src/palette/fuzzy-index";
import {
  rankSearchResults,
  RecencyTracker,
  type RankedSearchResult,
} from "../../src/palette/ranking";

function buildFullIndex(options?: {
  conversations?: readonly ConversationSearchSource[];
}): FuzzySearchIndex<PaletteAction> {
  const commandItems = createCommandSearchItems(SLASH_COMMANDS);
  const actionItems = createActionSearchItems(PALETTE_ACTIONS);
  const conversationItems = createConversationSearchItems(options?.conversations ?? []);
  return createFuzzySearchIndex([...commandItems, ...actionItems, ...conversationItems]);
}

function searchAndRank(
  index: FuzzySearchIndex<PaletteAction>,
  query: string,
  options?: { recencyTracker?: RecencyTracker },
): readonly RankedSearchResult<PaletteAction>[] {
  return rankSearchResults(index, query, options);
}

const CATEGORY_DISPLAY_ORDER: readonly SearchCategory[] = [
  "command",
  "action",
  "conversation",
  "note",
];

interface CategoryGroup {
  readonly category: SearchCategory;
  readonly results: readonly RankedSearchResult<PaletteAction>[];
}

function groupResultsByCategory(
  results: readonly RankedSearchResult<PaletteAction>[],
): readonly CategoryGroup[] {
  const grouped = new Map<SearchCategory, RankedSearchResult<PaletteAction>[]>();

  for (const result of results) {
    const category = result.item.category;
    const existing = grouped.get(category);
    if (existing) {
      existing.push(result);
    } else {
      grouped.set(category, [result]);
    }
  }

  const groups: CategoryGroup[] = [];
  for (const category of CATEGORY_DISPLAY_ORDER) {
    const items = grouped.get(category);
    if (items && items.length > 0) {
      groups.push({ category, results: items });
    }
  }

  return groups;
}

describe("command registry: required actions", () => {
  const requiredActionKeys = [
    "new-chat",
    "switch-conversation",
    "search-conversations",
    "switch-model",
    "switch-theme",
    "toggle-drawer",
    "toggle-today",
    "open-help",
    "open-settings",
    "clear-chat",
    "copy-last-response",
  ];

  test("all required actions are registered in PALETTE_ACTIONS", () => {
    const registeredKeys = PALETTE_ACTIONS.map((a) => a.actionKey);
    for (const key of requiredActionKeys) {
      expect(registeredKeys).toContain(key);
    }
  });

  test("every palette action has a non-empty label and description", () => {
    for (const action of PALETTE_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
    }
  });

  test("every palette action has at least one keyword", () => {
    for (const action of PALETTE_ACTIONS) {
      expect(action.keywords.length).toBeGreaterThan(0);
    }
  });

  test("palette actions have unique IDs", () => {
    const ids = PALETTE_ACTIONS.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("action search items", () => {
  test("creates searchable items from palette action definitions", () => {
    const items = createActionSearchItems(PALETTE_ACTIONS);

    expect(items.length).toBe(PALETTE_ACTIONS.length);
    for (const item of items) {
      expect(item.category).toBe("action");
      expect(item.action.type).toBe("action");
    }
  });

  test("action items are discoverable via fuzzy search", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "new chat");

    const actionResult = results.find(
      (r) => r.item.action.type === "action" && r.item.action.key === "new-chat",
    );
    expect(actionResult).toBeDefined();
  });

  test("switch model action is discoverable", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "switch model");

    const modelAction = results.find(
      (r) => r.item.action.type === "action" && r.item.action.key === "switch-model",
    );
    expect(modelAction).toBeDefined();
  });
});

describe("category grouping", () => {
  test("results include both commands and actions categories", () => {
    const index = buildFullIndex();
    // Use a higher limit to ensure both commands and actions appear in empty-query results,
    // since the default limit (20) may be filled entirely by commands when there are ≥20.
    const results = rankSearchResults(index, "", { limit: 50 });
    const groups = groupResultsByCategory(results);

    const categories = groups.map((g) => g.category);
    expect(categories).toContain("command");
    expect(categories).toContain("action");
  });

  test("category headers follow display order: command > action > conversation > note", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Help with setup", updatedAt: new Date().toISOString() },
    ];
    const index = buildFullIndex({ conversations });
    const results = searchAndRank(index, "help");
    const groups = groupResultsByCategory(results);

    const categoryOrder = groups.map((g) => g.category);
    for (let i = 0; i < categoryOrder.length - 1; i++) {
      const currentIdx = CATEGORY_DISPLAY_ORDER.indexOf(categoryOrder[i]);
      const nextIdx = CATEGORY_DISPLAY_ORDER.indexOf(categoryOrder[i + 1]);
      expect(currentIdx).toBeLessThanOrEqual(nextIdx);
    }
  });

  test("each group has non-zero results", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "");
    const groups = groupResultsByCategory(results);

    for (const group of groups) {
      expect(group.results.length).toBeGreaterThan(0);
    }
  });
});

describe("recency boosting", () => {
  test("RecencyTracker records and retrieves usage", () => {
    const tracker = new RecencyTracker();

    tracker.recordUsage("action:new-chat");
    tracker.recordUsage("command:help");

    expect(tracker.getBoost("command:help")).toBeGreaterThan(0);
    expect(tracker.getBoost("action:new-chat")).toBeGreaterThan(0);
    expect(tracker.getBoost("unknown-item")).toBe(0);
  });

  test("most recently used item gets highest boost", () => {
    const tracker = new RecencyTracker();

    tracker.recordUsage("action:new-chat");
    tracker.recordUsage("command:help");

    // "command:help" was used last, so it should have higher boost
    expect(tracker.getBoost("command:help")).toBeGreaterThan(
      tracker.getBoost("action:new-chat"),
    );
  });

  test("recency boost affects ranking order", () => {
    const items: SearchableItem<PaletteAction>[] = [
      {
        id: "action:alpha",
        label: "Alpha Action",
        description: "First action",
        category: "action",
        keywords: ["alpha"],
        action: { type: "action", key: "alpha" },
      },
      {
        id: "action:beta",
        label: "Beta Action",
        description: "Second action",
        category: "action",
        keywords: ["beta"],
        action: { type: "action", key: "beta" },
      },
    ];

    const index = createFuzzySearchIndex(items);
    const tracker = new RecencyTracker();

    // Record beta as recently used
    tracker.recordUsage("action:beta");

    // With recency, beta should rank higher than alpha
    const withRecency = rankSearchResults(index, "", { recencyTracker: tracker });
    const alphaResult = withRecency.find((r) => r.item.id === "action:alpha");
    const betaResult = withRecency.find((r) => r.item.id === "action:beta");

    expect(betaResult).toBeDefined();
    expect(alphaResult).toBeDefined();
    expect(betaResult!.rankScore).toBeGreaterThan(alphaResult!.rankScore);
  });

  test("recency tracker reset clears all usage", () => {
    const tracker = new RecencyTracker();

    tracker.recordUsage("action:new-chat");
    expect(tracker.getBoost("action:new-chat")).toBeGreaterThan(0);

    tracker.reset();
    expect(tracker.getBoost("action:new-chat")).toBe(0);
  });

  test("recency decay reduces boost for older items", () => {
    const tracker = new RecencyTracker();

    tracker.recordUsage("item-1");
    tracker.recordUsage("item-2");
    tracker.recordUsage("item-3");

    const boost1 = tracker.getBoost("item-1");
    const boost2 = tracker.getBoost("item-2");
    const boost3 = tracker.getBoost("item-3");

    // Most recent (item-3) gets highest boost
    expect(boost3).toBeGreaterThan(boost2);
    expect(boost2).toBeGreaterThan(boost1);
  });
});

describe("slash command discovery", () => {
  test("typing / shows slash commands", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "/");

    const commandResults = results.filter((r) => r.item.category === "command");
    expect(commandResults.length).toBeGreaterThan(0);
  });

  test("typing /h filters to matching slash commands", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "/h");

    const helpResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "help",
    );
    expect(helpResult).toBeDefined();
  });

  test("typing /model surfaces model command", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "/model");

    const modelResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "model",
    );
    expect(modelResult).toBeDefined();
  });

  test("slash commands are ranked and filterable", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "/the");

    const themeResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "theme",
    );
    expect(themeResult).toBeDefined();
  });

  test("slash commands include description in search", () => {
    const index = buildFullIndex();
    // Search by description content rather than command name
    const results = searchAndRank(index, "exit");

    const quitResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "quit",
    );
    expect(quitResult).toBeDefined();
  });
});

describe("fuzzy matching across names and descriptions", () => {
  test("fuzzy match on action label", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "nw cht");

    const newChatResult = results.find(
      (r) => r.item.action.type === "action" && r.item.action.key === "new-chat",
    );
    expect(newChatResult).toBeDefined();
  });

  test("fuzzy match on action description", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "clipboard");

    const copyResult = results.find(
      (r) => r.item.action.type === "action" && r.item.action.key === "copy-last-response",
    );
    expect(copyResult).toBeDefined();
  });

  test("keyword match surfaces relevant actions", () => {
    const index = buildFullIndex();
    const results = searchAndRank(index, "sidebar");

    const drawerResult = results.find(
      (r) => r.item.action.type === "action" && r.item.action.key === "toggle-drawer",
    );
    expect(drawerResult).toBeDefined();
  });
});
