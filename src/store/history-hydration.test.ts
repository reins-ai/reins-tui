import { describe, expect, it, spyOn } from "bun:test";

import type {
  DaemonHistoryNormalizationContext,
  DaemonHydratedHistoryMessage,
  DaemonRawHistoryMessage,
  DaemonRawHistoryPayload,
} from "../daemon/contracts";
import type { DisplayMessage } from "./types";
import type {
  ApplyHydratedHistoryChunkInput,
  HistoryHydrationState,
} from "./index";
import {
  applyHydratedHistoryChunk,
  createHydrationState,
  decodeEscapedText,
  historyPayloadNormalizer,
  hydratedMessageToDisplayMessage,
  normalizeHistoryMessage,
  sortHydratedHistoryMessages,
} from "./history-hydration";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawMessage(
  overrides: Partial<DaemonRawHistoryMessage> & { payload: DaemonRawHistoryPayload },
): DaemonRawHistoryMessage {
  return {
    id: overrides.id ?? "msg-1",
    role: overrides.role ?? "assistant",
    createdAt: overrides.createdAt ?? "2026-01-15T10:00:00.000Z",
    payload: overrides.payload,
  };
}

function makeContext(
  overrides?: Partial<DaemonHistoryNormalizationContext>,
): DaemonHistoryNormalizationContext {
  return {
    source: overrides?.source ?? "reload",
    fallbackIndex: overrides?.fallbackIndex ?? 0,
    seenMessageIds: overrides?.seenMessageIds ?? new Set(),
  };
}

function structuredPayload(
  text: string,
  blocks?: Extract<DaemonRawHistoryPayload, { kind: "structured" }>["value"]["blocks"],
): DaemonRawHistoryPayload {
  return {
    kind: "structured",
    value: { text, blocks },
  };
}

function serializedPayload(
  value: string,
  encoding: "json" | "json-escaped" | "plain-text" = "json",
): DaemonRawHistoryPayload {
  return { kind: "serialized", value, encoding };
}

// ---------------------------------------------------------------------------
// decodeEscapedText
// ---------------------------------------------------------------------------

describe("decodeEscapedText", () => {
  it("returns input unchanged when no backslashes present", () => {
    expect(decodeEscapedText("hello world")).toBe("hello world");
  });

  it("decodes \\n to newline", () => {
    expect(decodeEscapedText("line1\\nline2")).toBe("line1\nline2");
  });

  it("decodes \\t to tab", () => {
    expect(decodeEscapedText("col1\\tcol2")).toBe("col1\tcol2");
  });

  it("decodes \\r to carriage return", () => {
    expect(decodeEscapedText("line1\\rline2")).toBe("line1\rline2");
  });

  it("decodes \\\\ to single backslash", () => {
    expect(decodeEscapedText("path\\\\to\\\\file")).toBe("path\\to\\file");
  });

  it('decodes \\" to double quote', () => {
    expect(decodeEscapedText('say \\"hello\\"')).toBe('say "hello"');
  });

  it("decodes multiple escape sequences in one string", () => {
    expect(decodeEscapedText("a\\nb\\tc\\\\d")).toBe("a\nb\tc\\d");
  });

  it("handles empty string", () => {
    expect(decodeEscapedText("")).toBe("");
  });

  it("does not over-decode unknown escape sequences", () => {
    expect(decodeEscapedText("\\x41\\u0041")).toBe("\\x41\\u0041");
  });
});

// ---------------------------------------------------------------------------
// normalizeHistoryMessage — structured payloads
// ---------------------------------------------------------------------------

