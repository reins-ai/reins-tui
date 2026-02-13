/**
 * Persist and restore panel pin preferences to a JSON file.
 *
 * Pin preferences are stored at ~/.config/reins/pin-preferences.json.
 * On startup, pinned state is restored but panels start dismissed.
 *
 * Sidebar toggle intent:
 *   The breakpoint engine uses sidebar toggle intent to decide whether
 *   to auto-collapse the drawer on narrow terminals. A drawer that is
 *   either pinned or currently visible counts as "user toggled open",
 *   meaning the user has expressed intent to see the sidebar. This
 *   intent is respected as long as the terminal is wide enough to fit
 *   the sidebar alongside a minimum conversation area.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_PIN_PREFERENCES,
  type PanelState,
  type PinPreferences,
} from "./layout-mode";

const CONFIG_DIR = join(homedir(), ".config", "reins");
const PIN_FILE = join(CONFIG_DIR, "pin-preferences.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function isValidPinPreferences(value: unknown): value is PinPreferences {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.drawer === "boolean" &&
    typeof obj.today === "boolean" &&
    typeof obj.modal === "boolean"
  );
}

export function loadPinPreferences(): PinPreferences {
  try {
    if (!existsSync(PIN_FILE)) {
      return { ...DEFAULT_PIN_PREFERENCES };
    }

    const raw = readFileSync(PIN_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (isValidPinPreferences(parsed)) {
      return parsed;
    }

    return { ...DEFAULT_PIN_PREFERENCES };
  } catch {
    return { ...DEFAULT_PIN_PREFERENCES };
  }
}

export function savePinPreferences(prefs: PinPreferences): void {
  try {
    ensureConfigDir();
    writeFileSync(PIN_FILE, JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    // Silently fail — pin persistence is best-effort
  }
}

/**
 * Derive whether the user has expressed intent to see the sidebar.
 * Returns true if the drawer is currently visible or pinned.
 * Used by the breakpoint engine to decide auto-collapse behavior.
 */
export function hasSidebarToggleIntent(panels: PanelState): boolean {
  return panels.drawer.visible || panels.drawer.pinned;
}

export { PIN_FILE, CONFIG_DIR };
