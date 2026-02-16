/**
 * Persist and restore thinking preferences to a JSON file.
 *
 * Thinking preferences are stored at ~/.config/reins/thinking-preferences.json.
 * On startup, the last selected thinking level and visibility are restored.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ThinkingLevel } from "../daemon/contracts";

const CONFIG_DIR = join(homedir(), ".config", "reins");
const THINKING_FILE = join(CONFIG_DIR, "thinking-preferences.json");

export interface ThinkingPreferences {
  thinkingLevel: ThinkingLevel;
  thinkingVisible: boolean;
}

const VALID_THINKING_LEVELS: readonly string[] = ["none", "low", "medium", "high"];

export const DEFAULT_THINKING_PREFERENCES: ThinkingPreferences = {
  thinkingLevel: "none",
  thinkingVisible: true,
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function isValidThinkingPreferences(value: unknown): value is ThinkingPreferences {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.thinkingLevel === "string" &&
    VALID_THINKING_LEVELS.includes(obj.thinkingLevel) &&
    typeof obj.thinkingVisible === "boolean"
  );
}

export function loadThinkingPreferences(): ThinkingPreferences {
  try {
    if (!existsSync(THINKING_FILE)) {
      return { ...DEFAULT_THINKING_PREFERENCES };
    }

    const raw = readFileSync(THINKING_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (isValidThinkingPreferences(parsed)) {
      return parsed;
    }

    return { ...DEFAULT_THINKING_PREFERENCES };
  } catch {
    return { ...DEFAULT_THINKING_PREFERENCES };
  }
}

export function saveThinkingPreferences(prefs: ThinkingPreferences): void {
  try {
    ensureConfigDir();
    writeFileSync(THINKING_FILE, JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    // Silently fail — thinking persistence is best-effort
  }
}

export { THINKING_FILE, CONFIG_DIR };
