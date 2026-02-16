import { describe, expect, test } from "bun:test";

import {
  filterSkills,
  getStatusGlyph,
  getStatusColorToken,
  getTrustGlyph,
  getTrustColorToken,
  getTypeBadge,
  truncateDescription,
  panelReducer,
  INITIAL_STATE,
  type SkillListItem,
} from "../../../src/components/skills/SkillListPanel";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_SKILLS: SkillListItem[] = [
  {
    name: "git-workflow",
    description: "Automate common git operations and branch management.",
    enabled: true,
    trustLevel: "trusted",
    hasIntegration: false,
  },
  {
    name: "docker-compose",
    description: "Manage Docker containers and compose stacks.",
    enabled: true,
    trustLevel: "verified",
    hasIntegration: true,
  },
  {
    name: "code-review",
    description: "Automated code review with style and security checks.",
    enabled: false,
    trustLevel: "untrusted",
    hasIntegration: false,
  },
  {
    name: "slack-notify",
    description: "Send notifications to Slack channels.",
    enabled: true,
    trustLevel: "trusted",
    hasIntegration: true,
  },
  {
    name: "database-migrate",
    description: "Run database migrations and seed scripts.",
    enabled: false,
    trustLevel: "untrusted",
    hasIntegration: false,
  },
];

// ---------------------------------------------------------------------------
// filterSkills
// ---------------------------------------------------------------------------

describe("SkillListPanel filterSkills", () => {
  test("returns full list for empty query", () => {
    const result = filterSkills(MOCK_SKILLS, "");
    expect(result.length).toBe(MOCK_SKILLS.length);
  });

  test("returns full list for whitespace-only query", () => {
    const result = filterSkills(MOCK_SKILLS, "   ");
    expect(result.length).toBe(MOCK_SKILLS.length);
  });

  test("filters by exact name match", () => {
    const result = filterSkills(MOCK_SKILLS, "git-workflow");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("git-workflow");
  });

  test("filters case-insensitively", () => {
    const result = filterSkills(MOCK_SKILLS, "DOCKER");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("docker-compose");
  });

  test("filters by partial name", () => {
    const result = filterSkills(MOCK_SKILLS, "slack");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("slack-notify");
  });

  test("filters by description keyword", () => {
    const result = filterSkills(MOCK_SKILLS, "migrations");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("database-migrate");
  });

  test("returns multiple matches for shared terms", () => {
    // "code" appears in code-review name and description
    const result = filterSkills(MOCK_SKILLS, "code");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map((s) => s.name);
    expect(names).toContain("code-review");
  });

  test("returns empty array when nothing matches", () => {
    const result = filterSkills(MOCK_SKILLS, "zzzznonexistent");
    expect(result.length).toBe(0);
  });

  test("handles empty skills list", () => {
    const result = filterSkills([], "test");
    expect(result.length).toBe(0);
  });

  test("trims leading and trailing whitespace from query", () => {
    const result = filterSkills(MOCK_SKILLS, "  docker  ");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("docker-compose");
  });

  test("single character query works", () => {
    // "g" matches git-workflow by name
    const result = filterSkills(MOCK_SKILLS, "g");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const names = result.map((s) => s.name);
    expect(names).toContain("git-workflow");
  });
});

// ---------------------------------------------------------------------------
// getStatusGlyph
// ---------------------------------------------------------------------------

describe("SkillListPanel getStatusGlyph", () => {
  test("returns filled circle for enabled", () => {
    expect(getStatusGlyph(true)).toBe("●");
  });

  test("returns empty circle for disabled", () => {
    expect(getStatusGlyph(false)).toBe("○");
  });
});

// ---------------------------------------------------------------------------
// getStatusColorToken
// ---------------------------------------------------------------------------

describe("SkillListPanel getStatusColorToken", () => {
  test("returns success token for enabled", () => {
    expect(getStatusColorToken(true)).toBe("status.success");
  });

  test("returns muted token for disabled", () => {
    expect(getStatusColorToken(false)).toBe("text.muted");
  });
});

// ---------------------------------------------------------------------------
// getTrustGlyph
// ---------------------------------------------------------------------------

describe("SkillListPanel getTrustGlyph", () => {
  test("returns checkmark for trusted", () => {
    expect(getTrustGlyph("trusted")).toBe("✓");
  });

  test("returns warning for untrusted", () => {
    expect(getTrustGlyph("untrusted")).toBe("⚠");
  });

  test("returns shield for verified", () => {
    expect(getTrustGlyph("verified")).toBe("🛡");
  });
});

// ---------------------------------------------------------------------------
// getTrustColorToken
// ---------------------------------------------------------------------------

