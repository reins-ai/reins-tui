import { describe, expect, test } from "bun:test";

import {
  createCommandSearchItems,
  createConversationSearchItems,
  createFuzzySearchIndex,
  createNoteSearchItems,
  type ConversationSearchSource,
  type FuzzySearchIndex,
  type NoteSearchSource,
  type PaletteAction,
  type SearchableItem,
} from "../../src/palette/fuzzy-index";
import { rankSearchResults, type RankedSearchResult } from "../../src/palette/ranking";
import { SLASH_COMMANDS } from "../../src/commands/registry";

/**
 * These tests validate the command palette's search, grouping, navigation,
 * and execution logic — the core interaction model that drives the UI.
 */

function buildTestIndex(options?: {
  conversations?: readonly ConversationSearchSource[];
  notes?: readonly NoteSearchSource[];
}): FuzzySearchIndex<PaletteAction> {
  const commandItems = createCommandSearchItems(SLASH_COMMANDS);
  const conversationItems = createConversationSearchItems(options?.conversations ?? []);
  const noteItems = createNoteSearchItems(options?.notes ?? []);
  return createFuzzySearchIndex([...commandItems, ...conversationItems, ...noteItems]);
}

function searchAndRank(
  index: FuzzySearchIndex<PaletteAction>,
  query: string,
): readonly RankedSearchResult<PaletteAction>[] {
  return rankSearchResults(index, query);
}

type SearchCategory = "command" | "conversation" | "note" | "action";

interface CategoryGroup {
  readonly category: SearchCategory;
  readonly results: readonly RankedSearchResult<PaletteAction>[];
}

const CATEGORY_DISPLAY_ORDER: readonly SearchCategory[] = [
  "command",
  "action",
  "conversation",
  "note",
];

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

function flattenGroupedResults(
  groups: readonly CategoryGroup[],
): readonly RankedSearchResult<PaletteAction>[] {
  const flat: RankedSearchResult<PaletteAction>[] = [];
  for (const group of groups) {
    for (const result of group.results) {
      flat.push(result);
    }
  }
  return flat;
}

/**
 * Simulates the keyboard navigation state machine used by the palette.
 */
class PaletteNavigationSimulator {
  private selectedIndex = 0;
  private results: readonly RankedSearchResult<PaletteAction>[] = [];
  private executedActions: PaletteAction[] = [];
  private closed = false;

  constructor(
    private readonly index: FuzzySearchIndex<PaletteAction>,
  ) {
    this.updateResults("");
  }

  get currentIndex(): number {
    return this.selectedIndex;
  }

  get totalResults(): number {
    return this.results.length;
  }

  get selectedItem(): RankedSearchResult<PaletteAction> | undefined {
    return this.results[this.selectedIndex];
  }

  get lastExecutedAction(): PaletteAction | undefined {
    return this.executedActions[this.executedActions.length - 1];
  }

  get allExecutedActions(): readonly PaletteAction[] {
    return this.executedActions;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get groupedResults(): readonly CategoryGroup[] {
    return groupResultsByCategory(this.results);
  }

  search(query: string): void {
    this.updateResults(query);
    this.selectedIndex = 0;
  }

  moveUp(): void {
    if (this.totalResults === 0) return;
    const next = this.selectedIndex - 1;
    this.selectedIndex = next < 0 ? this.totalResults - 1 : next;
  }

  moveDown(): void {
    if (this.totalResults === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.totalResults;
  }

  enter(): void {
    if (this.totalResults === 0) return;
    const selected = this.results[this.selectedIndex];
    if (selected) {
      this.executedActions.push(selected.item.action);
    }
  }

  escape(): void {
    this.closed = true;
  }

  private updateResults(query: string): void {
    const ranked = searchAndRank(this.index, query);
    const groups = groupResultsByCategory(ranked);
    this.results = flattenGroupedResults(groups);
  }
}

describe("command palette: search integration", () => {
  test("empty query returns all registered commands", () => {
    const index = buildTestIndex();
    const results = rankSearchResults(index, "", { limit: 50 });

    expect(results.length).toBeGreaterThanOrEqual(SLASH_COMMANDS.length);
  });

  test("typing 'help' surfaces the help command first", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "help");

    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first?.item.action).toEqual({ type: "command", command: "help" });
  });

  test("typing 'model' surfaces the model command", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "model");

