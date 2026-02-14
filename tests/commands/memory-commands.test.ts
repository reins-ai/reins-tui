import { describe, expect, test } from "bun:test";

import {
  dispatchCommand,
  type CommandHandlerContext,
  type MemoryCommandContext,
  type MemoryEntry,
  type MemoryType,
  type MemoryLayer,
} from "../../src/commands/handlers";
import { parseSlashCommand } from "../../src/commands/parser";
import { SLASH_COMMANDS } from "../../src/commands/registry";
import { ok, err } from "../../src/daemon/contracts";

function createMemoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = new Date().toISOString();

  return {
    id: overrides.id ?? "mem-001-abc-def",
    content: overrides.content ?? "User prefers dark themes",
    type: overrides.type ?? "preference",
    layer: overrides.layer ?? "stm",
    importance: overrides.importance ?? 0.7,
    confidence: overrides.confidence ?? 1.0,
    tags: overrides.tags ?? [],
    entities: overrides.entities ?? [],
    source: overrides.source ?? { type: "explicit" },
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    accessedAt: overrides.accessedAt ?? now,
    ...(overrides.supersedes ? { supersedes: overrides.supersedes } : {}),
    ...(overrides.supersededBy ? { supersededBy: overrides.supersededBy } : {}),
  };
}

interface MockMemoryState {
  entries: MemoryEntry[];
  lastRememberInput: {
    content: string;
    type?: MemoryType;
    tags?: string[];
    conversationId?: string;
  } | null;
}

function createMockMemoryContext(
  overrides: Partial<{ available: boolean; entries: MemoryEntry[] }> = {},
): { memory: MemoryCommandContext; state: MockMemoryState } {
  const state: MockMemoryState = {
    entries: overrides.entries ?? [],
    lastRememberInput: null,
  };

  let nextId = 100;

  const memory: MemoryCommandContext = {
    available: overrides.available ?? true,

    async remember(input) {
      state.lastRememberInput = input;
      const entry = createMemoryEntry({
        id: `mem-${String(nextId++).padStart(3, "0")}-gen`,
        content: input.content,
        type: input.type ?? "fact",
        tags: input.tags ?? [],
        source: {
          type: "explicit",
          conversationId: input.conversationId,
        },
      });
      state.entries.push(entry);
      return ok(entry);
    },

    async list(options) {
      let filtered = [...state.entries];

      if (options?.type) {
        filtered = filtered.filter((e) => e.type === options.type);
      }

      if (options?.layer) {
        filtered = filtered.filter((e) => e.layer === options.layer);
      }

      const limit = options?.limit ?? 20;
      return ok(filtered.slice(0, limit));
    },

    async show(id) {
      const entry = state.entries.find(
        (e) => e.id === id || e.id.startsWith(id),
      );
      return ok(entry ?? null);
    },
  };

  return { memory, state };
}

function createTestContext(
  memoryOverrides: Partial<{ available: boolean; entries: MemoryEntry[] }> = {},
): {
  context: CommandHandlerContext;
  memoryState: MockMemoryState;
} {
  const { memory, state: memoryState } = createMockMemoryContext(memoryOverrides);

  const context: CommandHandlerContext = {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default"],
      currentModel: "default",
      setModel() {},
    },
    theme: {
      activeTheme: "reins-dark",
      listThemes() {
        return ["reins-dark"];
      },
      setTheme() {
        return true;
      },
    },
    session: {
      activeConversationId: "conv-123",
      messages: [],
      createConversation() {
        return "conv-new";
      },
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    memory,
    daemonClient: null,
  };

  return { context, memoryState };
}

async function runCommand(input: string, context: CommandHandlerContext) {
  const parsed = parseSlashCommand(input);
  if (!parsed.ok) {
    return parsed;
  }

  return dispatchCommand(parsed.value, context);
}

describe("memory command registration", () => {
  test("/remember is registered in command catalog", () => {
    const rememberCmd = SLASH_COMMANDS.find((c) => c.name === "remember");
    expect(rememberCmd).toBeDefined();
    expect(rememberCmd!.category).toBe("memory");
    expect(rememberCmd!.handlerKey).toBe("REMEMBER");
    expect(rememberCmd!.aliases).toContain("rem");
  });

  test("/memory is registered in command catalog", () => {
    const memoryCmd = SLASH_COMMANDS.find((c) => c.name === "memory");
    expect(memoryCmd).toBeDefined();
    expect(memoryCmd!.category).toBe("memory");
    expect(memoryCmd!.handlerKey).toBe("MEMORY");
    expect(memoryCmd!.aliases).toContain("mem");
  });

  test("memory commands appear in /help output", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/help", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("/remember");
      expect(result.value.responseText).toContain("/memory");
      expect(result.value.responseText).toContain("Memory:");
    }
  });
});

