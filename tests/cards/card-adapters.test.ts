import { describe, expect, test } from "bun:test";

import { adaptToolOutput } from "../../src/cards/card-adapters";
import { validateCard, type ContentCard } from "../../src/cards/card-schemas";

describe("adaptToolOutput", () => {
  test("adapts calendar event payload with full data", () => {
    const card = adaptToolOutput("calendar", {
      action: "create_event",
      event: {
        id: "evt_1",
        title: "Project sync",
        startTime: "2026-02-11T15:00:00.000Z",
        endTime: "2026-02-11T16:00:00.000Z",
        location: "Room A",
        description: "Weekly project checkpoint",
      },
    });

    expect(card).toEqual({
      type: "calendar-event",
      title: "Project sync",
      date: "2026-02-11T15:00:00.000Z",
      time: "15:00",
      duration: "1h",
      location: "Room A",
      description: "Weekly project checkpoint",
    });
  });

  test("adapts calendar event payload with partial data", () => {
    const card = adaptToolOutput("calendar_events", {
      events: [
        {
          title: "Lunch",
          startTime: "2026-02-11T12:30:00.000Z",
        },
      ],
    });

    expect(card).toEqual({
      type: "calendar-event",
      title: "Lunch",
      date: "2026-02-11T12:30:00.000Z",
      time: "12:30",
      duration: undefined,
      location: undefined,
      description: undefined,
    });
  });

  test("adapts notes payload with tags", () => {
    const card = adaptToolOutput("notes", {
      note: {
        title: "Release notes",
        content: "Ship Wave 6 tasks this week.",
        tags: ["release", "wave-6"],
        isPinned: true,
        folderName: "Work",
      },
    });

    expect(card).toEqual({
      type: "note",
      title: "Release notes",
      content: "Ship Wave 6 tasks this week.",
      tags: ["release", "wave-6"],
      pinned: true,
      folder: "Work",
    });
  });

  test("adapts notes payload without tags", () => {
    const card = adaptToolOutput("get_note", {
      result: {
        action: "get_note",
        note: {
          title: "Quick idea",
          content: "Keep adapter fallback strict.",
        },
      },
    });

    expect(card).toEqual({
      type: "note",
      title: "Quick idea",
      content: "Keep adapter fallback strict.",
      tags: undefined,
      pinned: undefined,
      folder: undefined,
    });
  });

  test("adapts reminders payload and preserves priority levels", () => {
    const lowPriority = adaptToolOutput("reminders", {
      reminder: {
        title: "Water plants",
        dueAt: "2026-02-12T10:00:00.000Z",
        priority: "low",
      },
    });

    const mediumPriority = adaptToolOutput("create_reminder", {
      result: {
        action: "create_reminder",
        reminder: {
          title: "Standup",
          dueAt: "2026-02-12T14:00:00.000Z",
          priority: "medium",
        },
      },
    });

    const highPriority = adaptToolOutput("reminders", {
      reminder: {
        title: "Pay invoice",
        dueAt: "2026-02-12T16:30:00.000Z",
        priority: "high",
      },
    });

    expect(lowPriority).toMatchObject({ type: "reminder", priority: "low" });
    expect(mediumPriority).toMatchObject({ type: "reminder", priority: "medium" });
    expect(highPriority).toMatchObject({ type: "reminder", priority: "high" });
  });

  test("falls back to plain-text for unknown tools", () => {
    const card = adaptToolOutput("weather", { forecast: "sunny", temperature: 72 });

    expect(card.type).toBe("plain-text");
    if (card.type !== "plain-text") {
      return;
    }

    expect(card.content).toContain("forecast");
    expect(card.content).toContain("temperature");
  });

  test("falls back to plain-text for malformed known payload", () => {
    const card = adaptToolOutput("calendar", { event: { title: "Broken event" } });

    expect(card).toEqual({
      type: "plain-text",
      content: JSON.stringify({ event: { title: "Broken event" } }, null, 2),
    });
  });

  test("handles null and undefined output", () => {
    expect(adaptToolOutput("notes", null)).toEqual({
      type: "plain-text",
      content: "No structured content available.",
    });

    expect(adaptToolOutput("reminders", undefined)).toEqual({
      type: "plain-text",
      content: "No structured content available.",
    });
  });

  test("handles array output by adapting first item", () => {
    const card = adaptToolOutput("notes", [
      {
        title: "First note",
        content: "First content",
      },
      {
        title: "Second note",
        content: "Second content",
      },
    ]);

    expect(card).toEqual({
      type: "note",
      title: "First note",
      content: "First content",
      tags: undefined,
      pinned: undefined,
      folder: undefined,
    });
  });
});

describe("validateCard", () => {
  test("accepts valid content cards", () => {
    const cards: ContentCard[] = [
      {
        type: "calendar-event",
        title: "Planning",
        date: "2026-02-11T10:00:00.000Z",
      },
      {
        type: "note",
        title: "Memo",
        content: "A short preview",
      },
      {
        type: "reminder",
        title: "Follow up",
        dueDate: "2026-02-11T11:00:00.000Z",
        priority: "high",
      },
      {
        type: "plain-text",
        content: "Fallback content",
      },
    ];

    for (const card of cards) {
      expect(validateCard(card)).toEqual(card);
    }
  });

  test("rejects invalid card inputs", () => {
    expect(validateCard({ type: "note", title: "Missing content" })).toBeNull();
    expect(validateCard({ type: "reminder", title: "Bad priority", dueDate: "2026-02-11", priority: "urgent" })).toBeNull();
    expect(validateCard({ type: "calendar-event", title: "Bad date", date: "not-a-date" })).toBeNull();
    expect(validateCard({ type: "plain-text", content: "" })).toBeNull();
    expect(validateCard("not-an-object")).toBeNull();
  });
});
