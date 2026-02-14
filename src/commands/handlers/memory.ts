import { err, ok } from "../../daemon/contracts";
import { handleMemoryReindexCommand } from "../memory/memory-reindex-command";
import { handleMemorySettingsCommand } from "../memory/memory-settings-command";
import type { CommandHandler, MemoryEntry, MemoryLayer, MemoryType } from "./types";

type ParsedFlagValue = string | boolean;

const VALID_MEMORY_TYPES: readonly MemoryType[] = [
  "fact",
  "preference",
  "decision",
  "episode",
  "skill",
  "entity",
  "document_chunk",
];

const VALID_MEMORY_LAYERS: readonly MemoryLayer[] = ["stm", "ltm"];

const PREVIEW_MAX_LENGTH = 80;
const DEFAULT_LIST_LIMIT = 20;

function isValidMemoryType(value: string): value is MemoryType {
  return VALID_MEMORY_TYPES.includes(value as MemoryType);
}

function isValidMemoryLayer(value: string): value is MemoryLayer {
  return VALID_MEMORY_LAYERS.includes(value as MemoryLayer);
}

/**
 * Extract a flag value supporting both `--flag=value` and `--flag value` syntax.
 *
 * When the parser sees `--flag value`, it stores `flags[name] = true` and puts
 * `value` in the positional array. This helper consumes the next positional arg
 * when the flag is boolean `true`.
 *
 * Returns the resolved value and the remaining positional args after consumption.
 */
function extractFlagValue(
  flagName: string,
  flags: Readonly<Record<string, ParsedFlagValue>>,
  positional: readonly string[],
): { value: string | undefined; remaining: readonly string[] } {
  const flagValue = flags[flagName];

  if (typeof flagValue === "string") {
    return { value: flagValue, remaining: positional };
  }

  if (flagValue === true && positional.length > 0) {
    return {
      value: positional[0],
      remaining: positional.slice(1),
    };
  }

  return { value: undefined, remaining: positional };
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  return content.slice(0, maxLength - 1) + "\u2026";
}

function formatImportance(importance: number): string {
  const filled = Math.round(importance * 5);
  const empty = 5 - filled;
  return "\u2605".repeat(filled) + "\u2606".repeat(empty);
}

function formatMemoryTypeLabel(type: MemoryType): string {
  const labels: Record<MemoryType, string> = {
    fact: "[fact]",
    preference: "[pref]",
    decision: "[decision]",
    episode: "[episode]",
    skill: "[skill]",
    entity: "[entity]",
    document_chunk: "[doc]",
  };

  return labels[type];
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "unknown";
    }

    return date.toLocaleString();
  } catch {
    return "unknown";
  }
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function formatMemoryListItem(entry: MemoryEntry): string {
  const typeLabel = formatMemoryTypeLabel(entry.type);
  const importance = formatImportance(entry.importance);
  const preview = truncateContent(entry.content.replace(/\n/g, " "), PREVIEW_MAX_LENGTH);

  return `${entry.id.slice(0, 8)}  ${typeLabel}  ${importance}  ${preview}`;
}

function formatMemoryList(entries: readonly MemoryEntry[]): string {
  if (entries.length === 0) {
    return "No memories found.";
  }

  const header = "ID        Type         Importance  Content";
  const separator = "-".repeat(header.length);
  const rows = entries.map(formatMemoryListItem);

  return [header, separator, ...rows, "", `${entries.length} memor${entries.length === 1 ? "y" : "ies"} shown.`].join(
    "\n",
  );
}

function formatMemoryDetail(entry: MemoryEntry): string {
  const sections: string[] = [];

  sections.push(`# Memory: ${entry.id}`);
  sections.push("");
  sections.push(entry.content);
  sections.push("");
  sections.push("---");
  sections.push("");
  sections.push(`Type:        ${entry.type}`);
  sections.push(`Layer:       ${entry.layer}`);
  sections.push(`Importance:  ${formatImportance(entry.importance)} (${entry.importance.toFixed(2)})`);
  sections.push(`Confidence:  ${entry.confidence.toFixed(2)}`);

  if (entry.tags.length > 0) {
    sections.push(`Tags:        ${entry.tags.join(", ")}`);
  }

  if (entry.entities.length > 0) {
    sections.push(`Entities:    ${entry.entities.join(", ")}`);
  }

  sections.push("");
  sections.push("Source:");
  sections.push(`  Type:            ${entry.source.type}`);
  if (entry.source.conversationId) {
    sections.push(`  Conversation:    ${entry.source.conversationId}`);
  }

  if (entry.supersedes) {
    sections.push(`  Supersedes:      ${entry.supersedes}`);
  }

  if (entry.supersededBy) {
    sections.push(`  Superseded by:   ${entry.supersededBy}`);
  }

  sections.push("");
  sections.push(`Created:     ${formatTimestamp(entry.createdAt)}`);
  sections.push(`Updated:     ${formatTimestamp(entry.updatedAt)}`);
  sections.push(`Accessed:    ${formatTimestamp(entry.accessedAt)}`);

  return sections.join("\n");
}

