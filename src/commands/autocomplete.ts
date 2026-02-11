import { SLASH_COMMANDS, type SlashCommandCategory } from "./registry";

export interface CommandAutocompleteItem {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly usage: string;
  readonly category: SlashCommandCategory;
  readonly score: number;
}

function normalizeQuery(input: string): string | null {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const commandChunk = trimmed.slice(1).split(/\s/, 1)[0] ?? "";
  return commandChunk.toLowerCase();
}

function fuzzyScore(query: string, value: string): number | null {
  if (query.length === 0) {
    return 0;
  }

  let queryIndex = 0;
  let totalGap = 0;
  let lastMatchIndex = -1;

  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] !== query[queryIndex]) {
      continue;
    }

    if (lastMatchIndex >= 0) {
      totalGap += index - lastMatchIndex - 1;
    } else {
      totalGap += index;
    }

    lastMatchIndex = index;
    queryIndex += 1;
  }

  if (queryIndex !== query.length) {
    return null;
  }

  return totalGap;
}

function getScore(query: string, name: string, aliases: readonly string[]): number | null {
  if (query.length === 0) {
    return 0;
  }

  if (name.startsWith(query)) {
    return 10 + (name.length - query.length) / 100;
  }

  for (const alias of aliases) {
    if (alias.startsWith(query)) {
      return 20 + (alias.length - query.length) / 100;
    }
  }

  const containsIndex = name.indexOf(query);
  if (containsIndex >= 0) {
    return 30 + containsIndex;
  }

  for (const alias of aliases) {
    const aliasContainsIndex = alias.indexOf(query);
    if (aliasContainsIndex >= 0) {
      return 40 + aliasContainsIndex;
    }
  }

  const fuzzyNameScore = fuzzyScore(query, name);
  if (fuzzyNameScore !== null) {
    return 50 + fuzzyNameScore;
  }

  for (const alias of aliases) {
    const fuzzyAliasScore = fuzzyScore(query, alias);
    if (fuzzyAliasScore !== null) {
      return 60 + fuzzyAliasScore;
    }
  }

  return null;
}

export function getCommandAutocomplete(prefix: string): readonly CommandAutocompleteItem[] {
  const query = normalizeQuery(prefix);
  if (query === null) {
    return [];
  }

  const scored = SLASH_COMMANDS
    .map((command) => {
      const score = getScore(query, command.name.toLowerCase(), command.aliases.map((alias) => alias.toLowerCase()));
      if (score === null) {
        return null;
      }

      return {
        name: command.name,
        aliases: command.aliases,
        description: command.description,
        usage: command.usage,
        category: command.category,
        score,
      } satisfies CommandAutocompleteItem;
    })
    .filter((item): item is CommandAutocompleteItem => item !== null);

  scored.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    return left.name.localeCompare(right.name);
  });

  return scored;
}
