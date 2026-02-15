import { err, ok } from "../../daemon/contracts";
import { getActiveDaemonUrl } from "../../daemon/actions";
import type { CommandHandler } from "./types";

const CHANNELS_SUBCOMMANDS = ["add", "remove", "enable", "disable", "status"] as const;
type ChannelsSubcommand = (typeof CHANNELS_SUBCOMMANDS)[number];

const SUPPORTED_PLATFORMS = ["telegram", "discord"] as const;
type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

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

const handleChannelsStatus: CommandHandler = () => {
  return ok({
    statusMessage: "Channel status",
    responseText: "Channel status display is not yet implemented.",
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
        "# Channel Management",
        "",
        "Manage external chat channel integrations (Telegram, Discord).",
        "",
        "**Subcommands:**",
        "  /channels add <platform> <token>  — Add and configure a channel",
        "  /channels remove <platform>       — Remove a configured channel",
        "  /channels enable <platform>       — Enable a channel",
        "  /channels disable <platform>      — Disable a channel",
        "  /channels status                  — Show all channels and connection state",
        "",
        "**Supported platforms:** telegram, discord",
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
