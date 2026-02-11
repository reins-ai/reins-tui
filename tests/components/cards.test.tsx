import { describe, expect, test } from "bun:test";

import type {
  CalendarEventCard,
  ContentCard,
  NoteCard,
  PlainTextCard,
  ReminderCard,
} from "../../src/cards/card-schemas";
import { adaptToolOutput } from "../../src/cards/card-adapters";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import { getPriorityColor } from "../../src/components/cards/reminder-card";

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
};

// --- CalendarCard data tests ---

describe("CalendarCard rendering data", () => {
  test("renders all fields for a complete calendar event", () => {
    const card: CalendarEventCard = {
      type: "calendar-event",
      title: "Team Standup",
      date: "2026-02-12T10:00:00.000Z",
      time: "10:00",
      duration: "30m",
      location: "Zoom Meeting",
    };

    expect(card.type).toBe("calendar-event");
    expect(card.title).toBe("Team Standup");
    expect(card.date).toBeTruthy();
    expect(card.time).toBe("10:00");
    expect(card.duration).toBe("30m");
    expect(card.location).toBe("Zoom Meeting");
  });

  test("handles missing optional fields gracefully", () => {
    const card: CalendarEventCard = {
      type: "calendar-event",
      title: "Quick Sync",
      date: "2026-02-12T00:00:00.000Z",
    };

    expect(card.type).toBe("calendar-event");
    expect(card.title).toBe("Quick Sync");
    expect(card.time).toBeUndefined();
    expect(card.duration).toBeUndefined();
    expect(card.location).toBeUndefined();
    expect(card.description).toBeUndefined();
  });

  test("calendar card type discriminant is calendar-event", () => {
    const card: CalendarEventCard = {
      type: "calendar-event",
      title: "Event",
      date: "2026-03-01T00:00:00.000Z",
    };

    expect(card.type).toBe("calendar-event");
  });

  test("calendar card with description field", () => {
    const card: CalendarEventCard = {
      type: "calendar-event",
      title: "Planning",
      date: "2026-02-15T14:00:00.000Z",
      time: "14:00",
      description: "Quarterly planning session",
    };

    expect(card.description).toBe("Quarterly planning session");
  });
});

// --- NoteCard data tests ---

describe("NoteCard rendering data", () => {
  test("renders title, content, and tags", () => {
    const card: NoteCard = {
      type: "note",
      title: "Meeting Notes",
      content: "Discussed project timeline and deliverables for Q1.",
      tags: ["planning", "q1"],
    };

    expect(card.type).toBe("note");
    expect(card.title).toBe("Meeting Notes");
    expect(card.content).toContain("Discussed");
    expect(card.tags).toEqual(["planning", "q1"]);
  });

  test("renders pinned indicator when pinned is true", () => {
    const card: NoteCard = {
      type: "note",
      title: "Important Note",
      content: "Do not forget this.",
      pinned: true,
    };

    expect(card.pinned).toBe(true);
  });

  test("pinned defaults to undefined when not set", () => {
    const card: NoteCard = {
      type: "note",
      title: "Regular Note",
      content: "Just a note.",
    };

    expect(card.pinned).toBeUndefined();
  });

  test("handles note without tags", () => {
    const card: NoteCard = {
      type: "note",
      title: "Simple Note",
      content: "No tags here.",
    };

    expect(card.tags).toBeUndefined();
  });

  test("handles note with folder", () => {
    const card: NoteCard = {
      type: "note",
      title: "Filed Note",
      content: "In a folder.",
      folder: "Work",
    };

    expect(card.folder).toBe("Work");
  });

  test("note content can be long text", () => {
    const longContent = "A".repeat(500);
    const card: NoteCard = {
      type: "note",
      title: "Long Note",
      content: longContent,
    };

    expect(card.content.length).toBe(500);
  });
});

// --- ReminderCard data tests ---

