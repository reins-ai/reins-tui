/**
 * Centralized keyboard shortcut registry.
 *
 * Every shortcut listed here MUST have a corresponding handler wired in the
 * codebase (app.tsx, input-area.tsx, task-panel.tsx, step-card.tsx, etc.).
 * The help screen renders directly from this registry so it can never go stale.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Logical grouping for the help screen. */
export type ShortcutContext =
  | "Global"
  | "Layout"
  | "Conversation"
  | "Input"
  | "Activity";

export interface RegisteredShortcut {
  /** Display string for the key combination (e.g. "Ctrl+K"). */
  key: string;
  /** Human-readable description of what the shortcut does. */
  description: string;
  /** Which context group this shortcut belongs to. */
  context: ShortcutContext;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Canonical list of all keyboard shortcuts that are actually wired and
 * functional in the TUI.  Grouped by context for the help screen.
 *
 * Maintenance rule: when you add or remove a keyboard handler, update this
 * array.  The help screen and its tests derive from this single source of
 * truth.
 */
export const KEYBOARD_SHORTCUTS: readonly RegisteredShortcut[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  { key: "q",       description: "Quit",                context: "Global" },
  { key: "?",       description: "Toggle help",         context: "Global" },
  { key: "Ctrl+K",  description: "Command palette",     context: "Global" },
  { key: "Esc",     description: "Dismiss / cancel",    context: "Global" },

  // ── Layout ──────────────────────────────────────────────────────────────
  { key: "Tab",       description: "Next panel",          context: "Layout" },
  { key: "Shift+Tab", description: "Previous panel",      context: "Layout" },
  { key: "Ctrl+1",    description: "Toggle drawer",       context: "Layout" },
  { key: "Ctrl+2",    description: "Toggle today panel",  context: "Layout" },
  { key: "Ctrl+3",    description: "Focus input",         context: "Layout" },
  { key: "Ctrl+A",    description: "Toggle activity view", context: "Layout" },
  { key: "Ctrl+Z",    description: "Toggle zen mode",     context: "Layout" },
  { key: "Ctrl+I",    description: "Toggle integrations", context: "Layout" },
  { key: "Ctrl+L",    description: "Toggle skills",       context: "Layout" },

  // ── Conversation ────────────────────────────────────────────────────────
  { key: "Ctrl+N",  description: "New conversation",     context: "Conversation" },
  { key: "Ctrl+M",  description: "Cycle model",          context: "Conversation" },
  { key: "Ctrl+T",  description: "Cycle thinking level", context: "Conversation" },

  // ── Input ───────────────────────────────────────────────────────────────
  { key: "Enter",       description: "Send message",     context: "Input" },
  { key: "Shift+Enter", description: "New line",         context: "Input" },
  { key: "Up/Down",     description: "Message history",  context: "Input" },

  // ── Activity (when activity panel is focused) ───────────────────────────
  { key: "c",       description: "Clear activity log",        context: "Activity" },
  { key: "y",       description: "Copy step card to clipboard", context: "Activity" },
  { key: "x",       description: "Export session log",        context: "Activity" },
  { key: "Enter/e", description: "Expand / collapse card",    context: "Activity" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ordered list of context groups as they should appear in the help screen. */
export const SHORTCUT_CONTEXT_ORDER: readonly ShortcutContext[] = [
  "Global",
  "Layout",
  "Conversation",
  "Input",
  "Activity",
] as const;

/** Return shortcuts filtered by context, preserving insertion order. */
export function getShortcutsByContext(context: ShortcutContext): RegisteredShortcut[] {
  return KEYBOARD_SHORTCUTS.filter((s) => s.context === context);
}

/**
 * Build the grouped structure consumed by the help screen.
 * Each group contains a title (the context name) and its shortcuts.
 */
export function buildHelpCategories(): { title: string; shortcuts: { key: string; description: string }[] }[] {
  return SHORTCUT_CONTEXT_ORDER.map((context) => ({
    title: context.toUpperCase(),
    shortcuts: getShortcutsByContext(context).map(({ key, description }) => ({ key, description })),
  }));
}
