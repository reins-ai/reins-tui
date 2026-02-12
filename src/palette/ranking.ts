import {
  createFuzzySearchIndex,
  searchFuzzyIndex,
  type FuzzySearchIndex,
  type FuzzySearchResult,
  type MatchKind,
  type SearchCategory,
  type SearchableItem,
} from "./fuzzy-index";

export interface RankingOptions {
  readonly limit?: number;
  readonly now?: () => number;
  readonly categoryOrder?: readonly SearchCategory[];
  readonly recentWindowMs?: number;
}

export interface RankedSearchResult<ActionType = string> extends FuzzySearchResult<ActionType> {
  readonly rankScore: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_CATEGORY_ORDER: readonly SearchCategory[] = Object.freeze([
  "command",
  "action",
  "conversation",
  "note",
]);

const MATCH_PRIORITY: Readonly<Record<MatchKind, number>> = Object.freeze({
  exact: 0,
  prefix: 1,
  substring: 2,
  fuzzy: 3,
  empty: 4,
});

const MATCH_WEIGHT: Readonly<Record<MatchKind, number>> = Object.freeze({
  exact: 320,
  prefix: 220,
  substring: 120,
  fuzzy: 40,
  empty: 0,
});

function createCategoryIndex(categoryOrder: readonly SearchCategory[]): ReadonlyMap<SearchCategory, number> {
  const map = new Map<SearchCategory, number>();

  for (let index = 0; index < categoryOrder.length; index += 1) {
    const category = categoryOrder[index];
    if (category === undefined) {
      continue;
    }

    map.set(category, index);
  }

  return map;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function recencyBoost(item: SearchableItem<unknown>, now: number, recentWindowMs: number): number {
  if (item.category !== "conversation") {
    return 0;
  }

  const lastUsedAt = item.lastUsedAt;
  if (lastUsedAt === undefined || !Number.isFinite(lastUsedAt)) {
    return 0;
  }

  const age = Math.max(0, now - lastUsedAt);
  if (age >= recentWindowMs) {
    return 0;
  }

  const freshness = 1 - age / recentWindowMs;
  return freshness * 180;
}

function popularityBoost(item: SearchableItem<unknown>): number {
  const popularity = item.popularity;
  if (popularity === undefined || !Number.isFinite(popularity)) {
    return 0;
  }

  return clamp(popularity, 0, 100) * 0.8;
}

function categoryBoost(item: SearchableItem<unknown>, categoryIndex: ReadonlyMap<SearchCategory, number>): number {
  const index = categoryIndex.get(item.category);
  if (index === undefined) {
    return 0;
  }

  return Math.max(0, 30 - index * 6);
}

function compareByCategoryThenLabel(
  left: RankedSearchResult<unknown>,
  right: RankedSearchResult<unknown>,
  categoryIndex: ReadonlyMap<SearchCategory, number>,
): number {
  const leftCategoryIndex = categoryIndex.get(left.item.category) ?? Number.MAX_SAFE_INTEGER;
  const rightCategoryIndex = categoryIndex.get(right.item.category) ?? Number.MAX_SAFE_INTEGER;

  if (leftCategoryIndex !== rightCategoryIndex) {
    return leftCategoryIndex - rightCategoryIndex;
  }

  return left.item.label.localeCompare(right.item.label);
}

function rankNonEmptyQuery<ActionType>(
  matches: readonly FuzzySearchResult<ActionType>[],
  options: Required<RankingOptions>,
): readonly RankedSearchResult<ActionType>[] {
  const now = options.now();
  const categoryIndex = createCategoryIndex(options.categoryOrder);

  const ranked = matches.map((match) => {
    const rankScore =
      match.score +
      MATCH_WEIGHT[match.matchKind] +
      recencyBoost(match.item, now, options.recentWindowMs) +
      popularityBoost(match.item) +
      categoryBoost(match.item, categoryIndex);

    return {
      ...match,
      rankScore,
    } satisfies RankedSearchResult<ActionType>;
  });

  ranked.sort((left, right) => {
    const leftPriority = MATCH_PRIORITY[left.matchKind];
    const rightPriority = MATCH_PRIORITY[right.matchKind];
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    if (left.rankScore !== right.rankScore) {
      return right.rankScore - left.rankScore;
    }

    return compareByCategoryThenLabel(
      left as RankedSearchResult<unknown>,
      right as RankedSearchResult<unknown>,
      categoryIndex,
    );
  });

  return Object.freeze(ranked.slice(0, options.limit));
}

function rankEmptyQuery<ActionType>(
  matches: readonly FuzzySearchResult<ActionType>[],
  options: Required<RankingOptions>,
): readonly RankedSearchResult<ActionType>[] {
  const now = options.now();
  const categoryIndex = createCategoryIndex(options.categoryOrder);

  const ranked = matches.map((match) => {
    const rankScore = recencyBoost(match.item, now, options.recentWindowMs) + popularityBoost(match.item) + categoryBoost(match.item, categoryIndex);
    return {
      ...match,
      rankScore,
    } satisfies RankedSearchResult<ActionType>;
  });

  ranked.sort((left, right) => {
    if (left.rankScore !== right.rankScore) {
      return right.rankScore - left.rankScore;
    }

    return compareByCategoryThenLabel(
      left as RankedSearchResult<unknown>,
      right as RankedSearchResult<unknown>,
      categoryIndex,
    );
  });

  return Object.freeze(ranked.slice(0, options.limit));
}

export function rankSearchResults<ActionType>(
  index: FuzzySearchIndex<ActionType>,
  query: string,
  options: RankingOptions = {},
): readonly RankedSearchResult<ActionType>[] {
  const normalizedQuery = query.trim();
  const resolvedOptions: Required<RankingOptions> = {
    limit: options.limit ?? DEFAULT_LIMIT,
    now: options.now ?? (() => Date.now()),
    categoryOrder: options.categoryOrder ?? DEFAULT_CATEGORY_ORDER,
    recentWindowMs: options.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS,
  };

  const matches = searchFuzzyIndex(index, normalizedQuery);
  if (normalizedQuery.length === 0) {
    return rankEmptyQuery(matches, resolvedOptions);
  }

  return rankNonEmptyQuery(matches, resolvedOptions);
}

export function rankSearchItems<ActionType>(
  items: readonly SearchableItem<ActionType>[],
  query: string,
  options: RankingOptions = {},
): readonly RankedSearchResult<ActionType>[] {
  const index = createFuzzySearchIndex(items);
  return rankSearchResults(index, query, options);
}