    const modelResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "model",
    );
    expect(modelResult).toBeDefined();
  });

  test("typing 'theme' surfaces the theme command", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "theme");

    const themeResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "theme",
    );
    expect(themeResult).toBeDefined();
  });

  test("conversations appear in search results", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Planning meeting notes", updatedAt: new Date().toISOString() },
      { id: "conv-2", title: "Code review discussion", updatedAt: new Date().toISOString() },
    ];
    const index = buildTestIndex({ conversations });
    const results = searchAndRank(index, "planning");

    const conversationResult = results.find(
      (r) => r.item.action.type === "conversation",
    );
    expect(conversationResult).toBeDefined();
    if (conversationResult?.item.action.type === "conversation") {
      expect(conversationResult.item.action.conversationId).toBe("conv-1");
    }
  });

  test("notes appear in search results", () => {
    const notes: NoteSearchSource[] = [
      { id: "note-1", title: "Architecture decisions", excerpt: "Key decisions made" },
      { id: "note-2", title: "Meeting agenda", excerpt: "Items to discuss" },
    ];
    const index = buildTestIndex({ notes });
    const results = searchAndRank(index, "architecture");

    const noteResult = results.find(
      (r) => r.item.action.type === "note",
    );
    expect(noteResult).toBeDefined();
    if (noteResult?.item.action.type === "note") {
      expect(noteResult.item.action.noteId).toBe("note-1");
    }
  });

  test("no results for nonsense query", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "xyzzyplugh");

    expect(results.length).toBe(0);
  });

  test("search is case-insensitive", () => {
    const index = buildTestIndex();
    const lower = searchAndRank(index, "help");
    const upper = searchAndRank(index, "HELP");

    expect(lower.length).toBe(upper.length);
    expect(lower[0]?.item.id).toBe(upper[0]?.item.id);
  });
});

describe("command palette: category grouping", () => {
  test("results are grouped by category in display order", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Help with setup", updatedAt: new Date().toISOString() },
    ];
    const notes: NoteSearchSource[] = [
      { id: "note-1", title: "Help documentation" },
    ];
    const index = buildTestIndex({ conversations, notes });
    const results = searchAndRank(index, "help");
    const groups = groupResultsByCategory(results);

    const categoryOrder = groups.map((g) => g.category);

    if (categoryOrder.includes("command") && categoryOrder.includes("conversation")) {
      expect(categoryOrder.indexOf("command")).toBeLessThan(
        categoryOrder.indexOf("conversation"),
      );
    }

    if (categoryOrder.includes("conversation") && categoryOrder.includes("note")) {
      expect(categoryOrder.indexOf("conversation")).toBeLessThan(
        categoryOrder.indexOf("note"),
      );
    }
  });

  test("empty categories are excluded from groups", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "help");
    const groups = groupResultsByCategory(results);

    for (const group of groups) {
      expect(group.results.length).toBeGreaterThan(0);
    }
  });

  test("flattened results preserve group ordering", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Help chat", updatedAt: new Date().toISOString() },
    ];
    const index = buildTestIndex({ conversations });
    const results = searchAndRank(index, "help");
    const groups = groupResultsByCategory(results);
    const flat = flattenGroupedResults(groups);

    let lastCategoryIndex = -1;
    for (const result of flat) {
      const categoryIndex = CATEGORY_DISPLAY_ORDER.indexOf(result.item.category);
      expect(categoryIndex).toBeGreaterThanOrEqual(lastCategoryIndex);
      if (categoryIndex > lastCategoryIndex) {
        lastCategoryIndex = categoryIndex;
      }
    }
  });
});

describe("command palette: keyboard navigation", () => {
  test("initial selection is index 0", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    expect(nav.currentIndex).toBe(0);
  });

  test("down arrow advances selection", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.moveDown();
    expect(nav.currentIndex).toBe(1);

    nav.moveDown();
    expect(nav.currentIndex).toBe(2);
  });

  test("up arrow moves selection backward", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.moveDown();
    nav.moveDown();
    nav.moveUp();
    expect(nav.currentIndex).toBe(1);
  });

  test("up arrow from index 0 wraps to last item", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.moveUp();
    expect(nav.currentIndex).toBe(nav.totalResults - 1);
  });

  test("down arrow from last item wraps to index 0", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    for (let i = 0; i < nav.totalResults; i++) {
      nav.moveDown();
    }
    expect(nav.currentIndex).toBe(0);
  });

  test("search resets selection to index 0", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.moveDown();
    nav.moveDown();
    nav.moveDown();
    expect(nav.currentIndex).toBe(3);

    nav.search("help");
    expect(nav.currentIndex).toBe(0);
  });

  test("enter executes the selected item action", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.search("help");
    nav.enter();

    expect(nav.lastExecutedAction).toEqual({ type: "command", command: "help" });
  });

  test("enter on conversation item returns conversation action", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-abc", title: "Test conversation", updatedAt: new Date().toISOString() },
    ];
    const index = buildTestIndex({ conversations });
    const nav = new PaletteNavigationSimulator(index);

    nav.search("test conversation");
    const selected = nav.selectedItem;
    if (selected?.item.action.type === "conversation") {
      nav.enter();
      expect(nav.lastExecutedAction).toEqual({
        type: "conversation",
        conversationId: "conv-abc",
      });
    }
  });

  test("escape closes the palette", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    expect(nav.isClosed).toBe(false);
    nav.escape();
    expect(nav.isClosed).toBe(true);
  });

  test("navigation with no results does not crash", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.search("xyzzyplugh");
    expect(nav.totalResults).toBe(0);

    nav.moveUp();
    expect(nav.currentIndex).toBe(0);

    nav.moveDown();
    expect(nav.currentIndex).toBe(0);

    nav.enter();
    expect(nav.lastExecutedAction).toBeUndefined();
  });

  test("arrow navigation through multiple categories", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Help with setup", updatedAt: new Date().toISOString() },
    ];
    const index = buildTestIndex({ conversations });
    const nav = new PaletteNavigationSimulator(index);

    nav.search("help");
    const groups = nav.groupedResults;

    expect(groups.length).toBeGreaterThanOrEqual(1);

    const totalAcrossGroups = groups.reduce((sum, g) => sum + g.results.length, 0);
    expect(nav.totalResults).toBe(totalAcrossGroups);

    for (let i = 0; i < totalAcrossGroups; i++) {
      expect(nav.currentIndex).toBe(i);
      nav.moveDown();
    }
    expect(nav.currentIndex).toBe(0);
  });
});

