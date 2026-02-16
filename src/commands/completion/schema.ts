/**
 * Brigadier-inspired command argument schema.
 *
 * Each slash command gets a declarative specification that describes its
 * argument tree as a list of nodes. The completion engine walks this tree
 * to determine context-aware suggestions.
 */

// ---------------------------------------------------------------------------
// Argument kinds
// ---------------------------------------------------------------------------

/**
 * The kind of value an argument node expects.
 *
 * - `literal`      — fixed keyword (subcommand-like, e.g. "list", "show")
 * - `string`       — arbitrary single token
 * - `enum`         — one of a fixed set of values
 * - `dynamic-enum` — one of a set resolved at runtime via a provider
 * - `integer`      — numeric value
 * - `path`         — filesystem-ish token
 * - `free-text`    — consumes all remaining tokens (no further positional completion)
 */
export type ArgKind =
  | "literal"
  | "string"
  | "enum"
  | "dynamic-enum"
  | "integer"
  | "path"
  | "free-text";

// ---------------------------------------------------------------------------
// Flag specification
// ---------------------------------------------------------------------------

export interface FlagSpec {
  /** Flag name including prefix, e.g. "--type" */
  readonly name: string;
  /** Short aliases, e.g. ["-t"] */
  readonly aliases?: readonly string[];
  /** Human description shown in completion detail */
  readonly description?: string;
  /** Value kind — boolean flags take no value */
  readonly kind: "boolean" | "enum" | "dynamic-enum" | "string" | "integer";
  /** Static enum values (when kind is "enum") */
  readonly enumValues?: readonly string[];
  /** Provider ID for runtime values (when kind is "dynamic-enum") */
  readonly providerId?: string;
  /** Whether the flag can appear more than once */
  readonly repeatable?: boolean;
}

// ---------------------------------------------------------------------------
// Argument specification
// ---------------------------------------------------------------------------

export interface ArgSpec {
  /** Display name shown in ghost hints, e.g. "model-name" */
  readonly name: string;
  /** What type of value this argument expects */
  readonly kind: Exclude<ArgKind, "literal">;
  /** Human description shown in completion detail */
  readonly description?: string;
  /** Whether the argument can be omitted */
  readonly optional?: boolean;
  /** Static enum values (when kind is "enum") */
  readonly enumValues?: readonly string[];
  /** Provider ID for runtime values (when kind is "dynamic-enum") */
  readonly providerId?: string;
  /** Placeholder shown as ghost text, e.g. "<model-name>" */
  readonly placeholder?: string;
}

// ---------------------------------------------------------------------------
// Command tree nodes
// ---------------------------------------------------------------------------

export type CommandNode = LiteralNode | ArgumentNode;

export interface LiteralNode {
  readonly type: "literal";
  /** The exact token this node matches, e.g. "list", "show" */
  readonly value: string;
  /** Description shown in completion detail */
  readonly description?: string;
  /** Child nodes to match after this literal */
  readonly children?: readonly CommandNode[];
  /** Flags valid when this literal is active */
  readonly flags?: readonly FlagSpec[];
}

export interface ArgumentNode {
  readonly type: "argument";
  /** Argument specification */
  readonly arg: ArgSpec;
  /** Child nodes to match after this argument is consumed */
  readonly children?: readonly CommandNode[];
  /** Flags valid when this argument is active */
  readonly flags?: readonly FlagSpec[];
}

// ---------------------------------------------------------------------------
// Command specification
// ---------------------------------------------------------------------------

export interface CommandSpec {
  /** Primary command name (without the leading /) */
  readonly name: string;
  /** Alternative names */
  readonly aliases?: readonly string[];
  /** Human description */
  readonly description: string;
  /** Full usage string, e.g. "/model <model-name>" */
  readonly usage: string;
  /** First-level nodes after the command token */
  readonly root: readonly CommandNode[];
  /** Command-level flags (valid everywhere in the command) */
  readonly flags?: readonly FlagSpec[];
}
