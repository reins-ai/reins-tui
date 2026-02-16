/**
 * Cursor-aware tokenizer for command completion.
 *
 * Splits input into tokens preserving their character ranges so the
 * completion engine knows exactly which token the cursor is within
 * and what range to replace on acceptance.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Token {
  /** The token text (quotes stripped if quoted) */
  readonly text: string;
  /** Start index in the original input (inclusive) */
  readonly start: number;
  /** End index in the original input (exclusive) */
  readonly end: number;
  /** Whether the token was wrapped in quotes */
  readonly quoted: boolean;
}

export interface CursorTokenInfo {
  /** All tokens parsed from the input */
  readonly tokens: readonly Token[];
  /**
   * Index of the token that the cursor is within or immediately after.
   * -1 when the cursor is at a whitespace gap between tokens (indicating
   * a new token should be started).
   */
  readonly activeTokenIndex: number;
  /** The partial text of the active token up to the cursor position */
  readonly activePrefix: string;
  /** Start index of the range to replace when accepting a suggestion */
  readonly replaceStart: number;
  /** End index of the range to replace when accepting a suggestion */
  readonly replaceEnd: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize the input string, tracking character ranges.
 *
 * Handles single and double quotes, and backslash escaping within quotes.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let tokenStart = -1;
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let wasQuoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== null) {
      escaping = true;
      continue;
    }

    if (quote !== null) {
      if (char === quote) {
        // Close quote — token continues until next whitespace
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (current.length === 0) {
        tokenStart = i;
      }
      quote = char;
      wasQuoted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push({
          text: current,
          start: tokenStart,
          end: i,
          quoted: wasQuoted,
        });
        current = "";
        tokenStart = -1;
        wasQuoted = false;
      }
      continue;
    }

    if (current.length === 0) {
      tokenStart = i;
    }
    current += char;
  }

  // Flush remaining token
  if (current.length > 0 || quote !== null) {
    tokens.push({
      text: current,
      start: tokenStart >= 0 ? tokenStart : input.length,
      end: input.length,
      quoted: quote !== null,
    });
  }

  return tokens;
}

/**
 * Determine cursor context within the tokenized input.
 *
 * @param input  The full input string
 * @param cursor Cursor position (0-based character offset). If beyond the
 *               input length it is clamped to `input.length`.
 */
export function getCursorTokenInfo(input: string, cursor: number): CursorTokenInfo {
  const clampedCursor = Math.max(0, Math.min(cursor, input.length));
  const tokens = tokenize(input);

  if (tokens.length === 0) {
    return {
      tokens,
      activeTokenIndex: -1,
      activePrefix: "",
      replaceStart: clampedCursor,
      replaceEnd: clampedCursor,
    };
  }

  // Check if cursor is within or immediately after any token
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;

    // Cursor is inside this token's range
    if (clampedCursor > token.start && clampedCursor <= token.end) {
      // For the raw prefix, use the original input slice to handle quotes
      const rawSlice = input.slice(token.start, clampedCursor);
      // Strip leading quote character if present
      const prefix = rawSlice.replace(/^["']/, "");

      return {
        tokens,
        activeTokenIndex: i,
        activePrefix: prefix,
        replaceStart: token.start,
        replaceEnd: token.end,
      };
    }
  }

  // Cursor is at a gap between tokens (or at end after whitespace)
  // This means a new token should be started
  return {
    tokens,
    activeTokenIndex: -1,
    activePrefix: "",
    replaceStart: clampedCursor,
    replaceEnd: clampedCursor,
  };
}
