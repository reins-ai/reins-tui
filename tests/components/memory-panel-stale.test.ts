import { describe, expect, it } from "bun:test";

import {
  isStaleMemory,
  type MemoryRecordDisplay,
} from "../../src/components/memory-panel";

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeMemory(overrides?: Partial<MemoryRecordDisplay>): MemoryRecordDisplay {
  return {
    id: "mem-1",
    content: "Test memory content",
    type: "fact",
    layer: "ltm",
    tags: [],
    entities: [],
    importance: 0.5,
    confidence: 0.8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accessedAt: new Date().toISOString(),
    ...overrides,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// isStaleMemory
// ---------------------------------------------------------------------------

describe("isStaleMemory", () => {
  it("returns true for a record accessed 91 days ago", () => {
    const daysAgo91 = new Date(Date.now() - 91 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: daysAgo91 });
    expect(isStaleMemory(memory)).toBe(true);
  });

  it("returns true for a record accessed exactly 90 days ago", () => {
    const daysAgo90 = new Date(Date.now() - 90 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: daysAgo90 });
    expect(isStaleMemory(memory)).toBe(true);
  });

  it("returns false for a record accessed 89 days ago", () => {
    const daysAgo89 = new Date(Date.now() - 89 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: daysAgo89 });
    expect(isStaleMemory(memory)).toBe(false);
  });

  it("returns false for a record accessed today", () => {
    const memory = makeMemory({ accessedAt: new Date().toISOString() });
    expect(isStaleMemory(memory)).toBe(false);
  });

  it("returns false for a record accessed 1 day ago", () => {
    const yesterday = new Date(Date.now() - 1 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: yesterday });
    expect(isStaleMemory(memory)).toBe(false);
  });

  it("returns true for a record accessed 365 days ago", () => {
    const yearAgo = new Date(Date.now() - 365 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: yearAgo });
    expect(isStaleMemory(memory)).toBe(true);
  });

  it("uses accessedAt as primary signal even when createdAt is old", () => {
    const recentAccess = new Date(Date.now() - 10 * MS_PER_DAY).toISOString();
    const oldCreation = new Date(Date.now() - 200 * MS_PER_DAY).toISOString();
    const memory = makeMemory({
      accessedAt: recentAccess,
      createdAt: oldCreation,
    });
    expect(isStaleMemory(memory)).toBe(false);
  });

  it("falls back to createdAt when accessedAt is empty", () => {
    const oldCreation = new Date(Date.now() - 100 * MS_PER_DAY).toISOString();
    const memory = makeMemory({
      accessedAt: "",
      createdAt: oldCreation,
    });
    expect(isStaleMemory(memory)).toBe(true);
  });

  it("returns false when accessedAt is empty and createdAt is recent", () => {
    const recentCreation = new Date(Date.now() - 10 * MS_PER_DAY).toISOString();
    const memory = makeMemory({
      accessedAt: "",
      createdAt: recentCreation,
    });
    expect(isStaleMemory(memory)).toBe(false);
  });

  it("supports custom threshold days", () => {
    const daysAgo31 = new Date(Date.now() - 31 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: daysAgo31 });

    // Not stale at default 90-day threshold
    expect(isStaleMemory(memory)).toBe(false);
    // Stale at 30-day threshold
    expect(isStaleMemory(memory, 30)).toBe(true);
  });

  it("returns false for a future accessedAt date", () => {
    const future = new Date(Date.now() + 10 * MS_PER_DAY).toISOString();
    const memory = makeMemory({ accessedAt: future });
    expect(isStaleMemory(memory)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stale indicator source-level verification
// ---------------------------------------------------------------------------

describe("MemoryPanel stale indicator", () => {
  it("source renders stale indicator for stale memories", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/memory-panel.tsx"),
      "utf-8",
    );

    // Verify the stale indicator text is present in the component
    expect(source).toContain("⚠ stale");
    // Verify it uses the warning color token
    expect(source).toContain('tokens["status.warning"]');
  });

  it("source calls isStaleMemory in MemoryRow", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/memory-panel.tsx"),
      "utf-8",
    );

    expect(source).toContain("isStaleMemory(memory)");
  });
});