describe("/remember command", () => {
  test("saves explicit memory with content", async () => {
    const { context, memoryState } = createTestContext();
    const result = await runCommand("/remember User likes TypeScript", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.statusMessage).toContain("Memory saved");
      expect(result.value.responseText).toContain("User likes TypeScript");
    }

    expect(memoryState.lastRememberInput).not.toBeNull();
    expect(memoryState.lastRememberInput!.content).toBe("User likes TypeScript");
  });

  test("saves memory with --type flag", async () => {
    const { context, memoryState } = createTestContext();
    const result = await runCommand("/remember --type preference Prefers dark mode", context);

    expect(result.ok).toBe(true);
    expect(memoryState.lastRememberInput!.type).toBe("preference");
    expect(memoryState.lastRememberInput!.content).toBe("Prefers dark mode");
  });

  test("saves memory with --type=value syntax", async () => {
    const { context, memoryState } = createTestContext();
    const result = await runCommand("/remember --type=decision Chose PostgreSQL", context);

    expect(result.ok).toBe(true);
    expect(memoryState.lastRememberInput!.type).toBe("decision");
  });

  test("maps 'note' type to 'fact'", async () => {
    const { context, memoryState } = createTestContext();
    const result = await runCommand("/remember --type note Meeting at 3pm", context);

    expect(result.ok).toBe(true);
    expect(memoryState.lastRememberInput!.type).toBe("fact");
  });

  test("saves memory with --tags flag", async () => {
    const { context, memoryState } = createTestContext();
    const result = await runCommand("/remember --tags work,project Important deadline", context);

    expect(result.ok).toBe(true);
    expect(memoryState.lastRememberInput!.tags).toEqual(["work", "project"]);
  });

  test("passes active conversation ID as source", async () => {
    const { context, memoryState } = createTestContext();
    await runCommand("/remember Some fact", context);

    expect(memoryState.lastRememberInput!.conversationId).toBe("conv-123");
  });

  test("works with /rem alias", async () => {
    const { context, memoryState } = createTestContext();
    const result = await runCommand("/rem Quick note", context);

    expect(result.ok).toBe(true);
    expect(memoryState.lastRememberInput!.content).toBe("Quick note");
  });

  test("returns error for empty content", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/remember", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing memory content");
    }
  });

  test("returns error for invalid type", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/remember --type invalid Some text", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Invalid memory type");
    }
  });

  test("returns error for empty tags", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/remember --tags= Some text", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Tags flag");
    }
  });

  test("returns error when memory service unavailable", async () => {
    const { context } = createTestContext({ available: false });
    const result = await runCommand("/remember Some text", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
      expect(result.error.message).toContain("Memory service is not available");
    }
  });

  test("returns error when memory context is null", async () => {
    const { context } = createTestContext();
    const contextWithoutMemory = { ...context, memory: null };
    const result = await runCommand("/remember Some text", contextWithoutMemory);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });
});

describe("/memory list command", () => {
  test("lists all memories", async () => {
    const entries = [
      createMemoryEntry({ id: "mem-001", content: "Fact one", type: "fact", importance: 0.8 }),
      createMemoryEntry({ id: "mem-002", content: "Preference two", type: "preference", importance: 0.6 }),
    ];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001");
      expect(result.value.responseText).toContain("mem-002");
      expect(result.value.responseText).toContain("2 memories shown");
      expect(result.value.statusMessage).toContain("2 memories found");
    }
  });

  test("defaults to list when no subcommand given", async () => {
    const entries = [createMemoryEntry({ id: "mem-001", content: "A fact" })];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001");
    }
  });

  test("filters by --type flag", async () => {
    const entries = [
      createMemoryEntry({ id: "mem-001", type: "fact" }),
      createMemoryEntry({ id: "mem-002", type: "preference" }),
    ];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list --type fact", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001");
      expect(result.value.responseText).not.toContain("mem-002");
      expect(result.value.statusMessage).toContain("1 memory found");
    }
  });

  test("filters by --layer flag", async () => {
    const entries = [
      createMemoryEntry({ id: "mem-001", layer: "stm" }),
      createMemoryEntry({ id: "mem-002", layer: "ltm" }),
    ];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list --layer ltm", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-002");
      expect(result.value.responseText).not.toContain("mem-001");
    }
  });

  test("respects --limit flag", async () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      createMemoryEntry({ id: `mem-${String(i + 1).padStart(3, "0")}` }),
    );
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list --limit 2", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("2 memories shown");
    }
  });

  test("shows empty state message", async () => {
    const { context } = createTestContext({ entries: [] });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("No memories found");
    }
  });

  test("shows importance stars in list", async () => {
    const entries = [createMemoryEntry({ importance: 0.8 })];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("\u2605");
    }
  });

  test("truncates long content in list preview", async () => {
    const longContent = "A".repeat(200);
    const entries = [createMemoryEntry({ content: longContent })];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("\u2026");
      expect(result.value.responseText).not.toContain("A".repeat(200));
    }
  });

  test("returns error for invalid type filter", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/memory list --type invalid", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Invalid memory type");
    }
  });

  test("returns error for invalid layer filter", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/memory list --layer invalid", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Invalid memory layer");
    }
  });

  test("returns error for invalid limit", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/memory list --limit abc", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Limit must be a positive integer");
    }
  });

  test("returns error when memory service unavailable", async () => {
    const { context } = createTestContext({ available: false });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });

  test("works with /mem alias", async () => {
    const entries = [createMemoryEntry({ id: "mem-001" })];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/mem list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001");
    }
  });

  test("singular 'memory' for single result", async () => {
    const entries = [createMemoryEntry()];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("1 memory shown");
      expect(result.value.statusMessage).toContain("1 memory found");
    }
  });
});

