import { describe, expect, test } from "bun:test";

import {
  formatInstallCount,
  getMarketplaceHelpActions,
  getMarketplaceTrustColorToken,
  getMarketplaceTrustGlyph,
  getNextSortMode,
  INITIAL_MARKETPLACE_STATE,
  marketplaceListReducer,
  truncateDescription,
  type MarketplaceListState,
} from "../../../src/components/skills/MarketplaceListPanel";

import type { MarketplaceSkill } from "@reins/core";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_SKILLS: MarketplaceSkill[] = [
  {
    slug: "git-workflow",
    name: "Git Workflow",
    author: "reins-team",
    description: "Automate common git operations and branch management.",
    installCount: 4523,
    trustLevel: "verified",
    categories: ["development", "git"],
    version: "1.2.0",
    updatedAt: "2026-02-10T00:00:00Z",
  },
  {
    slug: "docker-compose",
    name: "Docker Compose",
    author: "container-labs",
    description: "Manage Docker containers and compose stacks.",
    installCount: 12340,
    trustLevel: "trusted",
    categories: ["devops", "docker"],
    version: "2.0.1",
    updatedAt: "2026-02-08T00:00:00Z",
  },
  {
    slug: "code-review",
    name: "Code Review",
    author: "community-dev",
    description: "Automated code review with style and security checks.",
    installCount: 890,
    trustLevel: "community",
    categories: ["development", "review"],
    version: "0.9.0",
    updatedAt: "2026-01-15T00:00:00Z",
  },
  {
    slug: "sketchy-tool",
    name: "Sketchy Tool",
    author: "unknown-author",
    description: "A tool with no verification.",
    installCount: 12,
    trustLevel: "untrusted",
    categories: ["misc"],
    version: "0.1.0",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// marketplaceListReducer: NAVIGATE_DOWN
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer NAVIGATE_DOWN", () => {
  test("increments selectedIndex", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, {
      type: "NAVIGATE_DOWN",
      listLength: 5,
    });
    expect(state.selectedIndex).toBe(1);
  });

  test("wraps around to 0 at end of list", () => {
    const state: MarketplaceListState = { ...INITIAL_MARKETPLACE_STATE, selectedIndex: 4 };
    const next = marketplaceListReducer(state, { type: "NAVIGATE_DOWN", listLength: 5 });
    expect(next.selectedIndex).toBe(0);
  });

  test("no-op when list is empty", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, {
      type: "NAVIGATE_DOWN",
      listLength: 0,
    });
    expect(state.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// marketplaceListReducer: NAVIGATE_UP
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer NAVIGATE_UP", () => {
  test("decrements selectedIndex", () => {
    const state: MarketplaceListState = { ...INITIAL_MARKETPLACE_STATE, selectedIndex: 3 };
    const next = marketplaceListReducer(state, { type: "NAVIGATE_UP", listLength: 5 });
    expect(next.selectedIndex).toBe(2);
  });

  test("wraps around to last item from 0", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, {
      type: "NAVIGATE_UP",
      listLength: 5,
    });
    expect(state.selectedIndex).toBe(4);
  });

  test("no-op when list is empty", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, {
      type: "NAVIGATE_UP",
      listLength: 0,
    });
    expect(state.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// marketplaceListReducer: ENTER_SEARCH / EXIT_SEARCH
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer search mode", () => {
  test("ENTER_SEARCH activates search mode with empty query", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, { type: "ENTER_SEARCH" });
    expect(state.searchMode).toBe(true);
    expect(state.searchQuery).toBe("");
  });

  test("EXIT_SEARCH deactivates search mode and resets state", () => {
    const searching: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      searchMode: true,
      searchQuery: "docker",
      selectedIndex: 3,
    };
    const state = marketplaceListReducer(searching, { type: "EXIT_SEARCH" });
    expect(state.searchMode).toBe(false);
    expect(state.searchQuery).toBe("");
    expect(state.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// marketplaceListReducer: SET_SEARCH_QUERY
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer SET_SEARCH_QUERY", () => {
  test("updates search query and resets index", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      searchMode: true,
      selectedIndex: 2,
    };
    const next = marketplaceListReducer(state, { type: "SET_SEARCH_QUERY", query: "git" });
    expect(next.searchQuery).toBe("git");
    expect(next.selectedIndex).toBe(0);
  });

  test("handles empty query", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      searchMode: true,
      searchQuery: "g",
    };
    const next = marketplaceListReducer(state, { type: "SET_SEARCH_QUERY", query: "" });
    expect(next.searchQuery).toBe("");
    expect(next.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// marketplaceListReducer: SET_SORT / CYCLE_SORT
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer sort mode", () => {
  test("SET_SORT changes sort mode and resets index", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      selectedIndex: 3,
    };
    const next = marketplaceListReducer(state, { type: "SET_SORT", sortMode: "popular" });
    expect(next.sortMode).toBe("popular");
    expect(next.selectedIndex).toBe(0);
  });

  test("CYCLE_SORT cycles trending → popular", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, { type: "CYCLE_SORT" });
    expect(state.sortMode).toBe("popular");
  });

  test("CYCLE_SORT cycles popular → recent", () => {
    const state: MarketplaceListState = { ...INITIAL_MARKETPLACE_STATE, sortMode: "popular" };
    const next = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(next.sortMode).toBe("recent");
  });

  test("CYCLE_SORT cycles recent → trending", () => {
    const state: MarketplaceListState = { ...INITIAL_MARKETPLACE_STATE, sortMode: "recent" };
    const next = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(next.sortMode).toBe("trending");
  });

  test("CYCLE_SORT resets selectedIndex", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      selectedIndex: 5,
      sortMode: "trending",
    };
    const next = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(next.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// marketplaceListReducer: SET_SKILLS / SET_LOADING / SET_ERROR / CLEAR_ERROR
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer data loading", () => {
  test("SET_SKILLS stores skills and clears loading/error", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      isLoading: true,
      error: "previous error",
    };
    const next = marketplaceListReducer(state, { type: "SET_SKILLS", skills: MOCK_SKILLS });
    expect(next.skills).toBe(MOCK_SKILLS);
    expect(next.isLoading).toBe(false);
    expect(next.error).toBeNull();
  });

  test("SET_LOADING updates loading state", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, {
      type: "SET_LOADING",
      isLoading: true,
    });
    expect(state.isLoading).toBe(true);
  });

  test("SET_ERROR stores error and clears loading", () => {
    const state: MarketplaceListState = { ...INITIAL_MARKETPLACE_STATE, isLoading: true };
    const next = marketplaceListReducer(state, { type: "SET_ERROR", error: "Network error" });
    expect(next.error).toBe("Network error");
    expect(next.isLoading).toBe(false);
  });

  test("CLEAR_ERROR clears error", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      error: "Some error",
    };
    const next = marketplaceListReducer(state, { type: "CLEAR_ERROR" });
    expect(next.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// marketplaceListReducer: unknown action
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel reducer unknown action", () => {
  test("returns state unchanged for unknown action type", () => {
    const state = marketplaceListReducer(
      INITIAL_MARKETPLACE_STATE,
      // @ts-expect-error — testing unknown action type
      { type: "UNKNOWN_ACTION" },
    );
    expect(state).toEqual(INITIAL_MARKETPLACE_STATE);
  });
});

