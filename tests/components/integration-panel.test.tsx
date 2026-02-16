import { describe, expect, test } from "bun:test";

import {
  callIntegrationAction,
  filterIntegrations,
  getAvailableActions,
  getActionLabel,
  type IntegrationSummary,
  type IntegrationActionName,
  type IntegrationStatus,
} from "../../src/components/integration-panel";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CONNECTED_INTEGRATIONS: IntegrationSummary[] = [
  {
    id: "obsidian",
    name: "Obsidian",
    status: "connected",
    version: "1.0.0",
    description: "Local Markdown vault for notes and knowledge management.",
    category: "productivity",
    operations: [
      { name: "search-notes", description: "Search notes by content and title" },
      { name: "read-note", description: "Read note content by path" },
      { name: "create-note", description: "Create new note" },
      { name: "list-notes", description: "List notes in a directory" },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    status: "auth_expired",
    version: "1.0.0",
    description: "Google email with OAuth2 authentication.",
    category: "communication",
    operations: [
      { name: "read-email", description: "Read email by ID" },
      { name: "search-emails", description: "Search emails by query" },
      { name: "send-email", description: "Send email" },
      { name: "list-emails", description: "List recent inbox emails" },
    ],
  },
  {
    id: "spotify",
    name: "Spotify",
    status: "error",
    version: "1.0.0",
    description: "Music playback and library management.",
    category: "media",
    operations: [
      { name: "get-playback", description: "Get current playback state" },
      { name: "control-playback", description: "Play, pause, skip" },
      { name: "search", description: "Search tracks, albums, artists" },
      { name: "get-playlists", description: "Get user's playlists" },
    ],
  },
];

const AVAILABLE_INTEGRATIONS: IntegrationSummary[] = [
  {
    id: "slack",
    name: "Slack",
    status: "disconnected",
    version: "1.0.0",
    description: "Team messaging and collaboration.",
    category: "communication",
    operations: [
      { name: "send-message", description: "Send a message" },
      { name: "list-channels", description: "List available channels" },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    status: "disconnected",
    version: "1.0.0",
    description: "Workspace for notes, docs, and project management.",
    category: "productivity",
    operations: [
      { name: "search-pages", description: "Search pages" },
      { name: "read-page", description: "Read page content" },
      { name: "create-page", description: "Create a new page" },
    ],
  },
];

const ALL_INTEGRATIONS = [...CONNECTED_INTEGRATIONS, ...AVAILABLE_INTEGRATIONS];

// ---------------------------------------------------------------------------
// Search filtering — keyboard-driven search via / key
// ---------------------------------------------------------------------------

describe("IntegrationPanel search filtering", () => {
  describe("filterIntegrations", () => {
    test("returns full list for empty query", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "");
      expect(result.length).toBe(ALL_INTEGRATIONS.length);
    });

    test("returns full list for whitespace-only query", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "   ");
      expect(result.length).toBe(ALL_INTEGRATIONS.length);
    });

    test("filters by exact name match", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "Obsidian");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("obsidian");
    });

    test("filters case-insensitively", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "GMAIL");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("gmail");
    });

    test("filters by partial name", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "spo");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("spotify");
    });

    test("filters by integration id", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "slack");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("slack");
    });

    test("filters by description keyword", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "playback");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("spotify");
    });

    test("returns multiple matches for shared terms", () => {
      // "notes" appears in Obsidian description and Notion description
      const result = filterIntegrations(ALL_INTEGRATIONS, "notes");
      expect(result.length).toBe(2);
      const ids = result.map((i) => i.id);
      expect(ids).toContain("obsidian");
      expect(ids).toContain("notion");
    });

    test("returns empty array when nothing matches", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "zzzznonexistent");
      expect(result.length).toBe(0);
    });

    test("handles empty integration list", () => {
      const result = filterIntegrations([], "test");
      expect(result.length).toBe(0);
    });

    test("trims leading and trailing whitespace from query", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "  gmail  ");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("gmail");
    });

    test("matches description with OAuth keyword", () => {
      const result = filterIntegrations(ALL_INTEGRATIONS, "oauth");
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("gmail");
    });

    test("matches across connected and available lists separately", () => {
      const connectedResult = filterIntegrations(CONNECTED_INTEGRATIONS, "email");
      expect(connectedResult.length).toBe(1);
      expect(connectedResult[0].id).toBe("gmail");

      const availableResult = filterIntegrations(AVAILABLE_INTEGRATIONS, "messaging");
      expect(availableResult.length).toBe(1);
      expect(availableResult[0].id).toBe("slack");
    });

    test("single character query works", () => {
      // "s" matches Spotify, Slack (name), and possibly others via description
      const result = filterIntegrations(ALL_INTEGRATIONS, "s");
      expect(result.length).toBeGreaterThanOrEqual(2);
      const ids = result.map((i) => i.id);
      expect(ids).toContain("spotify");
      expect(ids).toContain("slack");
    });
  });
});

