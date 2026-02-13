import { describe, expect, it } from "bun:test";

import type { DaemonMessage, DaemonRawHistoryMessage } from "./contracts";
import {
  classifyHistoryPayload,
  mapConversationHistory,
  mapDaemonMessageToRawHistory,
  sanitizeLegacyContent,
} from "./ws-transport";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDaemonMessage(overrides: Partial<DaemonMessage> = {}): DaemonMessage {
  return {
    id: overrides.id ?? "msg-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "Hello, world!",
    createdAt: overrides.createdAt ?? "2026-01-15T10:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// classifyHistoryPayload
// ---------------------------------------------------------------------------

describe("classifyHistoryPayload", () => {
  describe("plain text classification", () => {
    it("classifies simple text as plain-text", () => {
      const result = classifyHistoryPayload("Hello, world!");
      expect(result).toEqual({
        kind: "serialized",
        value: "Hello, world!",
        encoding: "plain-text",
      });
    });

    it("classifies empty string as plain-text", () => {
      const result = classifyHistoryPayload("");
      expect(result).toEqual({
        kind: "serialized",
        value: "",
        encoding: "plain-text",
      });
    });

    it("classifies whitespace-only string as plain-text", () => {
      const result = classifyHistoryPayload("   ");
      expect(result).toEqual({
        kind: "serialized",
        value: "   ",
        encoding: "plain-text",
      });
    });

    it("classifies multi-line text without escape sequences as plain-text", () => {
      const content = "Line one\nLine two\nLine three";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "plain-text",
      });
    });

    it("classifies markdown content as plain-text", () => {
      const content = "# Heading\n\n- Item 1\n- Item 2\n\n```js\nconsole.log('hi');\n```";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "plain-text",
      });
    });
  });

  describe("JSON structured payload classification", () => {
    it("classifies JSON object with text field as json", () => {
      const content = JSON.stringify({ text: "Hello" });
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies JSON object with blocks field as json", () => {
      const content = JSON.stringify({
        blocks: [{ type: "text", text: "Hello" }],
      });
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies JSON object with text and blocks as json", () => {
      const content = JSON.stringify({
        text: "Hello",
        blocks: [
          { type: "text", text: "Hello" },
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: {} },
        ],
      });
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies double-encoded JSON string starting with quote as json", () => {
      // JSON.stringify("Hello, world!") produces '"Hello, world!"' (with quotes)
      // which starts with " — detected as a JSON-stringified string for legacy compat
      const content = JSON.stringify("Hello, world!");
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies JSON array as json", () => {
      const content = JSON.stringify([1, 2, 3]);
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies JSON object without text/blocks as json", () => {
      const content = JSON.stringify({ foo: "bar", baz: 42 });
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });
  });

  describe("escaped payload classification", () => {
    it("classifies content with escaped newlines as json-escaped", () => {
      const content = "Line one\\nLine two\\nLine three";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });

    it("classifies content with escaped tabs as json-escaped", () => {
      const content = "Column1\\tColumn2\\tColumn3";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });

    it("classifies content with escaped backslashes as json-escaped", () => {
      const content = "path\\\\to\\\\file";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });

    it("classifies content with escaped quotes as json-escaped", () => {
      const content = 'He said \\"hello\\"';
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });

    it("classifies mixed escaped content as json-escaped", () => {
      const content = "First line\\nSecond\\tindented\\nThird with \\\"quotes\\\"";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });
  });

  describe("edge cases", () => {
    it("classifies invalid JSON starting with { as plain-text when no escapes", () => {
      const content = "{not valid json at all";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "plain-text",
      });
    });

    it("classifies invalid JSON with escapes as json-escaped", () => {
      const content = "{not valid\\njson}";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });

    it("handles content with leading/trailing whitespace around JSON", () => {
      const content = '  {"text": "hello"}  ';
      const result = classifyHistoryPayload(content);
      // Trimmed value is used for JSON payloads since whitespace is irrelevant
      expect(result).toEqual({
        kind: "serialized",
        value: '{"text": "hello"}',
        encoding: "json",
      });
    });

    it("does not misclassify real newlines as escaped", () => {
      const content = "Line one\nLine two";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "plain-text",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// mapDaemonMessageToRawHistory
// ---------------------------------------------------------------------------

describe("mapDaemonMessageToRawHistory", () => {
  it("maps a simple text message", () => {
    const message = makeDaemonMessage({
      id: "msg-42",
      role: "user",
      content: "What is the weather?",
      createdAt: "2026-02-13T12:00:00.000Z",
    });

    const result = mapDaemonMessageToRawHistory(message);

    expect(result.id).toBe("msg-42");
    expect(result.role).toBe("user");
    expect(result.createdAt).toBe("2026-02-13T12:00:00.000Z");
    expect(result.payload).toEqual({
      kind: "serialized",
      value: "What is the weather?",
      encoding: "plain-text",
    });
  });

  it("maps an assistant message with JSON content", () => {
    const content = JSON.stringify({
      text: "Here is the result",
      blocks: [{ type: "text", text: "Here is the result" }],
    });
    const message = makeDaemonMessage({
      role: "assistant",
      content,
    });

    const result = mapDaemonMessageToRawHistory(message);

    expect(result.role).toBe("assistant");
    expect(result.payload).toEqual({
      kind: "serialized",
      value: content,
      encoding: "json",
    });
  });

  it("maps a message with escaped content", () => {
    const message = makeDaemonMessage({
      content: "Line 1\\nLine 2\\nLine 3",
    });

    const result = mapDaemonMessageToRawHistory(message);

    expect(result.payload).toEqual({
      kind: "serialized",
      value: "Line 1\\nLine 2\\nLine 3",
      encoding: "json-escaped",
    });
  });

  it("preserves all message metadata", () => {
    const message = makeDaemonMessage({
      id: "unique-id-123",
      role: "system",
      content: "System prompt",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = mapDaemonMessageToRawHistory(message);

    expect(result.id).toBe("unique-id-123");
    expect(result.role).toBe("system");
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not mutate the input message", () => {
    const message = makeDaemonMessage();
    const original = { ...message };

    mapDaemonMessageToRawHistory(message);

    expect(message).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// mapConversationHistory
// ---------------------------------------------------------------------------

describe("mapConversationHistory", () => {
  it("maps an empty array", () => {
    const result = mapConversationHistory([]);
    expect(result).toEqual([]);
  });

  it("maps multiple messages preserving order", () => {
    const messages: DaemonMessage[] = [
      makeDaemonMessage({ id: "msg-1", role: "user", content: "Hello" }),
      makeDaemonMessage({ id: "msg-2", role: "assistant", content: "Hi there!" }),
      makeDaemonMessage({ id: "msg-3", role: "user", content: "How are you?" }),
    ];

    const result = mapConversationHistory(messages);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("msg-1");
    expect(result[1].id).toBe("msg-2");
    expect(result[2].id).toBe("msg-3");
  });

  it("correctly classifies mixed content types", () => {
    const messages: DaemonMessage[] = [
      makeDaemonMessage({ id: "msg-1", content: "Plain text" }),
      makeDaemonMessage({ id: "msg-2", content: JSON.stringify({ text: "Structured" }) }),
      makeDaemonMessage({ id: "msg-3", content: "Escaped\\ncontent" }),
    ];

    const result = mapConversationHistory(messages);

    expect(result[0].payload).toEqual({
      kind: "serialized",
      value: "Plain text",
      encoding: "plain-text",
    });
    expect(result[1].payload).toEqual({
      kind: "serialized",
      value: JSON.stringify({ text: "Structured" }),
      encoding: "json",
    });
    expect(result[2].payload).toEqual({
      kind: "serialized",
      value: "Escaped\\ncontent",
      encoding: "json-escaped",
    });
  });

  it("does not mutate the input array", () => {
    const messages: DaemonMessage[] = [
      makeDaemonMessage({ id: "msg-1" }),
      makeDaemonMessage({ id: "msg-2" }),
    ];
    const originalLength = messages.length;

    mapConversationHistory(messages);

    expect(messages).toHaveLength(originalLength);
  });

  it("produces output compatible with hydration pipeline", () => {
    const messages: DaemonMessage[] = [
      makeDaemonMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        createdAt: "2026-01-15T10:00:00.000Z",
      }),
    ];

    const result = mapConversationHistory(messages);

    // Verify the shape matches DaemonRawHistoryMessage
    const raw: DaemonRawHistoryMessage = result[0];
    expect(raw.id).toBe("msg-1");
    expect(raw.role).toBe("user");
    expect(raw.createdAt).toBe("2026-01-15T10:00:00.000Z");
    expect(raw.payload.kind).toBe("serialized");
  });

  it("handles tool output JSON payloads", () => {
    const toolPayload = JSON.stringify({
      text: "",
      blocks: [
        { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "ls" } },
        { type: "tool-result", toolCallId: "tc-1", output: "file1.txt\nfile2.txt" },
      ],
    });

    const messages: DaemonMessage[] = [
      makeDaemonMessage({ id: "msg-1", role: "assistant", content: toolPayload }),
    ];

    const result = mapConversationHistory(messages);

    expect(result[0].payload).toEqual({
      kind: "serialized",
      value: toolPayload,
      encoding: "json",
    });
  });

  it("handles legacy escaped tool output", () => {
    const content = "file1.txt\\nfile2.txt\\nfile3.txt";
    const messages: DaemonMessage[] = [
      makeDaemonMessage({ id: "msg-1", content }),
    ];

    const result = mapConversationHistory(messages);

    expect(result[0].payload).toEqual({
      kind: "serialized",
      value: content,
      encoding: "json-escaped",
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: mapping → hydration pipeline compatibility
// ---------------------------------------------------------------------------

describe("history mapping integration", () => {
  it("mapped messages have the correct DaemonRawHistoryMessage shape", () => {
    const message = makeDaemonMessage({
      id: "test-id",
      role: "assistant",
      content: "Test content",
      createdAt: "2026-02-13T10:00:00.000Z",
    });

    const raw = mapDaemonMessageToRawHistory(message);

    // Verify all required fields exist
    expect(typeof raw.id).toBe("string");
    expect(typeof raw.role).toBe("string");
    expect(typeof raw.createdAt).toBe("string");
    expect(raw.payload).toBeDefined();
    expect(typeof raw.payload.kind).toBe("string");
    expect(raw.payload.kind).toBe("serialized");
  });

  it("backward compatible: simple content maps to plain-text encoding", () => {
    // This is the most common case for existing daemon sessions
    const messages: DaemonMessage[] = [
      makeDaemonMessage({ id: "m1", role: "user", content: "What is 2+2?" }),
      makeDaemonMessage({ id: "m2", role: "assistant", content: "The answer is 4." }),
    ];

    const result = mapConversationHistory(messages);

    // Both should be plain-text — no unnecessary JSON/escape classification
    for (const raw of result) {
      expect(raw.payload.kind).toBe("serialized");
      if (raw.payload.kind === "serialized") {
        expect(raw.payload.encoding).toBe("plain-text");
      }
    }
  });

  it("backward compatible: preserves message ordering from daemon", () => {
    const messages: DaemonMessage[] = Array.from({ length: 10 }, (_, i) =>
      makeDaemonMessage({
        id: `msg-${i}`,
        content: `Message ${i}`,
        createdAt: new Date(2026, 0, 15, 10, i).toISOString(),
      }),
    );

    const result = mapConversationHistory(messages);

    for (let i = 0; i < result.length; i++) {
      expect(result[i].id).toBe(`msg-${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// sanitizeLegacyContent
// ---------------------------------------------------------------------------

describe("sanitizeLegacyContent", () => {
  it("returns normal content unchanged", () => {
    expect(sanitizeLegacyContent("Hello, world!")).toBe("Hello, world!");
  });

  it("strips BOM character from start of content", () => {
    const bom = "\uFEFF";
    expect(sanitizeLegacyContent(`${bom}Hello`)).toBe("Hello");
  });

  it("strips null bytes from content", () => {
    expect(sanitizeLegacyContent("Hello\0World")).toBe("HelloWorld");
  });

  it("strips both BOM and null bytes", () => {
    const bom = "\uFEFF";
    expect(sanitizeLegacyContent(`${bom}Hello\0World`)).toBe("HelloWorld");
  });

  it("handles empty string", () => {
    expect(sanitizeLegacyContent("")).toBe("");
  });

  it("handles BOM-only content", () => {
    expect(sanitizeLegacyContent("\uFEFF")).toBe("");
  });

  it("does not strip BOM from middle of content", () => {
    expect(sanitizeLegacyContent("Hello\uFEFFWorld")).toBe("Hello\uFEFFWorld");
  });

  it("preserves JSON content after BOM removal", () => {
    const bom = "\uFEFF";
    const json = JSON.stringify({ text: "hello" });
    expect(sanitizeLegacyContent(`${bom}${json}`)).toBe(json);
  });
});

// ---------------------------------------------------------------------------
// Legacy compatibility: classifyHistoryPayload edge cases
// ---------------------------------------------------------------------------

describe("classifyHistoryPayload legacy compatibility", () => {
  describe("JSON-stringified string payloads", () => {
    it("classifies JSON.stringify(text) as json encoding", () => {
      // JSON.stringify("Hello world") → '"Hello world"'
      const content = JSON.stringify("Hello world");
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies JSON.stringify(text with escapes) as json encoding", () => {
      // JSON.stringify("line1\nline2") → '"line1\\nline2"'
      const content = JSON.stringify("line1\nline2");
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("classifies JSON.stringify(text with tabs) as json encoding", () => {
      const content = JSON.stringify("col1\tcol2");
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json",
      });
    });

    it("does not misclassify non-JSON strings starting with quote", () => {
      // A string that starts with " but is not valid JSON
      const content = '"unclosed string';
      const result = classifyHistoryPayload(content);
      // Should fall through to escape detection or plain-text
      expect(result.kind).toBe("serialized");
      if (result.kind === "serialized") {
        expect(result.encoding).not.toBe("json");
      }
    });

    it("classifies double-encoded structured payload starting with quote", () => {
      // JSON.stringify(JSON.stringify({ text: "hello" }))
      // Outer: '"{\\"text\\":\\"hello\\"}"'
      const inner = JSON.stringify({ text: "hello" });
      const doubleEncoded = JSON.stringify(inner);
      const result = classifyHistoryPayload(doubleEncoded);
      expect(result).toEqual({
        kind: "serialized",
        value: doubleEncoded,
        encoding: "json",
      });
    });
  });

  describe("legacy content with BOM/null sanitization", () => {
    it("maps content with BOM to correct classification after sanitization", () => {
      const bom = "\uFEFF";
      const message = makeDaemonMessage({
        content: `${bom}Hello world`,
      });
      const result = mapDaemonMessageToRawHistory(message);

      expect(result.payload).toEqual({
        kind: "serialized",
        value: "Hello world",
        encoding: "plain-text",
      });
    });

    it("maps JSON content with BOM to json encoding after sanitization", () => {
      const bom = "\uFEFF";
      const json = JSON.stringify({ text: "hello" });
      const message = makeDaemonMessage({
        content: `${bom}${json}`,
      });
      const result = mapDaemonMessageToRawHistory(message);

      expect(result.payload).toEqual({
        kind: "serialized",
        value: json,
        encoding: "json",
      });
    });

    it("maps content with null bytes to correct classification after sanitization", () => {
      const message = makeDaemonMessage({
        content: "Hello\0World",
      });
      const result = mapDaemonMessageToRawHistory(message);

      expect(result.payload).toEqual({
        kind: "serialized",
        value: "HelloWorld",
        encoding: "plain-text",
      });
    });
  });

  describe("backward compatibility with current daemon sessions", () => {
    it("does not alter classification of standard plain text", () => {
      const result = classifyHistoryPayload("Normal message text");
      expect(result).toEqual({
        kind: "serialized",
        value: "Normal message text",
        encoding: "plain-text",
      });
    });

    it("does not alter classification of standard JSON payloads", () => {
      const json = JSON.stringify({ text: "hello", blocks: [] });
      const result = classifyHistoryPayload(json);
      expect(result).toEqual({
        kind: "serialized",
        value: json,
        encoding: "json",
      });
    });

    it("does not alter classification of standard escaped content", () => {
      const content = "Line 1\\nLine 2\\nLine 3";
      const result = classifyHistoryPayload(content);
      expect(result).toEqual({
        kind: "serialized",
        value: content,
        encoding: "json-escaped",
      });
    });
  });
});