// ---------------------------------------------------------------------------
// getNextSortMode
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel getNextSortMode", () => {
  test("trending → popular", () => {
    expect(getNextSortMode("trending")).toBe("popular");
  });

  test("popular → recent", () => {
    expect(getNextSortMode("popular")).toBe("recent");
  });

  test("recent → trending", () => {
    expect(getNextSortMode("recent")).toBe("trending");
  });
});

// ---------------------------------------------------------------------------
// getMarketplaceTrustGlyph
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel getMarketplaceTrustGlyph", () => {
  test("returns [V] for verified", () => {
    expect(getMarketplaceTrustGlyph("verified")).toBe("[V]");
  });

  test("returns [T] for trusted", () => {
    expect(getMarketplaceTrustGlyph("trusted")).toBe("[T]");
  });

  test("returns [C] for community", () => {
    expect(getMarketplaceTrustGlyph("community")).toBe("[C]");
  });

  test("returns [!] for untrusted", () => {
    expect(getMarketplaceTrustGlyph("untrusted")).toBe("[!]");
  });

  test("each trust level has a distinct glyph", () => {
    const glyphs = new Set([
      getMarketplaceTrustGlyph("verified"),
      getMarketplaceTrustGlyph("trusted"),
      getMarketplaceTrustGlyph("community"),
      getMarketplaceTrustGlyph("untrusted"),
    ]);
    expect(glyphs.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getMarketplaceTrustColorToken
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel getMarketplaceTrustColorToken", () => {
  test("returns success token for verified", () => {
    expect(getMarketplaceTrustColorToken("verified")).toBe("status.success");
  });

  test("returns info token for trusted", () => {
    expect(getMarketplaceTrustColorToken("trusted")).toBe("status.info");
  });

  test("returns warning token for community", () => {
    expect(getMarketplaceTrustColorToken("community")).toBe("status.warning");
  });

  test("returns error token for untrusted", () => {
    expect(getMarketplaceTrustColorToken("untrusted")).toBe("status.error");
  });

  test("each trust level has a distinct color token", () => {
    const tokens = new Set([
      getMarketplaceTrustColorToken("verified"),
      getMarketplaceTrustColorToken("trusted"),
      getMarketplaceTrustColorToken("community"),
      getMarketplaceTrustColorToken("untrusted"),
    ]);
    expect(tokens.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// formatInstallCount
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel formatInstallCount", () => {
  test("returns raw number for counts under 1000", () => {
    expect(formatInstallCount(0)).toBe("0");
    expect(formatInstallCount(1)).toBe("1");
    expect(formatInstallCount(999)).toBe("999");
  });

  test("formats thousands with one decimal for 1k-9.9k", () => {
    expect(formatInstallCount(1000)).toBe("1.0k");
    expect(formatInstallCount(1234)).toBe("1.2k");
    expect(formatInstallCount(4523)).toBe("4.5k");
    expect(formatInstallCount(9999)).toBe("10.0k");
  });

  test("formats thousands as integer for 10k+", () => {
    expect(formatInstallCount(10000)).toBe("10k");
    expect(formatInstallCount(12340)).toBe("12k");
    expect(formatInstallCount(999999)).toBe("1000k");
  });

  test("formats millions with one decimal", () => {
    expect(formatInstallCount(1000000)).toBe("1.0M");
    expect(formatInstallCount(2500000)).toBe("2.5M");
  });
});

// ---------------------------------------------------------------------------
// truncateDescription
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel truncateDescription", () => {
  test("returns full string when under max length", () => {
    expect(truncateDescription("short", 40)).toBe("short");
  });

  test("returns full string when exactly at max length", () => {
    const str = "a".repeat(40);
    expect(truncateDescription(str, 40)).toBe(str);
  });

  test("truncates and appends ellipsis when over max length", () => {
    const str = "a".repeat(50);
    const result = truncateDescription(str, 40);
    expect(result.length).toBe(40);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toBe("a".repeat(39) + "…");
  });

  test("handles empty string", () => {
    expect(truncateDescription("", 40)).toBe("");
  });

  test("handles maxLen of 0", () => {
    expect(truncateDescription("hello", 0)).toBe("");
  });

  test("handles maxLen of 1", () => {
    expect(truncateDescription("hello", 1)).toBe("…");
  });
});

// ---------------------------------------------------------------------------
// getMarketplaceHelpActions
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel getMarketplaceHelpActions", () => {
  test("normal mode shows navigate, select, search, sort, and close", () => {
    const actions = getMarketplaceHelpActions(false, false);
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("j/k");
    expect(keys).toContain("Enter");
    expect(keys).toContain("/");
    expect(keys).toContain("s");
    expect(keys).toContain("Esc");
  });

  test("normal mode has 5 actions", () => {
    expect(getMarketplaceHelpActions(false, false).length).toBe(5);
  });

  test("search mode shows only cancel", () => {
    const actions = getMarketplaceHelpActions(true, false);
    expect(actions.length).toBe(1);
    expect(actions[0].key).toBe("Esc");
    expect(actions[0].label).toBe("Cancel");
  });

  test("error mode shows retry and close", () => {
    const actions = getMarketplaceHelpActions(false, true);
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("r");
    expect(keys).toContain("Esc");
    expect(actions.length).toBe(2);
  });

  test("error mode takes priority over search mode", () => {
    const actions = getMarketplaceHelpActions(true, true);
    const keys = actions.map((a) => a.key);

    expect(keys).toContain("r");
    expect(actions.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel initial state", () => {
  test("starts with selectedIndex 0", () => {
    expect(INITIAL_MARKETPLACE_STATE.selectedIndex).toBe(0);
  });

  test("starts not in search mode", () => {
    expect(INITIAL_MARKETPLACE_STATE.searchMode).toBe(false);
  });

  test("starts with empty search query", () => {
    expect(INITIAL_MARKETPLACE_STATE.searchQuery).toBe("");
  });

  test("starts with trending sort mode", () => {
    expect(INITIAL_MARKETPLACE_STATE.sortMode).toBe("trending");
  });

  test("starts with empty skills array", () => {
    expect(INITIAL_MARKETPLACE_STATE.skills).toEqual([]);
  });

  test("starts not loading", () => {
    expect(INITIAL_MARKETPLACE_STATE.isLoading).toBe(false);
  });

  test("starts with no error", () => {
    expect(INITIAL_MARKETPLACE_STATE.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation scenarios (pure logic tests)
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel keyboard navigation logic", () => {
  test("j/k navigation wraps around list", () => {
    const listLength = 3;
    let state = INITIAL_MARKETPLACE_STATE;

    // j (down) from 0 → 1
    state = marketplaceListReducer(state, { type: "NAVIGATE_DOWN", listLength });
    expect(state.selectedIndex).toBe(1);

    // j (down) from 1 → 2
    state = marketplaceListReducer(state, { type: "NAVIGATE_DOWN", listLength });
    expect(state.selectedIndex).toBe(2);

    // j (down) from 2 → 0 (wrap)
    state = marketplaceListReducer(state, { type: "NAVIGATE_DOWN", listLength });
    expect(state.selectedIndex).toBe(0);

    // k (up) from 0 → 2 (wrap)
    state = marketplaceListReducer(state, { type: "NAVIGATE_UP", listLength });
    expect(state.selectedIndex).toBe(2);

    // k (up) from 2 → 1
    state = marketplaceListReducer(state, { type: "NAVIGATE_UP", listLength });
    expect(state.selectedIndex).toBe(1);
  });

  test("search mode activation and deactivation", () => {
    let state = INITIAL_MARKETPLACE_STATE;

    // / activates search
    state = marketplaceListReducer(state, { type: "ENTER_SEARCH" });
    expect(state.searchMode).toBe(true);
    expect(state.searchQuery).toBe("");

    // Type characters
    state = marketplaceListReducer(state, { type: "SET_SEARCH_QUERY", query: "g" });
    state = marketplaceListReducer(state, { type: "SET_SEARCH_QUERY", query: "gi" });
    state = marketplaceListReducer(state, { type: "SET_SEARCH_QUERY", query: "git" });
    expect(state.searchQuery).toBe("git");

    // Esc exits search
    state = marketplaceListReducer(state, { type: "EXIT_SEARCH" });
    expect(state.searchMode).toBe(false);
    expect(state.searchQuery).toBe("");
    expect(state.selectedIndex).toBe(0);
  });

  test("sort cycling through all modes", () => {
    let state = INITIAL_MARKETPLACE_STATE;
    expect(state.sortMode).toBe("trending");

    state = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(state.sortMode).toBe("popular");

    state = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(state.sortMode).toBe("recent");

    state = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(state.sortMode).toBe("trending");
  });
});

// ---------------------------------------------------------------------------
// State transitions: browse → search → browse
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel state transitions", () => {
  test("loading → skills loaded → sort change → loading again", () => {
    let state = INITIAL_MARKETPLACE_STATE;

    // Start loading
    state = marketplaceListReducer(state, { type: "SET_LOADING", isLoading: true });
    expect(state.isLoading).toBe(true);

    // Skills arrive
    state = marketplaceListReducer(state, { type: "SET_SKILLS", skills: MOCK_SKILLS });
    expect(state.isLoading).toBe(false);
    expect(state.skills.length).toBe(4);

    // Change sort mode
    state = marketplaceListReducer(state, { type: "CYCLE_SORT" });
    expect(state.sortMode).toBe("popular");
    expect(state.selectedIndex).toBe(0);
  });

  test("loading → error → retry → loading → success", () => {
    let state = INITIAL_MARKETPLACE_STATE;

    // Start loading
    state = marketplaceListReducer(state, { type: "SET_LOADING", isLoading: true });
    expect(state.isLoading).toBe(true);

    // Error occurs
    state = marketplaceListReducer(state, { type: "SET_ERROR", error: "Network timeout" });
    expect(state.error).toBe("Network timeout");
    expect(state.isLoading).toBe(false);

    // Clear error for retry
    state = marketplaceListReducer(state, { type: "CLEAR_ERROR" });
    expect(state.error).toBeNull();

    // Start loading again
    state = marketplaceListReducer(state, { type: "SET_LOADING", isLoading: true });
    expect(state.isLoading).toBe(true);

    // Success
    state = marketplaceListReducer(state, { type: "SET_SKILLS", skills: MOCK_SKILLS });
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.skills.length).toBe(4);
  });

  test("browse → enter search → type query → exit search → back to browse", () => {
    let state = INITIAL_MARKETPLACE_STATE;

    // Load initial skills
    state = marketplaceListReducer(state, { type: "SET_SKILLS", skills: MOCK_SKILLS });
    expect(state.skills.length).toBe(4);

    // Enter search
    state = marketplaceListReducer(state, { type: "ENTER_SEARCH" });
    expect(state.searchMode).toBe(true);

    // Type query
    state = marketplaceListReducer(state, { type: "SET_SEARCH_QUERY", query: "docker" });
    expect(state.searchQuery).toBe("docker");

    // Exit search
    state = marketplaceListReducer(state, { type: "EXIT_SEARCH" });
    expect(state.searchMode).toBe(false);
    expect(state.searchQuery).toBe("");
    // Skills remain from last fetch
    expect(state.skills.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("MarketplaceListPanel edge cases", () => {
  test("SET_SKILLS with empty array", () => {
    const state = marketplaceListReducer(INITIAL_MARKETPLACE_STATE, {
      type: "SET_SKILLS",
      skills: [],
    });
    expect(state.skills).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  test("navigation in single-item list", () => {
    let state = INITIAL_MARKETPLACE_STATE;

    state = marketplaceListReducer(state, { type: "NAVIGATE_DOWN", listLength: 1 });
    expect(state.selectedIndex).toBe(0);

    state = marketplaceListReducer(state, { type: "NAVIGATE_UP", listLength: 1 });
    expect(state.selectedIndex).toBe(0);
  });

  test("SET_SORT to same mode resets index", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      sortMode: "trending",
      selectedIndex: 5,
    };
    const next = marketplaceListReducer(state, { type: "SET_SORT", sortMode: "trending" });
    expect(next.sortMode).toBe("trending");
    expect(next.selectedIndex).toBe(0);
  });

  test("SET_ERROR overwrites previous error", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      error: "First error",
    };
    const next = marketplaceListReducer(state, { type: "SET_ERROR", error: "Second error" });
    expect(next.error).toBe("Second error");
  });

  test("SET_SKILLS clears previous error", () => {
    const state: MarketplaceListState = {
      ...INITIAL_MARKETPLACE_STATE,
      error: "Some error",
      isLoading: true,
    };
    const next = marketplaceListReducer(state, { type: "SET_SKILLS", skills: MOCK_SKILLS });
    expect(next.error).toBeNull();
    expect(next.isLoading).toBe(false);
  });
});
