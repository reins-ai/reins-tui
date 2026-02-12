import { describe, expect, test } from "bun:test";

import { formatRelativeTime } from "../../src/lib";

const NOW = new Date("2026-02-10T12:00:00.000Z");

describe("formatRelativeTime", () => {
  test("returns just now for under one minute", () => {
    const date = new Date("2026-02-10T11:59:45.000Z");
    expect(formatRelativeTime(date, NOW)).toBe("just now");
  });

  test("returns minutes ago", () => {
    const date = new Date("2026-02-10T11:55:00.000Z");
    expect(formatRelativeTime(date, NOW)).toBe("5m ago");
  });

  test("returns hours ago", () => {
    const date = new Date("2026-02-10T09:00:00.000Z");
    expect(formatRelativeTime(date, NOW)).toBe("3h ago");
  });

  test("returns yesterday", () => {
    const date = new Date("2026-02-09T11:00:00.000Z");
    expect(formatRelativeTime(date, NOW)).toBe("yesterday");
  });

  test("returns month/day for older dates", () => {
    const date = new Date("2026-01-05T00:00:00.000Z");
    expect(formatRelativeTime(date, NOW)).toBe("Jan 5");
  });
});
