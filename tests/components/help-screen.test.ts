import { describe, expect, test } from "bun:test";

import { HELP_SHORTCUT_CATEGORIES } from "../../src/components";

describe("Help Screen", () => {
  test("exports expected keyboard shortcut categories", () => {
    const categories = HELP_SHORTCUT_CATEGORIES.map((category) => category.title);

    expect(categories).toEqual(["NAVIGATION", "CONVERSATION", "SIDEBAR", "MODEL & THINKING", "APPLICATION"]);
  });

  test("each shortcut has key and description", () => {
    for (const category of HELP_SHORTCUT_CATEGORIES) {
      expect(category.shortcuts.length).toBeGreaterThan(0);
      for (const shortcut of category.shortcuts) {
        expect(shortcut.key.trim().length).toBeGreaterThan(0);
        expect(shortcut.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("contains all critical shortcuts", () => {
    const allKeys = HELP_SHORTCUT_CATEGORIES.flatMap((category) => category.shortcuts.map((shortcut) => shortcut.key));

    expect(allKeys.includes("Tab")).toBe(true);
    expect(allKeys.includes("Shift+Tab")).toBe(true);
    expect(allKeys.includes("Enter")).toBe(true);
    expect(allKeys.includes("Ctrl+K")).toBe(true);
    expect(allKeys.includes("q")).toBe(true);
    expect(allKeys.includes("?")).toBe(true);
  });
});
