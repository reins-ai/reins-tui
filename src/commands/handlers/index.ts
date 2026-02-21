import { err, type Result } from "../../daemon/contracts";
import type { ParsedCommand } from "../parser";
import type { SlashCommandHandlerKey } from "../registry";
import { handleBrowserCommand } from "./browser";
import { handleExportPersonaCommand } from "./export-persona";
import { handleImportMemoriesCommand } from "./import-memories";
import { handleImportPersonaCommand } from "./import-persona";
import { handleScheduleCommand } from "./schedule";
import { handleChannelsCommand } from "./channels";
import { handleConnectCommand } from "./connect";
import { handleDaemonCommand } from "./daemon";
import { handleEnvironmentCommand } from "./environment";
import { handleIntegrationsCommand } from "./integrations";
import { handleSkillsCommand } from "./skills";
import { handleMemoryCommand, handleRememberCommand } from "./memory";
import { handleMemorySetupCommand } from "./memory-setup";
import { handleModelCommand } from "./model";
import { handleBriefingCommand, handleNudgesCommand } from "./proactive";
import { handleTasksCommand } from "./tasks";
import { handleSearchSettingsCommand } from "./search-settings";
import { handleSummariseCommand } from "./summarise";
import {
  handleClearConversationCommand,
  handleExportConversationCommand,
  handleNewConversationCommand,
} from "./session";
import { handleSetupCommand } from "./setup";
import { handleCompactCommand, handleHelpCommand, handleQuitCommand, handleSettingsCommand, handleStatusCommand } from "./system";
import { handleThemeCommand } from "./theme";
import { handleThinkingCommand } from "./thinking";
import type { CommandError, CommandHandler, CommandHandlerContext, CommandResult } from "./types";

const HANDLER_MAP: Record<SlashCommandHandlerKey, CommandHandler> = {
  HELP: handleHelpCommand,
  SWITCH_MODEL: handleModelCommand,
  SWITCH_THEME: handleThemeCommand,
  SWITCH_ENVIRONMENT: handleEnvironmentCommand,
  CONNECT_PROVIDER: handleConnectCommand,
  SHOW_STATUS: handleStatusCommand,
  NEW_CONVERSATION: handleNewConversationCommand,
  CLEAR_CONVERSATION: handleClearConversationCommand,
  EXPORT_CONVERSATION: handleExportConversationCommand,
  TOGGLE_COMPACT_MODE: handleCompactCommand,
  OPEN_SETTINGS: handleSettingsCommand,
  SEARCH_SETTINGS: handleSearchSettingsCommand,
  QUIT_TUI: handleQuitCommand,
  REMEMBER: handleRememberCommand,
  MEMORY: handleMemoryCommand,
  MEMORY_SETUP: handleMemorySetupCommand,
  DAEMON: handleDaemonCommand,
  CHANNELS: handleChannelsCommand,
  SETUP: handleSetupCommand,
  TOGGLE_THINKING: handleThinkingCommand,
  INTEGRATIONS: handleIntegrationsCommand,
  SKILLS: handleSkillsCommand,
  BRIEFING: handleBriefingCommand,
  NUDGES: handleNudgesCommand,
  TASKS: handleTasksCommand,
  BROWSER: handleBrowserCommand,
  SCHEDULE: handleScheduleCommand,
  IMPORT_MEMORIES: handleImportMemoriesCommand,
  EXPORT_PERSONA: handleExportPersonaCommand,
  IMPORT_PERSONA: handleImportPersonaCommand,
  SUMMARISE_CONTEXT: handleSummariseCommand,
};

export async function dispatchCommand(
  parsedCommand: ParsedCommand,
  context: CommandHandlerContext,
): Promise<Result<CommandResult, CommandError>> {
  const handler = HANDLER_MAP[parsedCommand.command.handlerKey];
  if (!handler) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: `No handler registered for ${parsedCommand.command.handlerKey}.`,
    });
  }

  return handler(parsedCommand.args, context);
}

export type {
  CommandError,
  CommandHandlerContext,
  CommandHandlerResult,
  CommandResult,
  CommandSignal,
  CommandSignalType,
  EnvironmentCommandContext,
  MemoryCommandContext,
  MemoryEntry,
  MemoryLayer,
  MemorySettingsManager,
  MemoryType,
} from "./types";
