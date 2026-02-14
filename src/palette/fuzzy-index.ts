import {
  SLASH_COMMANDS,
  PALETTE_ACTIONS,
  type SlashCommandCategory,
  type SlashCommandDefinition,
  type PaletteActionDefinition,
} from "../commands/registry";

export type SearchCategory = "command" | "conversation" | "note" | "action";

export interface SearchableItem<ActionType = string> {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: SearchCategory;
  readonly keywords: readonly string[];
  readonly action: ActionType;
  readonly lastUsedAt?: number;
  readonly popularity?: number;
}

export interface CommandSearchAction {
  readonly type: "command";
  readonly command: string;
}

export interface ConversationSearchAction {
  readonly type: "conversation";
  readonly conversationId: string;
}

export interface NoteSearchAction {
  readonly type: "note";
  readonly noteId: string;
}

export interface ActionSearchAction {
  readonly type: "action";
  readonly key: string;
}

export type PaletteAction = CommandSearchAction | ConversationSearchAction | NoteSearchAction | ActionSearchAction;

export interface ConversationSearchSource {
  readonly id: string;
  readonly title: string;
  readonly model?: string;
  readonly messageCount?: number;
  readonly createdAt?: Date | string;
  readonly updatedAt?: Date | string;
  readonly lastMessageAt?: Date | string;
}

export interface NoteSearchSource {
  readonly id: string;
  readonly title: string;
  readonly excerpt?: string;
  readonly tags?: readonly string[];
  readonly updatedAt?: Date | string;
}

export interface HighlightRange {
  readonly start: number;
  readonly end: number;
}

export type MatchKind = "exact" | "prefix" | "substring" | "fuzzy" | "empty";

export interface FuzzySearchResult<ActionType = PaletteAction> {
  readonly item: SearchableItem<ActionType>;
  readonly score: number;
  readonly matchKind: MatchKind;
  readonly ranges: readonly HighlightRange[];
  readonly matchedField: "label" | "keyword" | "description" | "none";
}

interface StringMatchResult {
  readonly score: number;
  readonly matchKind: MatchKind;
  readonly ranges: readonly HighlightRange[];
}

interface PreparedSearchItem<ActionType> {
  readonly item: SearchableItem<ActionType>;
  readonly labelLower: string;
  readonly descriptionLower: string;
  readonly keywordLower: readonly string[];
}

export interface FuzzySearchIndex<ActionType = PaletteAction> {
  readonly items: readonly PreparedSearchItem<ActionType>[];
}

