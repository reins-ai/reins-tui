/**
 * Shared daemon profile and token actions.
 *
 * These are pure business-logic functions used by both the slash-command
 * handlers (`/daemon add`, `/daemon switch`, etc.) and the interactive
 * daemon panel keybinds.
 */

import {
  DaemonProfileStore,
  DaemonTokenManager,
  TransportProbe,
  createKeychainProvider,
} from "@reins/core";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ActionSuccess {
  readonly ok: true;
  readonly message: string;
  /** Present only for token-related actions. */
  readonly token?: string;
}

export interface ActionError {
  readonly ok: false;
  readonly error: string;
}

export type ActionResult = ActionSuccess | ActionError;

// ---------------------------------------------------------------------------
// Internal helpers (re-exported for tests / direct consumption)
// ---------------------------------------------------------------------------

export function getProfileStore(): DaemonProfileStore {
  const dataRoot = process.env.REINS_DATA_ROOT;
  return new DaemonProfileStore(
    typeof dataRoot === "string" && dataRoot.length > 0 ? { dataRoot } : undefined,
  );
}

export function getTokenManager(): DaemonTokenManager {
  const dataRoot = process.env.REINS_DATA_ROOT;
  const keychain = createKeychainProvider(
    typeof dataRoot === "string" && dataRoot.length > 0
      ? { fallbackOptions: { filePath: join(dataRoot, "machine-secret.enc") } }
      : undefined,
  );
  return new DaemonTokenManager({ keychain });
}

export async function detectTransportType(
  httpUrl: string,
): Promise<"localhost" | "tailscale" | "cloudflare" | "direct"> {
  const probe = new TransportProbe();
  const detection = await probe.detect(httpUrl);
  if (!detection.ok) {
    return "direct";
  }
  return detection.value.type;
}

export function toHealthUrl(httpUrl: string): string {
  const parsed = new URL(httpUrl);
  const base = parsed.toString().endsWith("/") ? parsed.toString() : `${parsed.toString()}/`;
  return new URL("health", base).toString();
}