export const handleRememberCommand: CommandHandler = async (args, context) => {
  if (!context.memory?.available) {
    return err({
      code: "UNSUPPORTED",
      message: "Memory service is not available. Is the daemon running?",
    });
  }

  // Extract --type flag (supports both --type=value and --type value)
  const typeExtracted = extractFlagValue("type", args.flags, args.positional);
  // Extract --tags flag from remaining positional
  const tagsExtracted = extractFlagValue("tags", args.flags, typeExtracted.remaining);

  const content = tagsExtracted.remaining.join(" ").trim();

  if (content.length === 0) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing memory content. Usage: /remember [--type fact|preference|decision|note] <text>",
    });
  }

  let memoryType: MemoryType | undefined;
  if (typeExtracted.value !== undefined) {
    const normalizedType = typeExtracted.value.trim().toLowerCase();
    if (normalizedType === "note") {
      memoryType = "fact";
    } else if (!isValidMemoryType(normalizedType)) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Invalid memory type '${typeExtracted.value}'. Valid types: fact, preference, decision, note, episode, skill.`,
      });
    } else {
      memoryType = normalizedType;
    }
  }

  let tags: string[] | undefined;
  if (tagsExtracted.value !== undefined) {
    tags = parseTags(tagsExtracted.value);
    if (tags.length === 0) {
      return err({
        code: "INVALID_ARGUMENT",
        message: "Tags flag provided but no valid tags found. Use comma-separated values: --tags work,project",
      });
    }
  }

  const result = await context.memory.remember({
    content,
    type: memoryType,
    tags,
    conversationId: context.session.activeConversationId ?? undefined,
  });

  if (!result.ok) {
    return result;
  }

  const entry = result.value;
  return ok({
    statusMessage: `Memory saved (${entry.id.slice(0, 8)})`,
    responseText: `Remembered as ${entry.type}: "${truncateContent(entry.content, 60)}" [${entry.id.slice(0, 8)}]`,
  });
};

export const handleMemoryCommand: CommandHandler = async (args, context) => {
  if (!context.memory?.available) {
    return err({
      code: "UNSUPPORTED",
      message: "Memory service is not available. Is the daemon running?",
    });
  }

  const subcommand = args.positional[0]?.trim().toLowerCase();

  if (!subcommand || subcommand === "list") {
    return handleMemoryList(args, context);
  }

  if (subcommand === "show") {
    return handleMemoryShow(args, context);
  }

  if (subcommand === "search") {
    return handleMemorySearch(args, context);
  }

  if (subcommand === "settings") {
    const settingsManager = context.memory.settingsManager;
    if (!settingsManager) {
      return err({
        code: "UNSUPPORTED",
        message: "Proactive memory settings are not available.",
      });
    }

    return handleMemorySettingsCommand(args, {
      available: context.memory.available,
      settingsManager,
    });
  }

  if (subcommand === "reindex") {
    return handleMemoryReindexCommand(args, {
      available: context.memory.available,
      reindex: context.memory.reindex,
    });
  }

  return err({
    code: "INVALID_ARGUMENT",
    message: `Unknown memory subcommand '${subcommand}'. Usage: /memory <list|show|search|settings|reindex> [options]`,
  });
};

const handleMemoryList: CommandHandler = async (args, context) => {
  // Skip the subcommand ("list") from positional args if present
  const subcommand = args.positional[0]?.trim().toLowerCase();
  const positionalAfterSubcommand = subcommand === "list" ? args.positional.slice(1) : args.positional;

  const typeExtracted = extractFlagValue("type", args.flags, positionalAfterSubcommand);
  const layerExtracted = extractFlagValue("layer", args.flags, typeExtracted.remaining);
  const limitExtracted = extractFlagValue("limit", args.flags, layerExtracted.remaining);

  let filterType: MemoryType | undefined;
  if (typeExtracted.value !== undefined) {
    const normalizedType = typeExtracted.value.trim().toLowerCase();
    if (!isValidMemoryType(normalizedType)) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Invalid memory type '${typeExtracted.value}'. Valid types: ${VALID_MEMORY_TYPES.join(", ")}.`,
      });
    }

    filterType = normalizedType;
  }

  let filterLayer: MemoryLayer | undefined;
  if (layerExtracted.value !== undefined) {
    const normalizedLayer = layerExtracted.value.trim().toLowerCase();
    if (!isValidMemoryLayer(normalizedLayer)) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Invalid memory layer '${layerExtracted.value}'. Valid layers: stm, ltm.`,
      });
    }

    filterLayer = normalizedLayer;
  }

  let limit = DEFAULT_LIST_LIMIT;
  if (limitExtracted.value !== undefined) {
    const parsed = Number.parseInt(limitExtracted.value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return err({
        code: "INVALID_ARGUMENT",
        message: "Limit must be a positive integer.",
      });
    }

    limit = parsed;
  }

  const result = await context.memory!.list({
    type: filterType,
    layer: filterLayer,
    limit,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    statusMessage: `${result.value.length} memor${result.value.length === 1 ? "y" : "ies"} found`,
    responseText: formatMemoryList(result.value),
  });
};

const handleMemoryShow: CommandHandler = async (args, context) => {
  const memoryId = args.positional[1]?.trim();

  if (!memoryId) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing memory ID. Usage: /memory show <id>",
    });
  }

  const result = await context.memory!.show(memoryId);

  if (!result.ok) {
    return result;
  }

  if (result.value === null) {
    return err({
      code: "NOT_FOUND",
      message: `Memory '${memoryId}' not found.`,
    });
  }

  return ok({
    statusMessage: `Memory ${memoryId.slice(0, 8)}`,
    responseText: formatMemoryDetail(result.value),
  });
};

const handleMemorySearch: CommandHandler = async (args, context) => {
  const positionalAfterSubcommand = args.positional.slice(1);

  const typeExtracted = extractFlagValue("type", args.flags, positionalAfterSubcommand);
  const layerExtracted = extractFlagValue("layer", args.flags, typeExtracted.remaining);
  const limitExtracted = extractFlagValue("limit", args.flags, layerExtracted.remaining);

  const query = limitExtracted.remaining.join(" ").trim();

  if (query.length === 0) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing search query. Usage: /memory search [--type fact|preference] [--limit N] <query>",
    });
  }

  if (!context.memory!.search) {
    return err({
      code: "UNSUPPORTED",
      message: "Memory search is not available.",
    });
  }

  let filterType: MemoryType | undefined;
  if (typeExtracted.value !== undefined) {
    const normalizedType = typeExtracted.value.trim().toLowerCase();
    if (!isValidMemoryType(normalizedType)) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Invalid memory type '${typeExtracted.value}'. Valid types: ${VALID_MEMORY_TYPES.join(", ")}.`,
      });
    }
    filterType = normalizedType;
  }

  let filterLayer: MemoryLayer | undefined;
  if (layerExtracted.value !== undefined) {
    const normalizedLayer = layerExtracted.value.trim().toLowerCase();
    if (!isValidMemoryLayer(normalizedLayer)) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Invalid memory layer '${layerExtracted.value}'. Valid layers: stm, ltm.`,
      });
    }
    filterLayer = normalizedLayer;
  }

  let limit = DEFAULT_LIST_LIMIT;
  if (limitExtracted.value !== undefined) {
    const parsed = Number.parseInt(limitExtracted.value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return err({
        code: "INVALID_ARGUMENT",
        message: "Limit must be a positive integer.",
      });
    }
    limit = parsed;
  }

  const result = await context.memory!.search({
    query,
    type: filterType,
    layer: filterLayer,
    limit,
  });

  if (!result.ok) {
    return result;
  }

  return ok({
    statusMessage: `${result.value.length} memor${result.value.length === 1 ? "y" : "ies"} found for "${query}"`,
    responseText: formatMemoryList(result.value),
  });
};
