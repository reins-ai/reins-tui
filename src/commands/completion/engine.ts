/**
 * Core completion engine.
 *
 * Given the current input, cursor position, and app context, resolves
 * a list of ranked suggestions and an optional ghost-text hint.
 *
 * Resolution algorithm:
 *   1. Tokenize input with cursor awareness
 *   2. Resolve command name (first token) — suggest commands if incomplete
 *   3. Look up CommandSpec for the resolved command
 *   4. Walk the spec tree with tokens preceding the cursor token
 *   5. Generate suggestions for the cursor token based on tree position
 *   6. Compute ghost text from the next expected node
 */

import { fuzzyScore } from "../autocomplete";
import type { CommandNode, FlagSpec } from "./schema";
import { COMMAND_SPECS, getCommandSpec } from "./specs";
import { getCursorTokenInfo } from "./tokenizer";
import { resolveProviderValues, type CompletionProviderContext } from "./providers";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CompletionContextKind =
  | "none"
  | "command-name"
  | "subcommand"
  | "argument"
  | "flag-name"
  | "flag-value";

export interface CompletionSuggestion {
  readonly label: string;
  readonly insertText: string;
  readonly detail?: string;
  readonly kind: "command" | "subcommand" | "argument" | "flag" | "flag-value";
  readonly score: number;
  readonly replaceStart: number;
  readonly replaceEnd: number;
}

export interface CompletionResult {
  readonly suggestions: readonly CompletionSuggestion[];
  readonly ghostText?: string;
  readonly contextKind: CompletionContextKind;
}

