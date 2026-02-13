/**
 * Structured help text for all memory-related TUI commands.
 *
 * Each entry provides a description, usage pattern, flags, and examples
 * that can be rendered by the help system or displayed inline.
 */

export interface CommandHelpEntry {
  readonly command: string;
  readonly summary: string;
  readonly usage: string;
  readonly description: string;
  readonly flags?: readonly FlagHelpEntry[];
  readonly examples: readonly CommandExample[];
  readonly seeAlso?: readonly string[];
}

export interface FlagHelpEntry {
  readonly name: string;
  readonly values: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface CommandExample {
  readonly input: string;
  readonly description: string;
}

export const REMEMBER_HELP: CommandHelpEntry = {
  command: "/remember",
  summary: "Save an explicit memory entry.",
  usage: "/remember [--type <type>] [--tags <a,b>] <text>",
  description:
    "Saves text as a persistent memory entry. The memory is stored immediately " +
    "and becomes available for search and proactive recall in future sessions. " +
    "If no type is specified, the memory is saved as a fact.",
  flags: [
    {
      name: "--type",
      values: "fact, preference, decision, note, episode, skill",
      defaultValue: "fact",
      description: "Memory category. 'note' is an alias for 'fact'.",
    },
    {
      name: "--tags",
      values: "Comma-separated list",
      defaultValue: "(none)",
      description: "Tags for organization and filtering.",
    },
  ],
  examples: [
    {
      input: "/remember The API rate limit is 100 req/min",
      description: "Save a simple fact.",
    },
    {
      input: "/remember --type preference I prefer dark themes",
      description: "Save a user preference.",
    },
    {
      input: "/remember --type decision --tags auth,security Chose JWT over sessions",
      description: "Save a decision with tags.",
    },
  ],
  seeAlso: ["/memory list", "/memory show"],
};

export const MEMORY_LIST_HELP: CommandHelpEntry = {
  command: "/memory list",
  summary: "List stored memory entries with optional filters.",
  usage: "/memory list [--type <type>] [--layer <layer>] [--limit <n>]",
  description:
    "Displays a table of memory entries sorted by recency. " +
    "Use flags to filter by type, layer, or limit the number of results.",
  flags: [
    {
      name: "--type",
      values: "fact, preference, decision, episode, skill, entity, document_chunk",
      defaultValue: "(all)",
      description: "Filter by memory type.",
    },
    {
      name: "--layer",
      values: "stm, ltm",
      defaultValue: "(all)",
      description: "Filter by memory layer (short-term or long-term).",
    },
    {
      name: "--limit",
      values: "Positive integer",
      defaultValue: "20",
      description: "Maximum number of entries to display.",
    },
  ],
  examples: [
    {
      input: "/memory list",
      description: "List the 20 most recent memories.",
    },
    {
      input: "/memory list --type preference",
      description: "List only preference memories.",
    },
    {
      input: "/memory list --layer ltm --limit 50",
      description: "List up to 50 long-term memories.",
    },
  ],
  seeAlso: ["/memory show", "/remember"],
};

export const MEMORY_SHOW_HELP: CommandHelpEntry = {
  command: "/memory show",
  summary: "Display full details of a memory entry.",
  usage: "/memory show <id>",
  description:
    "Shows the complete content, metadata, source attribution, and timestamps " +
    "for a specific memory entry. Use the ID from '/memory list' output " +
    "(full UUID or first 8 characters).",
  examples: [
    {
      input: "/memory show a1b2c3d4",
      description: "Show details using the short ID.",
    },
    {
      input: "/memory show a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      description: "Show details using the full UUID.",
    },
  ],
  seeAlso: ["/memory list"],
};

export const MEMORY_SETTINGS_HELP: CommandHelpEntry = {
  command: "/memory settings",
  summary: "View and configure proactive memory features.",
  usage: "/memory settings [show|set|enable|disable|reset]",
  description:
    "Controls proactive memory behavior including context priming, daily briefings, " +
    "contextual nudges, and pattern detection. A master switch controls all features " +
    "globally, and each feature has individual enable/disable and tuning options.",
  flags: [
    {
      name: "set <feature> <key> <value>",
      values: "Feature: priming, briefing, nudges, patterns",
      defaultValue: "—",
      description: "Change a specific setting for a feature.",
    },
    {
      name: "enable [feature]",
      values: "priming, briefing, nudges, patterns",
      defaultValue: "(all features)",
      description: "Enable a specific feature or all proactive features.",
    },
    {
      name: "disable [feature]",
      values: "priming, briefing, nudges, patterns",
      defaultValue: "(all features)",
      description: "Disable a specific feature or all proactive features.",
    },
    {
      name: "reset",
      values: "—",
      defaultValue: "—",
      description: "Reset all proactive settings to defaults.",
    },
  ],
  examples: [
    {
      input: "/memory settings",
      description: "Show current proactive memory settings.",
    },
    {
      input: "/memory settings enable",
      description: "Enable all proactive memory features.",
    },
    {
      input: "/memory settings disable nudges",
      description: "Disable contextual nudges only.",
    },
    {
      input: "/memory settings set priming maxMemories 3",
      description: "Limit priming to 3 memories per turn.",
    },
    {
      input: "/memory settings set briefing scheduleHour 9",
      description: "Schedule daily briefing at 9 AM.",
    },
    {
      input: "/memory settings set briefing topicFilters work,project-x",
      description: "Limit briefings to specific topics.",
    },
    {
      input: "/memory settings reset",
      description: "Reset all settings to defaults.",
    },
  ],
  seeAlso: ["/memory list"],
};

export const MEMORY_REINDEX_HELP: CommandHelpEntry = {
  command: "/memory reindex",
  summary: "Rebuild vector embeddings after switching providers.",
  usage: "/memory reindex --provider <name>",
  description:
    "Re-embeds all memory records using the specified embedding provider. " +
    "Required after switching embedding providers because different models " +
    "produce incompatible vector representations. Includes a post-reindex " +
    "validation step to verify embedding quality.",
  flags: [
    {
      name: "--provider",
      values: "Provider name (e.g., ollama, openai)",
      defaultValue: "(required)",
      description: "Target embedding provider for reindexing.",
    },
  ],
  examples: [
    {
      input: "/memory reindex --provider openai",
      description: "Reindex all memories using the OpenAI embedding provider.",
    },
    {
      input: "/memory reindex --provider ollama",
      description: "Reindex all memories using the local Ollama provider.",
    },
  ],
  seeAlso: ["/memory list", "/memory settings"],
};

/**
 * All memory command help entries indexed by command name.
 */
export const MEMORY_HELP_ENTRIES: ReadonlyMap<string, CommandHelpEntry> = new Map([
  ["remember", REMEMBER_HELP],
  ["memory list", MEMORY_LIST_HELP],
  ["memory show", MEMORY_SHOW_HELP],
  ["memory settings", MEMORY_SETTINGS_HELP],
  ["memory reindex", MEMORY_REINDEX_HELP],
]);

/**
 * Format a single help entry as readable text for TUI display.
 */
export function formatMemoryHelpEntry(entry: CommandHelpEntry): string {
  const sections: string[] = [];

  sections.push(`${entry.command} — ${entry.summary}`);
  sections.push("");
  sections.push(`Usage: ${entry.usage}`);
  sections.push("");
  sections.push(entry.description);

  if (entry.flags && entry.flags.length > 0) {
    sections.push("");
    sections.push("Options:");
    for (const flag of entry.flags) {
      sections.push(`  ${flag.name}`);
      sections.push(`    ${flag.description}`);
      if (flag.values !== "—") {
        sections.push(`    Values: ${flag.values}`);
      }
      if (flag.defaultValue !== "—") {
        sections.push(`    Default: ${flag.defaultValue}`);
      }
    }
  }

  if (entry.examples.length > 0) {
    sections.push("");
    sections.push("Examples:");
    for (const example of entry.examples) {
      sections.push(`  ${example.input}`);
      sections.push(`    ${example.description}`);
    }
  }

  if (entry.seeAlso && entry.seeAlso.length > 0) {
    sections.push("");
    sections.push(`See also: ${entry.seeAlso.join(", ")}`);
  }

  return sections.join("\n");
}

/**
 * Format a summary of all memory commands for overview display.
 */
export function formatMemoryHelpOverview(): string {
  const sections: string[] = [];

  sections.push("Memory Commands:");
  sections.push("");
  sections.push("  /remember [--type <type>] [--tags <a,b>] <text>");
  sections.push("    Save an explicit memory entry.");
  sections.push("");
  sections.push("  /memory list [--type <type>] [--layer <layer>] [--limit <n>]");
  sections.push("    List stored memories with optional filters.");
  sections.push("");
  sections.push("  /memory show <id>");
  sections.push("    Display full details of a memory entry.");
  sections.push("");
  sections.push("  /memory settings [show|set|enable|disable|reset]");
  sections.push("    View and configure proactive memory features.");
  sections.push("");
  sections.push("  /memory reindex --provider <name>");
  sections.push("    Rebuild vector embeddings after switching providers.");
  sections.push("");
  sections.push("Use '/help <command>' for detailed help on a specific command.");

  return sections.join("\n");
}
