/**
 * Persist and restore the last active conversation ID to a JSON file.
 *
 * Session state is stored at ~/.config/reins/session-state.json.
 * On startup, the last active conversation is restored so the user
 * continues where they left off.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "reins");
const SESSION_STATE_FILE = join(CONFIG_DIR, "session-state.json");

export interface SessionState {
  lastConversationId: string;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function isValidSessionState(value: unknown): value is SessionState {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.lastConversationId === "string" &&
    obj.lastConversationId.length > 0
  );
}

export function loadSessionState(): SessionState | null {
  try {
    if (!existsSync(SESSION_STATE_FILE)) {
      return null;
    }

    const raw = readFileSync(SESSION_STATE_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (isValidSessionState(parsed)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveSessionState(state: SessionState): void {
  try {
    ensureConfigDir();
    writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Silently fail — session persistence is best-effort
  }
}

export { SESSION_STATE_FILE, CONFIG_DIR };
