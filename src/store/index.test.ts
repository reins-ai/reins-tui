/**
 * Regression tests for store-level history hydration via HYDRATE_HISTORY action.
 *
 * These tests exercise the full pipeline: raw payloads → normalizer → store state,
 * covering canonical object payloads, legacy escaped string payloads, mixed
 * sequences, and metadata/ordering preservation.
 */

import { describe, expect, it } from "bun:test";

import type { DaemonRawHistoryMessage } from "../daemon/contracts";
import { appReducer, DEFAULT_STATE, type AppAction, type HistoryHydrationState } from "./index";
import { createHydrationState, historyPayloadNormalizer } from "./history-hydration";
import type { AppState, DisplayMessage } from "./types";
import {
  CANONICAL_ASSISTANT_TEXT,
  CANONICAL_JSON_SERIALIZED,
  CANONICAL_TOOL_ERROR,
  CANONICAL_TOOL_MESSAGE,
  CANONICAL_USER_TEXT,
  LEGACY_DOUBLE_ENCODED_STRING,
  LEGACY_DOUBLE_ENCODED_STRUCTURED,
  LEGACY_ESCAPED_QUOTES,
  LEGACY_ESCAPED_TEXT,
  LEGACY_PLAIN_TEXT,
  MIXED_SEQUENCE_CANONICAL,
  MIXED_SEQUENCE_LEGACY,
  makeRawHistoryMessage,
  serializedPayload,
  structuredPayload,
} from "../__fixtures__/history-payloads";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hydrateAction(
  rawMessages: readonly DaemonRawHistoryMessage[],
  hydrationState?: HistoryHydrationState,
): AppAction {
  return {
    type: "HYDRATE_HISTORY",
    payload: {
      rawMessages,
      normalizer: historyPayloadNormalizer,
      hydrationState: hydrationState ?? createHydrationState(),
    },
  };
}

function hydrateFromDefault(
  rawMessages: readonly DaemonRawHistoryMessage[],
): AppState {
  return appReducer(DEFAULT_STATE, hydrateAction(rawMessages));
}

// ---------------------------------------------------------------------------
// Canonical object payload hydration (MH1, MH2, MH3, MH4)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — canonical payloads", () => {
  it("hydrates a simple user text message with decoded content", () => {
    const state = hydrateFromDefault([CANONICAL_USER_TEXT]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].id).toBe("canonical-user-1");
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[0].content).toBe("What is the weather today?");
    expect(state.messages[0].isStreaming).toBe(false);
  });

  it("hydrates a simple assistant text message", () => {
    const state = hydrateFromDefault([CANONICAL_ASSISTANT_TEXT]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("assistant");
    expect(state.messages[0].content).toBe("The weather is sunny and 72F.");
  });

  it("hydrates tool-use and tool-result blocks with correct structure", () => {
    const state = hydrateFromDefault([CANONICAL_TOOL_MESSAGE]);

    expect(state.messages).toHaveLength(1);
    const msg = state.messages[0];

    expect(msg.toolCalls).toBeDefined();
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe("get_weather");
    expect(msg.toolCalls![0].id).toBe("tc-weather-1");
    expect(msg.toolCalls![0].args).toEqual({ location: "San Francisco" });
    expect(msg.toolCalls![0].result).toBe(
      "Temperature: 72F\nCondition: Sunny\nHumidity: 45%",
    );
    expect(msg.toolCalls![0].status).toBe("complete");
    expect(msg.toolCalls![0].isError).toBe(false);
  });

  it("hydrates tool error results with error status", () => {
    const state = hydrateFromDefault([CANONICAL_TOOL_ERROR]);

    expect(state.messages).toHaveLength(1);
    const msg = state.messages[0];

    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].status).toBe("error");
    expect(msg.toolCalls![0].isError).toBe(true);
    expect(msg.toolCalls![0].result).toBe("Permission denied: /protected");
  });

  it("hydrates JSON-serialized structured payload with tool output", () => {
    const state = hydrateFromDefault([CANONICAL_JSON_SERIALIZED]);

    expect(state.messages).toHaveLength(1);
    const msg = state.messages[0];

    expect(msg.content).toBe("Here are the results");
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe("bash");
    // Tool output should have real newlines, not escaped
    expect(msg.toolCalls![0].result).toContain("total 42\n");
    expect(msg.toolCalls![0].result).toContain("README.md");
    expect(msg.toolCalls![0].result).not.toContain("\\n");
  });

  it("preserves createdAt as Date object", () => {
    const state = hydrateFromDefault([CANONICAL_USER_TEXT]);

    expect(state.messages[0].createdAt).toBeInstanceOf(Date);
    expect(state.messages[0].createdAt.toISOString()).toBe(
      "2026-02-13T10:00:00.000Z",
    );
  });
});

