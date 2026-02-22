import { err, ok } from "../../daemon/contracts";
import { getActiveDaemonUrl } from "../../daemon/actions";
import type { CommandHandler, CommandHandlerContext } from "./types";
import {
  callDaemonChannelGet,
  resolveChannelBaseUrl,
} from "./channels";

// ---------------------------------------------------------------------------
// Daemon response types
// ---------------------------------------------------------------------------

interface AuthAddResponse {
  ok: boolean;
  channelId: string;
  userId: string;
}

interface AuthRemoveResponse {
  ok?: boolean;
  removed?: boolean;
  error?: string;
}

interface AuthListResponse {
  channelId: string;
  users: string[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function checkDaemonConnected(
  context: CommandHandlerContext,
): { ok: true } | { ok: false; message: string } {
  if (context.daemonClient) {
    const state = context.daemonClient.getConnectionState();
    if (state.status !== "connected") {
      return {
        ok: false,
        message:
          "Daemon is disconnected. Reconnect first with " +
          "/daemon switch or restart the daemon.",
      };
    }
  }
  return { ok: true };
}

/**
 * POST to a daemon auth endpoint. Mirrors callDaemonChannelApi but
 * returns a generic type so auth-specific response shapes are preserved.
 */
async function callDaemonAuthApi<T>(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number = 10_000,
  fetchFn: typeof fetch = fetch,
  baseUrlOverride?: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const baseUrl = baseUrlOverride ?? await getActiveDaemonUrl();

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.message.includes("timed out"))
    ) {
      return {
        ok: false,
        error: "Daemon request timed out. Try again.",
      };
    }
    if (
      error instanceof TypeError &&
      (error.message.includes("fetch") ||
        error.message.includes("connect"))
    ) {
      return {
        ok: false,
        error:
          "Unable to reach daemon. Is it running on " +
          "the configured address?",
      };
    }
    const message =
      error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Daemon request failed: ${message}` };
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    return {
      ok: false,
      error: `Daemon returned invalid response (HTTP ${response.status})`,
    };
  }

  if (!response.ok) {
    const errorData = data as unknown as { error?: string };
    return {
      ok: false,
      error:
        errorData.error ??
        `Daemon returned HTTP ${response.status}`,
    };
  }

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// /auth handler
// ---------------------------------------------------------------------------

export const handleAuthCommand: CommandHandler = async (
  args,
  context,
) => {
  const first = args.positional[0]?.trim().toLowerCase();

  // No args → show help
  if (!first) {
    return ok({
      statusMessage: "Auth usage",
      responseText: [
        "**Auth Command Usage:**",
        "",
        "  /auth <channel> <userId>    Authorize a user",
        "  /auth list <channel>        List authorized users",
        "  /authenticate               Alias for /auth",
        "  /deauth <channel> <userId>  Remove a user",
      ].join("\n"),
    });
  }

  // /auth list <channel>
  if (first === "list") {
    const channelId = args.positional[1]?.trim();
    if (!channelId) {
      return err({
        code: "INVALID_ARGUMENT",
        message:
          "Missing channel. Usage: /auth list <channel>",
      });
    }

    const connCheck = checkDaemonConnected(context);
    if (!connCheck.ok) {
      return err({
        code: "INVALID_ARGUMENT",
        message: connCheck.message,
      });
    }

    const baseUrl = await resolveChannelBaseUrl(context);
    const result = await callDaemonChannelGet<AuthListResponse>(
      `/auth/list?channelId=${encodeURIComponent(channelId)}`,
      10_000,
      fetch,
      baseUrl,
    );

    if (!result.ok) {
      return err({
        code: "INVALID_ARGUMENT",
        message:
          `Failed to list authorized users: ${result.error}`,
      });
    }

    const { users } = result.data;

    if (users.length === 0) {
      return ok({
        statusMessage:
          `No authorized users for ${channelId}`,
        responseText: [
          `**No authorized users for ${channelId}.**`,
          "",
          `Use \`/auth ${channelId} <userId>\` to add a user.`,
        ].join("\n"),
      });
    }

    const userList = users
      .map((userId, i) => `  ${i + 1}. ${userId}`)
      .join("\n");

    return ok({
      statusMessage:
        `${users.length} authorized users for ${channelId}`,
      responseText: [
        `**Authorized users for ${channelId} ` +
          `(${users.length} total):**`,
        "",
        userList,
      ].join("\n"),
    });
  }

  // /auth <channel> <userId>
  const channelId = first;
  const userId = args.positional[1]?.trim();

  if (!userId) {
    return err({
      code: "INVALID_ARGUMENT",
      message:
        "Missing userId. Usage: /auth <channel> <userId>",
    });
  }

  const connCheck = checkDaemonConnected(context);
  if (!connCheck.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: connCheck.message,
    });
  }

  const baseUrl = await resolveChannelBaseUrl(context);
  const result = await callDaemonAuthApi<AuthAddResponse>(
    "/auth/add",
    { channelId, userId },
    10_000,
    fetch,
    baseUrl,
  );

  if (!result.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Failed to authorize user: ${result.error}`,
    });
  }

  return ok({
    statusMessage:
      `User ${userId} authorized for ${channelId}`,
    responseText: [
      `**User authorized for ${channelId}.**`,
      "",
      `User \`${userId}\` can now message the bot.`,
      `Use \`/auth list ${channelId}\` to see all ` +
        "authorized users.",
    ].join("\n"),
  });
};

// ---------------------------------------------------------------------------
// /deauth handler
// ---------------------------------------------------------------------------

export const handleDeauthCommand: CommandHandler = async (
  args,
  context,
) => {
  const channelId = args.positional[0]?.trim().toLowerCase();

  // No args → show help
  if (!channelId) {
    return ok({
      statusMessage: "Deauth usage",
      responseText: [
        "**Deauth Usage:**",
        "",
        "  /deauth <channel> <userId>  Remove an authorized user",
        "",
        "**Example:** /deauth telegram 123456789",
      ].join("\n"),
    });
  }

  const userId = args.positional[1]?.trim();
  if (!userId) {
    return err({
      code: "INVALID_ARGUMENT",
      message:
        "Missing userId. Usage: /deauth <channel> <userId>",
    });
  }

  const connCheck = checkDaemonConnected(context);
  if (!connCheck.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: connCheck.message,
    });
  }

  const baseUrl = await resolveChannelBaseUrl(context);
  const result = await callDaemonAuthApi<AuthRemoveResponse>(
    "/auth/remove",
    { channelId, userId },
    10_000,
    fetch,
    baseUrl,
  );

  if (!result.ok) {
    const isNotFound =
      result.error.toLowerCase().includes("not found") ||
      result.error.toLowerCase().includes("404");

    return err({
      code: isNotFound ? "NOT_FOUND" : "INVALID_ARGUMENT",
      message: isNotFound
        ? `User \`${userId}\` is not in the allow-list ` +
          `for ${channelId}.`
        : `Failed to deauthorize user: ${result.error}`,
    });
  }

  return ok({
    statusMessage:
      `User ${userId} removed from ${channelId}`,
    responseText: [
      `**User deauthorized from ${channelId}.**`,
      "",
      `User \`${userId}\` has been removed. Their next ` +
        "message will be rejected.",
      `Use \`/auth ${channelId} ${userId}\` to re-authorize.`,
    ].join("\n"),
  });
};
