export type SlashCommandCategory = "conversation" | "model" | "appearance" | "environment" | "system" | "memory";

export type SlashCommandHandlerKey =
  | "HELP"
  | "SWITCH_MODEL"
  | "SWITCH_THEME"
  | "SWITCH_ENVIRONMENT"
  | "CONNECT_PROVIDER"
  | "SHOW_STATUS"
  | "NEW_CONVERSATION"
  | "CLEAR_CONVERSATION"
  | "EXPORT_CONVERSATION"
  | "TOGGLE_COMPACT_MODE"
  | "OPEN_SETTINGS"
  | "SEARCH_SETTINGS"
  | "QUIT_TUI"
  | "REMEMBER"
  | "MEMORY"
  | "MEMORY_SETUP"
  | "DAEMON"
  | "CHANNELS"
  | "SETUP"
  | "TOGGLE_THINKING"
  | "INTEGRATIONS"
  | "SKILLS"
  | "BRIEFING"
  | "NUDGES"
  | "TASKS"
  | "BROWSER"
  | "SCHEDULE"
  | "IMPORT_MEMORIES"
  | "EXPORT_PERSONA";

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
    name: "env",
    aliases: Object.freeze(["environment"]),
    description: "Switch or list environments.",
    usage: "/env [name]",
    category: "environment",
    handlerKey: "SWITCH_ENVIRONMENT",
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
    name: "search-settings",
    aliases: Object.freeze(["ss"]),
    description: "Configure web search provider and API keys.",
    usage: "/search-settings",
    category: "system",
    handlerKey: "SEARCH_SETTINGS",
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
    description: "List, inspect, or search memory entries.",
    usage: "/memory <list|show|search> [options]",
    category: "memory",
    handlerKey: "MEMORY",
  }),
  Object.freeze({
    name: "daemon",
    aliases: Object.freeze(["d"]),
    description: "Manage daemon connections and profiles.",
    usage: "/daemon [add|switch|remove|status|token] [options]",
    category: "system",
    handlerKey: "DAEMON",
  }),
  Object.freeze({
    name: "channels",
    aliases: Object.freeze(["ch"]),
    description: "Manage external chat channel integrations.",
    usage: "/channels [add|remove|enable|disable|status] [platform]",
    category: "system",
    handlerKey: "CHANNELS",
  }),
  Object.freeze({
    name: "setup",
    aliases: Object.freeze(["onboarding", "personality"]),
    description: "Re-run the onboarding setup wizard.",
    usage: "/setup [reset-onboarding]",
    category: "system",
    handlerKey: "SETUP",
  }),
  Object.freeze({
    name: "thinking",
    aliases: Object.freeze([]),
    description: "Toggle visibility of thinking blocks.",
    usage: "/thinking",
    category: "appearance",
    handlerKey: "TOGGLE_THINKING",
  }),
  Object.freeze({
    name: "integrations",
    aliases: Object.freeze(["int"]),
    description: "Manage external service integrations.",
    usage: "/integrations",
    category: "system",
    handlerKey: "INTEGRATIONS",
  }),
  Object.freeze({
    name: "skills",
    aliases: Object.freeze(["sk"]),
    description: "Manage agent skills and capabilities.",
    usage: "/skills",
    category: "system",
    handlerKey: "SKILLS",
  }),
  Object.freeze({
    name: "briefing",
    aliases: Object.freeze([]),
    description: "Trigger an immediate morning briefing.",
    usage: "/briefing",
    category: "system",
    handlerKey: "BRIEFING",
  }),
  Object.freeze({
    name: "nudges",
    aliases: Object.freeze([]),
    description: "Toggle nudge injection on or off.",
    usage: "/nudges [on|off]",
    category: "system",
    handlerKey: "NUDGES",
  }),
  Object.freeze({
    name: "tasks",
    aliases: Object.freeze(["bg"]),
    description: "Manage background tasks: list, cancel, or retry.",
    usage: "/tasks [list|cancel|retry] [id]",
    category: "system",
    handlerKey: "TASKS",
  }),
  Object.freeze({
    name: "browser",
    aliases: Object.freeze(["br"]),
    description: "Control the browser — navigate, screenshot, and monitor pages.",
    usage: "/browser [headed | screenshot | close]",
    category: "system",
    handlerKey: "BROWSER",
  }),
  Object.freeze({
    name: "schedule",
    aliases: Object.freeze(["sched"]),
    description: "View and manage scheduled tasks and reminders.",
    usage: "/schedule",
    category: "system",
    handlerKey: "SCHEDULE",
  }),
  Object.freeze({
    name: "import-memories",
    aliases: Object.freeze(["import-mem"]),
    description: "Import memories from a JSON file or a directory of Markdown files.",
    usage: "/import-memories <path>",
    category: "memory",
    handlerKey: "IMPORT_MEMORIES",
  }),
  Object.freeze({
    name: "export-persona",
    aliases: Object.freeze([]),
    description: "Export the active persona (PERSONA.yaml + PERSONALITY.md) as a zip archive.",
    usage: "/export-persona [output-path]",
    category: "environment",
    handlerKey: "EXPORT_PERSONA",
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
  Object.freeze({
    id: "action:open-integrations",
    label: "Integrations",
    description: "Manage external service integrations.",
    category: "panels",
    shortcutHint: "Ctrl+I",
    keywords: Object.freeze(["integrations", "services", "obsidian", "vault", "connect"]),
    actionKey: "open-integrations",
  }),
  Object.freeze({
    id: "action:open-skills",
    label: "Skills",
    description: "Manage agent skills and capabilities.",
    category: "panels",
    shortcutHint: "Ctrl+L",
    keywords: Object.freeze(["skills", "agent", "capabilities", "plugins", "tools"]),
    actionKey: "open-skills",
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
  // Setup
  Object.freeze({
    id: "action:rerun-setup",
    label: "Re-run setup",
    description: "Reset onboarding and re-run the setup wizard.",
    category: "settings",
    keywords: Object.freeze(["setup", "settings", "onboarding", "reset", "rerun", "re-run", "wizard", "reconfigure"]),
    actionKey: "rerun-setup",
  }),
  // Proactive Intelligence
  Object.freeze({
    id: "action:trigger-briefing",
    label: "Trigger Briefing",
    description: "Generate and deliver an immediate morning briefing.",
    category: "actions",
    keywords: Object.freeze(["briefing", "morning", "summary", "daily", "report"]),
    actionKey: "trigger-briefing",
  }),
  Object.freeze({
    id: "action:nudges-on",
    label: "Enable Nudges",
    description: "Turn on nudge injection in conversations.",
    category: "settings",
    keywords: Object.freeze(["nudges", "nudge", "enable", "on", "proactive", "suggestions"]),
    actionKey: "nudges-on",
  }),
  Object.freeze({
    id: "action:nudges-off",
    label: "Disable Nudges",
    description: "Turn off nudge injection in conversations.",
    category: "settings",
    keywords: Object.freeze(["nudges", "nudge", "disable", "off", "proactive", "suggestions"]),
    actionKey: "nudges-off",
  }),
  // Background Tasks
  Object.freeze({
    id: "action:tasks-list",
    label: "List Background Tasks",
    description: "Show all background tasks with their status.",
    category: "actions",
    keywords: Object.freeze(["tasks", "background", "list", "queue", "jobs", "status"]),
    actionKey: "tasks-list",
  }),
  Object.freeze({
    id: "action:tasks-cancel",
    label: "Cancel Background Task",
    description: "Cancel a running background task.",
    category: "actions",
    keywords: Object.freeze(["tasks", "background", "cancel", "stop", "abort", "kill"]),
    actionKey: "tasks-cancel",
  }),
  Object.freeze({
    id: "action:tasks-retry",
    label: "Retry Failed Task",
    description: "Re-enqueue a failed background task.",
    category: "actions",
    keywords: Object.freeze(["tasks", "background", "retry", "rerun", "failed", "redo"]),
    actionKey: "tasks-retry",
  }),
]);

export const PALETTE_ACTIONS: readonly PaletteActionDefinition[] = PALETTE_ACTION_DEFINITIONS;