// ---------------------------------------------------------------------------
// Legacy escaped string payload hydration (MH1, MH2)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — legacy escaped payloads", () => {
  it("decodes escaped newlines and tabs in json-escaped payload", () => {
    const state = hydrateFromDefault([LEGACY_ESCAPED_TEXT]);

    expect(state.messages).toHaveLength(1);
    const content = state.messages[0].content;

    // Should contain real newlines and tabs, not literal \\n or \\t
    expect(content).toContain("\n");
    expect(content).toContain("\t");
    expect(content).not.toContain("\\n");
    expect(content).not.toContain("\\t");
    expect(content).toBe(
      "Here is the output:\nLine 1\nLine 2\tindented\nLine 3",
    );
  });

  it("decodes escaped quotes and backslashes", () => {
    const state = hydrateFromDefault([LEGACY_ESCAPED_QUOTES]);

    const content = state.messages[0].content;
    expect(content).toContain('"hello"');
    expect(content).toContain("C:\\Users\\test");
    expect(content).not.toContain('\\"');
    expect(content).not.toContain("\\\\");
  });

  it("decodes double-encoded string payload (JSON.stringify(text))", () => {
    const state = hydrateFromDefault([LEGACY_DOUBLE_ENCODED_STRING]);

    const content = state.messages[0].content;
    // JSON.stringify("Hello\nWorld\ttab") → after hydration should be decoded
    expect(content).toBe("Hello\nWorld\ttab");
    expect(content).not.toContain("\\n");
    expect(content).not.toContain("\\t");
  });

  it("recovers double-encoded structured payload", () => {
    const state = hydrateFromDefault([LEGACY_DOUBLE_ENCODED_STRUCTURED]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Legacy structured content");
  });

  it("hydrates plain-text payload without artifacts", () => {
    const state = hydrateFromDefault([LEGACY_PLAIN_TEXT]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Just a plain text message");
    expect(state.messages[0].role).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// Mixed sequences (MH1, MH2, MH3, MH4)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — mixed sequences", () => {
  it("hydrates canonical mixed sequence with correct ordering", () => {
    const state = hydrateFromDefault(MIXED_SEQUENCE_CANONICAL);

    expect(state.messages).toHaveLength(4);

    // Verify chronological order
    expect(state.messages[0].id).toBe("mix-user-1");
    expect(state.messages[1].id).toBe("mix-asst-1");
    expect(state.messages[2].id).toBe("mix-user-2");
    expect(state.messages[3].id).toBe("mix-asst-2");
  });

  it("preserves role transitions across mixed sequence", () => {
    const state = hydrateFromDefault(MIXED_SEQUENCE_CANONICAL);

    expect(state.messages[0].role).toBe("user");
    expect(state.messages[1].role).toBe("assistant");
    expect(state.messages[2].role).toBe("user");
    expect(state.messages[3].role).toBe("assistant");
  });

  it("preserves tool output in mixed sequence messages", () => {
    const state = hydrateFromDefault(MIXED_SEQUENCE_CANONICAL);

    // First assistant message has tool call
    const asst1 = state.messages[1];
    expect(asst1.toolCalls).toHaveLength(1);
    expect(asst1.toolCalls![0].name).toBe("bash");
    expect(asst1.toolCalls![0].result).toBe(
      "package.json\nsrc/\ntests/\nREADME.md",
    );

    // Second assistant message also has tool call
    const asst2 = state.messages[3];
    expect(asst2.toolCalls).toHaveLength(1);
    expect(asst2.toolCalls![0].result).toContain("# My Project");
    expect(asst2.toolCalls![0].result).toContain("Feature 1");
  });

  it("hydrates legacy mixed sequence with decoded content", () => {
    const state = hydrateFromDefault(MIXED_SEQUENCE_LEGACY);

    expect(state.messages).toHaveLength(4);

    // Plain text user message
    expect(state.messages[0].content).toBe("Show me the logs");
    expect(state.messages[0].role).toBe("user");

    // Legacy escaped assistant message — should be decoded
    const escapedContent = state.messages[1].content;
    expect(escapedContent).toContain("[INFO] Server started");
    expect(escapedContent).toContain("[ERROR] Connection timeout");
    expect(escapedContent).not.toContain("\\n");

    // Canonical user follow-up
    expect(state.messages[2].content).toBe("Can you fix the timeout?");

    // Canonical assistant with tool
    expect(state.messages[3].toolCalls).toHaveLength(1);
    expect(state.messages[3].toolCalls![0].result).toContain(
      "connection_timeout: 5000",
    );
  });

  it("maintains chronological order in legacy mixed sequence", () => {
    const state = hydrateFromDefault(MIXED_SEQUENCE_LEGACY);

    for (let i = 1; i < state.messages.length; i++) {
      const prev = state.messages[i - 1].createdAt.getTime();
      const curr = state.messages[i].createdAt.getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("handles out-of-order input and sorts chronologically", () => {
    // Reverse the canonical sequence
    const reversed = [...MIXED_SEQUENCE_CANONICAL].reverse();
    const state = hydrateFromDefault(reversed);

    expect(state.messages).toHaveLength(4);
    // Should still be in chronological order
    expect(state.messages[0].id).toBe("mix-user-1");
    expect(state.messages[1].id).toBe("mix-asst-1");
    expect(state.messages[2].id).toBe("mix-user-2");
    expect(state.messages[3].id).toBe("mix-asst-2");
  });
});

// ---------------------------------------------------------------------------
// Metadata preservation (MH3)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — metadata preservation", () => {
  it("preserves role for all message types", () => {
    const messages: DaemonRawHistoryMessage[] = [
      makeRawHistoryMessage({
        id: "meta-user",
        role: "user",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("User message"),
      }),
      makeRawHistoryMessage({
        id: "meta-asst",
        role: "assistant",
        createdAt: "2026-02-13T10:00:01.000Z",
        payload: structuredPayload("Assistant message"),
      }),
      makeRawHistoryMessage({
        id: "meta-sys",
        role: "system",
        createdAt: "2026-02-13T10:00:02.000Z",
        payload: structuredPayload("System message"),
      }),
    ];

    const state = hydrateFromDefault(messages);

    expect(state.messages[0].role).toBe("user");
    expect(state.messages[1].role).toBe("assistant");
    expect(state.messages[2].role).toBe("system");
  });

  it("preserves timestamp through hydration pipeline", () => {
    const state = hydrateFromDefault([
      makeRawHistoryMessage({
        id: "ts-msg",
        role: "user",
        createdAt: "2026-02-13T14:30:45.123Z",
        payload: structuredPayload("Timestamped message"),
      }),
    ]);

    expect(state.messages[0].createdAt.toISOString()).toBe(
      "2026-02-13T14:30:45.123Z",
    );
  });

  it("preserves message id through hydration pipeline", () => {
    const state = hydrateFromDefault([
      makeRawHistoryMessage({
        id: "unique-id-abc-123",
        role: "assistant",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("ID test"),
      }),
    ]);

    expect(state.messages[0].id).toBe("unique-id-abc-123");
  });

  it("sets isStreaming to false for all hydrated messages", () => {
    const state = hydrateFromDefault(MIXED_SEQUENCE_CANONICAL);

    for (const msg of state.messages) {
      expect(msg.isStreaming).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Ordering regression (MH4)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — ordering", () => {
  it("sorts messages by timestamp ascending", () => {
    const messages: DaemonRawHistoryMessage[] = [
      makeRawHistoryMessage({
        id: "ord-3",
        role: "assistant",
        createdAt: "2026-02-13T10:00:02.000Z",
        payload: structuredPayload("Third"),
      }),
      makeRawHistoryMessage({
        id: "ord-1",
        role: "user",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("First"),
      }),
      makeRawHistoryMessage({
        id: "ord-2",
        role: "assistant",
        createdAt: "2026-02-13T10:00:01.000Z",
        payload: structuredPayload("Second"),
      }),
    ];

    const state = hydrateFromDefault(messages);

    expect(state.messages[0].id).toBe("ord-1");
    expect(state.messages[1].id).toBe("ord-2");
    expect(state.messages[2].id).toBe("ord-3");
  });

  it("breaks timestamp ties with fallback index (insertion order)", () => {
    const sameTime = "2026-02-13T10:00:00.000Z";
    const messages: DaemonRawHistoryMessage[] = [
      makeRawHistoryMessage({
        id: "tie-a",
        role: "user",
        createdAt: sameTime,
        payload: structuredPayload("First by insertion"),
      }),
      makeRawHistoryMessage({
        id: "tie-b",
        role: "assistant",
        createdAt: sameTime,
        payload: structuredPayload("Second by insertion"),
      }),
      makeRawHistoryMessage({
        id: "tie-c",
        role: "user",
        createdAt: sameTime,
        payload: structuredPayload("Third by insertion"),
      }),
    ];

    const state = hydrateFromDefault(messages);

    expect(state.messages[0].id).toBe("tie-a");
    expect(state.messages[1].id).toBe("tie-b");
    expect(state.messages[2].id).toBe("tie-c");
  });

  it("deduplicates messages with same id", () => {
    const messages: DaemonRawHistoryMessage[] = [
      makeRawHistoryMessage({
        id: "dup-1",
        role: "user",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("Original"),
      }),
      makeRawHistoryMessage({
        id: "dup-1",
        role: "user",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("Duplicate"),
      }),
    ];

    const state = hydrateFromDefault(messages);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Original");
  });

  it("merges with existing messages without duplicating", () => {
    const existingMsg: DisplayMessage = {
      id: "existing-1",
      role: "user",
      content: "Already in store",
      isStreaming: false,
      createdAt: new Date("2026-02-13T09:59:00.000Z"),
    };

    const stateWithExisting: AppState = {
      ...DEFAULT_STATE,
      messages: [existingMsg],
    };

    const incoming: DaemonRawHistoryMessage[] = [
      makeRawHistoryMessage({
        id: "existing-1",
        role: "user",
        createdAt: "2026-02-13T09:59:00.000Z",
        payload: structuredPayload("Already in store"),
      }),
      makeRawHistoryMessage({
        id: "new-1",
        role: "assistant",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("New message"),
      }),
    ];

    const state = appReducer(stateWithExisting, hydrateAction(incoming));

    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].id).toBe("existing-1");
    expect(state.messages[0].content).toBe("Already in store");
    expect(state.messages[1].id).toBe("new-1");
  });
});

// ---------------------------------------------------------------------------
// Text decoding regression (MH1)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — text decoding regression", () => {
  it("does not leave \\n artifacts in decoded content", () => {
    const state = hydrateFromDefault([
      makeRawHistoryMessage({
        id: "decode-newline",
        role: "assistant",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: serializedPayload("Line 1\\nLine 2\\nLine 3", "json-escaped"),
      }),
    ]);

    expect(state.messages[0].content).not.toContain("\\n");
    expect(state.messages[0].content).toBe("Line 1\nLine 2\nLine 3");
  });

  it("does not leave \\t artifacts in decoded content", () => {
    const state = hydrateFromDefault([
      makeRawHistoryMessage({
        id: "decode-tab",
        role: "assistant",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: serializedPayload("Col1\\tCol2\\tCol3", "json-escaped"),
      }),
    ]);

    expect(state.messages[0].content).not.toContain("\\t");
    expect(state.messages[0].content).toBe("Col1\tCol2\tCol3");
  });

  it("does not leave \\\\ artifacts in decoded content", () => {
    const state = hydrateFromDefault([
      makeRawHistoryMessage({
        id: "decode-backslash",
        role: "assistant",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: serializedPayload("path\\\\to\\\\file", "json-escaped"),
      }),
    ]);

    expect(state.messages[0].content).not.toContain("\\\\");
    expect(state.messages[0].content).toBe("path\\to\\file");
  });

  it("does not leave \\\" artifacts in decoded content", () => {
    const state = hydrateFromDefault([
      makeRawHistoryMessage({
        id: "decode-quote",
        role: "assistant",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: serializedPayload('said \\"hello\\"', "json-escaped"),
      }),
    ]);

    expect(state.messages[0].content).not.toContain('\\"');
    expect(state.messages[0].content).toBe('said "hello"');
  });

  it("decodes tool output text without escape artifacts", () => {
    const state = hydrateFromDefault([CANONICAL_JSON_SERIALIZED]);

    const toolResult = state.messages[0].toolCalls![0].result!;
    expect(toolResult).not.toContain("\\n");
    expect(toolResult).toContain("\n");
  });
});

// ---------------------------------------------------------------------------
// Tool output structure regression (MH2)
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — tool output structure", () => {
  it("preserves tool call id linkage between use and result", () => {
    const state = hydrateFromDefault([CANONICAL_TOOL_MESSAGE]);

    const tc = state.messages[0].toolCalls![0];
    expect(tc.id).toBe("tc-weather-1");
    expect(tc.result).toBeDefined();
  });

  it("preserves tool call args", () => {
    const state = hydrateFromDefault([CANONICAL_TOOL_MESSAGE]);

    const tc = state.messages[0].toolCalls![0];
    expect(tc.args).toEqual({ location: "San Francisco" });
  });

  it("preserves multi-line tool output with real newlines", () => {
    const state = hydrateFromDefault([CANONICAL_TOOL_MESSAGE]);

    const result = state.messages[0].toolCalls![0].result!;
    const lines = result.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("Temperature: 72F");
    expect(lines[1]).toBe("Condition: Sunny");
    expect(lines[2]).toBe("Humidity: 45%");
  });

  it("generates contentBlocks for tool messages", () => {
    const state = hydrateFromDefault([CANONICAL_TOOL_MESSAGE]);

    const msg = state.messages[0];
    expect(msg.contentBlocks).toBeDefined();
    expect(msg.contentBlocks!.length).toBeGreaterThan(0);

    // Should have text block and tool-call blocks
    const textBlocks = msg.contentBlocks!.filter((b) => b.type === "text");
    const toolBlocks = msg.contentBlocks!.filter((b) => b.type === "tool-call");
    expect(textBlocks.length).toBeGreaterThanOrEqual(1);
    expect(toolBlocks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns undefined toolCalls for text-only messages", () => {
    const state = hydrateFromDefault([CANONICAL_USER_TEXT]);

    expect(state.messages[0].toolCalls).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// No-op optimization
// ---------------------------------------------------------------------------

describe("HYDRATE_HISTORY — no-op optimization", () => {
  it("returns same state reference when no new messages", () => {
    const state = appReducer(DEFAULT_STATE, hydrateAction([]));

    expect(state).toBe(DEFAULT_STATE);
  });

  it("drops malformed entries without crashing", () => {
    const messages: DaemonRawHistoryMessage[] = [
      makeRawHistoryMessage({
        id: "valid",
        role: "user",
        createdAt: "2026-02-13T10:00:00.000Z",
        payload: structuredPayload("Valid"),
      }),
      makeRawHistoryMessage({
        id: "invalid-date",
        role: "assistant",
        createdAt: "not-a-date",
        payload: structuredPayload("Bad timestamp"),
      }),
      makeRawHistoryMessage({
        id: "invalid-json",
        role: "assistant",
        createdAt: "2026-02-13T10:00:01.000Z",
        payload: serializedPayload("{broken", "json"),
      }),
    ];

    const state = hydrateFromDefault(messages);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].id).toBe("valid");
  });
});