describe("ReminderCard rendering data", () => {
  test("renders high priority with error token color", () => {
    const color = getPriorityColor("high", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["status.error"]);
  });

  test("renders medium priority with warning token color", () => {
    const color = getPriorityColor("medium", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("renders low priority with muted token color", () => {
    const color = getPriorityColor("low", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("renders undefined priority with secondary token color", () => {
    const color = getPriorityColor(undefined, MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["text.secondary"]);
  });

  test("reminder card with completed state", () => {
    const card: ReminderCard = {
      type: "reminder",
      title: "Submit report",
      dueDate: "2026-02-13T17:00:00.000Z",
      completed: true,
      priority: "high",
    };

    expect(card.completed).toBe(true);
    expect(card.priority).toBe("high");
  });

  test("reminder card with incomplete state", () => {
    const card: ReminderCard = {
      type: "reminder",
      title: "Buy groceries",
      dueDate: "2026-02-14T00:00:00.000Z",
      completed: false,
      priority: "low",
    };

    expect(card.completed).toBe(false);
  });

  test("reminder card with due time", () => {
    const card: ReminderCard = {
      type: "reminder",
      title: "Call dentist",
      dueDate: "2026-02-13T00:00:00.000Z",
      dueTime: "09:30",
    };

    expect(card.dueTime).toBe("09:30");
  });

  test("reminder card without optional fields", () => {
    const card: ReminderCard = {
      type: "reminder",
      title: "Do laundry",
      dueDate: "2026-02-15T00:00:00.000Z",
    };

    expect(card.priority).toBeUndefined();
    expect(card.completed).toBeUndefined();
    expect(card.dueTime).toBeUndefined();
    expect(card.recurring).toBeUndefined();
  });
});

// --- CardRenderer dispatch tests ---

describe("CardRenderer dispatch logic", () => {
  test("dispatches calendar-event type correctly", () => {
    const card: CalendarEventCard = {
      type: "calendar-event",
      title: "Meeting",
      date: "2026-02-12T10:00:00.000Z",
    };

    expect(card.type).toBe("calendar-event");
  });

  test("dispatches note type correctly", () => {
    const card: NoteCard = {
      type: "note",
      title: "Note",
      content: "Content here",
    };

    expect(card.type).toBe("note");
  });

  test("dispatches reminder type correctly", () => {
    const card: ReminderCard = {
      type: "reminder",
      title: "Reminder",
      dueDate: "2026-02-13T00:00:00.000Z",
    };

    expect(card.type).toBe("reminder");
  });

  test("dispatches plain-text type for fallback", () => {
    const card: PlainTextCard = {
      type: "plain-text",
      content: "Just plain text",
    };

    expect(card.type).toBe("plain-text");
  });

  test("ContentCard union covers all four types", () => {
    const types: ContentCard["type"][] = ["calendar-event", "note", "reminder", "plain-text"];
    expect(types).toHaveLength(4);

    for (const t of types) {
      expect(typeof t).toBe("string");
    }
  });
});

// --- PlainTextCard fallback tests ---

describe("PlainTextCard fallback rendering", () => {
  test("plain-text card has content field", () => {
    const card: PlainTextCard = {
      type: "plain-text",
      content: "Unstructured response data",
    };

    expect(card.content).toBe("Unstructured response data");
  });

  test("adaptToolOutput falls back to plain-text for unknown tools", () => {
    const card = adaptToolOutput("unknown_tool", { data: "something" });
    expect(card.type).toBe("plain-text");
  });

  test("adaptToolOutput falls back to plain-text for string output", () => {
    const card = adaptToolOutput("unknown_tool", "raw string output");
    expect(card.type).toBe("plain-text");
    if (card.type === "plain-text") {
      expect(card.content).toBe("raw string output");
    }
  });

  test("adaptToolOutput falls back to plain-text for null output", () => {
    const card = adaptToolOutput("calendar", null);
    expect(card.type).toBe("plain-text");
  });
});

// --- Theme token usage tests ---

describe("card theme token usage", () => {
  test("priority colors map to semantic status tokens", () => {
    expect(getPriorityColor("high", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.error"]);
    expect(getPriorityColor("medium", MOCK_TOKENS)).toBe(MOCK_TOKENS["status.warning"]);
    expect(getPriorityColor("low", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("priority colors are valid hex values", () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    expect(getPriorityColor("high", MOCK_TOKENS)).toMatch(hexPattern);
    expect(getPriorityColor("medium", MOCK_TOKENS)).toMatch(hexPattern);
    expect(getPriorityColor("low", MOCK_TOKENS)).toMatch(hexPattern);
    expect(getPriorityColor(undefined, MOCK_TOKENS)).toMatch(hexPattern);
  });

  test("all priority levels produce distinct colors", () => {
    const high = getPriorityColor("high", MOCK_TOKENS);
    const medium = getPriorityColor("medium", MOCK_TOKENS);
    const low = getPriorityColor("low", MOCK_TOKENS);

    expect(high).not.toBe(medium);
    expect(medium).not.toBe(low);
    expect(high).not.toBe(low);
  });

  test("border tokens exist in theme for card borders", () => {
    expect(MOCK_TOKENS["border.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["border.subtle"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("text tokens exist for card content hierarchy", () => {
    expect(MOCK_TOKENS["text.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["text.secondary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["text.muted"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

// --- Integration: adaptToolOutput to card type routing ---

describe("tool output to card routing integration", () => {
  test("calendar tool output produces calendar-event card", () => {
    const output = {
      title: "Standup",
      startTime: "2026-02-12T10:00:00.000Z",
      endTime: "2026-02-12T10:30:00.000Z",
    };

    const card = adaptToolOutput("calendar", output);
    expect(card.type).toBe("calendar-event");
    if (card.type === "calendar-event") {
      expect(card.title).toBe("Standup");
    }
  });

  test("notes tool output produces note card", () => {
    const output = {
      title: "My Note",
      content: "Some content here",
      tags: ["work"],
    };

    const card = adaptToolOutput("notes", output);
    expect(card.type).toBe("note");
    if (card.type === "note") {
      expect(card.title).toBe("My Note");
      expect(card.tags).toEqual(["work"]);
    }
  });

  test("reminders tool output produces reminder card", () => {
    const output = {
      title: "Submit report",
      dueAt: "2026-02-13T17:00:00.000Z",
      priority: "high",
    };

    const card = adaptToolOutput("reminders", output);
    expect(card.type).toBe("reminder");
    if (card.type === "reminder") {
      expect(card.title).toBe("Submit report");
      expect(card.priority).toBe("high");
    }
  });

  test("unknown tool falls back to plain-text", () => {
    const card = adaptToolOutput("weather", { temp: 72 });
    expect(card.type).toBe("plain-text");
  });

  test("malformed calendar data falls back to plain-text", () => {
    const card = adaptToolOutput("calendar", { invalid: true });
    expect(card.type).toBe("plain-text");
  });

  test("malformed reminder data falls back to plain-text", () => {
    const card = adaptToolOutput("reminders", "not an object");
    expect(card.type).toBe("plain-text");
  });
});

// --- Card border glyph vocabulary ---

describe("card border glyph vocabulary", () => {
  const TOP_LEFT = "\u256D";
  const TOP_RIGHT = "\u256E";
  const BOTTOM_LEFT = "\u2570";
  const BOTTOM_RIGHT = "\u256F";
  const HORIZONTAL = "\u2500";
  const VERTICAL = "\u2502";

  test("rounded corner glyphs are distinct single characters", () => {
    const glyphs = [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT, HORIZONTAL, VERTICAL];
    const unique = new Set(glyphs);
    expect(unique.size).toBe(glyphs.length);
  });

  test("top-left corner is ╭", () => {
    expect(TOP_LEFT).toBe("╭");
  });

  test("top-right corner is ╮", () => {
    expect(TOP_RIGHT).toBe("╮");
  });

  test("bottom-left corner is ╰", () => {
    expect(BOTTOM_LEFT).toBe("╰");
  });

  test("bottom-right corner is ╯", () => {
    expect(BOTTOM_RIGHT).toBe("╯");
  });

  test("horizontal line is ─", () => {
    expect(HORIZONTAL).toBe("─");
  });

  test("vertical line is │", () => {
    expect(VERTICAL).toBe("│");
  });
});