const EMPTY_RESULT: CompletionResult = {
  suggestions: [],
  contextKind: "none",
};

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function scoreCandidate(query: string, candidate: string): number | null {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();

  if (q.length === 0) {
    return 0;
  }

  // Exact prefix match is best
  if (c.startsWith(q)) {
    return 10 + (c.length - q.length) / 100;
  }

  // Contains match
  const containsIndex = c.indexOf(q);
  if (containsIndex >= 0) {
    return 30 + containsIndex;
  }

  // Fuzzy match
  const fuzzy = fuzzyScore(q, c);
  if (fuzzy !== null) {
    return 50 + fuzzy;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tree walk state
// ---------------------------------------------------------------------------

interface WalkState {
  /** Current valid nodes to match the next token against */
  readonly currentNodes: readonly CommandNode[];
  /** Flags available at the current scope (command-level + node-level) */
  readonly availableFlags: readonly FlagSpec[];
  /** Flag names already consumed */
  readonly usedFlags: ReadonlySet<string>;
  /** When a flag expecting a value was the last token */
  readonly pendingFlagValue: FlagSpec | null;
  /** Whether a free-text argument has been encountered */
  readonly freeTextReached: boolean;
}

/**
 * Collect all flags available at the current position:
 * command-level flags merged with the flags from matched nodes.
 */
function collectFlags(
  commandFlags: readonly FlagSpec[] | undefined,
  nodeFlags: readonly FlagSpec[] | undefined,
): readonly FlagSpec[] {
  const all: FlagSpec[] = [];
  if (commandFlags) all.push(...commandFlags);
  if (nodeFlags) all.push(...nodeFlags);
  return all;
}

/**
 * Walk one token through the command tree, returning the updated state.
 */
function walkToken(
  state: WalkState,
  tokenText: string,
): WalkState {
  // If we already hit free-text, no further tree traversal
  if (state.freeTextReached) {
    return state;
  }

  // Handle pending flag value — this token is consumed as the flag's value
  if (state.pendingFlagValue !== null) {
    return {
      ...state,
      pendingFlagValue: null,
    };
  }

  // Check if token is a flag
  if (tokenText.startsWith("-") && tokenText.length > 1) {
    const flagName = tokenText.toLowerCase();
    const matchedFlag = state.availableFlags.find(
      (f) => f.name.toLowerCase() === flagName ||
             (f.aliases?.some((a) => a.toLowerCase() === flagName) ?? false),
    );

    if (matchedFlag) {
      const newUsed = new Set(state.usedFlags);
      newUsed.add(matchedFlag.name.toLowerCase());

      // Boolean flags don't expect a value
      const pendingValue = matchedFlag.kind === "boolean" ? null : matchedFlag;

      return {
        ...state,
        usedFlags: newUsed,
        pendingFlagValue: pendingValue,
      };
    }

    // Handle --flag=value syntax
    if (tokenText.includes("=")) {
      const flagPart = tokenText.split("=")[0]!.toLowerCase();
      const matchedFlagEq = state.availableFlags.find(
        (f) => f.name.toLowerCase() === flagPart ||
               (f.aliases?.some((a) => a.toLowerCase() === flagPart) ?? false),
      );
      if (matchedFlagEq) {
        const newUsed = new Set(state.usedFlags);
        newUsed.add(matchedFlagEq.name.toLowerCase());
        return { ...state, usedFlags: newUsed, pendingFlagValue: null };
      }
    }

    // Unrecognized flag — don't advance tree
    return state;
  }

  // Try to match against literal nodes first
  const normalizedToken = tokenText.toLowerCase();
  for (const node of state.currentNodes) {
    if (node.type === "literal" && node.value.toLowerCase() === normalizedToken) {
      return {
        currentNodes: node.children ?? [],
        availableFlags: collectFlags(
          state.availableFlags,
          node.flags,
        ),
        usedFlags: state.usedFlags,
        pendingFlagValue: null,
        freeTextReached: false,
      };
    }
  }

  // Try to match against argument nodes
  for (const node of state.currentNodes) {
    if (node.type === "argument") {
      if (node.arg.kind === "free-text") {
        return {
          currentNodes: node.children ?? [],
          availableFlags: collectFlags(state.availableFlags, node.flags),
          usedFlags: state.usedFlags,
          pendingFlagValue: null,
          freeTextReached: true,
        };
      }

      // Consume the token as this argument's value
      return {
        currentNodes: node.children ?? [],
        availableFlags: collectFlags(state.availableFlags, node.flags),
        usedFlags: state.usedFlags,
        pendingFlagValue: null,
        freeTextReached: false,
      };
    }
  }

  // No match — can't advance further
  return {
    ...state,
    currentNodes: [],
  };
}

// ---------------------------------------------------------------------------
// Ghost text generation
// ---------------------------------------------------------------------------

function computeGhostText(state: WalkState): string | undefined {
  if (state.freeTextReached) {
    return undefined;
  }

  if (state.pendingFlagValue !== null) {
    const flag = state.pendingFlagValue;
    if (flag.kind === "enum" && flag.enumValues) {
      return `<${flag.enumValues.join("|")}>`;
    }
    return `<value>`;
  }

  if (state.currentNodes.length === 0) {
    return undefined;
  }

  // If all nodes are literals, show them as options
  const allLiterals = state.currentNodes.every((n) => n.type === "literal");
  if (allLiterals) {
    const values = state.currentNodes.map((n) => (n as { value: string }).value);
    if (values.length <= 5) {
      return `<${values.join("|")}>`;
    }
    return `<${values.slice(0, 4).join("|")}|...>`;
  }

  // First argument node's placeholder
  for (const node of state.currentNodes) {
    if (node.type === "argument" && node.arg.placeholder) {
      return node.arg.placeholder;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Suggestion generation for each context kind
// ---------------------------------------------------------------------------

function generateCommandNameSuggestions(
  prefix: string,
  replaceStart: number,
  replaceEnd: number,
): CompletionSuggestion[] {
  const query = prefix.toLowerCase();
  const suggestions: CompletionSuggestion[] = [];

  for (const spec of COMMAND_SPECS) {
    const score = scoreCandidate(query, spec.name);
    if (score !== null) {
      suggestions.push({
        label: `/${spec.name}`,
        insertText: `/${spec.name}`,
        detail: spec.description,
        kind: "command",
        score,
        replaceStart,
        replaceEnd,
      });
    }

    // Also score aliases
    if (spec.aliases) {
      for (const alias of spec.aliases) {
        const aliasScore = scoreCandidate(query, alias);
        if (aliasScore !== null && aliasScore < (score ?? Infinity)) {
          // Only add alias if it scores better than the name itself didn't
          // (we don't want duplicate entries for the same command)
          break;
        }
      }
    }
  }

  suggestions.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return suggestions;
}

function generateValueSuggestions(
  candidates: readonly string[],
  prefix: string,
  kind: CompletionSuggestion["kind"],
  replaceStart: number,
  replaceEnd: number,
  descriptionFn?: (value: string) => string | undefined,
): CompletionSuggestion[] {
  const query = prefix.toLowerCase();
  const suggestions: CompletionSuggestion[] = [];

  for (const candidate of candidates) {
    const score = scoreCandidate(query, candidate);
    if (score !== null) {
      suggestions.push({
        label: candidate,
        insertText: candidate,
        detail: descriptionFn?.(candidate),
        kind,
        score,
        replaceStart,
        replaceEnd,
      });
    }
  }

  suggestions.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return suggestions;
}

function generateNodeSuggestions(
  nodes: readonly CommandNode[],
  prefix: string,
  replaceStart: number,
  replaceEnd: number,
  ctx: CompletionProviderContext,
): { suggestions: CompletionSuggestion[]; contextKind: CompletionContextKind } {
  const suggestions: CompletionSuggestion[] = [];
  let contextKind: CompletionContextKind = "argument";

  // Literal nodes → subcommand suggestions
  for (const node of nodes) {
    if (node.type === "literal") {
      contextKind = "subcommand";
      const score = scoreCandidate(prefix, node.value);
      if (score !== null) {
        suggestions.push({
          label: node.value,
          insertText: node.value,
          detail: node.description,
          kind: "subcommand",
          score,
          replaceStart,
          replaceEnd,
        });
      }
    }
  }

  // Argument nodes → value suggestions
  for (const node of nodes) {
    if (node.type === "argument") {
      const arg = node.arg;

      if (arg.kind === "enum" && arg.enumValues) {
        const valueSuggestions = generateValueSuggestions(
          arg.enumValues,
          prefix,
          "argument",
          replaceStart,
          replaceEnd,
          () => arg.description,
        );
        suggestions.push(...valueSuggestions);
      } else if (arg.kind === "dynamic-enum" && arg.providerId) {
        const values = resolveProviderValues(arg.providerId, ctx);
        const valueSuggestions = generateValueSuggestions(
          values,
          prefix,
          "argument",
          replaceStart,
          replaceEnd,
          () => arg.description,
        );
        suggestions.push(...valueSuggestions);
      }
      // string, integer, path, free-text: no specific suggestions
    }
  }

  suggestions.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return { suggestions, contextKind };
}

function generateFlagSuggestions(
  flags: readonly FlagSpec[],
  usedFlags: ReadonlySet<string>,
  prefix: string,
  replaceStart: number,
  replaceEnd: number,
): CompletionSuggestion[] {
  const suggestions: CompletionSuggestion[] = [];

  for (const flag of flags) {
    // Skip already used non-repeatable flags
    if (usedFlags.has(flag.name.toLowerCase()) && !flag.repeatable) {
      continue;
    }

    const score = scoreCandidate(prefix, flag.name);
    if (score !== null) {
      suggestions.push({
        label: flag.name,
        insertText: flag.name,
        detail: flag.description,
        kind: "flag",
        score,
        replaceStart,
        replaceEnd,
      });
    }
  }

  suggestions.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return suggestions;
}

function generateFlagValueSuggestions(
  flag: FlagSpec,
  prefix: string,
  replaceStart: number,
  replaceEnd: number,
  ctx: CompletionProviderContext,
): CompletionSuggestion[] {
  if (flag.kind === "enum" && flag.enumValues) {
    return generateValueSuggestions(
      flag.enumValues,
      prefix,
      "flag-value",
      replaceStart,
      replaceEnd,
      () => flag.description,
    );
  }

  if (flag.kind === "dynamic-enum" && flag.providerId) {
    const values = resolveProviderValues(flag.providerId, ctx);
    return generateValueSuggestions(
      values,
      prefix,
      "flag-value",
      replaceStart,
      replaceEnd,
      () => flag.description,
    );
  }

  return [];
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve completions for the given input and cursor position.
 */
export function resolveCompletion(
  input: string,
  cursor: number,
  ctx: CompletionProviderContext,
): CompletionResult {
  const trimmedStart = input.trimStart();

  // Not a command → no completion
  if (!trimmedStart.startsWith("/")) {
    return EMPTY_RESULT;
  }

  const info = getCursorTokenInfo(input, cursor);
  const { tokens, activeTokenIndex, activePrefix, replaceStart, replaceEnd } = info;

  // No tokens at all (just whitespace after /) is handled by having "/" as a token
  if (tokens.length === 0) {
    return EMPTY_RESULT;
  }

  const firstToken = tokens[0]!;

  // Cursor is within the command token (first token starting with /)
  // Also handle the case where the first token is just "/" with cursor after it
  const firstTokenIsSlashOnly = firstToken.text === "/";
  if (activeTokenIndex === 0 || firstTokenIsSlashOnly) {
    const prefix = activeTokenIndex === 0
      ? activePrefix.startsWith("/") ? activePrefix.slice(1) : activePrefix
      : "";
    const suggestions = generateCommandNameSuggestions(prefix, firstToken.start, firstToken.end);
    return {
      suggestions,
      contextKind: "command-name",
    };
  }

  // Resolve which command this is
  const commandName = firstToken.text.startsWith("/")
    ? firstToken.text.slice(1)
    : firstToken.text;
  const spec = getCommandSpec(commandName);

  if (!spec) {
    return EMPTY_RESULT;
  }

  // Walk the spec tree with all tokens between the command and the cursor token
  let walkState: WalkState = {
    currentNodes: spec.root,
    availableFlags: collectFlags(spec.flags, undefined),
    usedFlags: new Set(),
    pendingFlagValue: null,
    freeTextReached: false,
  };

  // Determine which tokens are "consumed" (before cursor) and which is "active"
  const consumedEnd = activeTokenIndex === -1
    ? tokens.length  // cursor is at a gap — all tokens are consumed
    : activeTokenIndex;

  // Walk consumed tokens (skip the command token at index 0)
  for (let i = 1; i < consumedEnd; i += 1) {
    walkState = walkToken(walkState, tokens[i]!.text);
  }

  // If free-text has been reached, no more suggestions
  if (walkState.freeTextReached) {
    return EMPTY_RESULT;
  }

  // Determine the prefix for the cursor token
  const cursorPrefix = activeTokenIndex === -1 ? "" : activePrefix;

  // Handle pending flag value — the cursor token should complete the flag's value
  if (walkState.pendingFlagValue !== null) {
    const suggestions = generateFlagValueSuggestions(
      walkState.pendingFlagValue,
      cursorPrefix,
      replaceStart,
      replaceEnd,
      ctx,
    );
    const ghostText = computeGhostText(walkState);
    return {
      suggestions,
      ghostText: cursorPrefix.length === 0 ? ghostText : undefined,
      contextKind: "flag-value",
    };
  }

  // Check if the cursor token looks like a flag
  if (cursorPrefix.startsWith("-")) {
    const flagSuggestions = generateFlagSuggestions(
      walkState.availableFlags,
      walkState.usedFlags,
      cursorPrefix,
      replaceStart,
      replaceEnd,
    );
    return {
      suggestions: flagSuggestions,
      contextKind: "flag-name",
    };
  }

  // Generate suggestions from current tree nodes
  const { suggestions, contextKind } = generateNodeSuggestions(
    walkState.currentNodes,
    cursorPrefix,
    replaceStart,
    replaceEnd,
    ctx,
  );

  // Also include flag suggestions if user hasn't started a positional arg
  if (cursorPrefix.length === 0 && walkState.availableFlags.length > 0) {
    const flagSuggestions = generateFlagSuggestions(
      walkState.availableFlags,
      walkState.usedFlags,
      "",
      replaceStart,
      replaceEnd,
    );
    // Append flags after positional suggestions with a score penalty
    for (const fs of flagSuggestions) {
      suggestions.push({
        ...fs,
        score: fs.score + 100, // push flags below positional suggestions
      });
    }
  }

  // Compute ghost text for the expected next argument
  const ghostText = computeGhostText(walkState);

  return {
    suggestions,
    ghostText: cursorPrefix.length === 0 ? ghostText : undefined,
    contextKind: suggestions.length > 0 ? contextKind : "none",
  };
}

/**
 * Apply a suggestion to the input string.
 *
 * Returns the new input value and the cursor position after insertion.
 * Always appends a trailing space so the user can immediately type
 * the next token.
 */
export function applySuggestion(
  input: string,
  suggestion: CompletionSuggestion,
): { value: string; cursor: number } {
  const before = input.slice(0, suggestion.replaceStart);
  const after = input.slice(suggestion.replaceEnd);
  const inserted = suggestion.insertText + " ";
  const value = before + inserted + after.trimStart();
  const cursor = before.length + inserted.length;
  return { value, cursor };
}
