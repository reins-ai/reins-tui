import { err, ok } from "../../daemon/contracts";
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

const handleChannelsAdd: CommandHandler = (_args) => {
  const platform = _args.positional[1]?.trim().toLowerCase();

  if (!platform) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing platform. Usage: /channels add <telegram|discord>",
    });
  }

  if (!isSupportedPlatform(platform)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unsupported platform '${platform}'. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
    });
  }

  return ok({
    statusMessage: `Add ${platform} channel`,
    responseText: `Channel add for '${platform}' is not yet implemented.`,
  });
};

const handleChannelsRemove: CommandHandler = (_args) => {
  const platform = _args.positional[1]?.trim().toLowerCase();

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

  return ok({
    statusMessage: `Remove ${platform} channel`,
    responseText: `Channel remove for '${platform}' is not yet implemented.`,
  });
};

const handleChannelsEnable: CommandHandler = (_args) => {
  const platform = _args.positional[1]?.trim().toLowerCase();

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

  return ok({
    statusMessage: `Enable ${platform} channel`,
    responseText: `Channel enable for '${platform}' is not yet implemented.`,
  });
};

const handleChannelsDisable: CommandHandler = (_args) => {
  const platform = _args.positional[1]?.trim().toLowerCase();

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

  return ok({
    statusMessage: `Disable ${platform} channel`,
    responseText: `Channel disable for '${platform}' is not yet implemented.`,
  });
};

const handleChannelsStatus: CommandHandler = () => {
  return ok({
    statusMessage: "Channel status",
    responseText: "Channel status display is not yet implemented.",
  });
};

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
        "  /channels add <platform>      — Add and configure a channel",
        "  /channels remove <platform>   — Remove a configured channel",
        "  /channels enable <platform>   — Enable a channel",
        "  /channels disable <platform>  — Disable a channel",
        "  /channels status              — Show all channels and connection state",
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
