/**
 * Persist and restore model selection to a JSON file.
 *
 * Model preferences are stored at ~/.config/reins/model-preferences.json.
 * On startup, the last selected model and provider are restored.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "reins");
const MODEL_FILE = join(CONFIG_DIR, "model-preferences.json");

export interface ModelPreferences {
  modelId: string;
  provider: string;
}

export const DEFAULT_MODEL_PREFERENCES: ModelPreferences = {
  modelId: "default",
  provider: "",
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function isValidModelPreferences(value: unknown): value is ModelPreferences {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.modelId === "string" &&
    typeof obj.provider === "string"
  );
}

export function loadModelPreferences(): ModelPreferences {
  try {
    if (!existsSync(MODEL_FILE)) {
      return { ...DEFAULT_MODEL_PREFERENCES };
    }

    const raw = readFileSync(MODEL_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (isValidModelPreferences(parsed)) {
      return parsed;
    }

    return { ...DEFAULT_MODEL_PREFERENCES };
  } catch {
    return { ...DEFAULT_MODEL_PREFERENCES };
  }
}

export function saveModelPreferences(prefs: ModelPreferences): void {
  try {
    ensureConfigDir();
    writeFileSync(MODEL_FILE, JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    // Silently fail — model persistence is best-effort
  }
}

export { MODEL_FILE, CONFIG_DIR };
