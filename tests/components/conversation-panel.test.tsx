import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DisplayMessage, DisplayToolCall } from "../../src/store";
import {
  isExchangeBoundary,
  shouldRenderToolBlocks,
  MESSAGE_GAP,
  EXCHANGE_GAP,
  getStreamingPlaceholderStyle,
} from "../../src/components/conversation-panel";
import {
  GLYPH_REINS,
  GLYPH_USER,
  GLYPH_TOOL_RUNNING,
  GLYPH_TOOL_DONE,
  GLYPH_TOOL_ERROR,
  getRoleGlyph,
  getRoleColor,
  getMessageBlockStyle,
  getMessageBorderChars,
} from "../../src/components/message";
import { hydratedMessageToDisplayMessage } from "../../src/store/history-hydration";
import type { DaemonHydratedHistoryMessage } from "../../src/daemon/contracts";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import type { MessageRole } from "../../src/theme/use-theme-tokens";

function makeMessage(
  role: DisplayMessage["role"],
  content: string,
  overrides?: Partial<DisplayMessage>,
): DisplayMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date(),
    ...overrides,
  };
}

const MOCK_TOKENS: ThemeTokens = {
  "surface.primary": "#1a1a2e",
  "surface.secondary": "#252540",
  "surface.tertiary": "#2e2e4a",
  "surface.elevated": "#353555",
  "text.primary": "#e8e0d4",
  "text.secondary": "#a09888",
  "text.muted": "#6b6360",
  "text.inverse": "#1a1a2e",
  "accent.primary": "#e8976c",
  "accent.secondary": "#f0c674",
  "accent.subtle": "#4a3a2e",
  "border.primary": "#4a4a6a",
  "border.subtle": "#3a3a5a",
  "border.focus": "#e8976c",
  "status.error": "#e85050",
  "status.success": "#50c878",
  "status.warning": "#f0c674",
  "status.info": "#6ca8e8",
  "glyph.reins": "#e8976c",
  "glyph.user": "#f0c674",
  "glyph.tool.running": "#6ca8e8",
  "glyph.tool.done": "#50c878",
  "glyph.tool.error": "#e85050",
  "glyph.heartbeat": "#e8976c",
  "conversation.user.bg": "#2e2e4a",
  "conversation.user.text": "#e8e0d4",
  "conversation.assistant.bg": "#1a1a2e",
  "conversation.assistant.text": "#e8e0d4",
  "sidebar.bg": "#1a1a2e",
  "sidebar.text": "#a09888",
  "sidebar.active": "#e8976c",
  "sidebar.hover": "#353555",
  "input.bg": "#252540",
  "input.text": "#e8e0d4",
  "input.placeholder": "#6b6360",
  "input.border": "#4a4a6a",
  "depth.panel1": "#1a1a2e",
  "depth.panel2": "#252540",
  "depth.panel3": "#2e2e4a",
  "depth.interactive": "#353555",
  "role.user.border": "#f0c674",
  "role.assistant.border": "#e8976c",
  "role.system.border": "#6b6360",
};

const mockGetRoleBorder = (role: MessageRole): string => {
  const borders: Record<MessageRole, string> = {
    user: "#f0c674",
    assistant: "#e8976c",
    system: "#6b6360",
  };
  return borders[role];
};

describe("message labels", () => {
  test("exports text-only role/status labels", () => {
    expect(GLYPH_REINS).toBe("Assistant");
    expect(GLYPH_USER).toBe("User");
    expect(GLYPH_TOOL_RUNNING).toBe("Running");
    expect(GLYPH_TOOL_DONE).toBe("Done");
    expect(GLYPH_TOOL_ERROR).toBe("Failed");
  });

  test("role mapping remains deterministic", () => {
    expect(getRoleGlyph("assistant")).toBe("Assistant");
    expect(getRoleGlyph("user")).toBe("User");
    expect(getRoleGlyph("system")).toBe("Assistant");
    expect(getRoleGlyph("tool")).toBe("Done");
  });
});