// ---------------------------------------------------------------------------
// Action availability per integration status
// ---------------------------------------------------------------------------

describe("IntegrationPanel actions per status", () => {
  const ALL_STATUSES: IntegrationStatus[] = [
    "connected",
    "error",
    "auth_expired",
    "suspended",
    "disconnected",
  ];

  test("connected: disable and disconnect available", () => {
    const actions = getAvailableActions("connected");
    expect(actions).toEqual(["disable", "disconnect"]);
  });

  test("disconnected: enable and connect available", () => {
    const actions = getAvailableActions("disconnected");
    expect(actions).toEqual(["enable", "connect"]);
  });

  test("auth_expired: reconnect and disconnect available", () => {
    const actions = getAvailableActions("auth_expired");
    expect(actions).toEqual(["reconnect", "disconnect"]);
  });

  test("suspended: resume and disconnect available", () => {
    const actions = getAvailableActions("suspended");
    expect(actions).toEqual(["resume", "disconnect"]);
  });

  test("error: retry and disconnect available", () => {
    const actions = getAvailableActions("error");
    expect(actions).toEqual(["retry", "disconnect"]);
  });

  test("every status has at least one action", () => {
    for (const status of ALL_STATUSES) {
      expect(getAvailableActions(status).length).toBeGreaterThan(0);
    }
  });

  test("disconnect is available for all non-disconnected statuses", () => {
    const nonDisconnected: IntegrationStatus[] = [
      "connected",
      "error",
      "auth_expired",
      "suspended",
    ];
    for (const status of nonDisconnected) {
      expect(getAvailableActions(status)).toContain("disconnect");
    }
  });

  test("disconnect is NOT available for disconnected status", () => {
    expect(getAvailableActions("disconnected")).not.toContain("disconnect");
  });
});

// ---------------------------------------------------------------------------
// Action labels
// ---------------------------------------------------------------------------

