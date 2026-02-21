import { describe, expect, test } from "bun:test";

import { HELP_SHORTCUT_CATEGORIES } from "../../src/components";
import { formatGreetingLines } from "../../src/screens/help-screen";
import {
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CONTEXT_ORDER,
  buildHelpCategories,
  getShortcutsByContext,
} from "../../src/keyboard-registry";
import type { ShortcutContext } from "../../src/keyboard-registry";

describe("Help Screen", () => {
  test("categories are auto-generated from the keyboard registry", () => {
    const generated = buildHelpCategories();
    expect(HELP_SHORTCUT_CATEGORIES).toEqual(generated);
  });

  test("exports expected keyboard shortcut categories matching context order", () => {
    const categories = HELP_SHORTCUT_CATEGORIES.map((c) => c.title);
    const expected = SHORTCUT_CONTEXT_ORDER.map((c) => c.toUpperCase());
    expect(categories).toEqual(expected);
  });

  test("each shortcut has non-empty key and description", () => {
    for (const category of HELP_SHORTCUT_CATEGORIES) {
      expect(category.shortcuts.length).toBeGreaterThan(0);
      for (const shortcut of category.shortcuts) {
        expect(shortcut.key.trim().length).toBeGreaterThan(0);
        expect(shortcut.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("contains all critical global shortcuts", () => {
    const allKeys = HELP_SHORTCUT_CATEGORIES.flatMap((c) =>
      c.shortcuts.map((s) => s.key),
    );

    expect(allKeys).toContain("Tab");
    expect(allKeys).toContain("Shift+Tab");
    expect(allKeys).toContain("Enter");
    expect(allKeys).toContain("Ctrl+K");
    expect(allKeys).toContain("q");
    expect(allKeys).toContain("?");
  });

  test("every registry entry appears in exactly one help category", () => {
    const helpEntries = HELP_SHORTCUT_CATEGORIES.flatMap((c) =>
      c.shortcuts.map((s) => s.key),
    );

    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(helpEntries).toContain(shortcut.key);
    }

    expect(helpEntries.length).toBe(KEYBOARD_SHORTCUTS.length);
  });

  test("no duplicate keys in the registry", () => {
    const keys = KEYBOARD_SHORTCUTS.map((s) => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  test("getShortcutsByContext returns correct subset", () => {
    const global = getShortcutsByContext("Global");
    expect(global.length).toBeGreaterThan(0);
    for (const s of global) {
      expect(s.context).toBe("Global");
    }
  });

  test("activity shortcuts are grouped under ACTIVITY", () => {
    const activityCategory = HELP_SHORTCUT_CATEGORIES.find(
      (c) => c.title === "ACTIVITY",
    );
    expect(activityCategory).toBeDefined();
    expect(activityCategory!.shortcuts.length).toBeGreaterThan(0);

    const activityKeys = activityCategory!.shortcuts.map((s) => s.key);
    expect(activityKeys).toContain("c");
    expect(activityKeys).toContain("y");
    expect(activityKeys).toContain("x");
  });

  test("every context in SHORTCUT_CONTEXT_ORDER has at least one shortcut", () => {
    for (const context of SHORTCUT_CONTEXT_ORDER) {
      const shortcuts = getShortcutsByContext(context);
      expect(shortcuts.length).toBeGreaterThan(0);
    }
  });

  test("all registered shortcuts have a valid context", () => {
    const validContexts: readonly ShortcutContext[] = SHORTCUT_CONTEXT_ORDER;
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(validContexts).toContain(shortcut.context);
    }
  });

  test("conversation shortcuts include model and thinking toggles", () => {
    const convCategory = HELP_SHORTCUT_CATEGORIES.find(
      (c) => c.title === "CONVERSATION",
    );
    expect(convCategory).toBeDefined();
    const keys = convCategory!.shortcuts.map((s) => s.key);
    expect(keys).toContain("Ctrl+N");
    expect(keys).toContain("Ctrl+M");
    expect(keys).toContain("Ctrl+T");
  });

  test("layout shortcuts include panel toggles", () => {
    const layoutCategory = HELP_SHORTCUT_CATEGORIES.find(
      (c) => c.title === "LAYOUT",
    );
    expect(layoutCategory).toBeDefined();
    const keys = layoutCategory!.shortcuts.map((s) => s.key);
    expect(keys).toContain("Ctrl+1");
    expect(keys).toContain("Ctrl+A");
    expect(keys).toContain("Ctrl+Z");
  });

  test("input shortcuts include send and newline", () => {
    const inputCategory = HELP_SHORTCUT_CATEGORIES.find(
      (c) => c.title === "INPUT",
    );
    expect(inputCategory).toBeDefined();
    const keys = inputCategory!.shortcuts.map((s) => s.key);
    expect(keys).toContain("Enter");
    expect(keys).toContain("Shift+Enter");
  });
});

// ---------------------------------------------------------------------------
// formatGreetingLines
// ---------------------------------------------------------------------------

describe("formatGreetingLines", () => {
  test("returns greeting as first line", () => {
    const lines = formatGreetingLines({
      greeting: "Good morning!",
      contextSummary: null,
    });
    expect(lines[0]).toBe("Good morning!");
  });

  test("returns only greeting when contextSummary is null", () => {
    const lines = formatGreetingLines({
      greeting: "Hello",
      contextSummary: null,
    });
    expect(lines).toHaveLength(1);
  });

  test("includes context summary lines after blank line", () => {
    const lines = formatGreetingLines({
      greeting: "Hello",
      contextSummary: "Line 1\nLine 2",
    });
    expect(lines).toHaveLength(4); // greeting, blank, line1, line2
    expect(lines[0]).toBe("Hello");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("Line 1");
    expect(lines[3]).toBe("Line 2");
  });

  test("handles single-line context summary", () => {
    const lines = formatGreetingLines({
      greeting: "Hi",
      contextSummary: "You have 3 tasks today",
    });
    expect(lines).toHaveLength(3); // greeting, blank, summary
    expect(lines[2]).toBe("You have 3 tasks today");
  });

  test("handles empty context summary string as falsy", () => {
    const lines = formatGreetingLines({
      greeting: "Hi",
      contextSummary: "",
    });
    // Empty string is falsy, so contextSummary branch is skipped
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Hi");
  });
});