describe("SkillListPanel getTrustColorToken", () => {
  test("returns success token for trusted", () => {
    expect(getTrustColorToken("trusted")).toBe("status.success");
  });

  test("returns warning token for untrusted", () => {
    expect(getTrustColorToken("untrusted")).toBe("status.warning");
  });

  test("returns info token for verified", () => {
    expect(getTrustColorToken("verified")).toBe("status.info");
  });
});

// ---------------------------------------------------------------------------
// getTypeBadge
// ---------------------------------------------------------------------------

describe("SkillListPanel getTypeBadge", () => {
  test("returns 'integration' when hasIntegration is true", () => {
    expect(getTypeBadge(true)).toBe("integration");
  });

  test("returns 'native' when hasIntegration is false", () => {
    expect(getTypeBadge(false)).toBe("native");
  });
});

// ---------------------------------------------------------------------------
// truncateDescription
// ---------------------------------------------------------------------------

describe("SkillListPanel truncateDescription", () => {
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

  test("handles string of length 1 with maxLen 1", () => {
    expect(truncateDescription("a", 1)).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// panelReducer
// ---------------------------------------------------------------------------

describe("SkillListPanel panelReducer", () => {
  describe("NAVIGATE_DOWN", () => {
    test("increments selectedIndex", () => {
      const state = panelReducer(INITIAL_STATE, { type: "NAVIGATE_DOWN", listLength: 5 });
      expect(state.selectedIndex).toBe(1);
    });

    test("wraps around to 0 at end of list", () => {
      const state = { ...INITIAL_STATE, selectedIndex: 4 };
      const next = panelReducer(state, { type: "NAVIGATE_DOWN", listLength: 5 });
      expect(next.selectedIndex).toBe(0);
    });

    test("no-op when list is empty", () => {
      const state = panelReducer(INITIAL_STATE, { type: "NAVIGATE_DOWN", listLength: 0 });
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("NAVIGATE_UP", () => {
    test("decrements selectedIndex", () => {
      const state = { ...INITIAL_STATE, selectedIndex: 3 };
      const next = panelReducer(state, { type: "NAVIGATE_UP", listLength: 5 });
      expect(next.selectedIndex).toBe(2);
    });

    test("wraps around to last item from 0", () => {
      const state = panelReducer(INITIAL_STATE, { type: "NAVIGATE_UP", listLength: 5 });
      expect(state.selectedIndex).toBe(4);
    });

    test("no-op when list is empty", () => {
      const state = panelReducer(INITIAL_STATE, { type: "NAVIGATE_UP", listLength: 0 });
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("ENTER_SEARCH", () => {
    test("activates search mode with empty query", () => {
      const state = panelReducer(INITIAL_STATE, { type: "ENTER_SEARCH" });
      expect(state.searchMode).toBe(true);
      expect(state.searchQuery).toBe("");
    });
  });

  describe("EXIT_SEARCH", () => {
    test("deactivates search mode and resets state", () => {
      const searching = {
        ...INITIAL_STATE,
        searchMode: true,
        searchQuery: "docker",
        selectedIndex: 3,
      };
      const state = panelReducer(searching, { type: "EXIT_SEARCH" });
      expect(state.searchMode).toBe(false);
      expect(state.searchQuery).toBe("");
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("SET_SEARCH_QUERY", () => {
    test("updates search query and resets index", () => {
      const state = { ...INITIAL_STATE, searchMode: true, selectedIndex: 2 };
      const next = panelReducer(state, { type: "SET_SEARCH_QUERY", query: "git" });
      expect(next.searchQuery).toBe("git");
      expect(next.selectedIndex).toBe(0);
    });

    test("handles empty query", () => {
      const state = { ...INITIAL_STATE, searchMode: true, searchQuery: "g" };
      const next = panelReducer(state, { type: "SET_SEARCH_QUERY", query: "" });
      expect(next.searchQuery).toBe("");
      expect(next.selectedIndex).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation scenarios (pure logic tests)
// ---------------------------------------------------------------------------

describe("SkillListPanel keyboard navigation logic", () => {
  describe("search mode activation and deactivation", () => {
    test("/ key activates search mode (query starts empty)", () => {
      const state = panelReducer(INITIAL_STATE, { type: "ENTER_SEARCH" });
      expect(state.searchMode).toBe(true);
      expect(state.searchQuery).toBe("");
    });

    test("Esc in search mode exits and clears query", () => {
      const searching = { ...INITIAL_STATE, searchMode: true, searchQuery: "test" };
      const state = panelReducer(searching, { type: "EXIT_SEARCH" });
      expect(state.searchMode).toBe(false);
      expect(state.searchQuery).toBe("");
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("search query building", () => {
    test("typing characters appends to search query", () => {
      let state = { ...INITIAL_STATE, searchMode: true };
      state = panelReducer(state, { type: "SET_SEARCH_QUERY", query: "c" });
      state = panelReducer(state, { type: "SET_SEARCH_QUERY", query: "ca" });
      state = panelReducer(state, { type: "SET_SEARCH_QUERY", query: "cal" });
      expect(state.searchQuery).toBe("cal");
    });

    test("backspace removes last character", () => {
      const state = { ...INITIAL_STATE, searchMode: true, searchQuery: "docker" };
      const next = panelReducer(state, {
        type: "SET_SEARCH_QUERY",
        query: state.searchQuery.slice(0, -1),
      });
      expect(next.searchQuery).toBe("docke");
    });
  });

  describe("navigation with filtered lists", () => {
    test("j/k navigation wraps around filtered list", () => {
      const listLength = 2;
      let state = INITIAL_STATE;

      // j (down) from 0 -> 1
      state = panelReducer(state, { type: "NAVIGATE_DOWN", listLength });
      expect(state.selectedIndex).toBe(1);

      // j (down) from 1 -> 0 (wrap)
      state = panelReducer(state, { type: "NAVIGATE_DOWN", listLength });
      expect(state.selectedIndex).toBe(0);

      // k (up) from 0 -> 1 (wrap)
      state = panelReducer(state, { type: "NAVIGATE_UP", listLength });
      expect(state.selectedIndex).toBe(1);

      // k (up) from 1 -> 0
      state = panelReducer(state, { type: "NAVIGATE_UP", listLength });
      expect(state.selectedIndex).toBe(0);
    });

    test("navigation in empty filtered list is a no-op", () => {
      const state = panelReducer(INITIAL_STATE, { type: "NAVIGATE_DOWN", listLength: 0 });
      expect(state.selectedIndex).toBe(0);
    });

    test("search query change resets index to 0", () => {
      const state = { ...INITIAL_STATE, selectedIndex: 3, searchMode: true };
      const next = panelReducer(state, { type: "SET_SEARCH_QUERY", query: "git" });
      expect(next.selectedIndex).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("SkillListPanel empty state", () => {
  test("filterSkills returns empty for empty skills array", () => {
    const result = filterSkills([], "");
    expect(result.length).toBe(0);
  });

  test("filterSkills returns empty for empty skills with query", () => {
    const result = filterSkills([], "anything");
    expect(result.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Various skill configurations
// ---------------------------------------------------------------------------

describe("SkillListPanel skill configurations", () => {
  test("all enabled skills show filled circle", () => {
    const enabledSkills = MOCK_SKILLS.filter((s) => s.enabled);
    for (const skill of enabledSkills) {
      expect(getStatusGlyph(skill.enabled)).toBe("●");
    }
  });

  test("all disabled skills show empty circle", () => {
    const disabledSkills = MOCK_SKILLS.filter((s) => !s.enabled);
    for (const skill of disabledSkills) {
      expect(getStatusGlyph(skill.enabled)).toBe("○");
    }
  });

  test("integration skills get integration badge", () => {
    const integrationSkills = MOCK_SKILLS.filter((s) => s.hasIntegration);
    for (const skill of integrationSkills) {
      expect(getTypeBadge(skill.hasIntegration)).toBe("integration");
    }
  });

  test("native skills get native badge", () => {
    const nativeSkills = MOCK_SKILLS.filter((s) => !s.hasIntegration);
    for (const skill of nativeSkills) {
      expect(getTypeBadge(skill.hasIntegration)).toBe("native");
    }
  });

  test("each trust level has a distinct glyph", () => {
    const glyphs = new Set([
      getTrustGlyph("trusted"),
      getTrustGlyph("untrusted"),
      getTrustGlyph("verified"),
    ]);
    expect(glyphs.size).toBe(3);
  });

  test("each trust level has a distinct color token", () => {
    const tokens = new Set([
      getTrustColorToken("trusted"),
      getTrustColorToken("untrusted"),
      getTrustColorToken("verified"),
    ]);
    expect(tokens.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Search result count
// ---------------------------------------------------------------------------

describe("SkillListPanel search result count", () => {
  test("total count matches filtered results", () => {
    const filtered = filterSkills(MOCK_SKILLS, "docker");
    expect(filtered.length).toBe(1);
  });

  test("broad query returns multiple results", () => {
    // "a" appears in many names and descriptions
    const filtered = filterSkills(MOCK_SKILLS, "a");
    expect(filtered.length).toBeGreaterThanOrEqual(2);
  });

  test("total count is zero when nothing matches", () => {
    const filtered = filterSkills(MOCK_SKILLS, "zzz");
    expect(filtered.length).toBe(0);
  });

  test("total count equals full list when query is empty", () => {
    const filtered = filterSkills(MOCK_SKILLS, "");
    expect(filtered.length).toBe(MOCK_SKILLS.length);
  });
});