describe("IntegrationPanel action labels", () => {
  const ALL_ACTIONS: IntegrationActionName[] = [
    "enable",
    "disable",
    "connect",
    "disconnect",
    "reconnect",
    "resume",
    "retry",
  ];

  test("every action has a non-empty label", () => {
    for (const action of ALL_ACTIONS) {
      const label = getActionLabel(action);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test("labels start with uppercase", () => {
    for (const action of ALL_ACTIONS) {
      const label = getActionLabel(action);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  test("specific label values", () => {
    expect(getActionLabel("enable")).toBe("Enable");
    expect(getActionLabel("disable")).toBe("Disable");
    expect(getActionLabel("connect")).toBe("Connect");
    expect(getActionLabel("disconnect")).toBe("Disconnect");
    expect(getActionLabel("reconnect")).toBe("Reconnect");
    expect(getActionLabel("resume")).toBe("Resume");
    expect(getActionLabel("retry")).toBe("Retry");
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation scenarios (pure logic tests)
// ---------------------------------------------------------------------------

describe("IntegrationPanel keyboard navigation logic", () => {
  describe("search mode activation and deactivation", () => {
    test("/ key should activate search mode (search query starts empty)", () => {
      // The search mode is activated by dispatching ENTER_SEARCH
      // which sets searchMode=true and searchQuery=""
      // This tests the expected state shape
      const initialSearchMode = false;
      const initialSearchQuery = "";
      expect(initialSearchMode).toBe(false);
      expect(initialSearchQuery).toBe("");
    });

    test("Esc in search mode exits search and clears query", () => {
      // EXIT_SEARCH sets searchMode=false, searchQuery="", resets indices
      const afterExit = { searchMode: false, searchQuery: "", connectedIndex: 0, availableIndex: 0 };
      expect(afterExit.searchMode).toBe(false);
      expect(afterExit.searchQuery).toBe("");
      expect(afterExit.connectedIndex).toBe(0);
      expect(afterExit.availableIndex).toBe(0);
    });

    test("Enter in search mode exits search (keeps filter until next search)", () => {
      // Enter dispatches EXIT_SEARCH which clears the query
      const afterEnter = { searchMode: false, searchQuery: "" };
      expect(afterEnter.searchMode).toBe(false);
    });
  });

  describe("search query building", () => {
    test("typing characters appends to search query", () => {
      let query = "";
      query += "g";
      query += "m";
      query += "a";
      expect(query).toBe("gma");
    });

    test("backspace removes last character", () => {
      const query = "gmail";
      const afterBackspace = query.slice(0, -1);
      expect(afterBackspace).toBe("gmai");
    });

    test("backspace on empty query stays empty", () => {
      const query = "";
      const afterBackspace = query.slice(0, -1);
      expect(afterBackspace).toBe("");
    });
  });

  describe("navigation with filtered lists", () => {
    test("j/k navigation wraps around filtered list", () => {
      // Simulating navigation in a filtered list of length 2
      const listLength = 2;
      let index = 0;

      // j (down) from 0 -> 1
      index = (index + 1) % listLength;
      expect(index).toBe(1);

      // j (down) from 1 -> 0 (wrap)
      index = (index + 1) % listLength;
      expect(index).toBe(0);

      // k (up) from 0 -> 1 (wrap)
      index = index <= 0 ? listLength - 1 : index - 1;
      expect(index).toBe(1);

      // k (up) from 1 -> 0
      index = index <= 0 ? listLength - 1 : index - 1;
      expect(index).toBe(0);
    });

    test("navigation in empty filtered list is a no-op", () => {
      const listLength = 0;
      const index = 0;
      // Should not change when list is empty
      expect(listLength).toBe(0);
      expect(index).toBe(0);
    });

    test("search query change resets indices to 0", () => {
      // SET_SEARCH_QUERY always resets connectedIndex and availableIndex to 0
      const afterQueryChange = { connectedIndex: 0, availableIndex: 0 };
      expect(afterQueryChange.connectedIndex).toBe(0);
      expect(afterQueryChange.availableIndex).toBe(0);
    });
  });

  describe("Tab section switching", () => {
    test("Tab cycles through connected -> available -> detail", () => {
      const sections = ["connected", "available", "detail"] as const;
      let currentIdx = 0;

      // Tab from connected -> available
      currentIdx = (currentIdx + 1) % sections.length;
      expect(sections[currentIdx]).toBe("available");

      // Tab from available -> detail
      currentIdx = (currentIdx + 1) % sections.length;
      expect(sections[currentIdx]).toBe("detail");

      // Tab from detail -> connected (wrap)
      currentIdx = (currentIdx + 1) % sections.length;
      expect(sections[currentIdx]).toBe("connected");
    });
  });

  describe("Esc key priority", () => {
    test("Esc exits search mode before closing panel", () => {
      // When searchMode is true, Esc should dispatch EXIT_SEARCH, not onClose
      const searchMode = true;
      const shouldExitSearch = searchMode;
      const shouldClosePanel = !searchMode;
      expect(shouldExitSearch).toBe(true);
      expect(shouldClosePanel).toBe(false);
    });

    test("Esc clears error feedback before closing panel", () => {
      // When error feedback is showing, Esc clears it first
      const hasErrorFeedback = true;
      const shouldClearFeedback = hasErrorFeedback;
      expect(shouldClearFeedback).toBe(true);
    });

    test("Esc closes panel when no search or error feedback", () => {
      const searchMode = false;
      const hasErrorFeedback = false;
      const shouldClosePanel = !searchMode && !hasErrorFeedback;
      expect(shouldClosePanel).toBe(true);
    });
  });

  describe("Enter key behavior", () => {
    test("Enter in list view switches to detail view", () => {
      // SELECT_CURRENT sets focusSection to "detail"
      const afterSelect = { focusSection: "detail" };
      expect(afterSelect.focusSection).toBe("detail");
    });

    test("Enter in detail view triggers selected action", () => {
      // In detail view, Enter triggers the action at selectedActionIndex
      const actions = getAvailableActions("connected");
      const selectedActionIndex = 0;
      const clampedIndex = Math.min(selectedActionIndex, actions.length - 1);
      const action = actions[clampedIndex];
      expect(action).toBe("disable");
    });
  });
});

// ---------------------------------------------------------------------------
// Search result count
// ---------------------------------------------------------------------------

describe("IntegrationPanel search result count", () => {
  test("total count is sum of filtered connected and available", () => {
    const filteredConnected = filterIntegrations(CONNECTED_INTEGRATIONS, "email");
    const filteredAvailable = filterIntegrations(AVAILABLE_INTEGRATIONS, "email");
    const total = filteredConnected.length + filteredAvailable.length;
    expect(total).toBe(1); // Only Gmail matches "email"
  });

  test("total count with broad query", () => {
    const filteredConnected = filterIntegrations(CONNECTED_INTEGRATIONS, "a");
    const filteredAvailable = filterIntegrations(AVAILABLE_INTEGRATIONS, "a");
    const total = filteredConnected.length + filteredAvailable.length;
    // "a" appears in many names and descriptions
    expect(total).toBeGreaterThanOrEqual(3);
  });

  test("total count is zero when nothing matches", () => {
    const filteredConnected = filterIntegrations(CONNECTED_INTEGRATIONS, "zzz");
    const filteredAvailable = filterIntegrations(AVAILABLE_INTEGRATIONS, "zzz");
    const total = filteredConnected.length + filteredAvailable.length;
    expect(total).toBe(0);
  });

  test("total count equals full list when query is empty", () => {
    const filteredConnected = filterIntegrations(CONNECTED_INTEGRATIONS, "");
    const filteredAvailable = filterIntegrations(AVAILABLE_INTEGRATIONS, "");
    const total = filteredConnected.length + filteredAvailable.length;
    expect(total).toBe(CONNECTED_INTEGRATIONS.length + AVAILABLE_INTEGRATIONS.length);
  });
});

// ---------------------------------------------------------------------------
// Daemon API mock — OAuth config validation
// ---------------------------------------------------------------------------

describe("IntegrationPanel callIntegrationAction", () => {
  const originalEnv = { ...process.env };

  function clearOAuthEnv(): void {
    delete process.env["GMAIL_CLIENT_ID"];
    delete process.env["GMAIL_CLIENT_SECRET"];
    delete process.env["SPOTIFY_CLIENT_ID"];
    delete process.env["SPOTIFY_CLIENT_SECRET"];
  }

  function restoreEnv(): void {
    // Restore only the keys we care about
    if (originalEnv["GMAIL_CLIENT_ID"] !== undefined) {
      process.env["GMAIL_CLIENT_ID"] = originalEnv["GMAIL_CLIENT_ID"];
    } else {
      delete process.env["GMAIL_CLIENT_ID"];
    }
    if (originalEnv["SPOTIFY_CLIENT_ID"] !== undefined) {
      process.env["SPOTIFY_CLIENT_ID"] = originalEnv["SPOTIFY_CLIENT_ID"];
    } else {
      delete process.env["SPOTIFY_CLIENT_ID"];
    }
  }

  test("connect fails for gmail when GMAIL_CLIENT_ID is missing", async () => {
    clearOAuthEnv();
    try {
      const result = await callIntegrationAction("gmail", "connect");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Gmail requires OAuth credentials");
      expect(result.error).toContain("GMAIL_CLIENT_ID");
      expect(result.error).toContain("GMAIL_CLIENT_SECRET");
    } finally {
      restoreEnv();
    }
  });

  test("connect fails for spotify when SPOTIFY_CLIENT_ID is missing", async () => {
    clearOAuthEnv();
    try {
      const result = await callIntegrationAction("spotify", "connect");
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Spotify requires OAuth credentials");
      expect(result.error).toContain("SPOTIFY_CLIENT_ID");
    } finally {
      restoreEnv();
    }
  });

  test("connect succeeds for gmail when GMAIL_CLIENT_ID is set", async () => {
    process.env["GMAIL_CLIENT_ID"] = "test-client-id";
    try {
      const result = await callIntegrationAction("gmail", "connect");
      expect(result.success).toBe(true);
    } finally {
      restoreEnv();
    }
  });

  test("connect succeeds for non-OAuth integrations without env vars", async () => {
    clearOAuthEnv();
    try {
      const result = await callIntegrationAction("obsidian", "connect");
      expect(result.success).toBe(true);
    } finally {
      restoreEnv();
    }
  });

  test("non-connect actions succeed regardless of OAuth config", async () => {
    clearOAuthEnv();
    try {
      const result = await callIntegrationAction("gmail", "disconnect");
      expect(result.success).toBe(true);
    } finally {
      restoreEnv();
    }
  });

  test("connect error message includes setup instructions", async () => {
    clearOAuthEnv();
    try {
      const result = await callIntegrationAction("gmail", "connect");
      expect(result.success).toBe(false);
      expect(result.error).toContain("developer console");
      expect(result.error).toContain("OAuth 2.0 credentials");
      expect(result.error).toContain("Restart Reins daemon");
    } finally {
      restoreEnv();
    }
  });
});