export async function isDaemonReachable(httpUrl: string): Promise<boolean> {
  try {
    const response = await fetch(toHealthUrl(httpUrl), {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

export function toWsUrl(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return httpUrl.replace(/^http/i, "ws");
  }
}

export function maskToken(token: string): string {
  if (token.length <= 10) {
    return "rm_****";
  }
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/**
 * Resolve the active daemon HTTP base URL.
 *
 * Priority:
 *   1. Default profile URL from the DaemonProfileStore
 *   2. Fallback: DEFAULT_DAEMON_HTTP_BASE_URL (localhost:7433)
 */
export async function getActiveDaemonUrl(): Promise<string> {
  try {
    const store = getProfileStore();
    const result = await store.getDefault();
    if (result.ok && result.value !== null) {
      return result.value.httpUrl;
    }
  } catch {
    // Profile store may not be available yet — fall through
  }

  // Lazy import to avoid circular dependency at module level
  const { DEFAULT_DAEMON_HTTP_BASE_URL } = await import("./client");
  return DEFAULT_DAEMON_HTTP_BASE_URL;
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export async function addDaemonProfile(name: string, url: string): Promise<ActionResult> {
  if (!name || !url) {
    return { ok: false, error: "Name and URL are required." };
  }

  const profileStore = getProfileStore();
  const transportType = await detectTransportType(url);
  const addResult = await profileStore.add({
    name,
    httpUrl: url,
    wsUrl: toWsUrl(url),
    transportType,
    isDefault: false,
  });

  if (!addResult.ok) {
    return { ok: false, error: addResult.error.message };
  }

  return {
    ok: true,
    message: `Profile '${addResult.value.name}' created at ${addResult.value.httpUrl}`,
  };
}

export async function switchDaemonProfile(name: string): Promise<ActionResult> {
  if (!name) {
    return { ok: false, error: "Profile name is required." };
  }

  const profileStore = getProfileStore();
  const profileResult = await profileStore.get(name);
  if (!profileResult.ok) {
    return { ok: false, error: profileResult.error.message };
  }

  if (profileResult.value === null) {
    return { ok: false, error: `Profile '${name}' not found.` };
  }

  const reachable = await isDaemonReachable(profileResult.value.httpUrl);
  if (!reachable) {
    return {
      ok: false,
      error: `Unable to reach daemon '${name}' at ${profileResult.value.httpUrl}. Default profile unchanged.`,
    };
  }

  const setDefaultResult = await profileStore.setDefault(name);
  if (!setDefaultResult.ok) {
    return { ok: false, error: setDefaultResult.error.message };
  }

  const touchResult = await profileStore.touchLastConnected(name);
  if (!touchResult.ok) {
    return { ok: false, error: touchResult.error.message };
  }

  return { ok: true, message: `Switched to daemon '${name}'` };
}

export async function removeDaemonProfile(name: string): Promise<ActionResult> {
  if (!name) {
    return { ok: false, error: "Profile name is required." };
  }

  const profileStore = getProfileStore();
  const existingResult = await profileStore.get(name);
  if (!existingResult.ok) {
    return { ok: false, error: existingResult.error.message };
  }

  if (existingResult.value === null) {
    return { ok: false, error: `Profile '${name}' not found.` };
  }

  if (existingResult.value.isDefault) {
    const listResult = await profileStore.list();
    if (!listResult.ok) {
      return { ok: false, error: listResult.error.message };
    }

    const fallbackProfiles = listResult.value.filter((profile) => profile.name !== name);
    if (fallbackProfiles.length === 0) {
      return {
        ok: false,
        error: "Cannot remove the default profile because it is the only configured profile.",
      };
    }

    const fallbackProfile = fallbackProfiles.find((profile) => profile.name === "local")
      ?? fallbackProfiles.find((profile) => profile.transportType === "localhost")
      ?? fallbackProfiles[0];

    const setDefaultResult = await profileStore.setDefault(fallbackProfile.name);
    if (!setDefaultResult.ok) {
      return { ok: false, error: setDefaultResult.error.message };
    }
  }

  const removeResult = await profileStore.remove(name);
  if (!removeResult.ok) {
    return { ok: false, error: removeResult.error.message };
  }

  return { ok: true, message: `Profile '${name}' removed` };
}

export async function showDaemonToken(): Promise<ActionResult> {
  const profileStore = getProfileStore();
  const defaultProfileResult = await profileStore.getDefault();
  if (!defaultProfileResult.ok) {
    return { ok: false, error: defaultProfileResult.error.message };
  }

  if (defaultProfileResult.value === null) {
    return { ok: false, error: "No default daemon profile configured." };
  }

  const tokenManager = getTokenManager();
  const tokenResult = await tokenManager.getToken(defaultProfileResult.value.name);
  if (!tokenResult.ok) {
    return { ok: false, error: tokenResult.error.message };
  }

  const tokenText = tokenResult.value === null
    ? "(not configured)"
    : maskToken(tokenResult.value);

  return {
    ok: true,
    message: `Profile: ${defaultProfileResult.value.name}`,
    token: tokenText,
  };
}

export async function rotateDaemonToken(): Promise<ActionResult> {
  const profileStore = getProfileStore();
  const defaultProfileResult = await profileStore.getDefault();
  if (!defaultProfileResult.ok) {
    return { ok: false, error: defaultProfileResult.error.message };
  }

  if (defaultProfileResult.value === null) {
    return { ok: false, error: "No default daemon profile configured." };
  }

  const tokenManager = getTokenManager();
  const rotateResult = await tokenManager.rotateToken(defaultProfileResult.value.name);
  if (!rotateResult.ok) {
    return { ok: false, error: rotateResult.error.message };
  }

  return {
    ok: true,
    message: `Token rotated for '${defaultProfileResult.value.name}'`,
    token: maskToken(rotateResult.value),
  };
}
