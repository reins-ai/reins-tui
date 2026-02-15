import { err, ok } from "../../daemon/contracts";
import { getActiveDaemonUrl } from "../../daemon/actions";
import type { CommandHandler } from "./types";

const CHANNELS_SUBCOMMANDS = ["add", "remove", "enable", "disable", "status"] as const;
type ChannelsSubcommand = (typeof CHANNELS_SUBCOMMANDS)[number];

const SUPPORTED_PLATFORMS = ["telegram", "discord"] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

// ---------------------------------------------------------------------------
// Channel status types (mirrors daemon ChannelHealthStatus)
// ---------------------------------------------------------------------------

export interface ChannelHealthStatus {
  channelId: string;
  platform: string;
  enabled: boolean;
  state: "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
  uptimeMs: number;
  healthy: boolean;
  lastError?: string;
  lastMessageAt?: string;
  checkedAt: string;
}

interface ChannelStatusSummary {
  total: number;
  enabled: number;
  healthy: number;
  unhealthy: number;
}

interface ChannelStatusSnapshot {
  channels: ChannelHealthStatus[];
  summary: ChannelStatusSummary;
}

function isChannelsSubcommand(value: string): value is ChannelsSubcommand {
  return CHANNELS_SUBCOMMANDS.includes(value as ChannelsSubcommand);
}

function isSupportedPlatform(value: string): value is SupportedPlatform {
  return SUPPORTED_PLATFORMS.includes(value as SupportedPlatform);
}

/**
 * Mask a bot token for safe display. Shows only the first 4 and last 4
 * characters, replacing the middle with asterisks.
 */
export function maskBotToken(token: string): string {
  if (token.length <= 10) {
    return "****";
  }
  return `${token.slice(0, 4)}${"*".repeat(Math.min(token.length - 8, 16))}${token.slice(-4)}`;
}

interface DaemonChannelResponse {
  channel?: {
    channelId: string;
    platform: string;
    enabled: boolean;
    state: string;
    healthy: boolean;
  };
  removed?: boolean;
  channelId?: string;
  error?: string;
}

/**
 * Call a daemon channel management endpoint.
 *
 * Returns the parsed JSON response on success, or an error message string
 * on failure (network error, non-2xx status, or daemon error field).
 */
