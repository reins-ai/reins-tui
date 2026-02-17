import { describe, expect, it } from "bun:test";
import { handleBrowserCommand } from "../../src/commands/handlers/browser";
import type { CommandHandlerContext } from "../../src/commands/handlers/types";

// ---------------------------------------------------------------------------
// Minimal mock context — daemonClient is null for arg-parsing tests.
// Subcommand handlers that call the daemon will hit the graceful fallback
// path because fetch will fail with no real daemon running.
// ---------------------------------------------------------------------------

const MOCK_CONTEXT = {
  catalog: [],
  model: {
    availableModels: [],
    currentModel: "test-model",
    setModel: () => {},
  },
  theme: {
    activeTheme: "default",
    listThemes: () => [],
    setTheme: () => false,
  },
  session: {
    activeConversationId: null,
    messages: [],
    createConversation: () => "test-id",
    clearConversation: () => {},
  },
  view: {
    compactMode: false,
    setCompactMode: () => {},
  },
  environment: null,
  memory: null,
  daemonClient: null,
} satisfies CommandHandlerContext;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleBrowserCommand subcommand routing", () => {
  it("returns OPEN_BROWSER_PANEL signal when called with no args", () => {
    const result = handleBrowserCommand(
      { positional: [], flags: {} },
      MOCK_CONTEXT,
    );

    // Synchronous path — no subcommand
    expect(result).toBeDefined();
    const resolved = result as { ok: true; value: { statusMessage: string; signals: readonly { type: string }[] } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.statusMessage).toBe("Browser panel");
    expect(resolved.value.signals).toHaveLength(1);
    expect(resolved.value.signals![0].type).toBe("OPEN_BROWSER_PANEL");
  });

  it("returns error for unknown subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["foobar"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: false; error: { code: string; message: string } };
    expect(resolved.ok).toBe(false);
    expect(resolved.error.code).toBe("INVALID_ARGUMENT");
    expect(resolved.error.message).toContain("Unknown subcommand");
    expect(resolved.error.message).toContain("foobar");
  });

  it("returns a promise for 'headed' subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["headed"], flags: {} },
      MOCK_CONTEXT,
    );

    // Async handler — returns a Promise
    expect(result).toBeInstanceOf(Promise);
  });

  it("returns a promise for 'screenshot' subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["screenshot"], flags: {} },
      MOCK_CONTEXT,
    );

    expect(result).toBeInstanceOf(Promise);
  });

  it("returns a promise for 'close' subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["close"], flags: {} },
      MOCK_CONTEXT,
    );

    expect(result).toBeInstanceOf(Promise);
  });

  it("resolves alias 'h' to headed subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["h"], flags: {} },
      MOCK_CONTEXT,
    );

    expect(result).toBeInstanceOf(Promise);
  });

  it("resolves alias 'ss' to screenshot subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["ss"], flags: {} },
      MOCK_CONTEXT,
    );

    expect(result).toBeInstanceOf(Promise);
  });

  it("resolves alias 'stop' to close subcommand", () => {
    const result = handleBrowserCommand(
      { positional: ["stop"], flags: {} },
      MOCK_CONTEXT,
    );

    expect(result).toBeInstanceOf(Promise);
  });
});

describe("handleBrowserCommand headed subcommand", () => {
  it("returns a non-empty statusMessage with graceful fallback", async () => {
    const result = await handleBrowserCommand(
      { positional: ["headed"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: true; value: { statusMessage: string; responseText?: string; signals?: readonly { type: string }[] } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.statusMessage.length).toBeGreaterThan(0);
    expect(resolved.value.responseText).toBeDefined();
    expect(resolved.value.responseText!.length).toBeGreaterThan(0);
  });

  it("includes OPEN_BROWSER_PANEL signal", async () => {
    const result = await handleBrowserCommand(
      { positional: ["headed"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: true; value: { signals?: readonly { type: string }[] } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.signals).toBeDefined();
    expect(resolved.value.signals!.some((s) => s.type === "OPEN_BROWSER_PANEL")).toBe(true);
  });
});

describe("handleBrowserCommand screenshot subcommand", () => {
  it("returns a non-empty statusMessage with graceful fallback", async () => {
    const result = await handleBrowserCommand(
      { positional: ["screenshot"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: true; value: { statusMessage: string; responseText?: string } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.statusMessage.length).toBeGreaterThan(0);
    expect(resolved.value.responseText).toBeDefined();
    expect(resolved.value.responseText!.length).toBeGreaterThan(0);
  });

  it("includes OPEN_BROWSER_PANEL signal", async () => {
    const result = await handleBrowserCommand(
      { positional: ["screenshot"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: true; value: { signals?: readonly { type: string }[] } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.signals).toBeDefined();
    expect(resolved.value.signals!.some((s) => s.type === "OPEN_BROWSER_PANEL")).toBe(true);
  });
});

describe("handleBrowserCommand close subcommand", () => {
  it("returns a non-empty statusMessage with graceful fallback", async () => {
    const result = await handleBrowserCommand(
      { positional: ["close"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: true; value: { statusMessage: string; responseText?: string } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.statusMessage.length).toBeGreaterThan(0);
    expect(resolved.value.responseText).toBeDefined();
    expect(resolved.value.responseText!.length).toBeGreaterThan(0);
  });

  it("includes OPEN_BROWSER_PANEL signal", async () => {
    const result = await handleBrowserCommand(
      { positional: ["close"], flags: {} },
      MOCK_CONTEXT,
    );

    const resolved = result as { ok: true; value: { signals?: readonly { type: string }[] } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.signals).toBeDefined();
    expect(resolved.value.signals!.some((s) => s.type === "OPEN_BROWSER_PANEL")).toBe(true);
  });
});

describe("callBrowserApi graceful error handling", () => {
  it("never throws on network failure — all subcommands return ok results", async () => {
    // All three subcommands should gracefully handle daemon being unreachable
    const subcommands = ["headed", "screenshot", "close"];

    for (const sub of subcommands) {
      const result = await handleBrowserCommand(
        { positional: [sub], flags: {} },
        MOCK_CONTEXT,
      );

      // Should always return ok (graceful fallback), never throw
      const resolved = result as { ok: boolean };
      expect(resolved.ok).toBe(true);
    }
  });
});