describe("exchange boundary detection", () => {
  test("detects user-after-assistant boundary", () => {
    const messages = [makeMessage("assistant", "Hi"), makeMessage("user", "Hello")];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("detects user-after-tool boundary", () => {
    const messages = [makeMessage("tool", "done"), makeMessage("user", "thanks")];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("does not mark assistant-after-user boundary", () => {
    const messages = [makeMessage("user", "Q"), makeMessage("assistant", "A")];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });
});

describe("spacing rhythm", () => {
  test("spacing values are positive integers", () => {
    expect(Number.isInteger(MESSAGE_GAP)).toBe(true);
    expect(Number.isInteger(EXCHANGE_GAP)).toBe(true);
    expect(MESSAGE_GAP).toBeGreaterThan(0);
    expect(EXCHANGE_GAP).toBeGreaterThan(0);
  });

  test("exchange gap keeps turn separation", () => {
    expect(EXCHANGE_GAP).toBeGreaterThanOrEqual(MESSAGE_GAP);
  });
});

describe("streaming placeholder style", () => {
  test("matches assistant message framing", () => {
    const placeholderStyle = getStreamingPlaceholderStyle(MOCK_TOKENS, mockGetRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", MOCK_TOKENS, mockGetRoleBorder);

    expect(placeholderStyle.accentColor).toBe(assistantStyle.accentColor);
    expect(placeholderStyle.backgroundColor).toBe(assistantStyle.backgroundColor);
    expect(placeholderStyle.paddingLeft).toBe(assistantStyle.paddingLeft);
    expect(placeholderStyle.paddingRight).toBe(assistantStyle.paddingRight);
  });
});

describe("source-level structure", () => {
  test("message.tsx keeps tool anchors inside framed message cards", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../src/components/message.tsx"), "utf-8");
    expect(source).toContain("FramedBlock");
    expect(source).toContain("ToolCallAnchor");
  });

  test("conversation-panel renders Reins version header in bold", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"), "utf-8");
    expect(source).toContain("Reins v${version}");
    expect(source).toContain('fontWeight: "bold"');
  });

  test("conversation-panel avoids flex-end content anchoring in ScrollBox", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"), "utf-8");
    expect(source).not.toContain('justifyContent: "flex-end"');
  });

  test("message.tsx does not perform text derivation or escape decoding", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../src/components/message.tsx"), "utf-8");
    // message.tsx should be purely presentational — no escape decoding in render path
    expect(source).not.toContain("decodeEscaped");
    expect(source).not.toContain("unescape");
    // No regex-based text replacement on message content
    expect(source).not.toContain(".replace(/\\\\n/");
    expect(source).not.toContain(".replace(/\\\\t/");
  });

  test("conversation-panel does not perform text derivation or escape decoding", () => {
    const source = readFileSync(resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"), "utf-8");
    expect(source).not.toContain("decodeEscaped");
    expect(source).not.toContain("unescape");
  });
});

// ---------------------------------------------------------------------------
// Helpers for hydrated message construction
// ---------------------------------------------------------------------------

function makeHydratedDisplayMessage(
  role: "user" | "assistant" | "system",
  text: string,
  overrides?: Partial<DaemonHydratedHistoryMessage>,
): DisplayMessage {
  const hydrated: DaemonHydratedHistoryMessage = {
    id: overrides?.id ?? crypto.randomUUID(),
    role,
    createdAt: overrides?.createdAt ?? new Date().toISOString(),
    payload: overrides?.payload ?? {
      text,
      blocks: text.length > 0 ? [{ type: "text", text }] : [],
    },
    ordering: overrides?.ordering ?? { timestampMs: Date.now(), fallbackIndex: 0 },
    dedupeKey: overrides?.dedupeKey ?? `${role}:${overrides?.id ?? "test"}`,
  };
  return hydratedMessageToDisplayMessage(hydrated);
}

// ---------------------------------------------------------------------------
// Reload ordering and role distinction parity
// ---------------------------------------------------------------------------

describe("reload ordering and role distinction", () => {
  test("hydrated messages preserve chronological order for exchange boundaries", () => {
    const t1 = new Date("2026-02-13T10:00:00Z");
    const t2 = new Date("2026-02-13T10:01:00Z");
    const t3 = new Date("2026-02-13T10:02:00Z");

    const messages: DisplayMessage[] = [
      makeHydratedDisplayMessage("user", "Hello", {
        createdAt: t1.toISOString(),
        ordering: { timestampMs: t1.getTime(), fallbackIndex: 0 },
      }),
      makeHydratedDisplayMessage("assistant", "Hi there!", {
        createdAt: t2.toISOString(),
        ordering: { timestampMs: t2.getTime(), fallbackIndex: 1 },
      }),
      makeHydratedDisplayMessage("user", "How are you?", {
        createdAt: t3.toISOString(),
        ordering: { timestampMs: t3.getTime(), fallbackIndex: 2 },
      }),
    ];

    // Verify ordering is correct
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("user");

    // Exchange boundary should be detected at index 2 (user after assistant)
    expect(isExchangeBoundary(messages, 0)).toBe(false);
    expect(isExchangeBoundary(messages, 1)).toBe(false);
    expect(isExchangeBoundary(messages, 2)).toBe(true);
  });

  test("hydrated messages maintain role distinction identical to live messages", () => {
    const liveUser = makeMessage("user", "Question");
    const liveAssistant = makeMessage("assistant", "Answer");
    const hydratedUser = makeHydratedDisplayMessage("user", "Question");
    const hydratedAssistant = makeHydratedDisplayMessage("assistant", "Answer");

    // Role labels must match
    expect(getRoleGlyph(liveUser.role)).toBe(getRoleGlyph(hydratedUser.role));
    expect(getRoleGlyph(liveAssistant.role)).toBe(getRoleGlyph(hydratedAssistant.role));

    // Role colors must match
    expect(getRoleColor(liveUser.role, MOCK_TOKENS)).toBe(getRoleColor(hydratedUser.role, MOCK_TOKENS));
    expect(getRoleColor(liveAssistant.role, MOCK_TOKENS)).toBe(getRoleColor(hydratedAssistant.role, MOCK_TOKENS));

    // Block styling must match
    const liveUserStyle = getMessageBlockStyle(liveUser.role, MOCK_TOKENS, mockGetRoleBorder);
    const hydratedUserStyle = getMessageBlockStyle(hydratedUser.role, MOCK_TOKENS, mockGetRoleBorder);
    expect(liveUserStyle.accentColor).toBe(hydratedUserStyle.accentColor);
    expect(liveUserStyle.backgroundColor).toBe(hydratedUserStyle.backgroundColor);

    const liveAssistantStyle = getMessageBlockStyle(liveAssistant.role, MOCK_TOKENS, mockGetRoleBorder);
    const hydratedAssistantStyle = getMessageBlockStyle(hydratedAssistant.role, MOCK_TOKENS, mockGetRoleBorder);
    expect(liveAssistantStyle.accentColor).toBe(hydratedAssistantStyle.accentColor);
    expect(liveAssistantStyle.backgroundColor).toBe(hydratedAssistantStyle.backgroundColor);

    // Border chars must match
    expect(getMessageBorderChars(liveUser.role)).toBe(getMessageBorderChars(hydratedUser.role));
    expect(getMessageBorderChars(liveAssistant.role)).toBe(getMessageBorderChars(hydratedAssistant.role));
  });

  test("shouldRenderToolBlocks works identically for hydrated assistant messages with tools", () => {
    const hydratedWithTools = makeHydratedDisplayMessage("assistant", "Let me check.", {
      payload: {
        text: "Let me check.",
        blocks: [
          { type: "text", text: "Let me check." },
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "ls" } },
          { type: "tool-result", toolCallId: "tc-1", output: "file.txt" },
        ],
      },
    });

    const liveWithTools = makeMessage("assistant", "Let me check.", {
      toolCalls: [{
        id: "tc-1",
        name: "bash",
        status: "complete" as const,
        args: { command: "ls" },
        result: "file.txt",
      }],
    });

    expect(shouldRenderToolBlocks(hydratedWithTools)).toBe(shouldRenderToolBlocks(liveWithTools));
  });

  test("shouldRenderToolBlocks returns false for messages without tool calls", () => {
    const hydratedNoTools = makeHydratedDisplayMessage("assistant", "Just text.");
    const liveNoTools = makeMessage("assistant", "Just text.");

    expect(shouldRenderToolBlocks(hydratedNoTools)).toBe(false);
    expect(shouldRenderToolBlocks(liveNoTools)).toBe(false);
  });

  test("exchange boundaries work correctly with mixed live and hydrated messages", () => {
    const messages: DisplayMessage[] = [
      makeHydratedDisplayMessage("user", "First question"),
      makeHydratedDisplayMessage("assistant", "First answer"),
      makeMessage("user", "Follow-up question"),  // live message after reload
    ];

    expect(isExchangeBoundary(messages, 0)).toBe(false);
    expect(isExchangeBoundary(messages, 1)).toBe(false);
    expect(isExchangeBoundary(messages, 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Hydrated content integrity in conversation flow
// ---------------------------------------------------------------------------

describe("hydrated content integrity in conversation flow", () => {
  const ESCAPED_SEQUENCE_PATTERN = /(?<!\\)\\[ntr"\\]/;

  test("multi-turn hydrated conversation has no escaped artifacts", () => {
    const messages: DisplayMessage[] = [
      makeHydratedDisplayMessage("user", "What is TypeScript?"),
      makeHydratedDisplayMessage("assistant", "TypeScript is a typed superset of JavaScript.\nIt compiles to plain JavaScript."),
      makeHydratedDisplayMessage("user", "Can you show an example?"),
      makeHydratedDisplayMessage("assistant", "function greet(name: string): string {\n\treturn `Hello, ${name}!`;\n}"),
    ];

    for (const message of messages) {
      expect(message.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
    }

    // Verify actual content is clean
    expect(messages[1].content).toContain("\n");
    expect(messages[3].content).toContain("\n");
    expect(messages[3].content).toContain("\t");
  });

  test("hydrated messages with tool calls have clean content and tool data", () => {
    const hydrated = makeHydratedDisplayMessage("assistant", "Running the command now.", {
      payload: {
        text: "Running the command now.",
        blocks: [
          { type: "text", text: "Running the command now." },
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "echo 'hello world'" } },
          { type: "tool-result", toolCallId: "tc-1", output: "hello world" },
        ],
      },
    });

    expect(hydrated.content).toBe("Running the command now.");
    expect(hydrated.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
    expect(hydrated.toolCalls).toHaveLength(1);
    expect(hydrated.toolCalls![0].result).toBe("hello world");
    expect(hydrated.toolCalls![0].result).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
  });

  test("empty hydrated messages render without artifacts", () => {
    const hydrated = makeHydratedDisplayMessage("assistant", "", {
      payload: {
        text: "",
        blocks: [
          { type: "tool-use", toolCallId: "tc-1", name: "read_file", args: { path: "test.ts" } },
          { type: "tool-result", toolCallId: "tc-1", output: "const x = 1;" },
        ],
      },
    });

    expect(hydrated.content).toBe("");
    expect(hydrated.toolCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed sequence ordering and role distinction (MH3, MH4)
// ---------------------------------------------------------------------------

describe("mixed sequence ordering and role distinction on reload", () => {
  const ESCAPED_SEQUENCE_PATTERN = /(?<!\\)\\[ntr"\\]/;

  /**
   * Builds a realistic multi-turn conversation with assistant text,
   * tool calls/results, and user follow-ups — as it would appear
   * after history hydration on reconnect.
   */
  function buildRealisticReloadSequence(): DisplayMessage[] {
    const t1 = new Date("2026-02-13T09:00:00Z");
    const t2 = new Date("2026-02-13T09:00:10Z");
    const t3 = new Date("2026-02-13T09:00:30Z");
    const t4 = new Date("2026-02-13T09:01:00Z");
    const t5 = new Date("2026-02-13T09:01:30Z");

    return [
      makeHydratedDisplayMessage("user", "What files are in the project?", {
        createdAt: t1.toISOString(),
        ordering: { timestampMs: t1.getTime(), fallbackIndex: 0 },
      }),
      makeHydratedDisplayMessage("assistant", "Let me check the project structure.", {
        createdAt: t2.toISOString(),
        ordering: { timestampMs: t2.getTime(), fallbackIndex: 1 },
        payload: {
          text: "Let me check the project structure.",
          blocks: [
            { type: "text", text: "Let me check the project structure." },
            { type: "tool-use", toolCallId: "tc-ls", name: "bash", args: { command: "ls -la" } },
            { type: "tool-result", toolCallId: "tc-ls", output: "total 32\npackage.json\nsrc/\ntests/" },
          ],
        },
      }),
      makeHydratedDisplayMessage("assistant", "The project contains:\n- package.json\n- src/ directory\n- tests/ directory", {
        createdAt: t3.toISOString(),
        ordering: { timestampMs: t3.getTime(), fallbackIndex: 2 },
      }),
      makeHydratedDisplayMessage("user", "Show me the package.json", {
        createdAt: t4.toISOString(),
        ordering: { timestampMs: t4.getTime(), fallbackIndex: 3 },
      }),
      makeHydratedDisplayMessage("assistant", "Here is the package.json content:", {
        createdAt: t5.toISOString(),
        ordering: { timestampMs: t5.getTime(), fallbackIndex: 4 },
        payload: {
          text: "Here is the package.json content:",
          blocks: [
            { type: "text", text: "Here is the package.json content:" },
            { type: "tool-use", toolCallId: "tc-read", name: "read_file", args: { path: "package.json" } },
            { type: "tool-result", toolCallId: "tc-read", output: "{\n  \"name\": \"reins-tui\",\n  \"version\": \"0.1.0\"\n}" },
          ],
        },
      }),
    ];
  }

  test("chronological ordering is preserved across all messages in reload sequence", () => {
    const messages = buildRealisticReloadSequence();

    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].createdAt.getTime()).toBeGreaterThan(
        messages[i - 1].createdAt.getTime(),
      );
    }
  });

  test("role sequence matches expected user-assistant-assistant-user-assistant pattern", () => {
    const messages = buildRealisticReloadSequence();
    const roles = messages.map((m) => m.role);

    expect(roles).toEqual(["user", "assistant", "assistant", "user", "assistant"]);
  });

  test("exchange boundaries are detected correctly in reload sequence", () => {
    const messages = buildRealisticReloadSequence();

    // Index 0: first message, no boundary
    expect(isExchangeBoundary(messages, 0)).toBe(false);
    // Index 1: assistant after user — not a boundary (same exchange)
    expect(isExchangeBoundary(messages, 1)).toBe(false);
    // Index 2: assistant after assistant — not a boundary
    expect(isExchangeBoundary(messages, 2)).toBe(false);
    // Index 3: user after assistant — IS a boundary (new exchange)
    expect(isExchangeBoundary(messages, 3)).toBe(true);
    // Index 4: assistant after user — not a boundary
    expect(isExchangeBoundary(messages, 4)).toBe(false);
  });

  test("no escaped artifacts in any message content across reload sequence", () => {
    const messages = buildRealisticReloadSequence();

    for (const msg of messages) {
      expect(msg.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
    }
  });

  test("no escaped artifacts in tool call results across reload sequence", () => {
    const messages = buildRealisticReloadSequence();

    for (const msg of messages) {
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.result) {
            expect(tc.result).not.toContain("\\n");
            expect(tc.result).not.toContain("\\t");
            expect(tc.result).not.toContain("\\\\");
          }
        }
      }
    }
  });

  test("tool calls in reload sequence have correct metadata", () => {
    const messages = buildRealisticReloadSequence();

    // Message at index 1 has bash tool call
    const msg1 = messages[1];
    expect(msg1.toolCalls).toHaveLength(1);
    expect(msg1.toolCalls![0].name).toBe("bash");
    expect(msg1.toolCalls![0].status).toBe("complete");
    expect(msg1.toolCalls![0].args).toEqual({ command: "ls -la" });

    // Message at index 4 has read_file tool call
    const msg4 = messages[4];
    expect(msg4.toolCalls).toHaveLength(1);
    expect(msg4.toolCalls![0].name).toBe("read_file");
    expect(msg4.toolCalls![0].status).toBe("complete");
    expect(msg4.toolCalls![0].args).toEqual({ path: "package.json" });
  });

  test("tool results preserve real newlines in reload sequence", () => {
    const messages = buildRealisticReloadSequence();

    // bash tool result has 3 lines
    const bashResult = messages[1].toolCalls![0].result!;
    expect(bashResult.split("\n")).toHaveLength(4); // "total 32" + 3 entries

    // read_file tool result has multi-line JSON
    const readResult = messages[4].toolCalls![0].result!;
    expect(readResult.split("\n").length).toBeGreaterThanOrEqual(4);
    expect(readResult).toContain('"name"');
    expect(readResult).toContain('"reins-tui"');
  });

  test("shouldRenderToolBlocks correctly identifies tool-bearing messages in sequence", () => {
    const messages = buildRealisticReloadSequence();

    expect(shouldRenderToolBlocks(messages[0])).toBe(false); // user, no tools
    expect(shouldRenderToolBlocks(messages[1])).toBe(true);  // assistant with tools
    expect(shouldRenderToolBlocks(messages[2])).toBe(false); // assistant, no tools
    expect(shouldRenderToolBlocks(messages[3])).toBe(false); // user, no tools
    expect(shouldRenderToolBlocks(messages[4])).toBe(true);  // assistant with tools
  });
});

// ---------------------------------------------------------------------------
// Role distinction visual parity: live vs hydrated (MH3, MH4)
// ---------------------------------------------------------------------------

describe("role distinction visual parity: live vs hydrated", () => {
  test("user role visual treatment is identical for live and hydrated", () => {
    const live = makeMessage("user", "Hello");
    const hydrated = makeHydratedDisplayMessage("user", "Hello");

    expect(getRoleGlyph(live.role)).toBe(GLYPH_USER);
    expect(getRoleGlyph(hydrated.role)).toBe(GLYPH_USER);
    expect(getRoleColor(live.role, MOCK_TOKENS)).toBe(getRoleColor(hydrated.role, MOCK_TOKENS));

    const liveStyle = getMessageBlockStyle(live.role, MOCK_TOKENS, mockGetRoleBorder);
    const hydratedStyle = getMessageBlockStyle(hydrated.role, MOCK_TOKENS, mockGetRoleBorder);
    expect(liveStyle).toEqual(hydratedStyle);
  });

  test("assistant role visual treatment is identical for live and hydrated", () => {
    const live = makeMessage("assistant", "Response");
    const hydrated = makeHydratedDisplayMessage("assistant", "Response");

    expect(getRoleGlyph(live.role)).toBe(GLYPH_REINS);
    expect(getRoleGlyph(hydrated.role)).toBe(GLYPH_REINS);
    expect(getRoleColor(live.role, MOCK_TOKENS)).toBe(getRoleColor(hydrated.role, MOCK_TOKENS));

    const liveStyle = getMessageBlockStyle(live.role, MOCK_TOKENS, mockGetRoleBorder);
    const hydratedStyle = getMessageBlockStyle(hydrated.role, MOCK_TOKENS, mockGetRoleBorder);
    expect(liveStyle).toEqual(hydratedStyle);
  });

  test("system role visual treatment is identical for live and hydrated", () => {
    const live = makeMessage("system", "System prompt");
    const hydrated = makeHydratedDisplayMessage("system", "System prompt");

    expect(getRoleGlyph(live.role)).toBe(getRoleGlyph(hydrated.role));
    expect(getRoleColor(live.role, MOCK_TOKENS)).toBe(getRoleColor(hydrated.role, MOCK_TOKENS));

    const liveStyle = getMessageBlockStyle(live.role, MOCK_TOKENS, mockGetRoleBorder);
    const hydratedStyle = getMessageBlockStyle(hydrated.role, MOCK_TOKENS, mockGetRoleBorder);
    expect(liveStyle).toEqual(hydratedStyle);
  });

  test("border chars are identical for all roles across live and hydrated", () => {
    const roles: Array<"user" | "assistant" | "system"> = ["user", "assistant", "system"];

    for (const role of roles) {
      const live = makeMessage(role, "content");
      const hydrated = makeHydratedDisplayMessage(role, "content");
      expect(getMessageBorderChars(live.role)).toBe(getMessageBorderChars(hydrated.role));
    }
  });

  test("user and assistant have distinct visual treatments in hydrated messages", () => {
    const user = makeHydratedDisplayMessage("user", "Question");
    const assistant = makeHydratedDisplayMessage("assistant", "Answer");

    // Glyphs differ
    expect(getRoleGlyph(user.role)).not.toBe(getRoleGlyph(assistant.role));

    // Colors differ
    expect(getRoleColor(user.role, MOCK_TOKENS)).not.toBe(
      getRoleColor(assistant.role, MOCK_TOKENS),
    );

    // Block styles differ
    const userStyle = getMessageBlockStyle(user.role, MOCK_TOKENS, mockGetRoleBorder);
    const assistantStyle = getMessageBlockStyle(assistant.role, MOCK_TOKENS, mockGetRoleBorder);
    expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
    expect(userStyle.backgroundColor).not.toBe(assistantStyle.backgroundColor);
  });
});

// ---------------------------------------------------------------------------
// Content blocks ordering parity on reload (MH4)
// ---------------------------------------------------------------------------

describe("content blocks ordering parity on reload", () => {
  test("hydrated message with interleaved text and tool blocks preserves block order", () => {
    const hydrated = makeHydratedDisplayMessage("assistant", "I'll check two things.", {
      payload: {
        text: "I'll check two things.",
        blocks: [
          { type: "text", text: "I'll check two things." },
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "ls" } },
          { type: "tool-result", toolCallId: "tc-1", output: "file.txt" },
          { type: "text", text: "Now let me read it." },
          { type: "tool-use", toolCallId: "tc-2", name: "read_file", args: { path: "file.txt" } },
          { type: "tool-result", toolCallId: "tc-2", output: "Hello world" },
        ],
      },
    });

    expect(hydrated.contentBlocks).toBeDefined();
    expect(hydrated.contentBlocks).toHaveLength(6);

    // Verify block type ordering
    expect(hydrated.contentBlocks![0].type).toBe("text");
    expect(hydrated.contentBlocks![0].text).toBe("I'll check two things.");
    expect(hydrated.contentBlocks![1].type).toBe("tool-call");
    expect(hydrated.contentBlocks![1].toolCallId).toBe("tc-1");
    expect(hydrated.contentBlocks![2].type).toBe("tool-call"); // tool-result maps to tool-call
    expect(hydrated.contentBlocks![3].type).toBe("text");
    expect(hydrated.contentBlocks![3].text).toBe("Now let me read it.");
    expect(hydrated.contentBlocks![4].type).toBe("tool-call");
    expect(hydrated.contentBlocks![4].toolCallId).toBe("tc-2");
    expect(hydrated.contentBlocks![5].type).toBe("tool-call");
  });

  test("hydrated message with multiple tool calls preserves all tool metadata", () => {
    const hydrated = makeHydratedDisplayMessage("assistant", "", {
      payload: {
        text: "",
        blocks: [
          { type: "tool-use", toolCallId: "tc-a", name: "bash", args: { command: "git status" } },
          { type: "tool-result", toolCallId: "tc-a", output: "On branch main\nnothing to commit" },
          { type: "tool-use", toolCallId: "tc-b", name: "bash", args: { command: "git log -1" } },
          { type: "tool-result", toolCallId: "tc-b", output: "commit abc123\nAuthor: test" },
        ],
      },
    });

    expect(hydrated.toolCalls).toHaveLength(2);

    expect(hydrated.toolCalls![0].id).toBe("tc-a");
    expect(hydrated.toolCalls![0].name).toBe("bash");
    expect(hydrated.toolCalls![0].result).toBe("On branch main\nnothing to commit");
    expect(hydrated.toolCalls![0].result).not.toContain("\\n");

    expect(hydrated.toolCalls![1].id).toBe("tc-b");
    expect(hydrated.toolCalls![1].name).toBe("bash");
    expect(hydrated.toolCalls![1].result).toBe("commit abc123\nAuthor: test");
    expect(hydrated.toolCalls![1].result).not.toContain("\\n");
  });

  test("hydrated message with error tool call preserves error state in sequence", () => {
    const hydrated = makeHydratedDisplayMessage("assistant", "Trying both commands.", {
      payload: {
        text: "Trying both commands.",
        blocks: [
          { type: "text", text: "Trying both commands." },
          { type: "tool-use", toolCallId: "tc-ok", name: "bash", args: { command: "echo ok" } },
          { type: "tool-result", toolCallId: "tc-ok", output: "ok" },
          { type: "tool-use", toolCallId: "tc-fail", name: "bash", args: { command: "bad-cmd" } },
          { type: "tool-result", toolCallId: "tc-fail", output: "command not found", isError: true },
        ],
      },
    });

    expect(hydrated.toolCalls).toHaveLength(2);

    // First tool: success
    expect(hydrated.toolCalls![0].status).toBe("complete");
    expect(hydrated.toolCalls![0].isError).toBeFalsy();

    // Second tool: error
    expect(hydrated.toolCalls![1].status).toBe("error");
    expect(hydrated.toolCalls![1].isError).toBe(true);
    expect(hydrated.toolCalls![1].result).toBe("command not found");
  });
});