export async function callDaemonChannelApi(
  endpoint: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; data: DaemonChannelResponse } | { ok: false; error: string }> {
  const baseUrl = await getActiveDaemonUrl();

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "Request timed out. Is the daemon running?" };
    }
    if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("connect"))) {
      return { ok: false, error: "Unable to reach daemon. Is it running on the configured address?" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Daemon request failed: ${message}` };
  }

  let data: DaemonChannelResponse;
  try {
    data = (await response.json()) as DaemonChannelResponse;
  } catch {
    return { ok: false, error: `Daemon returned invalid response (HTTP ${response.status})` };
  }

  if (!response.ok) {
    return { ok: false, error: data.error ?? `Daemon returned HTTP ${response.status}` };
  }

  return { ok: true, data };
}

/**
 * Call a daemon channel GET endpoint (e.g. /channels/status).
 *
 * Returns the parsed JSON response on success, or an error message string
 * on failure (network error, non-2xx status, or daemon error field).
 */
export async function callDaemonChannelGet<T>(
  endpoint: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const baseUrl = await getActiveDaemonUrl();

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${endpoint}`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "Request timed out. Is the daemon running?" };
    }
    if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("connect"))) {
      return { ok: false, error: "Unable to reach daemon. Is it running on the configured address?" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Daemon request failed: ${message}` };
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    return { ok: false, error: `Daemon returned invalid response (HTTP ${response.status})` };
  }

  if (!response.ok) {
    const errorData = data as unknown as { error?: string };
    return { ok: false, error: errorData.error ?? `Daemon returned HTTP ${response.status}` };
  }

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Status display formatting
// ---------------------------------------------------------------------------

const COLOR_GREEN = "\x1b[32m";
const COLOR_RED = "\x1b[31m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_DIM = "\x1b[2m";
const COLOR_RESET = "\x1b[0m";

/**
 * Return a color-coded status indicator for a channel state.
 *
 * - connected  → green
 * - error      → red
 * - all others → yellow (disconnected, connecting, reconnecting)
 */
export function formatStatusIndicator(state: ChannelHealthStatus["state"]): string {
  switch (state) {
    case "connected":
      return `${COLOR_GREEN}● connected${COLOR_RESET}`;
    case "error":
      return `${COLOR_RED}● error${COLOR_RESET}`;
    case "disconnected":
      return `${COLOR_YELLOW}● disconnected${COLOR_RESET}`;
    case "connecting":
      return `${COLOR_YELLOW}● connecting${COLOR_RESET}`;
    case "reconnecting":
      return `${COLOR_YELLOW}● reconnecting${COLOR_RESET}`;
    default:
      return `${COLOR_DIM}● unknown${COLOR_RESET}`;
  }
}

/**
 * Format a relative time string from an ISO timestamp.
 * Returns a human-readable "X ago" string, or a dim dash if no timestamp.
 */
export function formatRelativeTime(isoTimestamp: string | undefined, nowMs?: number): string {
  if (!isoTimestamp) {
    return `${COLOR_DIM}—${COLOR_RESET}`;
  }

  const now = nowMs ?? Date.now();
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) {
    return `${COLOR_DIM}—${COLOR_RESET}`;
  }

  const diffMs = now - then;
  if (diffMs < 0) {
    return "just now";
  }

  const seconds = Math.floor(diffMs / 1_000);
  if (seconds < 60) {
    return seconds <= 1 ? "just now" : `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Pad a string to a fixed width, truncating with ellipsis if too long.
 */
function padColumn(value: string, width: number): string {
  // Strip ANSI codes for length calculation
  const stripped = value.replace(/\x1b\[[0-9;]*m/g, "");
  if (stripped.length > width) {
    return value.slice(0, width - 1) + "…";
  }
  const padding = width - stripped.length;
  return value + " ".repeat(padding);
}

/**
 * Format the full channel status table from a status snapshot.
 *
 * Produces a human-readable table with color-coded status indicators,
 * or a helpful empty-state message when no channels are configured.
 */
export function formatChannelStatusTable(snapshot: ChannelStatusSnapshot, nowMs?: number): string {
  const { channels, summary } = snapshot;

  if (channels.length === 0) {
    return [
      "**No channels configured.**",
      "",
      "Add a channel to get started:",
      "  /channels add telegram <bot-token>",
      "  /channels add discord <bot-token>",
      "",
      `Supported platforms: ${SUPPORTED_PLATFORMS.join(", ")}`,
    ].join("\n");
  }

  // Column widths
  const colPlatform = 12;
  const colStatus = 24; // wider to accommodate ANSI codes
  const colEnabled = 10;
  const colActivity = 14;

  const header = [
    padColumn("Platform", colPlatform),
    padColumn("Status", colStatus),
    padColumn("Enabled", colEnabled),
    padColumn("Last Activity", colActivity),
  ].join("  ");

  const separator = [
    "─".repeat(colPlatform),
    "─".repeat(colStatus - 8), // ANSI codes add ~8 chars
    "─".repeat(colEnabled),
    "─".repeat(colActivity),
  ].join("  ");

  const rows = channels.map((ch) => {
    const platform = padColumn(capitalize(ch.platform), colPlatform);
    const status = padColumn(formatStatusIndicator(ch.state), colStatus);
    const enabled = padColumn(ch.enabled ? "Yes" : "No", colEnabled);
    const activity = padColumn(formatRelativeTime(ch.lastMessageAt, nowMs), colActivity);
    return `${platform}  ${status}  ${enabled}  ${activity}`;
  });

  const summaryLine = [
    "",
    `${COLOR_DIM}${summary.total} channel${summary.total === 1 ? "" : "s"}`,
    `${summary.enabled} enabled`,
    `${summary.healthy} healthy`,
    summary.unhealthy > 0
      ? `${COLOR_RED}${summary.unhealthy} unhealthy${COLOR_RESET}${COLOR_DIM}`
      : `${summary.unhealthy} unhealthy`,
    `${COLOR_RESET}`,
  ].join(" · ");

  return [
    "**Channel Status**",
    "",
    header,
    separator,
    ...rows,
    summaryLine,
  ].join("\n");
}

const handleChannelsAdd: CommandHandler = async (args) => {
  const platform = args.positional[1]?.trim().toLowerCase();

  if (!platform) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing platform. Usage: /channels add <telegram|discord> <bot-token>",
    });
  }

  if (!isSupportedPlatform(platform)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unsupported platform '${platform}'. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
    });
  }

  const token = (typeof args.flags.token === "string" ? args.flags.token : args.positional[2]) ?? "";
  if (token.trim().length === 0) {
    return err({
      code: "INVALID_ARGUMENT",
      message: [
        `Missing bot token. Usage: /channels add ${platform} <bot-token>`,
        "",
        "You can also use: /channels add " + platform + " --token=<bot-token>",
        "",
        `To get a bot token:`,
        platform === "telegram"
          ? "  1. Message @BotFather on Telegram\n  2. Use /newbot to create a bot\n  3. Copy the bot token"
          : "  1. Go to https://discord.com/developers/applications\n  2. Create a new application and add a bot\n  3. Copy the bot token",
      ].join("\n"),
    });
  }

  const result = await callDaemonChannelApi("/channels/add", {
    platform,
    token: token.trim(),
  });

  if (!result.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Failed to add ${platform} channel: ${result.error}`,
    });
  }

  const masked = maskBotToken(token.trim());
  const state = result.data.channel?.state ?? "unknown";

  return ok({
    statusMessage: `${capitalize(platform)} channel added`,
    responseText: [
      `**${capitalize(platform)} channel configured successfully.**`,
      "",
      `Token: ${masked}`,
      `Status: ${state}`,
      "",
      `Use \`/channels status\` to check connection state.`,
      `Use \`/channels disable ${platform}\` to pause the channel.`,
    ].join("\n"),
  });
};

