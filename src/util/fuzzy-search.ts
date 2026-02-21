/**
 * Lightweight fuzzy search for conversation list filtering.
 *
 * Supports exact substring matching and split-token matching where
 * each whitespace-separated query token must appear somewhere in
 * the target string. Returns a numeric score for ranking (higher
 * is better) or `null` when there is no match.
 */

export interface FuzzyMatchResult {
  /** Higher score = better match. */
  score: number;
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Score a single query against a single value string.
 *
 * Scoring tiers:
 *   - Exact match:    1000
 *   - Prefix match:   800 - length penalty
 *   - Substring:      600 - position penalty
 *   - Token match:    400 - missing-token penalty
 *   - No match:       null
 */
function scoreString(query: string, value: string): number | null {
  if (query.length === 0) {
    return 0;
  }

  if (value.length === 0) {
    return null;
  }

  if (value === query) {
    return 1000;
  }

  if (value.startsWith(query)) {
    return 800 - (value.length - query.length);
  }

  const substringIndex = value.indexOf(query);
  if (substringIndex >= 0) {
    return 600 - substringIndex * 2;
  }

  // Split-token matching: every query token must appear in the value
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length > 1) {
    const allPresent = tokens.every((token) => value.includes(token));
    if (allPresent) {
      return 400 - tokens.length;
    }
  }

  return null;
}

/**
 * Match a query against one or more target fields. Returns the best
 * score across all fields, or `null` if none match.
 */
export function fuzzyMatch(query: string, ...fields: string[]): FuzzyMatchResult | null {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) {
    return { score: 0 };
  }

  let bestScore: number | null = null;

  for (const field of fields) {
    const normalizedField = normalize(field);
    const fieldScore = scoreString(normalizedQuery, normalizedField);
    if (fieldScore !== null && (bestScore === null || fieldScore > bestScore)) {
      bestScore = fieldScore;
    }
  }

  if (bestScore === null) {
    return null;
  }

  return { score: bestScore };
}
