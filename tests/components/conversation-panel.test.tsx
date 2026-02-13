import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DisplayMessage, DisplayToolCall } from "../../src/store";
import {
  isExchangeBoundary,
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
  getToolGlyph,
  getToolGlyphColor,
  getMessageBlockStyle,
} from "../../src/components/message";
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

function makeToolCall(
  status: DisplayToolCall["status"],
  overrides?: Partial<DisplayToolCall>,
): DisplayToolCall {
  return {
    id: crypto.randomUUID(),
    name: "test_tool",
    status,
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
};

describe("glyph vocabulary", () => {
  test("reins glyph is filled diamond", () => {
    expect(GLYPH_REINS).toBe("◆");
  });

  test("user glyph is empty diamond", () => {
    expect(GLYPH_USER).toBe("◇");
  });

  test("tool running glyph is bullseye", () => {
    expect(GLYPH_TOOL_RUNNING).toBe("◎");
  });

  test("tool done glyph is four-pointed star", () => {
    expect(GLYPH_TOOL_DONE).toBe("✦");
  });

  test("tool error glyph is open four-pointed star", () => {
    expect(GLYPH_TOOL_ERROR).toBe("✧");
  });

  test("all glyphs are distinct single characters", () => {
    const glyphs = [GLYPH_REINS, GLYPH_USER, GLYPH_TOOL_RUNNING, GLYPH_TOOL_DONE, GLYPH_TOOL_ERROR];
    const unique = new Set(glyphs);
    expect(unique.size).toBe(glyphs.length);
    for (const g of glyphs) {
      expect([...g]).toHaveLength(1);
    }
  });
});

describe("role glyph mapping", () => {
  test("assistant role maps to reins glyph", () => {
    expect(getRoleGlyph("assistant")).toBe(GLYPH_REINS);
  });

  test("user role maps to user glyph", () => {
    expect(getRoleGlyph("user")).toBe(GLYPH_USER);
  });

  test("system role maps to reins glyph", () => {
    expect(getRoleGlyph("system")).toBe(GLYPH_REINS);
  });

  test("tool role maps to tool done glyph", () => {
    expect(getRoleGlyph("tool")).toBe(GLYPH_TOOL_DONE);
  });
});

describe("role color mapping", () => {
  test("assistant uses glyph.reins token", () => {
    expect(getRoleColor("assistant", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.reins"]);
  });

  test("user uses glyph.user token", () => {
    expect(getRoleColor("user", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.user"]);
  });

  test("system uses text.muted token", () => {
    expect(getRoleColor("system", MOCK_TOKENS)).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("tool uses glyph.tool.running token", () => {
    expect(getRoleColor("tool", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });
});

describe("tool glyph mapping", () => {
  test("pending status maps to running glyph", () => {
    expect(getToolGlyph("pending")).toBe(GLYPH_TOOL_RUNNING);
  });

  test("running status maps to running glyph", () => {
    expect(getToolGlyph("running")).toBe(GLYPH_TOOL_RUNNING);
  });

  test("complete status maps to done glyph", () => {
    expect(getToolGlyph("complete")).toBe(GLYPH_TOOL_DONE);
  });

  test("error status maps to error glyph", () => {
    expect(getToolGlyph("error")).toBe(GLYPH_TOOL_ERROR);
  });
});

describe("tool glyph color mapping", () => {
  test("pending uses glyph.tool.running token", () => {
    expect(getToolGlyphColor("pending", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("running uses glyph.tool.running token", () => {
    expect(getToolGlyphColor("running", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("complete uses glyph.tool.done token", () => {
    expect(getToolGlyphColor("complete", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.done"]);
  });

  test("error uses glyph.tool.error token", () => {
    expect(getToolGlyphColor("error", MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });
});

describe("exchange boundary detection", () => {
  test("no boundary before first message", () => {
    const messages = [makeMessage("user", "Hello")];
    expect(isExchangeBoundary(messages, 0)).toBe(false);
  });

  test("boundary before user message following assistant", () => {
    const messages = [
      makeMessage("assistant", "Hi there"),
      makeMessage("user", "Thanks"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("boundary before user message following tool", () => {
    const messages = [
      makeMessage("tool", "result data"),
      makeMessage("user", "Got it"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("no boundary between consecutive user messages", () => {
    const messages = [
      makeMessage("user", "First"),
      makeMessage("user", "Second"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("no boundary between consecutive assistant messages", () => {
    const messages = [
      makeMessage("assistant", "Part 1"),
      makeMessage("assistant", "Part 2"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("no boundary before assistant message following user", () => {
    const messages = [
      makeMessage("user", "Question"),
      makeMessage("assistant", "Answer"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("no boundary before system message", () => {
    const messages = [
      makeMessage("assistant", "Done"),
      makeMessage("system", "Session started"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("multi-turn conversation has correct boundary placement", () => {
    const messages = [
      makeMessage("user", "Hello"),
      makeMessage("assistant", "Hi!"),
      makeMessage("user", "How are you?"),
      makeMessage("assistant", "Great, thanks!"),
      makeMessage("user", "Bye"),
    ];

    expect(isExchangeBoundary(messages, 0)).toBe(false);
    expect(isExchangeBoundary(messages, 1)).toBe(false);
    expect(isExchangeBoundary(messages, 2)).toBe(true);
    expect(isExchangeBoundary(messages, 3)).toBe(false);
    expect(isExchangeBoundary(messages, 4)).toBe(true);
  });
});

describe("message spacing rhythm", () => {
  test("MESSAGE_GAP provides consistent intra-exchange spacing", () => {
    expect(MESSAGE_GAP).toBeGreaterThan(0);
  });

  test("EXCHANGE_GAP is larger than MESSAGE_GAP for visual separation", () => {
    expect(EXCHANGE_GAP).toBeGreaterThan(MESSAGE_GAP);
  });

  test("spacing values are whole numbers for terminal line alignment", () => {
    expect(Number.isInteger(MESSAGE_GAP)).toBe(true);
    expect(Number.isInteger(EXCHANGE_GAP)).toBe(true);
  });
});

describe("prose alignment semantics", () => {
  test("assistant messages use reins glyph for left-aligned marker", () => {
    const glyph = getRoleGlyph("assistant");
    expect(glyph).toBe(GLYPH_REINS);
  });

  test("user messages use user glyph for right-aligned marker", () => {
    const glyph = getRoleGlyph("user");
    expect(glyph).toBe(GLYPH_USER);
  });

  test("asymmetric alignment: user and assistant have different glyphs", () => {
    expect(getRoleGlyph("user")).not.toBe(getRoleGlyph("assistant"));
  });

  test("asymmetric alignment: user and assistant have different colors", () => {
    const userColor = getRoleColor("user", MOCK_TOKENS);
    const assistantColor = getRoleColor("assistant", MOCK_TOKENS);
    expect(userColor).not.toBe(assistantColor);
  });
});

describe("tool call anchors", () => {
  test("running tool call produces running glyph and color", () => {
    const tc = makeToolCall("running");
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyphColor(tc.status, MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("complete tool call produces done glyph and color", () => {
    const tc = makeToolCall("complete");
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyphColor(tc.status, MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.done"]);
  });

  test("error tool call produces error glyph and color", () => {
    const tc = makeToolCall("error", { isError: true });
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_ERROR);
    expect(getToolGlyphColor(tc.status, MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });

  test("pending tool call uses running glyph as placeholder", () => {
    const tc = makeToolCall("pending");
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_RUNNING);
  });

  test("all tool statuses map to valid glyphs", () => {
    const statuses: DisplayToolCall["status"][] = ["pending", "running", "complete", "error"];
    for (const status of statuses) {
      const glyph = getToolGlyph(status);
      expect(glyph.length).toBeGreaterThan(0);
    }
  });

  test("all tool statuses map to valid hex colors", () => {
    const statuses: DisplayToolCall["status"][] = ["pending", "running", "complete", "error"];
    for (const status of statuses) {
      const color = getToolGlyphColor(status, MOCK_TOKENS);
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("conversation with tool calls", () => {
  test("assistant message with tool calls uses correct glyph hierarchy", () => {
    const toolCalls: DisplayToolCall[] = [
      makeToolCall("running", { name: "search" }),
      makeToolCall("complete", { name: "fetch" }),
      makeToolCall("error", { name: "parse", isError: true }),
    ];

    const message = makeMessage("assistant", "Let me check...", { toolCalls });

    expect(getRoleGlyph(message.role)).toBe(GLYPH_REINS);
    expect(getToolGlyph(toolCalls[0].status)).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph(toolCalls[1].status)).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyph(toolCalls[2].status)).toBe(GLYPH_TOOL_ERROR);
  });

  test("exchange boundary detected before user reply after tool-bearing assistant message", () => {
    const messages = [
      makeMessage("assistant", "Checking...", {
        toolCalls: [makeToolCall("complete", { name: "search" })],
      }),
      makeMessage("user", "What did you find?"),
    ];

    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });
});

describe("tool lifecycle rendering in conversation", () => {
  test("tool start block has running glyph and tool name", () => {
    const tc = makeToolCall("running", { name: "bash" });
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyphColor(tc.status, MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.running"]);
  });

  test("tool start block with args carries args on DisplayToolCall", () => {
    const tc = makeToolCall("running", {
      name: "bash",
      args: { command: "git status" },
    });
    expect(tc.args).toEqual({ command: "git status" });
  });

  test("running tool shows running glyph color distinct from done", () => {
    const runningColor = getToolGlyphColor("running", MOCK_TOKENS);
    const doneColor = getToolGlyphColor("complete", MOCK_TOKENS);
    expect(runningColor).not.toBe(doneColor);
  });

  test("tool result block has done glyph", () => {
    const tc = makeToolCall("complete", { name: "read", result: "file contents" });
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyphColor(tc.status, MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.done"]);
  });

  test("tool error block has error glyph", () => {
    const tc = makeToolCall("error", { name: "write", isError: true, result: "Permission denied" });
    expect(getToolGlyph(tc.status)).toBe(GLYPH_TOOL_ERROR);
    expect(getToolGlyphColor(tc.status, MOCK_TOKENS)).toBe(MOCK_TOKENS["glyph.tool.error"]);
  });

  test("tool blocks are visually distinct from assistant text glyphs", () => {
    const assistantGlyph = getRoleGlyph("assistant");
    const toolRunningGlyph = getToolGlyph("running");
    const toolDoneGlyph = getToolGlyph("complete");
    const toolErrorGlyph = getToolGlyph("error");

    expect(assistantGlyph).not.toBe(toolRunningGlyph);
    expect(assistantGlyph).not.toBe(toolDoneGlyph);
    expect(assistantGlyph).not.toBe(toolErrorGlyph);
  });

  test("tool blocks use different color tokens from assistant text", () => {
    const assistantColor = getRoleColor("assistant", MOCK_TOKENS);
    const toolRunningColor = getToolGlyphColor("running", MOCK_TOKENS);
    expect(assistantColor).not.toBe(toolRunningColor);
  });

  test("multi-tool message preserves all tool call states independently", () => {
    const toolCalls: DisplayToolCall[] = [
      makeToolCall("complete", { name: "read" }),
      makeToolCall("running", { name: "grep" }),
      makeToolCall("pending", { name: "bash" }),
    ];

    expect(getToolGlyph(toolCalls[0].status)).toBe(GLYPH_TOOL_DONE);
    expect(getToolGlyph(toolCalls[1].status)).toBe(GLYPH_TOOL_RUNNING);
    expect(getToolGlyph(toolCalls[2].status)).toBe(GLYPH_TOOL_RUNNING);
  });

  test("DisplayToolCall args field is optional and backward compatible", () => {
    const withArgs = makeToolCall("running", {
      name: "bash",
      args: { command: "ls" },
    });
    const withoutArgs = makeToolCall("running", { name: "bash" });

    expect(withArgs.args).toBeDefined();
    expect(withoutArgs.args).toBeUndefined();
  });
});

const mockGetRoleBorder = (role: MessageRole): string => {
  const borders: Record<MessageRole, string> = {
    user: "#f0c674",
    assistant: "#e8976c",
    system: "#6b6360",
    tool: "#6ca8e8",
  };
  return borders[role];
};

describe("streaming placeholder block styling", () => {
  test("streaming placeholder uses assistant accent color", () => {
    const style = getStreamingPlaceholderStyle(MOCK_TOKENS, mockGetRoleBorder);
    expect(style.accentColor).toBe(mockGetRoleBorder("assistant"));
  });

  test("streaming placeholder uses assistant background", () => {
    const style = getStreamingPlaceholderStyle(MOCK_TOKENS, mockGetRoleBorder);
    expect(style.backgroundColor).toBe(MOCK_TOKENS["conversation.assistant.bg"]);
  });

  test("streaming placeholder matches assistant message block padding", () => {
    const placeholderStyle = getStreamingPlaceholderStyle(MOCK_TOKENS, mockGetRoleBorder);
    const assistantStyle = getMessageBlockStyle("assistant", MOCK_TOKENS, mockGetRoleBorder);
    expect(placeholderStyle.paddingLeft).toBe(assistantStyle.paddingLeft);
    expect(placeholderStyle.paddingRight).toBe(assistantStyle.paddingRight);
  });

  test("streaming placeholder style has consistent spacing with message blocks", () => {
    const style = getStreamingPlaceholderStyle(MOCK_TOKENS, mockGetRoleBorder);
    expect(style.paddingLeft).toBe(2);
    expect(style.paddingRight).toBe(1);
    expect(style.marginTop).toBe(0);
    expect(style.marginBottom).toBe(0);
  });
});

describe("tool calls render inside framed message blocks", () => {
  test("message.tsx renders ToolCallAnchor inside FramedBlock", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/message.tsx"),
      "utf-8",
    );
    // ToolCallAnchor is rendered inside FramedBlock (before closing tag)
    const framedBlockClose = source.indexOf("</FramedBlock>");
    const toolCallAnchorPos = source.indexOf("ToolCallAnchor");
    expect(toolCallAnchorPos).toBeGreaterThan(-1);
    expect(framedBlockClose).toBeGreaterThan(toolCallAnchorPos);
  });

  test("conversation-panel.tsx does not render tool calls outside Message component", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    // No InlineToolCalls or ToolInline rendered directly in conversation panel
    expect(source).not.toContain("InlineToolCalls");
    expect(source).not.toContain("<ToolInline");
  });

  test("conversation-panel.tsx wraps streaming placeholder in FramedBlock", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );
    expect(source).toContain("FramedBlock");
    expect(source).toContain("ACCENT_BORDER_CHARS");
    expect(source).toContain("getStreamingPlaceholderStyle");
  });
});

describe("multi-turn message ordering with tools", () => {
  test("exchange boundary detected after tool-bearing assistant before next user message", () => {
    const messages = [
      makeMessage("assistant", "Let me check...", {
        toolCalls: [
          makeToolCall("complete", { name: "bash" }),
          makeToolCall("complete", { name: "read" }),
        ],
      }),
      makeMessage("user", "What did you find?"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(true);
  });

  test("no exchange boundary between assistant messages with and without tools", () => {
    const messages = [
      makeMessage("assistant", "Running tools...", {
        toolCalls: [makeToolCall("complete", { name: "bash" })],
      }),
      makeMessage("assistant", "Here are the results"),
    ];
    expect(isExchangeBoundary(messages, 1)).toBe(false);
  });

  test("streaming message with tools preserves ordering in multi-turn", () => {
    const messages = [
      makeMessage("user", "Run some tools"),
      makeMessage("assistant", "On it...", {
        isStreaming: true,
        toolCalls: [
          makeToolCall("running", { name: "bash" }),
          makeToolCall("pending", { name: "read" }),
        ],
      }),
    ];
    // No exchange boundary between user and streaming assistant
    expect(isExchangeBoundary(messages, 1)).toBe(false);
    // Streaming message preserves tool calls
    expect(messages[1].toolCalls).toHaveLength(2);
    expect(messages[1].isStreaming).toBe(true);
  });

  test("completed tool-bearing turn followed by new user turn has correct boundary", () => {
    const messages = [
      makeMessage("user", "First question"),
      makeMessage("assistant", "Let me check", {
        toolCalls: [makeToolCall("complete", { name: "grep" })],
      }),
      makeMessage("user", "Second question"),
      makeMessage("assistant", "Sure thing"),
    ];
    expect(isExchangeBoundary(messages, 0)).toBe(false);
    expect(isExchangeBoundary(messages, 1)).toBe(false);
    expect(isExchangeBoundary(messages, 2)).toBe(true);
    expect(isExchangeBoundary(messages, 3)).toBe(false);
  });
});