const handleChannelsRemove: CommandHandler = async (args) => {
  const platform = args.positional[1]?.trim().toLowerCase();

  if (!platform) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing platform. Usage: /channels remove <telegram|discord>",
    });
  }

  if (!isSupportedPlatform(platform)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unsupported platform '${platform}'. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
    });
  }

  const result = await callDaemonChannelApi("/channels/remove", {
    channelId: platform,
  });

  if (!result.ok) {
    return err({
      code: "NOT_FOUND",
      message: `Failed to remove ${platform} channel: ${result.error}`,
    });
  }

  return ok({
    statusMessage: `${capitalize(platform)} channel removed`,
    responseText: [
      `**${capitalize(platform)} channel removed.**`,
      "",
      "The bot token has been deleted and the connection has been closed.",
      `Use \`/channels add ${platform}\` to reconfigure.`,
    ].join("\n"),
  });
};

const handleChannelsEnable: CommandHandler = async (args) => {
  const platform = args.positional[1]?.trim().toLowerCase();

  if (!platform) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing platform. Usage: /channels enable <telegram|discord>",
    });
  }

  if (!isSupportedPlatform(platform)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unsupported platform '${platform}'. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
    });
  }

  const result = await callDaemonChannelApi("/channels/enable", {
    channelId: platform,
  });

  if (!result.ok) {
    return err({
      code: "NOT_FOUND",
      message: `Failed to enable ${platform} channel: ${result.error}`,
    });
  }

  const state = result.data.channel?.state ?? "unknown";

  return ok({
    statusMessage: `${capitalize(platform)} channel enabled`,
    responseText: `**${capitalize(platform)} channel enabled.** Status: ${state}`,
  });
};

const handleChannelsDisable: CommandHandler = async (args) => {
  const platform = args.positional[1]?.trim().toLowerCase();

  if (!platform) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing platform. Usage: /channels disable <telegram|discord>",
    });
  }

  if (!isSupportedPlatform(platform)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unsupported platform '${platform}'. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
    });
  }

  const result = await callDaemonChannelApi("/channels/disable", {
    channelId: platform,
  });

  if (!result.ok) {
    return err({
      code: "NOT_FOUND",
      message: `Failed to disable ${platform} channel: ${result.error}`,
    });
  }

  return ok({
    statusMessage: `${capitalize(platform)} channel disabled`,
    responseText: [
      `**${capitalize(platform)} channel disabled.**`,
      "",
      "The channel connection has been paused. No messages will be sent or received.",
      `Use \`/channels enable ${platform}\` to resume.`,
    ].join("\n"),
  });
};

const handleChannelsStatus: CommandHandler = async () => {
  const result = await callDaemonChannelGet<ChannelStatusSnapshot>("/channels/status");

  if (!result.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Failed to fetch channel status: ${result.error}`,
    });
  }

  const table = formatChannelStatusTable(result.data);

  return ok({
    statusMessage: "Channel status",
    responseText: table,
  });
};

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const handleChannelsCommand: CommandHandler = (args, context) => {
  const subcommand = args.positional[0]?.trim().toLowerCase();

  if (!subcommand) {
    return ok({
      statusMessage: "Channels",
      responseText: [
        "**Channel Management Commands:**",
        "",
        "  /channels add <platform> <token>     Add a new chat channel",
        "  /channels remove <platform>          Remove a configured channel",
        "  /channels enable <platform>          Enable a channel",
        "  /channels disable <platform>         Disable a channel",
        "  /channels status                     Show all channel statuses",
        "",
        "**Supported platforms:** telegram, discord",
        "",
        "**Examples:**",
        "  /channels add telegram 123456789:ABC...",
        "  /channels status",
        "  /channels disable telegram",
        "",
        "**Alias:** /ch",
      ].join("\n"),
    });
  }

  if (!isChannelsSubcommand(subcommand)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unknown subcommand '${subcommand}'. Usage: /channels [${CHANNELS_SUBCOMMANDS.join("|")}]`,
    });
  }

  const subcommandHandlers: Record<ChannelsSubcommand, CommandHandler> = {
    add: handleChannelsAdd,
    remove: handleChannelsRemove,
    enable: handleChannelsEnable,
    disable: handleChannelsDisable,
    status: handleChannelsStatus,
  };

  return subcommandHandlers[subcommand](args, context);
};
