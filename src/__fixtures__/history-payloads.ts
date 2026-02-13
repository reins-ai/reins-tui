/**
 * Shared test fixtures for history payload regression tests.
 *
 * Provides canonical, legacy, and mixed-sequence payloads reusable
 * across store hydration and transport mapping test suites.
 */

import type {
  DaemonMessage,
  DaemonRawHistoryMessage,
  DaemonRawHistoryPayload,
} from "../daemon/contracts";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export function makeDaemonMessage(
  overrides: Partial<DaemonMessage> = {},
): DaemonMessage {
  return {
    id: overrides.id ?? "msg-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "Hello, world!",
    createdAt: overrides.createdAt ?? "2026-01-15T10:00:00.000Z",
  };
}

export function makeRawHistoryMessage(
  overrides: Partial<DaemonRawHistoryMessage> & {
    payload: DaemonRawHistoryPayload;
  },
): DaemonRawHistoryMessage {
  return {
    id: overrides.id ?? "msg-1",
    role: overrides.role ?? "assistant",
    createdAt: overrides.createdAt ?? "2026-01-15T10:00:00.000Z",
    payload: overrides.payload,
  };
}

export function structuredPayload(
  text: string,
  blocks?: Extract<
    DaemonRawHistoryPayload,
    { kind: "structured" }
  >["value"]["blocks"],
): DaemonRawHistoryPayload {
  return { kind: "structured", value: { text, blocks } };
}

export function serializedPayload(
  value: string,
  encoding: "json" | "json-escaped" | "plain-text" = "json",
): DaemonRawHistoryPayload {
  return { kind: "serialized", value, encoding };
}

// ---------------------------------------------------------------------------
// Canonical object payloads — current daemon format
// ---------------------------------------------------------------------------

/** Simple user text message in canonical structured format */
export const CANONICAL_USER_TEXT = makeRawHistoryMessage({
  id: "canonical-user-1",
  role: "user",
  createdAt: "2026-02-13T10:00:00.000Z",
  payload: structuredPayload("What is the weather today?"),
});

/** Simple assistant text response in canonical structured format */
export const CANONICAL_ASSISTANT_TEXT = makeRawHistoryMessage({
  id: "canonical-asst-1",
  role: "assistant",
  createdAt: "2026-02-13T10:00:01.000Z",
  payload: structuredPayload("The weather is sunny and 72F."),
});

/** Assistant message with tool use and tool result blocks */
export const CANONICAL_TOOL_MESSAGE = makeRawHistoryMessage({
  id: "canonical-tool-1",
  role: "assistant",
  createdAt: "2026-02-13T10:00:02.000Z",
  payload: structuredPayload("Let me check that for you.", [
    { type: "text", text: "Let me check that for you." },
    {
      type: "tool-use",
      toolCallId: "tc-weather-1",
      name: "get_weather",
      args: { location: "San Francisco" },
    },
    {
      type: "tool-result",
      toolCallId: "tc-weather-1",
      output: "Temperature: 72F\nCondition: Sunny\nHumidity: 45%",
    },
  ]),
});

/** Assistant message with tool error result */
export const CANONICAL_TOOL_ERROR = makeRawHistoryMessage({
  id: "canonical-tool-err-1",
  role: "assistant",
  createdAt: "2026-02-13T10:00:03.000Z",
  payload: structuredPayload("", [
    {
      type: "tool-use",
      toolCallId: "tc-fail-1",
      name: "bash",
      args: { command: "rm -rf /protected" },
    },
    {
      type: "tool-result",
      toolCallId: "tc-fail-1",
      output: "Permission denied: /protected",
      isError: true,
    },
  ]),
});

/** Canonical JSON serialized payload (structured object as JSON string) */
export const CANONICAL_JSON_SERIALIZED = makeRawHistoryMessage({
  id: "canonical-json-1",
  role: "assistant",
  createdAt: "2026-02-13T10:00:04.000Z",
  payload: serializedPayload(
    JSON.stringify({
      text: "Here are the results",
      blocks: [
        { type: "text", text: "Here are the results" },
        {
          type: "tool-use",
          toolCallId: "tc-ls-1",
          name: "bash",
          args: { command: "ls -la" },
        },
        {
          type: "tool-result",
          toolCallId: "tc-ls-1",
          output: "total 42\ndrwxr-xr-x  5 user staff  160 Feb 13 10:00 .\n-rw-r--r--  1 user staff 1234 Feb 13 09:55 README.md",
        },
      ],
    }),
    "json",
  ),
});

