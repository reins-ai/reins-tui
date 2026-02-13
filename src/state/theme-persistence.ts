/**
 * Persist and restore theme selection to a JSON file.
 *
 * Theme preferences are stored at ~/.config/reins/theme-preferences.json.
 * On startup, the last selected theme is restored.
 * Falls back to "reins-dark" if the persisted theme is invalid or missing.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "reins");
const THEME_FILE = join(CONFIG_DIR, "theme-preferences.json");

export interface ThemePreferences {
  themeName: string;
}

export const DEFAULT_THEME_NAME = "reins-dark";

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function isValidThemePreferences(value: unknown): value is ThemePreferences {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.themeName === "string" && obj.themeName.length > 0;
}

export function loadThemePreferences(): ThemePreferences {
  try {
    if (!existsSync(THEME_FILE)) {
      return { themeName: DEFAULT_THEME_NAME };
    }

    const raw = readFileSync(THEME_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (isValidThemePreferences(parsed)) {
      return parsed;
    }

    return { themeName: DEFAULT_THEME_NAME };
  } catch {
    return { themeName: DEFAULT_THEME_NAME };
  }
}

export function saveThemePreferences(prefs: ThemePreferences): void {
  try {
    ensureConfigDir();
    writeFileSync(THEME_FILE, JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    // Silently fail — theme persistence is best-effort
  }
}

export { THEME_FILE, CONFIG_DIR };
