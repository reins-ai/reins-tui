import { err, ok } from "../../daemon/contracts";
import type { CommandArgs, CommandHandler, CommandHandlerContext } from "./types";

// --- Constants ---

/** Default number of recent messages to keep after compaction. */
const DEFAULT_KEEP = 20;

/** Minimum allowed value for --keep (clamped, never negative). */
const MIN_KEEP = 0;

// --- Argument parsing ---

/**
 * Parse the `--keep N` option from command arguments.
 *
 * Supports three forms:
 *   /summarise --keep=10       → flags.keep = "10"
 *   /summarise --keep 10       → flags.keep = true, positional[0] = "10"
 *   /summarise                 → default (20)
 *
 * Returns the clamped keep value (min 0) or an error for non-numeric input.
 */
export function parseKeepArg(args: CommandArgs): { ok: true; value: number } | { ok: false; message: string } {
  const flagValue = args.flags["keep"];

  if (flagValue === undefined) {
    return { ok: true, value: DEFAULT_KEEP };
  }

  // --keep=N  →  flagValue is the string "N"
  if (typeof flagValue === "string") {
    const parsed = Number(flagValue);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return { ok: false, message: `Invalid --keep value '${flagValue}'. Expected a number.` };
    }
    return { ok: true, value: Math.max(MIN_KEEP, Math.floor(parsed)) };
  }

  // --keep 10  →  flagValue is true (boolean), next positional is "10"
  if (flagValue === true) {
    const nextPositional = args.positional[0];
    if (nextPositional === undefined) {
      // Bare --keep with no value → use default
      return { ok: true, value: DEFAULT_KEEP };
    }

    const parsed = Number(nextPositional);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      // The positional isn't a number — treat --keep as bare (use default)
      return { ok: true, value: DEFAULT_KEEP };
    }

    return { ok: true, value: Math.max(MIN_KEEP, Math.floor(parsed)) };
  }

  return { ok: true, value: DEFAULT_KEEP };
}

// --- Dependency injection for testability ---

export interface SummariseCommandDeps {
  /**
   * Compact the current conversation context, keeping the most recent N
   * messages plus a generated summary of older messages.
   *
   * Returns the total message count after compaction.
   */
  compactContext: (keep: number) => Promise<{ messageCount: number }>;
}

/**
 * Create a `/summarise` handler wired to real compaction dependencies.
 *
 * The handler:
 *   1. Parses `--keep N` from args (default 20, min 0).
 *   2. Returns a "⟳ Compacting…" status message.
 *   3. Calls `deps.compactContext(keep)` to run SummarisationStrategy.
 *   4. Returns a "✓ Compacted" confirmation with the resulting message count.
 */
export function createSummariseHandler(deps: SummariseCommandDeps): CommandHandler {
  return async (args: CommandArgs, _context: CommandHandlerContext) => {
    const keepResult = parseKeepArg(args);
    if (!keepResult.ok) {
      return err({
        code: "INVALID_ARGUMENT",
        message: keepResult.message,
      });
    }

    const keep = keepResult.value;

    try {
      const result = await deps.compactContext(keep);

      return ok({
        statusMessage: "\u2713 Compacted",
        responseText: `\u2713 Compacted to summary + last ${keep} messages (${result.messageCount} total)`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err({
        code: "UNSUPPORTED",
        message: `Compaction failed: ${message}`,
      });
    }
  };
}

/**
 * Default `/summarise` handler used when no compaction backend is available.
 * Returns an informational message that context compaction is not configured.
 */
export const handleSummariseCommand: CommandHandler = (args) => {
  const keepResult = parseKeepArg(args);
  if (!keepResult.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: keepResult.message,
    });
  }

  return ok({
    statusMessage: "\u27F3 Compacting\u2026",
    responseText: [
      "\u27F3 Context compaction is not available.",
      "",
      "Make sure the daemon is running and a provider is configured",
      "for summarisation. The SummarisationStrategy requires an active",
      "LLM connection to generate context summaries.",
    ].join("\n"),
  });
};
