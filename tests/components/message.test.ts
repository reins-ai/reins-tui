import { describe, expect, test } from "bun:test";

import {
  buildStreamingText,
  formatArgsPreview,
  formatResultPreview,
  formatToolResultPreview,
  getMessageBlockStyle,
  getMessageBorderChars,
  getRoleColor,
  getRoleGlyph,
  getToolGlyph,
  getToolGlyphColor,
  GLYPH_REINS,
  GLYPH_USER,
  GLYPH_TOOL_RUNNING,
  GLYPH_TOOL_DONE,
  GLYPH_TOOL_ERROR,
} from "../../src/components";
import { SUBTLE_BORDER_CHARS } from "../../src/ui/primitives";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import type { MessageRole } from "../../src/theme/use-theme-tokens";
import type { DisplayMessage, DisplayToolCall } from "../../src/store";
import { hydratedMessageToDisplayMessage } from "../../src/store/history-hydration";
import type { DaemonHydratedHistoryMessage } from "../../src/daemon/contracts";

import reinsDarkSource from "../../src/theme/builtins/reins-dark.json";
import reinsLightSource from "../../src/theme/builtins/reins-light.json";
import tokyonightSource from "../../src/theme/builtins/tokyonight.json";

const tokens = reinsDarkSource as unknown as Readonly<ThemeTokens>;
const lightTokens = reinsLightSource as unknown as Readonly<ThemeTokens>;
const tokyonightTokens = tokyonightSource as unknown as Readonly<ThemeTokens>;

function makeGetRoleBorder(t: Readonly<ThemeTokens>) {
  return (role: MessageRole): string => {
    const map: Record<MessageRole, string> = {
      user: t["role.user.border"],
      assistant: t["role.assistant.border"],
      system: t["role.system.border"],
    };
    return map[role];
  };
}

describe("message rendering helpers", () => {
  test("role colors map by message role using theme tokens", () => {
    expect(getRoleColor("user", tokens)).toBe(tokens["glyph.user"]);
    expect(getRoleColor("assistant", tokens)).toBe(tokens["glyph.reins"]);
    expect(getRoleColor("system", tokens)).toBe(tokens["text.muted"]);
    expect(getRoleColor("tool", tokens)).toBe(tokens["glyph.tool.running"]);
  });

  test("role labels use text-only vocabulary", () => {
    expect(getRoleGlyph("assistant")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("user")).toBe(GLYPH_USER);
    expect(getRoleGlyph("system")).toBe(GLYPH_REINS);
    expect(getRoleGlyph("tool")).toBe(GLYPH_TOOL_DONE);
  });

  test("tool status labels use text-only vocabulary", () => {
    expect(getToolGlyph("pending")).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph("running")).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph("complete")).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyph("error")).toBe(GLYPH_TOOL_ERROR);
  });

  test("tool status colors use dedicated theme tokens", () => {
    expect(getToolGlyphColor("running", tokens)).toBe(tokens["glyph.tool.running"]);
    expect(getToolGlyphColor("complete", tokens)).toBe(tokens["glyph.tool.done"]);
    expect(getToolGlyphColor("error", tokens)).toBe(tokens["glyph.tool.error"]);
  });

  test("streaming cursor appears only when streaming", () => {
    expect(buildStreamingText("partial", true)).toBe("partial▊");
    expect(buildStreamingText("final", false)).toBe("final");
  });
});

describe("role-specific message block styling", () => {
  const getRoleBorder = makeGetRoleBorder(tokens);

  test("user block uses role.user.border and conversation.user.bg", () => {
    const style = getMessageBlockStyle("user", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["role.user.border"]);
    expect(style.backgroundColor).toBe(tokens["conversation.user.bg"]);
  });

  test("assistant block uses role.assistant.border and conversation.assistant.bg", () => {
    const style = getMessageBlockStyle("assistant", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["role.assistant.border"]);
    expect(style.backgroundColor).toBe(tokens["conversation.assistant.bg"]);
  });

  test("system block uses role.system.border and surface.primary", () => {
    const style = getMessageBlockStyle("system", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["role.system.border"]);
    expect(style.backgroundColor).toBe(tokens["surface.primary"]);
  });

  test("tool block uses running accent and surface.secondary", () => {
    const style = getMessageBlockStyle("tool", tokens, getRoleBorder);
    expect(style.accentColor).toBe(tokens["glyph.tool.running"]);
    expect(style.backgroundColor).toBe(tokens["surface.secondary"]);
  });

  test("all roles produce consistent padding values", () => {
    const roles: Array<"user" | "assistant" | "system" | "tool"> = ["user", "assistant", "system", "tool"];
    for (const role of roles) {
      const style = getMessageBlockStyle(role, tokens, getRoleBorder);
      expect(style.paddingLeft).toBe(2);
      expect(style.paddingRight).toBe(1);
      expect(style.paddingTop).toBe(0);
      expect(style.paddingBottom).toBe(0);
    }
  });

  test("all roles use subtle border chars for cleaner cards", () => {
    expect(getMessageBorderChars("assistant")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("user")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("system")).toBe(SUBTLE_BORDER_CHARS);
    expect(getMessageBorderChars("tool")).toBe(SUBTLE_BORDER_CHARS);
  });
});

