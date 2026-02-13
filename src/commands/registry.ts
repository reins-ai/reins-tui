export type SlashCommandCategory = "conversation" | "model" | "appearance" | "system" | "memory";

export type SlashCommandHandlerKey =
  | "HELP"
  | "SWITCH_MODEL"
  | "SWITCH_THEME"
  | "CONNECT_PROVIDER"
  | "SHOW_STATUS"
  | "NEW_CONVERSATION"
  | "CLEAR_CONVERSATION"
  | "EXPORT_CONVERSATION"
  | "TOGGLE_COMPACT_MODE"
  | "OPEN_SETTINGS"
  | "QUIT_TUI"
  | "REMEMBER"
  | "MEMORY";

export interface SlashCommandDefinition {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly usage: string;
  readonly category: SlashCommandCategory;
  readonly handlerKey: SlashCommandHandlerKey;
}

export type PaletteActionCategory = "actions" | "conversations" | "commands" | "panels" | "settings";

export interface PaletteActionDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: PaletteActionCategory;
  readonly shortcutHint?: string;
  readonly keywords: readonly string[];
  readonly actionKey: string;
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
    name: "status",
    aliases: Object.freeze(["st"]),
    description: "Show daemon and session status.",
    usage: "/status",
    category: "system",
    handlerKey: "SHOW_STATUS",
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
  Object.freeze({
    name: "remember",
    aliases: Object.freeze(["rem"]),
    description: "Save an explicit memory entry.",
    usage: "/remember [--type fact|preference|decision|note] [--tags a,b] <text>",
    category: "memory",
    handlerKey: "REMEMBER",
  }),
  Object.freeze({
    name: "memory",
    aliases: Object.freeze(["mem"]),
    description: "List or inspect memory entries.",
    usage: "/memory <list|show> [options]",
    category: "memory",
    handlerKey: "MEMORY",
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

const PALETTE_ACTION_DEFINITIONS: readonly PaletteActionDefinition[] = Object.freeze([
  // Conversations
  Object.freeze({
    id: "action:new-chat",
    label: "New Chat",
    description: "Start a new conversation.",
    category: "actions",
    shortcutHint: "Ctrl+N",
    keywords: Object.freeze(["new", "chat", "conversation", "create"]),
    actionKey: "new-chat",
  }),
  Object.freeze({
    id: "action:switch-conversation",
    label: "Switch Conversation",
    description: "Jump to another conversation.",
    category: "conversations",
    keywords: Object.freeze(["switch", "conversation", "jump", "open", "chat"]),
    actionKey: "switch-conversation",
  }),
  Object.freeze({
    id: "action:search-conversations",
    label: "Search Conversations",
    description: "Find a conversation by title or content.",
    category: "conversations",
    keywords: Object.freeze(["search", "find", "conversation", "filter"]),
    actionKey: "search-conversations",
  }),
  // Model/Provider
  Object.freeze({
    id: "action:switch-model",
    label: "Switch Model",
    description: "Open the model selector.",
    category: "actions",
    shortcutHint: "Ctrl+M",
    keywords: Object.freeze(["model", "switch", "provider", "ai", "llm"]),
    actionKey: "switch-model",
  }),
  // Theme
  Object.freeze({
    id: "action:switch-theme",
    label: "Switch Theme",
    description: "Change the visual theme.",
    category: "actions",
    keywords: Object.freeze(["theme", "appearance", "dark", "light", "tokyonight"]),
    actionKey: "switch-theme",
  }),
  // Panels
  Object.freeze({
    id: "action:toggle-drawer",
    label: "Toggle Drawer",
    description: "Show or hide the conversation drawer.",
    category: "panels",
    shortcutHint: "Ctrl+1",
    keywords: Object.freeze(["drawer", "sidebar", "panel", "conversations"]),
    actionKey: "toggle-drawer",
  }),
  Object.freeze({
    id: "action:toggle-today",
    label: "Toggle Today Panel",
    description: "Show or hide the today panel.",
    category: "panels",
    shortcutHint: "Ctrl+2",
    keywords: Object.freeze(["today", "panel", "activity", "summary"]),
    actionKey: "toggle-today",
  }),
  // Settings/Help
  Object.freeze({
    id: "action:open-help",
    label: "Open Help",
    description: "Show keyboard shortcuts and help.",
    category: "settings",
    shortcutHint: "?",
    keywords: Object.freeze(["help", "shortcuts", "keyboard", "guide"]),
    actionKey: "open-help",
  }),
  Object.freeze({
    id: "action:open-settings",
    label: "Open Settings",
    description: "Open application settings.",
    category: "settings",
    keywords: Object.freeze(["settings", "preferences", "config", "options"]),
    actionKey: "open-settings",
  }),
  // General
  Object.freeze({
    id: "action:clear-chat",
    label: "Clear Chat",
    description: "Clear the current conversation messages.",
    category: "actions",
    keywords: Object.freeze(["clear", "chat", "messages", "reset"]),
    actionKey: "clear-chat",
  }),
  Object.freeze({
    id: "action:copy-last-response",
    label: "Copy Last Response",
    description: "Copy the last assistant response to clipboard.",
    category: "actions",
    keywords: Object.freeze(["copy", "response", "clipboard", "last"]),
    actionKey: "copy-last-response",
  }),
]);

export const PALETTE_ACTIONS: readonly PaletteActionDefinition[] = PALETTE_ACTION_DEFINITIONS;