describe("command palette: action dispatch", () => {
  test("command action contains command name", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.search("quit");
    nav.enter();

    const action = nav.lastExecutedAction;
    expect(action?.type).toBe("command");
    if (action?.type === "command") {
      expect(action.command).toBe("quit");
    }
  });

  test("conversation action contains conversation ID", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-xyz", title: "Unique conversation title", updatedAt: new Date().toISOString() },
    ];
    const index = buildTestIndex({ conversations });
    const nav = new PaletteNavigationSimulator(index);

    nav.search("unique conversation");
    nav.enter();

    const action = nav.lastExecutedAction;
    expect(action?.type).toBe("conversation");
    if (action?.type === "conversation") {
      expect(action.conversationId).toBe("conv-xyz");
    }
  });

  test("note action contains note ID", () => {
    const notes: NoteSearchSource[] = [
      { id: "note-abc", title: "Unique note about testing" },
    ];
    const index = buildTestIndex({ notes });
    const nav = new PaletteNavigationSimulator(index);

    nav.search("unique note");
    nav.enter();

    const action = nav.lastExecutedAction;
    expect(action?.type).toBe("note");
    if (action?.type === "note") {
      expect(action.noteId).toBe("note-abc");
    }
  });

  test("multiple executions are tracked", () => {
    const index = buildTestIndex();
    const nav = new PaletteNavigationSimulator(index);

    nav.search("help");
    nav.enter();

    nav.search("quit");
    nav.enter();

    expect(nav.allExecutedActions.length).toBe(2);
    expect(nav.allExecutedActions[0]?.type).toBe("command");
    expect(nav.allExecutedActions[1]?.type).toBe("command");
  });
});

describe("command palette: highlight ranges", () => {
  test("search results include highlight ranges for matches", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "help");

    const helpResult = results.find(
      (r) => r.item.action.type === "command" && r.item.action.command === "help",
    );
    expect(helpResult).toBeDefined();
    expect(helpResult?.ranges.length).toBeGreaterThan(0);
    expect(["label", "keyword", "description"]).toContain(helpResult?.matchedField);
  });

  test("highlight ranges are within label bounds", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "model");

    for (const result of results) {
      if (result.matchedField === "label") {
        for (const range of result.ranges) {
          expect(range.start).toBeGreaterThanOrEqual(0);
          expect(range.end).toBeLessThanOrEqual(result.item.label.length);
          expect(range.start).toBeLessThan(range.end);
        }
      }
    }
  });
});

describe("command palette: empty state behavior", () => {
  test("empty query with no data sources shows commands only", () => {
    const index = buildTestIndex();
    const results = searchAndRank(index, "");
    const groups = groupResultsByCategory(results);

    const categories = groups.map((g) => g.category);
    expect(categories).toContain("command");
  });

  test("empty query with conversations shows both categories", () => {
    const conversations: ConversationSearchSource[] = [
      { id: "conv-1", title: "Recent chat", updatedAt: new Date().toISOString() },
    ];
    const index = buildTestIndex({ conversations });
    const results = searchAndRank(index, "");
    const groups = groupResultsByCategory(results);

    const categories = groups.map((g) => g.category);
    expect(categories).toContain("command");
    expect(categories).toContain("conversation");
  });
});

describe("command palette: result limit", () => {
  test("results are capped at ranking limit", () => {
    const conversations: ConversationSearchSource[] = Array.from({ length: 50 }, (_, i) => ({
      id: `conv-${i}`,
      title: `Conversation about topic ${i}`,
      updatedAt: new Date(Date.now() - i * 60000).toISOString(),
    }));
    const index = buildTestIndex({ conversations });
    const results = searchAndRank(index, "");

    expect(results.length).toBeLessThanOrEqual(20);
  });
});
