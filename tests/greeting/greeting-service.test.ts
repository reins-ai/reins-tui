import { describe, expect, test } from "bun:test";

import { ContextSummaryService } from "../../src/personalization/context-summary";
import { GreetingService } from "../../src/personalization/greeting-service";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("GreetingService.generateGreeting", () => {
  test("morning greeting includes configured name", () => {
    const service = new GreetingService({
      configNameReader: () => "Avery",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T06:00:00") });
    expect(greeting).toMatch(/(Rise and shine|Morning|Good morning), Avery$/);
  });

  test("afternoon greeting includes configured name", () => {
    const service = new GreetingService({
      configNameReader: () => "Avery",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T14:00:00") });
    expect(greeting).toMatch(/(Afternoon|Good afternoon), Avery$/);
  });

  test("evening greeting includes configured name", () => {
    const service = new GreetingService({
      configNameReader: () => "Avery",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T19:00:00") });
    expect(greeting).toMatch(/(Evening|Good evening), Avery$/);
  });

  test("night greeting includes configured name", () => {
    const service = new GreetingService({
      configNameReader: () => "Avery",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T23:00:00") });
    expect(greeting).toMatch(/(Burning the midnight oil, Avery\?|Night owl mode, Avery)$/);
  });

  test("greeting without name falls back gracefully", () => {
    const service = new GreetingService({
      configNameReader: () => null,
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T06:00:00") });
    expect(greeting).toBe("Good morning");
  });

  test("deterministic variety uses same variant on same day of year", () => {
    const service = new GreetingService({
      configNameReader: () => "Avery",
    });

    const first = service.generateGreeting({ time: new Date("2026-02-11T06:00:00") });
    const second = service.generateGreeting({ time: new Date("2026-02-11T11:00:00") });

    expect(first).toBe(second);
  });
});

describe("ContextSummaryService", () => {
  test("returns reminder and event context summary", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/v1/reminders/due") {
        return jsonResponse({
          reminders: [
            {
              title: "Submit expense report",
              dueAt: "2026-02-11T17:00:00.000Z",
              priority: "high",
            },
            {
              title: "Call dentist",
              dueAt: "2026-02-12T09:00:00.000Z",
            },
          ],
        });
      }

      if (url.pathname === "/v1/calendar/events") {
        return jsonResponse({
          events: [
            {
              title: "Team standup",
              startTime: "2026-02-11T10:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({}, 404);
    };

    const service = new ContextSummaryService({
      fetchImpl,
      now: () => new Date("2026-02-11T09:00:00.000Z"),
    });

    const result = await service.getUpcomingContext();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected getUpcomingContext to succeed");
    }

    expect(result.value.reminders).toHaveLength(2);
    expect(result.value.events).toHaveLength(1);
    expect(result.value.formattedSummary).toContain("You have 2 reminders and 1 event today:");
  });

  test("returns null when no upcoming context data exists", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/v1/reminders/due") {
        return jsonResponse({ reminders: [] });
      }

      if (url.pathname === "/v1/calendar/events") {
        return jsonResponse({ events: [] });
      }

      return jsonResponse({}, 404);
    };

    const service = new ContextSummaryService({ fetchImpl });
    const summary = await service.getUpcomingContextOrNull();
    expect(summary).toBeNull();
  });

  test("returns null gracefully when daemon is offline", async () => {
    const service = new ContextSummaryService({
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });

    const summary = await service.getUpcomingContextOrNull();
    expect(summary).toBeNull();
  });

  test("formats context summary output", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/v1/reminders/due") {
        return jsonResponse({
          reminders: [
            {
              title: "Submit expense report",
              dueAt: "2026-02-11T17:00:00.000Z",
              priority: "high",
            },
            {
              title: "Call dentist",
              dueAt: "2026-02-12T09:00:00.000Z",
            },
          ],
        });
      }

      if (url.pathname === "/v1/calendar/events") {
        return jsonResponse({
          events: [
            {
              title: "Team standup",
              startTime: "2026-02-11T10:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({}, 404);
    };

    const service = new ContextSummaryService({
      fetchImpl,
      now: () => new Date("2026-02-11T09:00:00.000Z"),
    });

    const result = await service.getUpcomingContext();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected getUpcomingContext to succeed");
    }

    expect(result.value.formattedSummary).toContain("· Submit expense report (due 5:00 PM, high priority)");
    expect(result.value.formattedSummary).toContain("· Call dentist (due tomorrow)");
    expect(result.value.formattedSummary).toContain("📅 Team standup at 10:00 AM");
  });
});

describe("GreetingService.getFullStartup", () => {
  test("combines greeting with proactive context", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/v1/reminders/due") {
        return jsonResponse({
          reminders: [
            {
              title: "Submit expense report",
              dueAt: "2026-02-11T17:00:00.000Z",
              priority: "high",
            },
          ],
        });
      }

      if (url.pathname === "/v1/calendar/events") {
        return jsonResponse({
          events: [
            {
              title: "Team standup",
              startTime: "2026-02-11T10:00:00.000Z",
            },
          ],
        });
      }

      return jsonResponse({}, 404);
    };

    const contextService = new ContextSummaryService({
      fetchImpl,
      now: () => new Date("2026-02-11T09:00:00.000Z"),
    });

    const greetingService = new GreetingService({
      configNameReader: () => "Avery",
      contextService,
      now: () => new Date("2026-02-11T09:00:00.000Z"),
    });

    const startup = await greetingService.getFullStartup();
    expect(startup.greeting).toMatch(/(Rise and shine|Morning|Good morning), Avery$/);
    expect(startup.contextSummary).not.toBeNull();
    expect(startup.hasReminders).toBe(true);
    expect(startup.hasEvents).toBe(true);
  });
});
