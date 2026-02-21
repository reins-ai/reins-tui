import { describe, expect, test } from "bun:test";

import { HELP_SHORTCUT_CATEGORIES } from "../../src/components";
import {
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CONTEXT_ORDER,
  buildHelpCategories,
  getShortcutsByContext,
} from "../../src/keyboard-registry";

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
});