const ALPHANUMERIC = /^[a-z0-9]$/;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function toTimestamp(value: Date | string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isWordBoundary(value: string, index: number): boolean {
  if (index === 0) {
    return true;
  }

  const previous = value[index - 1];
  return previous === undefined ? true : !ALPHANUMERIC.test(previous);
}

function createQueryRanges(start: number, length: number): readonly HighlightRange[] {
  return Object.freeze([{ start, end: start + length }]);
}

function collapseRanges(indices: readonly number[]): readonly HighlightRange[] {
  if (indices.length === 0) {
    return Object.freeze([] as HighlightRange[]);
  }

  const ranges: HighlightRange[] = [];
  let rangeStart = indices[0] ?? 0;
  let previous = rangeStart;

  for (let index = 1; index < indices.length; index += 1) {
    const value = indices[index];
    if (value === undefined) {
      continue;
    }

    if (value === previous + 1) {
      previous = value;
      continue;
    }

    ranges.push({ start: rangeStart, end: previous + 1 });
    rangeStart = value;
    previous = value;
  }

  ranges.push({ start: rangeStart, end: previous + 1 });
  return Object.freeze(ranges);
}

function fuzzyCharacterScore(query: string, value: string): StringMatchResult | null {
  let searchFrom = 0;
  let previousMatch = -1;
  let penalties = 0;
  let bonuses = 0;
  const matchedIndexes: number[] = [];

  for (let queryIndex = 0; queryIndex < query.length; queryIndex += 1) {
    const queryCharacter = query[queryIndex];
    if (queryCharacter === undefined) {
      return null;
    }

    const foundAt = value.indexOf(queryCharacter, searchFrom);
    if (foundAt < 0) {
      return null;
    }

    const gap = previousMatch < 0 ? foundAt : foundAt - previousMatch - 1;
    penalties += gap * 7;

    if (previousMatch >= 0 && foundAt === previousMatch + 1) {
      bonuses += 18;
    }

    if (foundAt === 0) {
      bonuses += 16;
    } else if (isWordBoundary(value, foundAt)) {
      bonuses += 8;
    }

    matchedIndexes.push(foundAt);
    previousMatch = foundAt;
    searchFrom = foundAt + 1;
  }

  const densityPenalty = Math.max(0, value.length - query.length) * 0.75;
  const score = 520 + bonuses - penalties - densityPenalty;

  return {
    score,
    matchKind: "fuzzy",
    ranges: collapseRanges(matchedIndexes),
  };
}

export function matchString(queryInput: string, valueInput: string): StringMatchResult | null {
  const query = normalize(queryInput);
  const value = normalize(valueInput);

  if (query.length === 0) {
    return {
      score: 0,
      matchKind: "empty",
      ranges: Object.freeze([] as HighlightRange[]),
    };
  }

  if (value.length === 0) {
    return null;
  }

  if (value === query) {
    return {
      score: 1600,
      matchKind: "exact",
      ranges: createQueryRanges(0, value.length),
    };
  }

  if (value.startsWith(query)) {
    return {
      score: 1300 - (value.length - query.length) * 2,
      matchKind: "prefix",
      ranges: createQueryRanges(0, query.length),
    };
  }

  const substringAt = value.indexOf(query);
  if (substringAt >= 0) {
    return {
      score: 1020 - substringAt * 12,
      matchKind: "substring",
      ranges: createQueryRanges(substringAt, query.length),
    };
  }

  return fuzzyCharacterScore(query, value);
}

function freezeItem<ActionType>(item: SearchableItem<ActionType>): SearchableItem<ActionType> {
  return Object.freeze({
    ...item,
    keywords: Object.freeze([...item.keywords]),
  });
}

export function createFuzzySearchIndex<ActionType = PaletteAction>(
  items: readonly SearchableItem<ActionType>[],
): FuzzySearchIndex<ActionType> {
  const prepared = items.map((item) => {
    const frozenItem = freezeItem(item);
    return Object.freeze({
      item: frozenItem,
      labelLower: frozenItem.label.toLowerCase(),
      descriptionLower: frozenItem.description.toLowerCase(),
      keywordLower: Object.freeze(frozenItem.keywords.map((keyword) => keyword.toLowerCase())),
    });
  });

  return Object.freeze({
    items: Object.freeze(prepared),
  });
}

export interface SearchIndexSource {
  readonly commands?: readonly SlashCommandDefinition[];
  readonly conversations?: readonly ConversationSearchSource[];
  readonly notes?: readonly NoteSearchSource[];
  readonly actions?: readonly SearchableItem<PaletteAction>[];
}

function mapSlashCategoryToKeyword(category: SlashCommandCategory): string {
  switch (category) {
    case "appearance":
      return "theme";
    case "conversation":
      return "chat";
    case "model":
      return "model";
    case "system":
      return "system";
    case "memory":
      return "memory";
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

export function createCommandSearchItems(
  commands: readonly SlashCommandDefinition[] = SLASH_COMMANDS,
): readonly SearchableItem<PaletteAction>[] {
  return Object.freeze(
    commands.map((command) =>
      Object.freeze({
        id: `command:${command.name}`,
        label: `/${command.name}`,
        description: command.description,
        category: "command" as const,
        keywords: Object.freeze([
          command.name,
          ...command.aliases,
          command.usage,
          command.category,
          mapSlashCategoryToKeyword(command.category),
        ]),
        action: Object.freeze({ type: "command", command: command.name } satisfies CommandSearchAction),
      } satisfies SearchableItem<PaletteAction>),
    ),
  );
}

export function createConversationSearchItems(
  conversations: readonly ConversationSearchSource[],
): readonly SearchableItem<PaletteAction>[] {
  return Object.freeze(
    conversations.map((conversation) => {
      const updatedAt =
        toTimestamp(conversation.lastMessageAt) ??
        toTimestamp(conversation.updatedAt) ??
        toTimestamp(conversation.createdAt);

      return Object.freeze({
        id: `conversation:${conversation.id}`,
        label: conversation.title,
        description: conversation.model ? `Model: ${conversation.model}` : "Conversation",
        category: "conversation" as const,
        keywords: Object.freeze([
          conversation.model ?? "",
          `${conversation.messageCount ?? 0} messages`,
          "conversation",
          "chat",
        ]),
        action: Object.freeze({
          type: "conversation",
          conversationId: conversation.id,
        } satisfies ConversationSearchAction),
        lastUsedAt: updatedAt,
      } satisfies SearchableItem<PaletteAction>);
    }),
  );
}

export function createNoteSearchItems(notes: readonly NoteSearchSource[]): readonly SearchableItem<PaletteAction>[] {
  return Object.freeze(
    notes.map((note) =>
      Object.freeze({
        id: `note:${note.id}`,
        label: note.title,
        description: note.excerpt ?? "Note",
        category: "note" as const,
        keywords: Object.freeze(["note", ...(note.tags ?? [])]),
        action: Object.freeze({
          type: "note",
          noteId: note.id,
        } satisfies NoteSearchAction),
        lastUsedAt: toTimestamp(note.updatedAt),
      } satisfies SearchableItem<PaletteAction>),
    ),
  );
}

export function createActionSearchItems(
  actions: readonly PaletteActionDefinition[] = PALETTE_ACTIONS,
): readonly SearchableItem<PaletteAction>[] {
  return Object.freeze(
    actions.map((action) =>
      Object.freeze({
        id: action.id,
        label: action.label,
        description: action.description,
        category: "action" as const,
        keywords: Object.freeze([
          ...action.keywords,
          action.category,
          ...(action.shortcutHint ? [action.shortcutHint] : []),
        ]),
        action: Object.freeze({ type: "action", key: action.actionKey } satisfies ActionSearchAction),
      } satisfies SearchableItem<PaletteAction>),
    ),
  );
}

export function createUnifiedSearchItems(source: SearchIndexSource): readonly SearchableItem<PaletteAction>[] {
  const commandItems = createCommandSearchItems(source.commands ?? SLASH_COMMANDS);
  const conversationItems = createConversationSearchItems(source.conversations ?? []);
  const noteItems = createNoteSearchItems(source.notes ?? []);
  const actionItems = source.actions
    ? Object.freeze([...source.actions])
    : createActionSearchItems();

  return Object.freeze([...commandItems, ...conversationItems, ...noteItems, ...actionItems]);
}

function scoreItemField(query: string, value: string): StringMatchResult | null {
  if (value.trim().length === 0) {
    return null;
  }

  return matchString(query, value);
}

export function matchSearchableItem<ActionType>(
  query: string,
  preparedItem: PreparedSearchItem<ActionType>,
): FuzzySearchResult<ActionType> | null {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) {
    return {
      item: preparedItem.item,
      score: 0,
      matchKind: "empty",
      ranges: Object.freeze([] as HighlightRange[]),
      matchedField: "none",
    };
  }

  const labelMatch = scoreItemField(normalizedQuery, preparedItem.labelLower);
  let best: FuzzySearchResult<ActionType> | null =
    labelMatch === null
      ? null
      : {
          item: preparedItem.item,
          score: labelMatch.score,
          matchKind: labelMatch.matchKind,
          ranges: labelMatch.ranges,
          matchedField: "label",
        };

  for (const keyword of preparedItem.keywordLower) {
    const keywordMatch = scoreItemField(normalizedQuery, keyword);
    if (keywordMatch === null) {
      continue;
    }

    const candidateScore = keywordMatch.score - 140;
    if (best !== null && candidateScore <= best.score) {
      continue;
    }

    best = {
      item: preparedItem.item,
      score: candidateScore,
      matchKind: keywordMatch.matchKind,
      ranges: keywordMatch.ranges,
      matchedField: "keyword",
    };
  }

  const descriptionMatch = scoreItemField(normalizedQuery, preparedItem.descriptionLower);
  if (descriptionMatch !== null) {
    const candidateScore = descriptionMatch.score - 240;
    if (best === null || candidateScore > best.score) {
      best = {
        item: preparedItem.item,
        score: candidateScore,
        matchKind: descriptionMatch.matchKind,
        ranges: descriptionMatch.ranges,
        matchedField: "description",
      };
    }
  }

  return best;
}

export function searchFuzzyIndex<ActionType = PaletteAction>(
  index: FuzzySearchIndex<ActionType>,
  query: string,
): readonly FuzzySearchResult<ActionType>[] {
  const normalizedQuery = normalize(query);
  const matches: FuzzySearchResult<ActionType>[] = [];

  for (const item of index.items) {
    const match = matchSearchableItem(normalizedQuery, item);
    if (match !== null) {
      matches.push(match);
    }
  }

  if (normalizedQuery.length === 0) {
    return Object.freeze(matches);
  }

  matches.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    return left.item.label.localeCompare(right.item.label);
  });

  return Object.freeze(matches);
}