// ---------------------------------------------------------------------------
// Legacy escaped string payloads — older daemon format
// ---------------------------------------------------------------------------

/** Legacy payload with escaped newlines and tabs */
export const LEGACY_ESCAPED_TEXT = makeRawHistoryMessage({
  id: "legacy-escaped-1",
  role: "assistant",
  createdAt: "2026-02-13T10:01:00.000Z",
  payload: serializedPayload(
    "Here is the output:\\nLine 1\\nLine 2\\tindented\\nLine 3",
    "json-escaped",
  ),
});

/** Legacy payload with escaped quotes and backslashes */
export const LEGACY_ESCAPED_QUOTES = makeRawHistoryMessage({
  id: "legacy-escaped-2",
  role: "assistant",
  createdAt: "2026-02-13T10:01:01.000Z",
  payload: serializedPayload(
    'He said \\"hello\\" and the path was C:\\\\Users\\\\test',
    "json-escaped",
  ),
});

/** Legacy double-encoded JSON string (JSON.stringify("text")) */
export const LEGACY_DOUBLE_ENCODED_STRING = makeRawHistoryMessage({
  id: "legacy-double-str-1",
  role: "assistant",
  createdAt: "2026-02-13T10:01:02.000Z",
  payload: serializedPayload(
    JSON.stringify("Hello\nWorld\ttab"),
    "json",
  ),
});

/** Legacy double-encoded structured payload (JSON.stringify(JSON.stringify(obj))) */
export const LEGACY_DOUBLE_ENCODED_STRUCTURED = makeRawHistoryMessage({
  id: "legacy-double-struct-1",
  role: "assistant",
  createdAt: "2026-02-13T10:01:03.000Z",
  payload: serializedPayload(
    JSON.stringify(
      JSON.stringify({
        text: "Legacy structured content",
        blocks: [{ type: "text", text: "Legacy structured content" }],
      }),
    ),
    "json",
  ),
});

/** Legacy plain-text payload (no encoding artifacts) */
export const LEGACY_PLAIN_TEXT = makeRawHistoryMessage({
  id: "legacy-plain-1",
  role: "user",
  createdAt: "2026-02-13T10:01:04.000Z",
  payload: serializedPayload("Just a plain text message", "plain-text"),
});

// ---------------------------------------------------------------------------
// DaemonMessage fixtures (pre-transport-mapping)
// ---------------------------------------------------------------------------

/** DaemonMessage with plain text content */
export const DAEMON_MSG_PLAIN = makeDaemonMessage({
  id: "dmsg-plain-1",
  role: "user",
  content: "What is 2+2?",
  createdAt: "2026-02-13T10:00:00.000Z",
});

/** DaemonMessage with JSON structured content */
export const DAEMON_MSG_JSON = makeDaemonMessage({
  id: "dmsg-json-1",
  role: "assistant",
  content: JSON.stringify({
    text: "The answer is 4.",
    blocks: [{ type: "text", text: "The answer is 4." }],
  }),
  createdAt: "2026-02-13T10:00:01.000Z",
});

/** DaemonMessage with escaped content (legacy) */
export const DAEMON_MSG_ESCAPED = makeDaemonMessage({
  id: "dmsg-escaped-1",
  role: "assistant",
  content: "Line 1\\nLine 2\\nLine 3",
  createdAt: "2026-02-13T10:00:02.000Z",
});

/** DaemonMessage with tool output JSON */
export const DAEMON_MSG_TOOL = makeDaemonMessage({
  id: "dmsg-tool-1",
  role: "assistant",
  content: JSON.stringify({
    text: "",
    blocks: [
      {
        type: "tool-use",
        toolCallId: "tc-run-1",
        name: "bash",
        args: { command: "echo hello" },
      },
      {
        type: "tool-result",
        toolCallId: "tc-run-1",
        output: "hello\nworld",
      },
    ],
  }),
  createdAt: "2026-02-13T10:00:03.000Z",
});

/** DaemonMessage with BOM prefix (legacy artifact) */
export const DAEMON_MSG_BOM = makeDaemonMessage({
  id: "dmsg-bom-1",
  role: "assistant",
  content: "\uFEFFHello from legacy storage",
  createdAt: "2026-02-13T10:00:04.000Z",
});

/** DaemonMessage with double-encoded structured content */
export const DAEMON_MSG_DOUBLE_ENCODED = makeDaemonMessage({
  id: "dmsg-double-1",
  role: "assistant",
  content: JSON.stringify(
    JSON.stringify({
      text: "Double encoded message",
      blocks: [{ type: "text", text: "Double encoded message" }],
    }),
  ),
  createdAt: "2026-02-13T10:00:05.000Z",
});

