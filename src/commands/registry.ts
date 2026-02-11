export type SlashCommandCategory = "conversation" | "model" | "appearance" | "system";

export type SlashCommandHandlerKey =
  | "HELP"
  | "SWITCH_MODEL"
  | "SWITCH_THEME"
  | "CONNECT_PROVIDER"
  | "NEW_CONVERSATION"
  | "CLEAR_CONVERSATION"
  | "EXPORT_CONVERSATION"
  | "TOGGLE_COMPACT_MODE"
  | "OPEN_SETTINGS"
  | "QUIT_TUI";

export interface SlashCommandDefinition {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly usage: string;
  readonly category: SlashCommandCategory;
  readonly handlerKey: SlashCommandHandlerKey;
}

const COMMAND_DEFINITIONS: readonly SlashCommandDefinition[] = Object.freeze([
  Object.freeze({
    name: "help",
    aliases: Object.freeze(["h"]),
    description: "List available commands and their usage.",
    usage: "/help [command]",
    category: "system",
    handlerKey: "HELP",
  }),
  Object.freeze({
    name: "model",
    aliases: Object.freeze(["m"]),
    description: "Switch the active model.",
    usage: "/model <model-name>",
    category: "model",
    handlerKey: "SWITCH_MODEL",
  }),
  Object.freeze({
    name: "theme",
    aliases: Object.freeze(["t"]),
    description: "Switch the active theme.",
    usage: "/theme <theme-name>",
    category: "appearance",
    handlerKey: "SWITCH_THEME",
  }),
  Object.freeze({
    name: "connect",
    aliases: Object.freeze(["provider"]),
    description: "Open provider setup flow.",
    usage: "/connect",
    category: "system",
    handlerKey: "CONNECT_PROVIDER",
  }),
  Object.freeze({
    name: "new",
    aliases: Object.freeze(["n"]),
    description: "Start a new conversation.",
    usage: "/new",
    category: "conversation",
    handlerKey: "NEW_CONVERSATION",
  }),
  Object.freeze({
    name: "clear",
    aliases: Object.freeze(["cls"]),
    description: "Clear the current conversation.",
    usage: "/clear",
    category: "conversation",
    handlerKey: "CLEAR_CONVERSATION",
  }),
  Object.freeze({
    name: "export",
    aliases: Object.freeze(["save"]),
    description: "Export the current conversation.",
    usage: "/export [path]",
    category: "conversation",
    handlerKey: "EXPORT_CONVERSATION",
  }),
  Object.freeze({
    name: "compact",
    aliases: Object.freeze(["dense"]),
    description: "Toggle compact rendering mode.",
    usage: "/compact [on|off]",
    category: "appearance",
    handlerKey: "TOGGLE_COMPACT_MODE",
  }),
  Object.freeze({
    name: "settings",
    aliases: Object.freeze(["prefs"]),
    description: "Open settings.",
    usage: "/settings",
    category: "system",
    handlerKey: "OPEN_SETTINGS",
  }),
  Object.freeze({
    name: "quit",
    aliases: Object.freeze(["exit", "q"]),
    description: "Exit the TUI.",
    usage: "/quit",
    category: "system",
    handlerKey: "QUIT_TUI",
  }),
]);

const COMMAND_LOOKUP = new Map<string, SlashCommandDefinition>();

for (const command of COMMAND_DEFINITIONS) {
  COMMAND_LOOKUP.set(command.name.toLowerCase(), command);

  for (const alias of command.aliases) {
    COMMAND_LOOKUP.set(alias.toLowerCase(), command);
  }
}

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = COMMAND_DEFINITIONS;

export function getSlashCommandByNameOrAlias(nameOrAlias: string): SlashCommandDefinition | null {
  const normalized = nameOrAlias.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  return COMMAND_LOOKUP.get(normalized) ?? null;
}
