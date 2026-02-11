import { err, type Result } from "../../daemon/contracts";
import type { ParsedCommand } from "../parser";
import type { SlashCommandHandlerKey } from "../registry";
import { handleConnectCommand } from "./connect";
import { handleModelCommand } from "./model";
import {
  handleClearConversationCommand,
  handleExportConversationCommand,
  handleNewConversationCommand,
} from "./session";
import { handleCompactCommand, handleHelpCommand, handleQuitCommand, handleSettingsCommand } from "./system";
import { handleThemeCommand } from "./theme";
import type { CommandError, CommandHandler, CommandHandlerContext, CommandResult } from "./types";

const HANDLER_MAP: Record<SlashCommandHandlerKey, CommandHandler> = {
  HELP: handleHelpCommand,
  SWITCH_MODEL: handleModelCommand,
  SWITCH_THEME: handleThemeCommand,
  CONNECT_PROVIDER: handleConnectCommand,
  NEW_CONVERSATION: handleNewConversationCommand,
  CLEAR_CONVERSATION: handleClearConversationCommand,
  EXPORT_CONVERSATION: handleExportConversationCommand,
  TOGGLE_COMPACT_MODE: handleCompactCommand,
  OPEN_SETTINGS: handleSettingsCommand,
  QUIT_TUI: handleQuitCommand,
};

export function dispatchCommand(
  parsedCommand: ParsedCommand,
  context: CommandHandlerContext,
): Result<CommandResult, CommandError> {
  const handler = HANDLER_MAP[parsedCommand.command.handlerKey];
  if (!handler) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: `No handler registered for ${parsedCommand.command.handlerKey}.`,
    });
  }

  return handler(parsedCommand.args, context);
}

export type { CommandError, CommandHandlerContext, CommandResult, CommandSignal, CommandSignalType } from "./types";
