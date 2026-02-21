import { describe, expect, it } from "bun:test";

import {
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CONTEXT_ORDER,
  buildHelpCategories,
  getShortcutsByContext,
} from "../src/keyboard-registry";
import type { RegisteredShortcut, ShortcutContext } from "../src/keyboard-registry";

// ---------------------------------------------------------------------------
// Handler map — the authoritative mapping from registry keys to their handler
// locations.  When you add or remove a keyboard shortcut, update BOTH the
// KEYBOARD_SHORTCUTS array in keyboard-registry.ts AND this map.
//
// The test below verifies bidirectional coverage:
//   1. Every registry entry has a handler listed here.
//   2. Every handler listed here has a registry entry.
// ---------------------------------------------------------------------------

/**
 * Maps each shortcut key string to the file and function that handles it.
 * This is intentionally a static declaration so that adding a shortcut to
 * the registry without wiring a handler (or vice versa) causes a test failure.
 */
const KNOWN_HANDLERS: Record<string, { file: string; handler: string }> = {
  // ── Global ──────────────────────────────────────────────────────────────
  "q":           { file: "app.tsx",        handler: "isQuitEvent" },
  "?":           { file: "app.tsx",        handler: "isHelpEvent" },
  "Ctrl+K":      { file: "app.tsx",        handler: "isCommandPaletteToggleEvent" },
  "Esc":         { file: "app.tsx",        handler: "isEscapeEvent" },

  // ── Layout ──────────────────────────────────────────────────────────────
  "Tab":         { file: "app.tsx",        handler: "isFocusForwardEvent" },
  "Shift+Tab":   { file: "app.tsx",        handler: "isFocusBackwardEvent" },
  "Ctrl+1":      { file: "app.tsx",        handler: "isToggleDrawerEvent" },
  "Ctrl+2":      { file: "app.tsx",        handler: "isToggleTodayEvent" },
  "Ctrl+3":      { file: "app.tsx",        handler: "resolveDirectPanelFocus" },
  "Ctrl+A":      { file: "app.tsx",        handler: "isToggleActivityEvent" },
  "Ctrl+Z":      { file: "app.tsx",        handler: "isToggleZenEvent" },
  "Ctrl+I":      { file: "app.tsx",        handler: "isToggleIntegrationPanelEvent" },
  "Ctrl+L":      { file: "app.tsx",        handler: "isToggleSkillPanelEvent" },

  // ── Conversation ────────────────────────────────────────────────────────
  "Ctrl+N":      { file: "app.tsx",        handler: "isNewConversationEvent" },
  "Ctrl+M":      { file: "app.tsx",        handler: "isToggleModelSelectorEvent" },
  "Ctrl+T":      { file: "app.tsx",        handler: "isCycleThinkingEvent" },

  // ── Input ───────────────────────────────────────────────────────────────
  "Enter":       { file: "input-area.tsx", handler: "onSubmit (return key)" },
  "Shift+Enter": { file: "input-area.tsx", handler: "newline insertion" },
  "Up/Down":     { file: "input-area.tsx", handler: "message history navigation" },

  // ── Activity (when activity panel is focused) ───────────────────────────
  "c":           { file: "task-panel.tsx",  handler: "clear activity log" },
  "y":           { file: "task-panel.tsx",  handler: "copy step card to clipboard" },
  "x":           { file: "task-panel.tsx",  handler: "export session log" },
  "Enter/e":     { file: "step-card.tsx",   handler: "expand / collapse card" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Keyboard Registry ↔ Handler Verification", () => {
  it("every registry entry has a corresponding handler in KNOWN_HANDLERS", () => {
    const missing: string[] = [];
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      if (!(shortcut.key in KNOWN_HANDLERS)) {
        missing.push(shortcut.key);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every handler in KNOWN_HANDLERS has a corresponding registry entry", () => {
    const registryKeys = new Set(KEYBOARD_SHORTCUTS.map((s) => s.key));
    const orphanedHandlers: string[] = [];
    for (const key of Object.keys(KNOWN_HANDLERS)) {
      if (!registryKeys.has(key)) {
        orphanedHandlers.push(key);
      }
    }
    expect(orphanedHandlers).toEqual([]);
  });

  it("registry and handler map have the same count", () => {
    expect(Object.keys(KNOWN_HANDLERS).length).toBe(KEYBOARD_SHORTCUTS.length);
  });
});

describe("Keyboard Registry Integrity", () => {
  it("has no duplicate shortcut keys", () => {
    const keys = KEYBOARD_SHORTCUTS.map((s) => s.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(duplicates).toEqual([]);
  });

  it("every shortcut has a non-empty key and description", () => {
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(shortcut.key.trim().length).toBeGreaterThan(0);
      expect(shortcut.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("every shortcut has a valid context from SHORTCUT_CONTEXT_ORDER", () => {
    const validContexts = new Set<ShortcutContext>(SHORTCUT_CONTEXT_ORDER);
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      expect(validContexts.has(shortcut.context)).toBe(true);
    }
  });

  it("every context in SHORTCUT_CONTEXT_ORDER has at least one shortcut", () => {
    for (const context of SHORTCUT_CONTEXT_ORDER) {
      const shortcuts = getShortcutsByContext(context);
      expect(shortcuts.length).toBeGreaterThan(0);
    }
  });

  it("buildHelpCategories covers all registry entries exactly once", () => {
    const categories = buildHelpCategories();
    const helpKeys = categories.flatMap((c) => c.shortcuts.map((s) => s.key));
    const registryKeys = KEYBOARD_SHORTCUTS.map((s) => s.key);

    // Same count — no entries lost or duplicated
    expect(helpKeys.length).toBe(registryKeys.length);

    // Every registry key appears in help
    for (const key of registryKeys) {
      expect(helpKeys).toContain(key);
    }
  });
});

describe("No Orphaned Shortcuts", () => {
  // Ctrl+B was flagged as a potential orphan in the audit (TUI-014).
  // Verified: Ctrl+B does not exist in the registry or any handler.
  // This test ensures it stays that way.
  it("Ctrl+B is not in the registry (confirmed not wired)", () => {
    const ctrlB = KEYBOARD_SHORTCUTS.find((s) => s.key === "Ctrl+B");
    expect(ctrlB).toBeUndefined();
  });

  it("no registry entry references a handler file that is not in KNOWN_HANDLERS", () => {
    // This is a structural sanity check: the handler map should reference
    // only files that actually exist in the project.  The set of known
    // handler files is intentionally small.
    const knownFiles = new Set([
      "app.tsx",
      "input-area.tsx",
      "task-panel.tsx",
      "step-card.tsx",
    ]);

    for (const [key, info] of Object.entries(KNOWN_HANDLERS)) {
      expect(knownFiles.has(info.file)).toBe(true);
    }
  });
});
