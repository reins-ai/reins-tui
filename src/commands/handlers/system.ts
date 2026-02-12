import { err, ok } from "../../daemon/contracts";
import { getSlashCommandByNameOrAlias, type SlashCommandCategory, type SlashCommandDefinition } from "../registry";
import type { CommandHandler } from "./types";

const CATEGORY_ORDER: readonly SlashCommandCategory[] = ["conversation", "model", "appearance", "system"];

function capitalizeCategory(category: SlashCommandCategory): string {
  return category.slice(0, 1).toUpperCase() + category.slice(1);
}

function formatCommand(command: SlashCommandDefinition): string {
  const aliases = command.aliases.length > 0 ? ` (aliases: ${command.aliases.map((alias) => `/${alias}`).join(", ")})` : "";
  return `${command.usage} - ${command.description}${aliases}`;
}

function formatCommandGroup(category: SlashCommandCategory, commands: readonly SlashCommandDefinition[]): string {
  const lines = commands.map((command) => `- ${formatCommand(command)}`);
  return [`${capitalizeCategory(category)}:`, ...lines].join("\n");
}

function formatHelp(catalog: readonly SlashCommandDefinition[]): string {
  const chunks: string[] = ["Slash commands:"];

  for (const category of CATEGORY_ORDER) {
    const grouped = catalog.filter((command) => command.category === category);
    if (grouped.length === 0) {
      continue;
    }

    chunks.push("", formatCommandGroup(category, grouped));
  }

  return chunks.join("\n");
}

export const handleHelpCommand: CommandHandler = (args, context) => {
  const requestedCommand = args.positional[0]?.trim();

  if (requestedCommand) {
    const command = getSlashCommandByNameOrAlias(requestedCommand);
    if (!command) {
      return err({
        code: "NOT_FOUND",
        message: `Unknown command '${requestedCommand}'.`,
      });
    }

    return ok({
      statusMessage: `Help: /${command.name}`,
      responseText: formatCommand(command),
    });
  }

  return ok({
    statusMessage: "Listed slash commands",
    responseText: formatHelp(context.catalog),
  });
};

export const handleCompactCommand: CommandHandler = (args, context) => {
  const explicitValue = args.positional[0]?.trim().toLowerCase();
  let nextCompactMode: boolean;

  if (!explicitValue) {
    nextCompactMode = !context.view.compactMode;
  } else if (explicitValue === "on") {
    nextCompactMode = true;
  } else if (explicitValue === "off") {
    nextCompactMode = false;
  } else {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Invalid compact mode value. Use '/compact', '/compact on', or '/compact off'.",
    });
  }

  context.view.setCompactMode(nextCompactMode);

  return ok({
    statusMessage: `Compact mode ${nextCompactMode ? "enabled" : "disabled"}`,
    responseText: `Compact rendering mode is now ${nextCompactMode ? "on" : "off"}.`,
  });
};

export const handleSettingsCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Settings UI is not available yet",
    responseText: "Settings will be interactive in a later wave.",
    signals: [{ type: "OPEN_SETTINGS" }],
  });
};

export const handleStatusCommand: CommandHandler = (_args, context) => {
  const daemonStatus = context.daemonClient?.getConnectionState().status ?? "disconnected";
  const conversationId = context.session.activeConversationId ?? "none";

  return ok({
    statusMessage: `Daemon ${daemonStatus}`,
    responseText: [
      `Daemon: ${daemonStatus}`,
      `Model: ${context.model.currentModel}`,
      `Active conversation: ${conversationId}`,
      `Messages: ${context.session.messages.length}`,
    ].join("\n"),
  });
};

export const handleQuitCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Quitting Reins TUI",
    signals: [{ type: "QUIT_TUI" }],
  });
};