describe("normalizeHistoryMessage", () => {
  describe("structured payloads", () => {
    it("normalizes a simple text message", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("Hello world"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.id).toBe("msg-1");
      expect(result.message.role).toBe("assistant");
      expect(result.message.payload.text).toBe("Hello world");
      expect(result.message.payload.blocks).toHaveLength(1);
      expect(result.message.payload.blocks[0]).toEqual({ type: "text", text: "Hello world" });
    });

    it("decodes escaped text in structured payload", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("line1\\nline2\\ttab"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("line1\nline2\ttab");
    });

    it("normalizes tool-use and tool-result blocks", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("", [
          { type: "text", text: "Let me check that." },
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "ls" } },
          { type: "tool-result", toolCallId: "tc-1", output: "file1.txt\\nfile2.txt" },
        ]),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      const blocks = result.message.payload.blocks;
      expect(blocks).toHaveLength(3);
      expect(blocks[0]).toEqual({ type: "text", text: "Let me check that." });
      expect(blocks[1]).toEqual({
        type: "tool-use",
        toolCallId: "tc-1",
        name: "bash",
        args: { command: "ls" },
      });
      expect(blocks[2]).toEqual({
        type: "tool-result",
        toolCallId: "tc-1",
        output: "file1.txt\nfile2.txt",
        isError: false,
      });
    });

    it("handles tool-result with result alias instead of output", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("", [
          { type: "tool-result", toolCallId: "tc-1", result: "some result" },
        ]),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.blocks[0]).toEqual({
        type: "tool-result",
        toolCallId: "tc-1",
        output: "some result",
        isError: false,
      });
    });

    it("handles tool-result with error alias instead of isError", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("", [
          { type: "tool-result", toolCallId: "tc-1", output: "fail", error: true },
        ]),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.blocks[0]).toEqual({
        type: "tool-result",
        toolCallId: "tc-1",
        output: "fail",
        isError: true,
      });
    });

    it("handles tool-use with missing args", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("", [
          { type: "tool-use", toolCallId: "tc-1", name: "read" },
        ]),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.blocks[0]).toEqual({
        type: "tool-use",
        toolCallId: "tc-1",
        name: "read",
        args: {},
      });
    });

    it("preserves role and metadata", () => {
      const raw = makeRawMessage({
        id: "user-msg-42",
        role: "user",
        createdAt: "2026-01-15T12:30:00.000Z",
        payload: structuredPayload("What is the weather?"),
      });
      const result = normalizeHistoryMessage(raw, makeContext({ fallbackIndex: 5 }));

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.id).toBe("user-msg-42");
      expect(result.message.role).toBe("user");
      expect(result.message.createdAt).toBe("2026-01-15T12:30:00.000Z");
      expect(result.message.ordering.timestampMs).toBe(
        new Date("2026-01-15T12:30:00.000Z").getTime(),
      );
      expect(result.message.ordering.fallbackIndex).toBe(5);
      expect(result.message.dedupeKey).toBe("user:user-msg-42");
    });
  });

  describe("serialized payloads", () => {
    it("normalizes plain-text encoding", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("Hello from plain text", "plain-text"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Hello from plain text");
      expect(result.message.payload.blocks).toEqual([
        { type: "text", text: "Hello from plain text" },
      ]);
    });

    it("normalizes json-escaped encoding with escape sequences", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("line1\\nline2\\ttab", "json-escaped"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("line1\nline2\ttab");
    });

    it("normalizes json encoding with object payload", () => {
      const jsonValue = JSON.stringify({
        text: "Hello",
        blocks: [{ type: "text", text: "Hello" }],
      });
      const raw = makeRawMessage({
        payload: serializedPayload(jsonValue, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Hello");
      expect(result.message.payload.blocks).toEqual([
        { type: "text", text: "Hello" },
      ]);
    });

    it("normalizes json encoding with double-encoded string", () => {
      const doubleEncoded = JSON.stringify("Hello\\nWorld");
      const raw = makeRawMessage({
        payload: serializedPayload(doubleEncoded, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Hello\nWorld");
    });

    it("drops message with invalid JSON in json encoding", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("{invalid json", "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("dropped");
      if (result.status !== "dropped") return;
      expect(result.reason).toBe("decode-failed");
    });
  });

  describe("idempotency", () => {
    it("returns duplicate for already-seen message id", () => {
      const raw = makeRawMessage({
        id: "seen-msg",
        payload: structuredPayload("Hello"),
      });
      const result = normalizeHistoryMessage(
        raw,
        makeContext({ seenMessageIds: new Set(["seen-msg"]) }),
      );

      expect(result.status).toBe("duplicate");
      if (result.status !== "duplicate") return;
      expect(result.dedupeKey).toBe("assistant:seen-msg");
    });
  });

  describe("validation", () => {
    it("drops message with invalid createdAt", () => {
      const raw = makeRawMessage({
        createdAt: "not-a-date",
        payload: structuredPayload("Hello"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("dropped");
      if (result.status !== "dropped") return;
      expect(result.reason).toBe("invalid-created-at");
    });
  });
});

// ---------------------------------------------------------------------------
// sortHydratedHistoryMessages
// ---------------------------------------------------------------------------

describe("sortHydratedHistoryMessages", () => {
  function makeHydrated(
    id: string,
    timestampMs: number,
    fallbackIndex: number,
  ): DaemonHydratedHistoryMessage {
    return {
      id,
      role: "assistant",
      createdAt: new Date(timestampMs).toISOString(),
      payload: { text: id, blocks: [] },
      ordering: { timestampMs, fallbackIndex },
      dedupeKey: `assistant:${id}`,
    };
  }

  it("sorts by timestamp ascending", () => {
    const messages = [
      makeHydrated("c", 3000, 0),
      makeHydrated("a", 1000, 0),
      makeHydrated("b", 2000, 0),
    ];
    const sorted = sortHydratedHistoryMessages(messages);

    expect(sorted.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks timestamp ties with fallbackIndex", () => {
    const messages = [
      makeHydrated("b", 1000, 1),
      makeHydrated("a", 1000, 0),
      makeHydrated("c", 1000, 2),
    ];
    const sorted = sortHydratedHistoryMessages(messages);

    expect(sorted.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const messages = [
      makeHydrated("b", 2000, 0),
      makeHydrated("a", 1000, 0),
    ];
    const original = [...messages];
    sortHydratedHistoryMessages(messages);

    expect(messages.map((m) => m.id)).toEqual(original.map((m) => m.id));
  });

  it("handles empty array", () => {
    expect(sortHydratedHistoryMessages([])).toEqual([]);
  });

  it("handles single element", () => {
    const messages = [makeHydrated("a", 1000, 0)];
    const sorted = sortHydratedHistoryMessages(messages);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// hydratedMessageToDisplayMessage
// ---------------------------------------------------------------------------

describe("hydratedMessageToDisplayMessage", () => {
  it("converts a text-only message", () => {
    const hydrated: DaemonHydratedHistoryMessage = {
      id: "msg-1",
      role: "user",
      createdAt: "2026-01-15T10:00:00.000Z",
      payload: {
        text: "Hello",
        blocks: [{ type: "text", text: "Hello" }],
      },
      ordering: { timestampMs: 1736935200000, fallbackIndex: 0 },
      dedupeKey: "user:msg-1",
    };

    const display = hydratedMessageToDisplayMessage(hydrated);

    expect(display.id).toBe("msg-1");
    expect(display.role).toBe("user");
    expect(display.content).toBe("Hello");
    expect(display.isStreaming).toBe(false);
    expect(display.createdAt).toBeInstanceOf(Date);
    expect(display.createdAt.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("converts tool-use and tool-result blocks into toolCalls", () => {
    const hydrated: DaemonHydratedHistoryMessage = {
      id: "msg-2",
      role: "assistant",
      createdAt: "2026-01-15T10:01:00.000Z",
      payload: {
        text: "",
        blocks: [
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { cmd: "ls" } },
          { type: "tool-result", toolCallId: "tc-1", output: "file.txt", isError: false },
        ],
      },
      ordering: { timestampMs: 1736935260000, fallbackIndex: 1 },
      dedupeKey: "assistant:msg-2",
    };

    const display = hydratedMessageToDisplayMessage(hydrated);

    expect(display.toolCalls).toHaveLength(1);
    expect(display.toolCalls![0]).toEqual({
      id: "tc-1",
      name: "bash",
      status: "complete",
      args: { cmd: "ls" },
      result: "file.txt",
      isError: false,
    });
  });

  it("marks tool call as error when isError is true", () => {
    const hydrated: DaemonHydratedHistoryMessage = {
      id: "msg-3",
      role: "assistant",
      createdAt: "2026-01-15T10:02:00.000Z",
      payload: {
        text: "",
        blocks: [
          { type: "tool-use", toolCallId: "tc-2", name: "exec", args: {} },
          { type: "tool-result", toolCallId: "tc-2", output: "error msg", isError: true },
        ],
      },
      ordering: { timestampMs: 1736935320000, fallbackIndex: 2 },
      dedupeKey: "assistant:msg-3",
    };

    const display = hydratedMessageToDisplayMessage(hydrated);

    expect(display.toolCalls![0].status).toBe("error");
    expect(display.toolCalls![0].isError).toBe(true);
    expect(display.toolCalls![0].result).toBe("error msg");
  });

  it("generates contentBlocks from blocks", () => {
    const hydrated: DaemonHydratedHistoryMessage = {
      id: "msg-4",
      role: "assistant",
      createdAt: "2026-01-15T10:03:00.000Z",
      payload: {
        text: "Checking...",
        blocks: [
          { type: "text", text: "Checking..." },
          { type: "tool-use", toolCallId: "tc-3", name: "read", args: {} },
          { type: "tool-result", toolCallId: "tc-3", output: "content" },
        ],
      },
      ordering: { timestampMs: 1736935380000, fallbackIndex: 3 },
      dedupeKey: "assistant:msg-4",
    };

    const display = hydratedMessageToDisplayMessage(hydrated);

    expect(display.contentBlocks).toHaveLength(3);
    expect(display.contentBlocks![0]).toEqual({ type: "text", text: "Checking..." });
    expect(display.contentBlocks![1]).toEqual({ type: "tool-call", toolCallId: "tc-3" });
    expect(display.contentBlocks![2]).toEqual({ type: "tool-call", toolCallId: "tc-3" });
  });

  it("returns undefined toolCalls when no tool blocks present", () => {
    const hydrated: DaemonHydratedHistoryMessage = {
      id: "msg-5",
      role: "user",
      createdAt: "2026-01-15T10:04:00.000Z",
      payload: {
        text: "Just text",
        blocks: [{ type: "text", text: "Just text" }],
      },
      ordering: { timestampMs: 1736935440000, fallbackIndex: 4 },
      dedupeKey: "user:msg-5",
    };

    const display = hydratedMessageToDisplayMessage(hydrated);

    expect(display.toolCalls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createHydrationState
// ---------------------------------------------------------------------------

describe("createHydrationState", () => {
  it("returns empty state", () => {
    const state = createHydrationState();
    expect(state.seenMessageIds.size).toBe(0);
    expect(state.nextFallbackIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyHydratedHistoryChunk
// ---------------------------------------------------------------------------

describe("applyHydratedHistoryChunk", () => {
  function makeChunkInput(
    overrides: Partial<ApplyHydratedHistoryChunkInput> & {
      incomingRawMessages: readonly DaemonRawHistoryMessage[];
    },
  ): ApplyHydratedHistoryChunkInput {
    return {
      existingMessages: overrides.existingMessages ?? [],
      incomingRawMessages: overrides.incomingRawMessages,
      hydrationState: overrides.hydrationState ?? createHydrationState(),
      normalizer: overrides.normalizer ?? historyPayloadNormalizer,
    };
  }

  it("hydrates a batch of raw messages into display messages", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "u1",
          role: "user",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("Hello"),
        }),
        makeRawMessage({
          id: "a1",
          role: "assistant",
          createdAt: "2026-01-15T10:00:01.000Z",
          payload: structuredPayload("Hi there!"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("u1");
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("Hello");
    expect(result.messages[1].id).toBe("a1");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].content).toBe("Hi there!");
    expect(result.accepted).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
  });

  it("preserves chronological order regardless of input order", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "late",
          role: "assistant",
          createdAt: "2026-01-15T10:00:02.000Z",
          payload: structuredPayload("Second"),
        }),
        makeRawMessage({
          id: "early",
          role: "user",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("First"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages[0].id).toBe("early");
    expect(result.messages[1].id).toBe("late");
  });

  it("deduplicates messages across chunks", () => {
    const hydrationState: HistoryHydrationState = {
      seenMessageIds: new Set(["u1"]),
      nextFallbackIndex: 1,
    };

    const input = makeChunkInput({
      hydrationState,
      incomingRawMessages: [
        makeRawMessage({
          id: "u1",
          role: "user",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("Hello"),
        }),
        makeRawMessage({
          id: "a1",
          role: "assistant",
          createdAt: "2026-01-15T10:00:01.000Z",
          payload: structuredPayload("Hi"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("a1");
    expect(result.duplicates).toHaveLength(1);
  });

  it("drops malformed entries silently", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "good",
          role: "user",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("Valid"),
        }),
        makeRawMessage({
          id: "bad",
          role: "assistant",
          createdAt: "not-a-date",
          payload: structuredPayload("Invalid timestamp"),
        }),
        makeRawMessage({
          id: "bad2",
          role: "assistant",
          createdAt: "2026-01-15T10:00:01.000Z",
          payload: serializedPayload("{broken json", "json"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("good");
    expect(result.dropped).toHaveLength(2);
  });

  it("merges with existing messages without duplicating", () => {
    const existingMessages: DisplayMessage[] = [
      {
        id: "existing-1",
        role: "user",
        content: "Already here",
        isStreaming: false,
        createdAt: new Date("2026-01-15T09:59:00.000Z"),
      },
    ];

    const input = makeChunkInput({
      existingMessages,
      incomingRawMessages: [
        makeRawMessage({
          id: "existing-1",
          role: "user",
          createdAt: "2026-01-15T09:59:00.000Z",
          payload: structuredPayload("Already here"),
        }),
        makeRawMessage({
          id: "new-1",
          role: "assistant",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("New message"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    // existing-1 is in accepted (normalizer doesn't know about existing display messages)
    // but the merge deduplicates by id
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("existing-1");
    expect(result.messages[0].content).toBe("Already here"); // preserved original
    expect(result.messages[1].id).toBe("new-1");
  });

  it("updates hydration state for subsequent chunks", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "m1",
          role: "user",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("First"),
        }),
        makeRawMessage({
          id: "m2",
          role: "assistant",
          createdAt: "2026-01-15T10:00:01.000Z",
          payload: structuredPayload("Second"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.hydrationState.seenMessageIds.has("m1")).toBe(true);
    expect(result.hydrationState.seenMessageIds.has("m2")).toBe(true);
    expect(result.hydrationState.nextFallbackIndex).toBe(2);
  });

  it("handles empty incoming messages", () => {
    const input = makeChunkInput({
      incomingRawMessages: [],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(0);
    expect(result.accepted).toHaveLength(0);
  });

  it("decodes escaped text in serialized payloads end-to-end", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "escaped-msg",
          role: "assistant",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: serializedPayload("Here is output:\\nline1\\nline2\\ttab", "json-escaped"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe("Here is output:\nline1\nline2\ttab");
  });

  it("preserves all metadata through the full pipeline", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "meta-msg",
          role: "user",
          createdAt: "2026-01-15T12:30:45.123Z",
          payload: structuredPayload("Test message"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);
    const msg = result.messages[0];

    expect(msg.id).toBe("meta-msg");
    expect(msg.role).toBe("user");
    expect(msg.createdAt.toISOString()).toBe("2026-01-15T12:30:45.123Z");
    expect(msg.isStreaming).toBe(false);
  });

  it("handles mixed structured and serialized payloads in one chunk", () => {
    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "struct-msg",
          role: "user",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: structuredPayload("Structured"),
        }),
        makeRawMessage({
          id: "serial-msg",
          role: "assistant",
          createdAt: "2026-01-15T10:00:01.000Z",
          payload: serializedPayload("Serialized plain", "plain-text"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe("Structured");
    expect(result.messages[1].content).toBe("Serialized plain");
  });

  it("handles tool calls through serialized JSON payload", () => {
    const jsonPayload = JSON.stringify({
      text: "Let me check",
      blocks: [
        { type: "text", text: "Let me check" },
        { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { cmd: "pwd" } },
        { type: "tool-result", toolCallId: "tc-1", output: "/home/user" },
      ],
    });

    const input = makeChunkInput({
      incomingRawMessages: [
        makeRawMessage({
          id: "tool-msg",
          role: "assistant",
          createdAt: "2026-01-15T10:00:00.000Z",
          payload: serializedPayload(jsonPayload, "json"),
        }),
      ],
    });

    const result = applyHydratedHistoryChunk(input);

    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0];
    expect(msg.content).toBe("Let me check");
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe("bash");
    expect(msg.toolCalls![0].result).toBe("/home/user");
  });
});

// ---------------------------------------------------------------------------
// Legacy escaped-payload compatibility guards
// ---------------------------------------------------------------------------

describe("legacy compatibility guards", () => {
  describe("double-encoded structured payloads", () => {
    it("recovers a double-encoded JSON object with text and blocks", () => {
      // Simulates JSON.stringify(JSON.stringify({ text: "hello", blocks: [...] }))
      const inner = JSON.stringify({
        text: "Hello from legacy",
        blocks: [{ type: "text", text: "Hello from legacy" }],
      });
      const doubleEncoded = JSON.stringify(inner);

      const raw = makeRawMessage({
        payload: serializedPayload(doubleEncoded, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Hello from legacy");
      expect(result.message.payload.blocks).toEqual([
        { type: "text", text: "Hello from legacy" },
      ]);
    });

    it("recovers double-encoded tool blocks", () => {
      const inner = JSON.stringify({
        text: "",
        blocks: [
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "ls" } },
          { type: "tool-result", toolCallId: "tc-1", output: "file1.txt\\nfile2.txt" },
        ],
      });
      const doubleEncoded = JSON.stringify(inner);

      const raw = makeRawMessage({
        payload: serializedPayload(doubleEncoded, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.blocks).toHaveLength(2);
      expect(result.message.payload.blocks[0]).toEqual({
        type: "tool-use",
        toolCallId: "tc-1",
        name: "bash",
        args: { command: "ls" },
      });
      expect(result.message.payload.blocks[1]).toEqual({
        type: "tool-result",
        toolCallId: "tc-1",
        output: "file1.txt\nfile2.txt",
        isError: false,
      });
    });

    it("falls back to plain text for double-encoded non-structured JSON", () => {
      // JSON.stringify(JSON.stringify({ foo: "bar" })) — no text/blocks fields
      const inner = JSON.stringify({ foo: "bar" });
      const doubleEncoded = JSON.stringify(inner);

      const raw = makeRawMessage({
        payload: serializedPayload(doubleEncoded, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      // Should decode as plain text since inner object has no text/blocks
      expect(result.message.payload.text).toBe(inner);
    });
  });

  describe("JSON-stringified string payloads", () => {
    it("handles JSON.stringify(text) where text has escape sequences", () => {
      // Daemon stored: JSON.stringify("Hello\nWorld") → "\"Hello\\nWorld\""
      const jsonString = JSON.stringify("Hello\nWorld");

      const raw = makeRawMessage({
        payload: serializedPayload(jsonString, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Hello\nWorld");
    });

    it("handles JSON.stringify of plain text without escapes", () => {
      const jsonString = JSON.stringify("Simple message");

      const raw = makeRawMessage({
        payload: serializedPayload(jsonString, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Simple message");
    });
  });

  describe("malformed payload handling", () => {
    it("drops completely invalid JSON with json encoding silently", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("{{{{not json at all", "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("dropped");
      if (result.status !== "dropped") return;
      expect(result.reason).toBe("decode-failed");
    });

    it("drops truncated JSON payload silently", () => {
      const raw = makeRawMessage({
        payload: serializedPayload('{"text": "hello', "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("dropped");
      if (result.status !== "dropped") return;
      expect(result.reason).toBe("decode-failed");
    });

    it("handles empty string in json encoding gracefully", () => {
      const raw = makeRawMessage({
        payload: serializedPayload('""', "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("");
      expect(result.message.payload.blocks).toEqual([]);
    });

    it("handles JSON null gracefully", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("null", "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("null");
    });

    it("handles JSON number gracefully", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("42", "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("42");
    });

    it("handles JSON boolean gracefully", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("true", "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("true");
    });

    it("preserves json-escaped content even when partially malformed", () => {
      // Content with escape sequences but not valid JSON
      const raw = makeRawMessage({
        payload: serializedPayload("some text\\nwith escapes\\tand tabs", "json-escaped"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("some text\nwith escapes\tand tabs");
    });

    it("handles plain-text with no special content", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("Just a regular message.", "plain-text"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Just a regular message.");
    });
  });

  describe("telemetry logging", () => {
    it("logs telemetry for double-encoded structured payloads", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      try {
        const inner = JSON.stringify({ text: "recovered" });
        const doubleEncoded = JSON.stringify(inner);

        const raw = makeRawMessage({
          payload: serializedPayload(doubleEncoded, "json"),
        });
        normalizeHistoryMessage(raw, makeContext());

        expect(warnSpy).toHaveBeenCalledTimes(1);
        const message = warnSpy.mock.calls[0][0] as string;
        expect(message).toContain("[history-hydration]");
        expect(message).toContain("double-encoded-structured");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("logs telemetry for failed JSON parse", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      try {
        const raw = makeRawMessage({
          payload: serializedPayload("{broken", "json"),
        });
        normalizeHistoryMessage(raw, makeContext());

        expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        const allMessages = warnSpy.mock.calls.map((c) => c[0] as string).join(" ");
        expect(allMessages).toContain("[history-hydration]");
        expect(allMessages).toContain("json-parse-failed");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("does not log telemetry for normal payloads", () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

      try {
        const raw = makeRawMessage({
          payload: structuredPayload("Normal message"),
        });
        normalizeHistoryMessage(raw, makeContext());

        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("end-to-end legacy payload hydration", () => {
    it("hydrates a mix of legacy and current payloads in one chunk", () => {
      const doubleEncodedInner = JSON.stringify({ text: "Legacy structured" });
      const doubleEncoded = JSON.stringify(doubleEncodedInner);

      const input: ApplyHydratedHistoryChunkInput = {
        existingMessages: [],
        incomingRawMessages: [
          makeRawMessage({
            id: "current-msg",
            role: "user",
            createdAt: "2026-01-15T10:00:00.000Z",
            payload: structuredPayload("Current format"),
          }),
          makeRawMessage({
            id: "legacy-escaped",
            role: "assistant",
            createdAt: "2026-01-15T10:00:01.000Z",
            payload: serializedPayload("Legacy\\nescaped\\tcontent", "json-escaped"),
          }),
          makeRawMessage({
            id: "legacy-double",
            role: "assistant",
            createdAt: "2026-01-15T10:00:02.000Z",
            payload: serializedPayload(doubleEncoded, "json"),
          }),
          makeRawMessage({
            id: "legacy-plain",
            role: "user",
            createdAt: "2026-01-15T10:00:03.000Z",
            payload: serializedPayload("Plain text message", "plain-text"),
          }),
        ],
        hydrationState: createHydrationState(),
        normalizer: historyPayloadNormalizer,
      };

      const result = applyHydratedHistoryChunk(input);

      expect(result.messages).toHaveLength(4);
      expect(result.dropped).toHaveLength(0);

      // Current format
      expect(result.messages[0].content).toBe("Current format");

      // Legacy escaped
      expect(result.messages[1].content).toBe("Legacy\nescaped\tcontent");

      // Legacy double-encoded structured
      expect(result.messages[2].content).toBe("Legacy structured");

      // Legacy plain text
      expect(result.messages[3].content).toBe("Plain text message");
    });

    it("gracefully handles malformed entries mixed with valid ones", () => {
      const input: ApplyHydratedHistoryChunkInput = {
        existingMessages: [],
        incomingRawMessages: [
          makeRawMessage({
            id: "valid-1",
            role: "user",
            createdAt: "2026-01-15T10:00:00.000Z",
            payload: structuredPayload("Valid message"),
          }),
          makeRawMessage({
            id: "malformed-1",
            role: "assistant",
            createdAt: "2026-01-15T10:00:01.000Z",
            payload: serializedPayload("{truncated json", "json"),
          }),
          makeRawMessage({
            id: "valid-2",
            role: "assistant",
            createdAt: "2026-01-15T10:00:02.000Z",
            payload: serializedPayload("Normal response", "plain-text"),
          }),
        ],
        hydrationState: createHydrationState(),
        normalizer: historyPayloadNormalizer,
      };

      const result = applyHydratedHistoryChunk(input);

      // Malformed entry dropped, valid entries preserved
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].id).toBe("valid-1");
      expect(result.messages[1].id).toBe("valid-2");
      expect(result.dropped).toHaveLength(1);
    });

    it("does not crash on deeply nested double-encoding", () => {
      // Triple-encoded: JSON.stringify(JSON.stringify(JSON.stringify("text")))
      const tripleEncoded = JSON.stringify(JSON.stringify(JSON.stringify("deep text")));

      const raw = makeRawMessage({
        payload: serializedPayload(tripleEncoded, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      // Should not crash — accepts as double-encoded string (inner is a JSON string, not structured)
      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      // The first JSON.parse yields a string containing escaped quotes.
      // tryRecoverDoubleEncodedStructured sees it doesn't start with { so skips.
      // decodeEscapedText then decodes \" → " in the first-parse result.
      // First parse result: "\"deep text\"" → after decode: ""deep text""
      // This is conservative — no multi-pass decode, just one level of unwrap.
      expect(typeof result.message.payload.text).toBe("string");
      expect(result.message.payload.text).toContain("deep text");
    });
  });

  describe("backward compatibility with current daemon sessions", () => {
    it("handles standard structured payload unchanged", () => {
      const raw = makeRawMessage({
        payload: structuredPayload("Standard message", [
          { type: "text", text: "Standard message" },
        ]),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Standard message");
      expect(result.message.payload.blocks).toEqual([
        { type: "text", text: "Standard message" },
      ]);
    });

    it("handles standard JSON serialized payload unchanged", () => {
      const jsonValue = JSON.stringify({
        text: "JSON message",
        blocks: [{ type: "text", text: "JSON message" }],
      });
      const raw = makeRawMessage({
        payload: serializedPayload(jsonValue, "json"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("JSON message");
    });

    it("handles standard plain-text payload unchanged", () => {
      const raw = makeRawMessage({
        payload: serializedPayload("Hello world", "plain-text"),
      });
      const result = normalizeHistoryMessage(raw, makeContext());

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") return;

      expect(result.message.payload.text).toBe("Hello world");
    });
  });
});

// ---------------------------------------------------------------------------
// historyPayloadNormalizer (interface compliance)
// ---------------------------------------------------------------------------

describe("historyPayloadNormalizer", () => {
  it("implements the DaemonHistoryPayloadNormalizer interface", () => {
    expect(typeof historyPayloadNormalizer.normalize).toBe("function");
  });

  it("produces the same result as normalizeHistoryMessage", () => {
    const raw = makeRawMessage({
      payload: structuredPayload("Test"),
    });
    const ctx = makeContext();

    const direct = normalizeHistoryMessage(raw, ctx);
    const viaInterface = historyPayloadNormalizer.normalize(raw, makeContext());

    expect(direct.status).toBe(viaInterface.status);
    if (direct.status === "accepted" && viaInterface.status === "accepted") {
      expect(direct.message.id).toBe(viaInterface.message.id);
      expect(direct.message.payload.text).toBe(viaInterface.message.payload.text);
    }
  });
});