// ---------------------------------------------------------------------------
// Mixed sequences — realistic conversation flows
// ---------------------------------------------------------------------------

/**
 * A realistic mixed conversation: user asks, assistant uses tool, user follows up.
 * Tests ordering, role transitions, and tool output preservation.
 */
export const MIXED_SEQUENCE_CANONICAL: DaemonRawHistoryMessage[] = [
  makeRawHistoryMessage({
    id: "mix-user-1",
    role: "user",
    createdAt: "2026-02-13T10:00:00.000Z",
    payload: structuredPayload("List the files in the current directory"),
  }),
  makeRawHistoryMessage({
    id: "mix-asst-1",
    role: "assistant",
    createdAt: "2026-02-13T10:00:01.000Z",
    payload: structuredPayload("I'll check that for you.", [
      { type: "text", text: "I'll check that for you." },
      {
        type: "tool-use",
        toolCallId: "tc-ls-mix",
        name: "bash",
        args: { command: "ls -la" },
      },
      {
        type: "tool-result",
        toolCallId: "tc-ls-mix",
        output: "package.json\nsrc/\ntests/\nREADME.md",
      },
    ]),
  }),
  makeRawHistoryMessage({
    id: "mix-user-2",
    role: "user",
    createdAt: "2026-02-13T10:00:05.000Z",
    payload: structuredPayload("Now show me the README"),
  }),
  makeRawHistoryMessage({
    id: "mix-asst-2",
    role: "assistant",
    createdAt: "2026-02-13T10:00:06.000Z",
    payload: structuredPayload("Here is the README content.", [
      { type: "text", text: "Here is the README content." },
      {
        type: "tool-use",
        toolCallId: "tc-cat-mix",
        name: "bash",
        args: { command: "cat README.md" },
      },
      {
        type: "tool-result",
        toolCallId: "tc-cat-mix",
        output: "# My Project\n\nA sample project for testing.\n\n## Features\n- Feature 1\n- Feature 2",
      },
    ]),
  }),
];

/**
 * Mixed sequence with legacy escaped payloads interleaved with canonical ones.
 * Simulates a session that spans daemon format changes.
 */
export const MIXED_SEQUENCE_LEGACY: DaemonRawHistoryMessage[] = [
  makeRawHistoryMessage({
    id: "mixleg-user-1",
    role: "user",
    createdAt: "2026-02-13T10:02:00.000Z",
    payload: serializedPayload("Show me the logs", "plain-text"),
  }),
  makeRawHistoryMessage({
    id: "mixleg-asst-1",
    role: "assistant",
    createdAt: "2026-02-13T10:02:01.000Z",
    payload: serializedPayload(
      "Here are the logs:\\n[INFO] Server started\\n[WARN] Slow query detected\\n[ERROR] Connection timeout",
      "json-escaped",
    ),
  }),
  makeRawHistoryMessage({
    id: "mixleg-user-2",
    role: "user",
    createdAt: "2026-02-13T10:02:05.000Z",
    payload: structuredPayload("Can you fix the timeout?"),
  }),
  makeRawHistoryMessage({
    id: "mixleg-asst-2",
    role: "assistant",
    createdAt: "2026-02-13T10:02:06.000Z",
    payload: structuredPayload("I'll investigate the connection issue.", [
      { type: "text", text: "I'll investigate the connection issue." },
      {
        type: "tool-use",
        toolCallId: "tc-fix-1",
        name: "bash",
        args: { command: "grep timeout config.yml" },
      },
      {
        type: "tool-result",
        toolCallId: "tc-fix-1",
        output: "connection_timeout: 5000\nread_timeout: 10000",
      },
    ]),
  }),
];

/**
 * DaemonMessage array for transport mapping tests — mixed content types.
 */
export const DAEMON_MSG_MIXED_SEQUENCE: DaemonMessage[] = [
  DAEMON_MSG_PLAIN,
  DAEMON_MSG_JSON,
  DAEMON_MSG_ESCAPED,
  DAEMON_MSG_TOOL,
];

/**
 * DaemonMessage array with legacy artifacts for transport mapping tests.
 */
export const DAEMON_MSG_LEGACY_SEQUENCE: DaemonMessage[] = [
  DAEMON_MSG_BOM,
  DAEMON_MSG_DOUBLE_ENCODED,
  DAEMON_MSG_ESCAPED,
  DAEMON_MSG_PLAIN,
];
