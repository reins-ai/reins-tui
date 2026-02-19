/**
 * Declarative command specifications for every slash command.
 *
 * Each spec defines the argument tree that the completion engine walks
 * to generate context-aware suggestions.
 */

import type { CommandSpec } from "./schema";

// ---------------------------------------------------------------------------
// Simple commands (no arguments)
// ---------------------------------------------------------------------------

const NEW_SPEC: CommandSpec = {
  name: "new",
  aliases: ["n"],
  description: "Start a new conversation.",
  usage: "/new",
  root: [],
};

const CLEAR_SPEC: CommandSpec = {
  name: "clear",
  aliases: ["cls"],
  description: "Clear the current conversation.",
  usage: "/clear",
  root: [],
};

const CONNECT_SPEC: CommandSpec = {
  name: "connect",
  aliases: ["provider"],
  description: "Open provider setup flow.",
  usage: "/connect",
  root: [],
};

const STATUS_SPEC: CommandSpec = {
  name: "status",
  aliases: ["st"],
  description: "Show daemon and session status.",
  usage: "/status",
  root: [],
};

const SETTINGS_SPEC: CommandSpec = {
  name: "settings",
  aliases: ["prefs"],
  description: "Open settings.",
  usage: "/settings",
  root: [],
};

const SEARCH_SETTINGS_SPEC: CommandSpec = {
  name: "search-settings",
  aliases: ["ss"],
  description: "Configure web search provider and API keys.",
  usage: "/search-settings",
  root: [],
};

const QUIT_SPEC: CommandSpec = {
  name: "quit",
  aliases: ["exit", "q"],
  description: "Exit the TUI.",
  usage: "/quit",
  root: [],
};

const SETUP_SPEC: CommandSpec = {
  name: "setup",
  aliases: ["onboarding", "personality"],
  description: "Re-run the onboarding setup wizard.",
  usage: "/setup",
  root: [],
};

// ---------------------------------------------------------------------------
// Commands with simple arguments
// ---------------------------------------------------------------------------

const HELP_SPEC: CommandSpec = {
  name: "help",
  aliases: ["h"],
  description: "List available commands and their usage.",
  usage: "/help [command]",
  root: [
    {
      type: "argument",
      arg: {
        name: "command",
        kind: "dynamic-enum",
        providerId: "commands",
        optional: true,
        placeholder: "[command]",
        description: "Command name to get help for",
      },
    },
  ],
};

const MODEL_SPEC: CommandSpec = {
  name: "model",
  aliases: ["m"],
  description: "Switch the active model.",
  usage: "/model <model-name>",
  root: [
    {
      type: "argument",
      arg: {
        name: "model-name",
        kind: "dynamic-enum",
        providerId: "models",
        placeholder: "<model-name>",
        description: "Model to activate",
      },
    },
  ],
};

const THEME_SPEC: CommandSpec = {
  name: "theme",
  aliases: ["t"],
  description: "Switch the active theme.",
  usage: "/theme <theme-name>",
  root: [
    {
      type: "argument",
      arg: {
        name: "theme-name",
        kind: "dynamic-enum",
        providerId: "themes",
        placeholder: "<theme-name>",
        description: "Theme to activate",
      },
    },
  ],
};

const ENV_SPEC: CommandSpec = {
  name: "env",
  aliases: ["environment"],
  description: "Switch or list environments.",
  usage: "/env [name]",
  root: [
    {
      type: "argument",
      arg: {
        name: "name",
        kind: "dynamic-enum",
        providerId: "environments",
        optional: true,
        placeholder: "[name]",
        description: "Environment to switch to",
      },
    },
  ],
};

const COMPACT_SPEC: CommandSpec = {
  name: "compact",
  aliases: ["dense"],
  description: "Toggle compact rendering mode.",
  usage: "/compact [on|off]",
  root: [
    {
      type: "argument",
      arg: {
        name: "mode",
        kind: "enum",
        enumValues: ["on", "off"],
        optional: true,
        placeholder: "[on|off]",
        description: "Enable or disable compact mode",
      },
    },
  ],
};

