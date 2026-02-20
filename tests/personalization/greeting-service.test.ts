import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GreetingService } from "../../src/personalization/greeting-service";

/**
 * Helper to create a temporary config file with the given content.
 * Returns the file path and a cleanup function.
 */
function createTempConfig(content: Record<string, unknown>): { path: string; cleanup: () => void } {
  const dir = join(tmpdir(), `reins-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "config.json");
  writeFileSync(filePath, JSON.stringify(content, null, 2));
  return {
    path: filePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// --- Named greetings by time of day ---

describe("GreetingService.generateGreeting with name", () => {
  test("morning greeting (hour 9) includes name", () => {
    const service = new GreetingService({
      configNameReader: () => "James",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toMatch(/(Rise and shine|Morning|Good morning), James$/);
  });

  test("afternoon greeting (hour 14) includes name", () => {
    const service = new GreetingService({
      configNameReader: () => "James",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T14:00:00") });
    expect(greeting).toMatch(/(Afternoon|Good afternoon), James$/);
  });

  test("evening greeting (hour 19) includes name", () => {
    const service = new GreetingService({
      configNameReader: () => "James",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T19:00:00") });
    expect(greeting).toMatch(/(Evening|Good evening), James$/);
  });

  test("night greeting (hour 23) includes name", () => {
    const service = new GreetingService({
      configNameReader: () => "James",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T23:00:00") });
    expect(greeting).toMatch(/(Burning the midnight oil, James\?|Night owl mode, James)$/);
  });

  test("options.name overrides configured name", () => {
    const service = new GreetingService({
      configNameReader: () => "ConfigName",
    });

    const greeting = service.generateGreeting({
      name: "OverrideName",
      time: new Date("2026-03-15T09:00:00"),
    });
    expect(greeting).toContain("OverrideName");
    expect(greeting).not.toContain("ConfigName");
  });
});

// --- Generic greetings (no name) by time of day ---

describe("GreetingService.generateGreeting without name", () => {
  test("morning fallback (hour 9) returns generic greeting", () => {
    const service = new GreetingService({
      configNameReader: () => null,
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toBe("Good morning");
  });

  test("afternoon fallback (hour 14) returns generic greeting", () => {
    const service = new GreetingService({
      configNameReader: () => null,
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T14:00:00") });
    expect(greeting).toBe("Good afternoon");
  });

  test("evening fallback (hour 19) returns generic greeting", () => {
    const service = new GreetingService({
      configNameReader: () => null,
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T19:00:00") });
    expect(greeting).toBe("Good evening");
  });

  test("night fallback (hour 23) returns generic greeting", () => {
    const service = new GreetingService({
      configNameReader: () => null,
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T23:00:00") });
    expect(greeting).toBe("Burning the midnight oil?");
  });
});

// --- Boundary hour edge cases ---

describe("GreetingService.generateGreeting boundary hours", () => {
  test("hour 5 is morning (start of morning range)", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T05:00:00") });
    expect(greeting).toBe("Good morning");
  });

  test("hour 4 is night (end of night range)", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T04:00:00") });
    expect(greeting).toBe("Burning the midnight oil?");
  });

  test("hour 11 is still morning (end of morning range)", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T11:59:00") });
    expect(greeting).toBe("Good morning");
  });

  test("hour 12 (noon) is afternoon", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T12:00:00") });
    expect(greeting).toBe("Good afternoon");
  });

  test("hour 16 is still afternoon", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T16:59:00") });
    expect(greeting).toBe("Good afternoon");
  });

  test("hour 17 is evening (start of evening range)", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T17:00:00") });
    expect(greeting).toBe("Good evening");
  });

  test("hour 20 is still evening", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T20:59:00") });
    expect(greeting).toBe("Good evening");
  });

  test("hour 21 is night (start of night range)", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T21:00:00") });
    expect(greeting).toBe("Burning the midnight oil?");
  });

  test("midnight (hour 0) is night", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T00:00:00") });
    expect(greeting).toBe("Burning the midnight oil?");
  });

  test("hour 3 is night", () => {
    const service = new GreetingService({ configNameReader: () => null });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T03:00:00") });
    expect(greeting).toBe("Burning the midnight oil?");
  });
});

// --- Config file reading ---

describe("GreetingService reads name from config file", () => {
  test("reads name field from config.json", () => {
    const { path, cleanup } = createTempConfig({ name: "Alice" });
    try {
      const service = new GreetingService({ configPath: path });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toContain("Alice");
    } finally {
      cleanup();
    }
  });

  test("reads userName field when name is absent", () => {
    const { path, cleanup } = createTempConfig({ userName: "Bob" });
    try {
      const service = new GreetingService({ configPath: path });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toContain("Bob");
    } finally {
      cleanup();
    }
  });

  test("prefers name over userName when both present", () => {
    const { path, cleanup } = createTempConfig({ name: "Alice", userName: "Bob" });
    try {
      const service = new GreetingService({ configPath: path });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toContain("Alice");
      expect(greeting).not.toContain("Bob");
    } finally {
      cleanup();
    }
  });

  test("falls back to generic when config file does not exist", () => {
    const service = new GreetingService({
      configPath: "/tmp/nonexistent-reins-config-test/config.json",
    });
    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toBe("Good morning");
  });

  test("falls back to generic when config has empty name", () => {
    const { path, cleanup } = createTempConfig({ name: "" });
    try {
      const service = new GreetingService({ configPath: path });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toBe("Good morning");
    } finally {
      cleanup();
    }
  });

  test("falls back to generic when config has whitespace-only name", () => {
    const { path, cleanup } = createTempConfig({ name: "   " });
    try {
      const service = new GreetingService({ configPath: path });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toBe("Good morning");
    } finally {
      cleanup();
    }
  });

  test("falls back to generic when config has no name fields", () => {
    const { path, cleanup } = createTempConfig({ setupComplete: true });
    try {
      const service = new GreetingService({ configPath: path });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toBe("Good morning");
    } finally {
      cleanup();
    }
  });

  test("handles malformed JSON gracefully", () => {
    const dir = join(tmpdir(), `reins-test-malformed-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "config.json");
    writeFileSync(filePath, "not valid json {{{");
    try {
      const service = new GreetingService({ configPath: filePath });
      const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
      expect(greeting).toBe("Good morning");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- Acceptance criteria from spec ---

describe("GreetingService acceptance criteria (MH04-3)", () => {
  test("returns 'Good morning, James!' when userName is James and hour is 9", () => {
    // Use a specific day where the variant index maps to "Good morning, {name}"
    // Day of year 42 (Feb 11) → (42-1) % 3 = 2 → "Good morning, {name}"
    const service = new GreetingService({
      configNameReader: () => "James",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T09:00:00") });
    expect(greeting).toBe("Good morning, James");
  });

  test("returns generic 'Good morning' when no userName configured", () => {
    const service = new GreetingService({
      configNameReader: () => null,
    });

    const greeting = service.generateGreeting({ time: new Date("2026-02-11T09:00:00") });
    expect(greeting).toBe("Good morning");
  });

  test("greeting varies by time of day with same name", () => {
    const service = new GreetingService({
      configNameReader: () => "James",
    });

    const morning = service.generateGreeting({ time: new Date("2026-02-11T09:00:00") });
    const afternoon = service.generateGreeting({ time: new Date("2026-02-11T14:00:00") });
    const evening = service.generateGreeting({ time: new Date("2026-02-11T19:00:00") });
    const night = service.generateGreeting({ time: new Date("2026-02-11T23:00:00") });

    expect(morning).toContain("James");
    expect(afternoon).toContain("James");
    expect(evening).toContain("James");
    expect(night).toContain("James");

    // All four should be different greetings
    const unique = new Set([morning, afternoon, evening, night]);
    expect(unique.size).toBe(4);
  });
});

// --- Deterministic variety ---

describe("GreetingService deterministic variety", () => {
  test("same day of year produces same variant", () => {
    const service = new GreetingService({
      configNameReader: () => "Test",
    });

    const first = service.generateGreeting({ time: new Date("2026-06-15T08:00:00") });
    const second = service.generateGreeting({ time: new Date("2026-06-15T10:00:00") });
    expect(first).toBe(second);
  });

  test("different days may produce different variants", () => {
    const service = new GreetingService({
      configNameReader: () => "Test",
    });

    // Collect morning greetings across 3 consecutive days
    const greetings = [
      service.generateGreeting({ time: new Date("2026-01-01T09:00:00") }),
      service.generateGreeting({ time: new Date("2026-01-02T09:00:00") }),
      service.generateGreeting({ time: new Date("2026-01-03T09:00:00") }),
    ];

    // Morning has 3 variants, so 3 consecutive days should cycle through all
    const unique = new Set(greetings);
    expect(unique.size).toBe(3);
  });
});

// --- now() injection ---

describe("GreetingService now() injection", () => {
  test("uses injected now() when no time option provided", () => {
    const service = new GreetingService({
      configNameReader: () => null,
      now: () => new Date("2026-03-15T14:00:00"),
    });

    const greeting = service.generateGreeting();
    expect(greeting).toBe("Good afternoon");
  });

  test("time option overrides injected now()", () => {
    const service = new GreetingService({
      configNameReader: () => null,
      now: () => new Date("2026-03-15T14:00:00"),
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toBe("Good morning");
  });
});

// --- Name normalization edge cases ---

describe("GreetingService name normalization", () => {
  test("trims whitespace from name", () => {
    const service = new GreetingService({
      configNameReader: () => "  Alice  ",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toContain("Alice");
    expect(greeting).not.toContain("  Alice  ");
  });

  test("empty string name falls back to generic", () => {
    const service = new GreetingService({
      configNameReader: () => "",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toBe("Good morning");
  });

  test("whitespace-only name falls back to generic", () => {
    const service = new GreetingService({
      configNameReader: () => "   ",
    });

    const greeting = service.generateGreeting({ time: new Date("2026-03-15T09:00:00") });
    expect(greeting).toBe("Good morning");
  });
});