describe("/memory show command", () => {
  test("shows full memory details", async () => {
    const entry = createMemoryEntry({
      id: "mem-001-abc-def",
      content: "User prefers dark themes",
      type: "preference",
      layer: "stm",
      importance: 0.7,
      confidence: 1.0,
      tags: ["ui", "theme"],
      entities: ["dark-mode"],
      source: { type: "explicit", conversationId: "conv-123" },
      createdAt: "2026-02-13T10:00:00.000Z",
      updatedAt: "2026-02-13T10:00:00.000Z",
      accessedAt: "2026-02-13T10:00:00.000Z",
    });
    const { context } = createTestContext({ entries: [entry] });
    const result = await runCommand("/memory show mem-001-abc-def", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("# Memory: mem-001-abc-def");
      expect(result.value.responseText).toContain("User prefers dark themes");
      expect(result.value.responseText).toContain("Type:        preference");
      expect(result.value.responseText).toContain("Layer:       stm");
      expect(result.value.responseText).toContain("Importance:");
      expect(result.value.responseText).toContain("0.70");
      expect(result.value.responseText).toContain("Confidence:  1.00");
      expect(result.value.responseText).toContain("Tags:        ui, theme");
      expect(result.value.responseText).toContain("Entities:    dark-mode");
      expect(result.value.responseText).toContain("Type:            explicit");
      expect(result.value.responseText).toContain("Conversation:    conv-123");
      expect(result.value.responseText).toContain("Created:");
      expect(result.value.responseText).toContain("Updated:");
      expect(result.value.responseText).toContain("Accessed:");
    }
  });

  test("shows supersession info when present", async () => {
    const entry = createMemoryEntry({
      id: "mem-002",
      supersedes: "mem-001",
      supersededBy: "mem-003",
    });
    const { context } = createTestContext({ entries: [entry] });
    const result = await runCommand("/memory show mem-002", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("Supersedes:      mem-001");
      expect(result.value.responseText).toContain("Superseded by:   mem-003");
    }
  });

  test("matches by prefix", async () => {
    const entry = createMemoryEntry({ id: "mem-001-abc-def" });
    const { context } = createTestContext({ entries: [entry] });
    const result = await runCommand("/memory show mem-001", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("mem-001-abc-def");
    }
  });

  test("returns error for missing ID", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/memory show", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Missing memory ID");
    }
  });

  test("returns error for non-existent memory", async () => {
    const { context } = createTestContext({ entries: [] });
    const result = await runCommand("/memory show mem-999", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toContain("mem-999");
    }
  });

  test("returns error when memory service unavailable", async () => {
    const { context } = createTestContext({ available: false });
    const result = await runCommand("/memory show mem-001", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED");
    }
  });
});

describe("/memory subcommand routing", () => {
  test("returns error for unknown subcommand", async () => {
    const { context } = createTestContext();
    const result = await runCommand("/memory delete mem-001", context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_ARGUMENT");
      expect(result.error.message).toContain("Unknown memory subcommand");
    }
  });
});

describe("memory output formatting", () => {
  test("importance stars reflect value correctly", async () => {
    const entries = [
      createMemoryEntry({ id: "mem-low", importance: 0.2 }),
      createMemoryEntry({ id: "mem-high", importance: 1.0 }),
    ];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const text = result.value.responseText!;
      // importance 0.2 → 1 filled star
      expect(text).toContain("\u2605\u2606\u2606\u2606\u2606");
      // importance 1.0 → 5 filled stars
      expect(text).toContain("\u2605\u2605\u2605\u2605\u2605");
    }
  });

  test("type labels are formatted correctly in list", async () => {
    const entries = [
      createMemoryEntry({ id: "mem-f", type: "fact" }),
      createMemoryEntry({ id: "mem-p", type: "preference" }),
      createMemoryEntry({ id: "mem-d", type: "decision" }),
    ];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("[fact]");
      expect(result.value.responseText).toContain("[pref]");
      expect(result.value.responseText).toContain("[decision]");
    }
  });

  test("list includes header row", async () => {
    const entries = [createMemoryEntry()];
    const { context } = createTestContext({ entries });
    const result = await runCommand("/memory list", context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.responseText).toContain("ID");
      expect(result.value.responseText).toContain("Type");
      expect(result.value.responseText).toContain("Importance");
      expect(result.value.responseText).toContain("Content");
    }
  });
});