const EXPORT_SPEC: CommandSpec = {
  name: "export",
  aliases: ["save"],
  description: "Export the current conversation.",
  usage: "/export [path]",
  root: [
    {
      type: "argument",
      arg: {
        name: "path",
        kind: "path",
        optional: true,
        placeholder: "[path]",
        description: "File path to export to",
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Commands with subcommands
// ---------------------------------------------------------------------------

const MEMORY_TYPE_FLAG: {
  readonly name: string;
  readonly kind: "enum";
  readonly enumValues: readonly string[];
  readonly description: string;
} = {
  name: "--type",
  kind: "enum",
  enumValues: ["fact", "preference", "decision", "episode", "skill", "entity", "document_chunk"],
  description: "Filter by memory type",
};

const MEMORY_LAYER_FLAG: {
  readonly name: string;
  readonly kind: "enum";
  readonly enumValues: readonly string[];
  readonly description: string;
} = {
  name: "--layer",
  kind: "enum",
  enumValues: ["stm", "ltm"],
  description: "Filter by memory layer",
};

const MEMORY_LIMIT_FLAG: {
  readonly name: string;
  readonly kind: "integer";
  readonly description: string;
} = {
  name: "--limit",
  kind: "integer",
  description: "Maximum number of results",
};

const MEMORY_SPEC: CommandSpec = {
  name: "memory",
  aliases: ["mem"],
  description: "List, inspect, or search memory entries.",
  usage: "/memory <list|show|search|settings|setup|reindex> [options]",
  root: [
    {
      type: "literal",
      value: "list",
      description: "List memory entries",
      children: [],
      flags: [MEMORY_TYPE_FLAG, MEMORY_LAYER_FLAG, MEMORY_LIMIT_FLAG],
    },
    {
      type: "literal",
      value: "show",
      description: "Show a specific memory entry",
      children: [
        {
          type: "argument",
          arg: {
            name: "id",
            kind: "string",
            placeholder: "<id>",
            description: "Memory entry ID",
          },
        },
      ],
    },
    {
      type: "literal",
      value: "search",
      description: "Search memory entries",
      children: [
        {
          type: "argument",
          arg: {
            name: "query",
            kind: "free-text",
            placeholder: "<query>",
            description: "Search query",
          },
        },
      ],
      flags: [MEMORY_TYPE_FLAG, MEMORY_LAYER_FLAG, MEMORY_LIMIT_FLAG],
    },
    {
      type: "literal",
      value: "settings",
      description: "Manage proactive memory settings",
    },
    {
      type: "literal",
      value: "setup",
      description: "Configure embedding provider",
    },
    {
      type: "literal",
      value: "reindex",
      description: "Re-index memory embeddings",
    },
  ],
};

const REMEMBER_SPEC: CommandSpec = {
  name: "remember",
  aliases: ["rem"],
  description: "Save an explicit memory entry.",
  usage: "/remember [--type fact|preference|decision|note] [--tags a,b] <text>",
  root: [
    {
      type: "argument",
      arg: {
        name: "text",
        kind: "free-text",
        placeholder: "<text>",
        description: "Memory content to save",
      },
    },
  ],
  flags: [
    {
      name: "--type",
      kind: "enum",
      enumValues: ["fact", "preference", "decision", "note"],
      description: "Memory type",
    },
    {
      name: "--tags",
      kind: "string",
      description: "Comma-separated tags",
    },
  ],
};

const DAEMON_SPEC: CommandSpec = {
  name: "daemon",
  aliases: ["d"],
  description: "Manage daemon connections and profiles.",
  usage: "/daemon [add|switch|remove|status|token] [options]",
  root: [
    {
      type: "literal",
      value: "add",
      description: "Add a new daemon profile",
      children: [
        {
          type: "argument",
          arg: {
            name: "name",
            kind: "string",
            placeholder: "<name>",
            description: "Profile name",
          },
          children: [
            {
              type: "argument",
              arg: {
                name: "url",
                kind: "string",
                placeholder: "<url>",
                description: "Daemon URL",
              },
            },
          ],
        },
      ],
    },
    {
      type: "literal",
      value: "switch",
      description: "Switch to a daemon profile",
      children: [
        {
          type: "argument",
          arg: {
            name: "name",
            kind: "string",
            placeholder: "<name>",
            description: "Profile name to switch to",
          },
        },
      ],
    },
    {
      type: "literal",
      value: "remove",
      description: "Remove a daemon profile",
      children: [
        {
          type: "argument",
          arg: {
            name: "name",
            kind: "string",
            placeholder: "<name>",
            description: "Profile name to remove",
          },
        },
      ],
    },
    {
      type: "literal",
      value: "status",
      description: "Show daemon connection status",
    },
    {
      type: "literal",
      value: "token",
      description: "Manage daemon auth tokens",
      children: [
        {
          type: "argument",
          arg: {
            name: "action",
            kind: "enum",
            enumValues: ["show", "rotate"],
            optional: true,
            placeholder: "[show|rotate]",
            description: "Token action",
          },
        },
      ],
    },
  ],
};

const CHANNELS_SPEC: CommandSpec = {
  name: "channels",
  aliases: ["ch"],
  description: "Manage external chat channel integrations.",
  usage: "/channels [add|remove|enable|disable|status] [platform]",
  root: [
    {
      type: "literal",
      value: "add",
      description: "Add a new chat channel",
      children: [
        {
          type: "argument",
          arg: {
            name: "platform",
            kind: "enum",
            enumValues: ["telegram", "discord"],
            placeholder: "<telegram|discord>",
            description: "Platform to add",
          },
          children: [
            {
              type: "argument",
              arg: {
                name: "token",
                kind: "string",
                optional: true,
                placeholder: "[bot-token]",
                description: "Bot token (or prompted interactively)",
              },
            },
          ],
        },
      ],
    },
    {
      type: "literal",
      value: "remove",
      description: "Remove a configured channel",
      children: [
        {
          type: "argument",
          arg: {
            name: "platform",
            kind: "enum",
            enumValues: ["telegram", "discord"],
            placeholder: "<telegram|discord>",
            description: "Platform to remove",
          },
        },
      ],
    },
    {
      type: "literal",
      value: "enable",
      description: "Enable a channel",
      children: [
        {
          type: "argument",
          arg: {
            name: "platform",
            kind: "enum",
            enumValues: ["telegram", "discord"],
            placeholder: "<telegram|discord>",
            description: "Platform to enable",
          },
        },
      ],
    },
    {
      type: "literal",
      value: "disable",
      description: "Disable a channel",
      children: [
        {
          type: "argument",
          arg: {
            name: "platform",
            kind: "enum",
            enumValues: ["telegram", "discord"],
            placeholder: "<telegram|discord>",
            description: "Platform to disable",
          },
        },
      ],
    },
    {
      type: "literal",
      value: "status",
      description: "Show all channel statuses",
    },
  ],
};

const INTEGRATIONS_SPEC: CommandSpec = {
  name: "integrations",
  aliases: ["int"],
  description: "Open integrations panel.",
  usage: "/integrations",
  root: [],
};

const SKILLS_SPEC: CommandSpec = {
  name: "skills",
  aliases: ["sk"],
  description: "Open skills management panel.",
  usage: "/skills",
  root: [],
};

const BROWSER_SPEC: CommandSpec = {
  name: "browser",
  aliases: ["br"],
  description: "Control the browser — navigate, screenshot, and monitor pages.",
  usage: "/browser [headed | headless | screenshot | close]",
  root: [
    {
      type: "literal",
      value: "headed",
      description: "Switch to headed (visible window) mode",
    },
    {
      type: "literal",
      value: "headless",
      description: "Switch to headless (background) mode",
    },
    {
      type: "literal",
      value: "screenshot",
      description: "Take a screenshot of the current page",
    },
    {
      type: "literal",
      value: "close",
      description: "Close the browser",
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALL_SPECS: readonly CommandSpec[] = [
  HELP_SPEC,
  MODEL_SPEC,
  THEME_SPEC,
  CONNECT_SPEC,
  STATUS_SPEC,
  ENV_SPEC,
  NEW_SPEC,
  CLEAR_SPEC,
  EXPORT_SPEC,
  COMPACT_SPEC,
  SETTINGS_SPEC,
  SEARCH_SETTINGS_SPEC,
  QUIT_SPEC,
  REMEMBER_SPEC,
  MEMORY_SPEC,
  DAEMON_SPEC,
  CHANNELS_SPEC,
  SETUP_SPEC,
  INTEGRATIONS_SPEC,
  SKILLS_SPEC,
  BROWSER_SPEC,
];

/**
 * Lookup map: command name or alias → CommandSpec.
 */
const SPEC_LOOKUP = new Map<string, CommandSpec>();

for (const spec of ALL_SPECS) {
  SPEC_LOOKUP.set(spec.name.toLowerCase(), spec);
  if (spec.aliases) {
    for (const alias of spec.aliases) {
      SPEC_LOOKUP.set(alias.toLowerCase(), spec);
    }
  }
}

/** All command specifications. */
export const COMMAND_SPECS: readonly CommandSpec[] = ALL_SPECS;

/** Resolve a command spec by name or alias (case-insensitive). */
export function getCommandSpec(nameOrAlias: string): CommandSpec | null {
  return SPEC_LOOKUP.get(nameOrAlias.toLowerCase()) ?? null;
}
