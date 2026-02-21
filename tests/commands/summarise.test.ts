import { describe, expect, mock, test } from "bun:test";

import {
  createSummariseHandler,
  handleSummariseCommand,
  parseKeepArg,
  type SummariseCommandDeps,
} from "../../src/commands/handlers/summarise";
import type { CommandArgs } from "../../src/commands/handlers/types";
import { SLASH_COMMANDS } from "../../src/commands/registry";

// --- Helpers ---

function makeArgs(
  positional: string[] = [],
  flags: Record<string, string | boolean> = {},
): CommandArgs {
  return { positional, flags };
}

// ---------------------------------------------------------------------------
// parseKeepArg
// ---------------------------------------------------------------------------

describe("parseKeepArg", () => {
  test("defaults to 20 with no args", () => {
    const result = parseKeepArg(makeArgs());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(20);
    }
  });

  test("parses --keep=5 (equals form)", () => {
    const result = parseKeepArg(makeArgs([], { keep: "5" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  test("parses --keep=10 (equals form)", () => {
    const result = parseKeepArg(makeArgs([], { keep: "10" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  test("parses --keep=0 (equals form)", () => {
    const result = parseKeepArg(makeArgs([], { keep: "0" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test("parses --keep 5 (space-separated form)", () => {
    // When --keep is a boolean flag, the next positional is the value
    const result = parseKeepArg(makeArgs(["5"], { keep: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  test("parses --keep 0 (space-separated form)", () => {
    const result = parseKeepArg(makeArgs(["0"], { keep: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test("clamps negative values to 0 (equals form)", () => {
    const result = parseKeepArg(makeArgs([], { keep: "-3" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test("clamps negative values to 0 (space-separated form)", () => {
    const result = parseKeepArg(makeArgs(["-3"], { keep: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  test("returns default 20 for bare --keep without value", () => {
    // --keep at end of args with no positional following
    const result = parseKeepArg(makeArgs([], { keep: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(20);
    }
  });

  test("returns default 20 when --keep followed by non-numeric positional", () => {
    const result = parseKeepArg(makeArgs(["abc"], { keep: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(20);
    }
  });

  test("returns error for non-numeric --keep= value", () => {
    const result = parseKeepArg(makeArgs([], { keep: "abc" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid --keep value");
      expect(result.message).toContain("abc");
    }
  });

  test("returns error for Infinity --keep= value", () => {
    const result = parseKeepArg(makeArgs([], { keep: "Infinity" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid --keep value");
    }
  });

  test("floors fractional values", () => {
    const result = parseKeepArg(makeArgs([], { keep: "7.9" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(7);
    }
  });

  test("returns default 20 for unrecognised flag type", () => {
    // Edge case: flagValue is something unexpected (e.g. false)
    const result = parseKeepArg(makeArgs([], { keep: false as unknown as boolean }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(20);
    }
  });
});

// ---------------------------------------------------------------------------
// handleSummariseCommand registration
// ---------------------------------------------------------------------------

describe("handleSummariseCommand registration", () => {
  test("SUMMARISE_CONTEXT key exists in slash command registry", () => {
    const summariseCmd = SLASH_COMMANDS.find((cmd) => cmd.name === "summarise");
    expect(summariseCmd).toBeDefined();
    expect(summariseCmd!.handlerKey).toBe("SUMMARISE_CONTEXT");
  });

  test("summarise command has 'sum' alias", () => {
    const summariseCmd = SLASH_COMMANDS.find((cmd) => cmd.name === "summarise");
    expect(summariseCmd).toBeDefined();
    expect(summariseCmd!.aliases).toContain("sum");
  });

  test("summarise command is in 'conversation' category", () => {
    const summariseCmd = SLASH_COMMANDS.find((cmd) => cmd.name === "summarise");
    expect(summariseCmd).toBeDefined();
    expect(summariseCmd!.category).toBe("conversation");
  });

  test("summarise command has usage string", () => {
    const summariseCmd = SLASH_COMMANDS.find((cmd) => cmd.name === "summarise");
    expect(summariseCmd).toBeDefined();
    expect(summariseCmd!.usage.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// handleSummariseCommand (default fallback handler)
// ---------------------------------------------------------------------------

describe("handleSummariseCommand (default handler)", () => {
  test("returns ok with compacting status for valid args", () => {
    const result = handleSummariseCommand(makeArgs(), {} as any);
    // The default handler is synchronous, returns a Result directly
    expect(result).toBeDefined();
    const resolved = result as { ok: true; value: { statusMessage: string; responseText: string } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.responseText).toContain("not available");
  });

  test("returns error for invalid --keep value", () => {
    const result = handleSummariseCommand(makeArgs([], { keep: "xyz" }), {} as any);
    const resolved = result as { ok: false; error: { code: string; message: string } };
    expect(resolved.ok).toBe(false);
    expect(resolved.error.code).toBe("INVALID_ARGUMENT");
  });
});

// ---------------------------------------------------------------------------
// createSummariseHandler (wired handler)
// ---------------------------------------------------------------------------

describe("createSummariseHandler", () => {
  test("calls compactContext with parsed keep value", async () => {
    const compactContext = mock(async (_keep: number) => ({ messageCount: 5 }));
    const deps: SummariseCommandDeps = { compactContext };
    const handler = createSummariseHandler(deps);

    const result = await handler(makeArgs([], { keep: "10" }), {} as any);

    expect(compactContext).toHaveBeenCalledTimes(1);
    expect(compactContext).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      ok: true,
      value: {
        statusMessage: "\u2713 Compacted",
        responseText: "\u2713 Compacted to summary + last 10 messages (5 total)",
      },
    });
  });

  test("uses default keep=20 when no --keep provided", async () => {
    const compactContext = mock(async (_keep: number) => ({ messageCount: 22 }));
    const deps: SummariseCommandDeps = { compactContext };
    const handler = createSummariseHandler(deps);

    await handler(makeArgs(), {} as any);

    expect(compactContext).toHaveBeenCalledWith(20);
  });

  test("returns error when compactContext throws", async () => {
    const compactContext = mock(async () => {
      throw new Error("Provider unavailable");
    });
    const deps: SummariseCommandDeps = { compactContext };
    const handler = createSummariseHandler(deps);

    const result = await handler(makeArgs(), {} as any);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
      expect(result.error.message).toContain("Provider unavailable");
    }
  });

  test("returns error for invalid --keep before calling compactContext", async () => {
    const compactContext = mock(async () => ({ messageCount: 0 }));
    const deps: SummariseCommandDeps = { compactContext };
    const handler = createSummariseHandler(deps);

    const result = await handler(makeArgs([], { keep: "not-a-number" }), {} as any);

    expect(result.ok).toBe(false);
    expect(compactContext).not.toHaveBeenCalled();
  });

  test("handles non-Error thrown values", async () => {
    const compactContext = mock(async () => {
      throw "string error";
    });
    const deps: SummariseCommandDeps = { compactContext };
    const handler = createSummariseHandler(deps);

    const result = await handler(makeArgs(), {} as any);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("string error");
    }
  });
});
