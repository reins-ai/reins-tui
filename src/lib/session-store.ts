import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getDataRoot } from "@reins/core";

interface SessionData {
  sessionToken: string;
  issuedAt: string;
}

const SESSION_FILE_NAME = "session.json";

/**
 * Resolve the session file path.
 * Accepts an optional dataRoot override for testing.
 */
function getSessionPath(dataRoot?: string): string {
  const root = dataRoot ?? getDataRoot();
  return join(root, SESSION_FILE_NAME);
}

export interface SessionStoreOptions {
  dataRoot?: string;
}

export async function loadSessionToken(options: SessionStoreOptions = {}): Promise<string | null> {
  try {
    const file = Bun.file(getSessionPath(options.dataRoot));
    const exists = await file.exists();
    if (!exists) {
      return null;
    }

    const text = await file.text();
    const data = JSON.parse(text) as Partial<SessionData>;
    if (typeof data.sessionToken === "string" && data.sessionToken.length > 0) {
      return data.sessionToken;
    }

    return null;
  } catch {
    return null;
  }
}

export async function saveSessionToken(token: string, options: SessionStoreOptions = {}): Promise<void> {
  const path = getSessionPath(options.dataRoot);
  await mkdir(dirname(path), { recursive: true });

  const data: SessionData = {
    sessionToken: token,
    issuedAt: new Date().toISOString(),
  };

  await Bun.write(path, JSON.stringify(data, null, 2));
}

export async function clearSessionToken(options: SessionStoreOptions = {}): Promise<void> {
  try {
    const file = Bun.file(getSessionPath(options.dataRoot));
    const exists = await file.exists();
    if (exists) {
      await unlink(getSessionPath(options.dataRoot));
    }
  } catch {
    // Ignore errors when clearing — file may not exist
  }
}