describe("role block styling across themes", () => {
  test("themes produce valid role accents", () => {
    const themeTokenSets = [tokens, lightTokens, tokyonightTokens];
    for (const t of themeTokenSets) {
      const getRoleBorder = makeGetRoleBorder(t);
      const userStyle = getMessageBlockStyle("user", t, getRoleBorder);
      const assistantStyle = getMessageBlockStyle("assistant", t, getRoleBorder);
      expect(userStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(assistantStyle.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(userStyle.accentColor).not.toBe(assistantStyle.accentColor);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers for live vs reload parity tests
// ---------------------------------------------------------------------------

/** Simulates a live-session message (as created by use-conversation.ts). */
function makeLiveMessage(
  role: DisplayMessage["role"],
  content: string,
  overrides?: Partial<DisplayMessage>,
): DisplayMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    isStreaming: false,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Builds a hydrated history message and converts it to DisplayMessage. */
function makeHydratedMessage(
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

const ESCAPED_SEQUENCE_PATTERN = /(?<!\\)\\[ntr"\\]/;

// ---------------------------------------------------------------------------
// Live vs reload rendering parity
// ---------------------------------------------------------------------------

describe("live vs reload message rendering parity", () => {
  const getRoleBorder = makeGetRoleBorder(tokens);

  test("user messages produce identical role labels regardless of origin", () => {
    const live = makeLiveMessage("user", "Hello world");
    const hydrated = makeHydratedMessage("user", "Hello world");

    expect(getRoleGlyph(live.role)).toBe(getRoleGlyph(hydrated.role));
    expect(getRoleColor(live.role, tokens)).toBe(getRoleColor(hydrated.role, tokens));
  });

  test("assistant messages produce identical role labels regardless of origin", () => {
    const live = makeLiveMessage("assistant", "I can help with that.");
    const hydrated = makeHydratedMessage("assistant", "I can help with that.");

    expect(getRoleGlyph(live.role)).toBe(getRoleGlyph(hydrated.role));
    expect(getRoleColor(live.role, tokens)).toBe(getRoleColor(hydrated.role, tokens));
  });

  test("system messages produce identical role labels regardless of origin", () => {
    const live = makeLiveMessage("system", "System prompt");
    const hydrated = makeHydratedMessage("system", "System prompt");

    expect(getRoleGlyph(live.role)).toBe(getRoleGlyph(hydrated.role));
    expect(getRoleColor(live.role, tokens)).toBe(getRoleColor(hydrated.role, tokens));
  });

  test("block styling is identical for live and hydrated messages of same role", () => {
    const roles: Array<"user" | "assistant" | "system"> = ["user", "assistant", "system"];

    for (const role of roles) {
      const live = makeLiveMessage(role, "content");
      const hydrated = makeHydratedMessage(role, "content");

      const liveStyle = getMessageBlockStyle(live.role, tokens, getRoleBorder);
      const hydratedStyle = getMessageBlockStyle(hydrated.role, tokens, getRoleBorder);

      expect(liveStyle.accentColor).toBe(hydratedStyle.accentColor);
      expect(liveStyle.backgroundColor).toBe(hydratedStyle.backgroundColor);
      expect(liveStyle.paddingLeft).toBe(hydratedStyle.paddingLeft);
      expect(liveStyle.paddingRight).toBe(hydratedStyle.paddingRight);
    }
  });

  test("border chars are identical for live and hydrated messages of same role", () => {
    const roles: Array<"user" | "assistant" | "system"> = ["user", "assistant", "system"];

    for (const role of roles) {
      const live = makeLiveMessage(role, "content");
      const hydrated = makeHydratedMessage(role, "content");

      expect(getMessageBorderChars(live.role)).toBe(getMessageBorderChars(hydrated.role));
    }
  });

  test("content field is identical for same text in live and hydrated messages", () => {
    const text = "Here is a multi-line response.\nWith actual newlines.\nAnd tabs:\there.";
    const live = makeLiveMessage("assistant", text);
    const hydrated = makeHydratedMessage("assistant", text);

    expect(live.content).toBe(hydrated.content);
  });

  test("hydrated messages have isStreaming set to false", () => {
    const hydrated = makeHydratedMessage("assistant", "Some response");
    expect(hydrated.isStreaming).toBe(false);
  });

  test("hydrated messages preserve createdAt as Date object", () => {
    const timestamp = "2026-02-13T10:30:00.000Z";
    const hydrated = makeHydratedMessage("user", "Hello", {
      createdAt: timestamp,
    });

    expect(hydrated.createdAt).toBeInstanceOf(Date);
    expect(hydrated.createdAt.toISOString()).toBe(timestamp);
  });
});

// ---------------------------------------------------------------------------
// Escaped sequence artifact prevention
// ---------------------------------------------------------------------------

describe("no escaped sequence artifacts in rendered content", () => {
  test("hydrated message with decoded newlines contains real newlines", () => {
    const hydrated = makeHydratedMessage("assistant", "Line 1\nLine 2\nLine 3");
    expect(hydrated.content).toBe("Line 1\nLine 2\nLine 3");
    expect(hydrated.content).toContain("\n");
    expect(hydrated.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
  });

  test("hydrated message with decoded tabs contains real tabs", () => {
    const hydrated = makeHydratedMessage("assistant", "Col1\tCol2\tCol3");
    expect(hydrated.content).toBe("Col1\tCol2\tCol3");
    expect(hydrated.content).toContain("\t");
    expect(hydrated.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
  });

  test("hydrated message with mixed whitespace is clean", () => {
    const text = "function hello() {\n\treturn \"world\";\n}";
    const hydrated = makeHydratedMessage("assistant", text);
    expect(hydrated.content).toBe(text);
    expect(hydrated.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
  });

  test("plain text content passes through without escaped artifacts", () => {
    const text = "This is a simple message with no special characters.";
    const hydrated = makeHydratedMessage("user", text);
    expect(hydrated.content).toBe(text);
    expect(hydrated.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
  });

  test("empty content produces empty string without artifacts", () => {
    const hydrated = makeHydratedMessage("assistant", "");
    expect(hydrated.content).toBe("");
  });

  test("content with quotes is clean after hydration", () => {
    const text = 'She said "hello" and he replied "goodbye"';
    const hydrated = makeHydratedMessage("assistant", text);
    expect(hydrated.content).toBe(text);
    expect(hydrated.content).not.toMatch(ESCAPED_SEQUENCE_PATTERN);
  });
});

// ---------------------------------------------------------------------------
// Role and metadata preservation through hydration
// ---------------------------------------------------------------------------

describe("role and metadata preservation for hydrated messages", () => {
  test("user role is preserved through hydration", () => {
    const hydrated = makeHydratedMessage("user", "Hello");
    expect(hydrated.role).toBe("user");
  });

  test("assistant role is preserved through hydration", () => {
    const hydrated = makeHydratedMessage("assistant", "Response");
    expect(hydrated.role).toBe("assistant");
  });

  test("system role is preserved through hydration", () => {
    const hydrated = makeHydratedMessage("system", "System prompt");
    expect(hydrated.role).toBe("system");
  });

  test("hydrated user message gets same visual treatment as live user message", () => {
    const hydrated = makeHydratedMessage("user", "Question");
    expect(getRoleGlyph(hydrated.role)).toBe(GLYPH_USER);
    expect(getRoleColor(hydrated.role, tokens)).toBe(tokens["glyph.user"]);
  });

  test("hydrated assistant message gets same visual treatment as live assistant message", () => {
    const hydrated = makeHydratedMessage("assistant", "Answer");
    expect(getRoleGlyph(hydrated.role)).toBe(GLYPH_REINS);
    expect(getRoleColor(hydrated.role, tokens)).toBe(tokens["glyph.reins"]);
  });

  test("hydrated messages with tool calls preserve tool metadata", () => {
    const hydrated = makeHydratedMessage("assistant", "Let me check that.", {
      payload: {
        text: "Let me check that.",
        blocks: [
          { type: "text", text: "Let me check that." },
          { type: "tool-use", toolCallId: "tc-1", name: "bash", args: { command: "ls -la" } },
          { type: "tool-result", toolCallId: "tc-1", output: "file1.txt\nfile2.txt" },
        ],
      },
    });

    expect(hydrated.toolCalls).toBeDefined();
    expect(hydrated.toolCalls).toHaveLength(1);
    expect(hydrated.toolCalls![0].id).toBe("tc-1");
    expect(hydrated.toolCalls![0].name).toBe("bash");
    expect(hydrated.toolCalls![0].status).toBe("complete");
    expect(hydrated.toolCalls![0].args).toEqual({ command: "ls -la" });
    expect(hydrated.toolCalls![0].result).toBe("file1.txt\nfile2.txt");
    expect(hydrated.toolCalls![0].isError).toBeFalsy();
  });

  test("hydrated messages with content blocks preserve block ordering", () => {
    const hydrated = makeHydratedMessage("assistant", "Checking...", {
      payload: {
        text: "Checking...",
        blocks: [
          { type: "text", text: "Checking..." },
          { type: "tool-use", toolCallId: "tc-1", name: "read_file", args: { path: "test.ts" } },
          { type: "text", text: "Here are the results." },
        ],
      },
    });

    expect(hydrated.contentBlocks).toBeDefined();
    expect(hydrated.contentBlocks).toHaveLength(3);
    expect(hydrated.contentBlocks![0].type).toBe("text");
    expect(hydrated.contentBlocks![0].text).toBe("Checking...");
    expect(hydrated.contentBlocks![1].type).toBe("tool-call");
    expect(hydrated.contentBlocks![1].toolCallId).toBe("tc-1");
    expect(hydrated.contentBlocks![2].type).toBe("text");
    expect(hydrated.contentBlocks![2].text).toBe("Here are the results.");
  });

  test("hydrated error tool calls preserve error state", () => {
    const hydrated = makeHydratedMessage("assistant", "", {
      payload: {
        text: "",
        blocks: [
          { type: "tool-use", toolCallId: "tc-err", name: "bash", args: { command: "bad-cmd" } },
          { type: "tool-result", toolCallId: "tc-err", output: "command not found", isError: true },
        ],
      },
    });

    expect(hydrated.toolCalls).toBeDefined();
    expect(hydrated.toolCalls![0].status).toBe("error");
    expect(hydrated.toolCalls![0].isError).toBe(true);
    expect(hydrated.toolCalls![0].result).toBe("command not found");
  });
});

// ---------------------------------------------------------------------------
// Tool preview formatting (presentational helpers)
// ---------------------------------------------------------------------------

describe("tool preview formatting", () => {
  test("formatArgsPreview extracts command from args", () => {
    const toolCall: DisplayToolCall = {
      id: "tc-1",
      name: "bash",
      status: "running",
      args: { command: "ls -la" },
    };
    expect(formatArgsPreview(toolCall)).toBe("$ ls -la");
  });

  test("formatArgsPreview returns undefined for empty args", () => {
    const toolCall: DisplayToolCall = {
      id: "tc-1",
      name: "bash",
      status: "running",
      args: {},
    };
    expect(formatArgsPreview(toolCall)).toBeUndefined();
  });

  test("formatArgsPreview returns undefined for missing args", () => {
    const toolCall: DisplayToolCall = {
      id: "tc-1",
      name: "bash",
      status: "running",
    };
    expect(formatArgsPreview(toolCall)).toBeUndefined();
  });

  test("formatArgsPreview truncates long JSON args", () => {
    const toolCall: DisplayToolCall = {
      id: "tc-1",
      name: "write_file",
      status: "running",
      args: { path: "/very/long/path/to/some/file.ts", content: "a".repeat(200) },
    };
    const preview = formatArgsPreview(toolCall);
    expect(preview).toBeDefined();
    expect(preview!.length).toBeLessThanOrEqual(121); // 120 + ellipsis
  });

  test("formatResultPreview truncates long results", () => {
    const longResult = "x".repeat(500);
    const preview = formatResultPreview(longResult, 100);
    expect(preview.length).toBe(101); // 100 + ellipsis
    expect(preview.endsWith("…")).toBe(true);
  });

  test("formatResultPreview returns short results unchanged", () => {
    expect(formatResultPreview("short", 100)).toBe("short");
  });

  test("formatToolResultPreview works with hydrated tool call data", () => {
    const toolCall: DisplayToolCall = {
      id: "tc-1",
      name: "bash",
      status: "complete",
      args: { command: "echo hello" },
      result: '{"command":"echo hello","output":"hello"}',
    };
    const preview = formatToolResultPreview(toolCall);
    expect(preview).toBeDefined();
    expect(preview).toContain("hello");
  });
});
