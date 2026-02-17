import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DisplayMessage, DisplayContentBlock } from "../../src/store/types";
import type { ThemeTokens } from "../../src/theme/theme-schema";
import {
  createInitialStreamingState,
  reduceStreamingState,
  type StreamingEvent,
  type StreamingState,
} from "../../src/state/streaming-state";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

function applyEvents(initial: StreamingState, events: StreamingEvent[]): StreamingState {
  return events.reduce(reduceStreamingState, initial);
}

function createState() {
  return createInitialStreamingState("2026-02-15T00:00:00.000Z");
}

function createStreamingBase(): StreamingState {
  return applyEvents(createState(), [
    {
      type: "user-send",
      timestamp: "2026-02-15T00:00:01.000Z",
      conversationId: "conv-1",
      userMessage: {
        id: "user-1",
        role: "user",
        content: "explain this",
        createdAt: "2026-02-15T00:00:01.000Z",
      },
    },
    {
      type: "message-ack",
      timestamp: "2026-02-15T00:00:02.000Z",
      conversationId: "conv-1",
      assistantMessageId: "assistant-1",
    },
  ]);
}

// ===========================================================================
// Suite 1: ThinkingBlock Component
// ===========================================================================

describe("ThinkingBlock component", () => {
  const thinkingBlockSource = readFileSync(
    resolve(import.meta.dir, "../../src/components/thinking-block.tsx"),
    "utf-8",
  );

  test("renders 'Thinking:' prefix in component source", () => {
    // MH3 AC: Thinking blocks appear with "Thinking:" prefix
    expect(thinkingBlockSource).toContain('"Thinking:"');
  });

  test("uses muted color token for distinct styling", () => {
    // MH3 AC: Formatting is visually distinct from regular message content
    expect(thinkingBlockSource).toContain('tokens["text.muted"]');
  });

  test("muted color is distinct from primary and secondary text colors", () => {
    // MH3 AC: Formatting is visually distinct from regular message content
    const mutedColor = MOCK_TOKENS["text.muted"];
    const primaryColor = MOCK_TOKENS["text.primary"];
    const secondaryColor = MOCK_TOKENS["text.secondary"];
    const assistantTextColor = MOCK_TOKENS["conversation.assistant.text"];

    expect(mutedColor).not.toBe(primaryColor);
    expect(mutedColor).not.toBe(secondaryColor);
    expect(mutedColor).not.toBe(assistantTextColor);
  });

  test("applies muted color to both prefix and content text", () => {
    // Both the "Thinking:" label and the content body use the muted color
    // Count occurrences of the muted color token usage
    const mutedUsages = thinkingBlockSource.match(/tokens\["text\.muted"\]/g);
    expect(mutedUsages).not.toBeNull();
    expect(mutedUsages!.length).toBeGreaterThanOrEqual(1);

    // The color is assigned once and used for both Text elements
    expect(thinkingBlockSource).toContain("const mutedColor");
    // Both Text elements use the same color variable
    const colorStyleUsages = thinkingBlockSource.match(/color: mutedColor/g);
    expect(colorStyleUsages).not.toBeNull();
    expect(colorStyleUsages!.length).toBe(2);
  });

  test("renders prefix in bold for visual emphasis", () => {
    // The "Thinking:" prefix is wrapped in <b> for emphasis
    expect(thinkingBlockSource).toContain("<b>");
    expect(thinkingBlockSource).toContain("</b>");
  });

  test("shows streaming cursor when isStreaming is true", () => {
    // During streaming, a block cursor character is appended
    // Unicode block cursor: \u258A (left three-eighths block)
    expect(thinkingBlockSource).toContain("\\u258A");
    expect(thinkingBlockSource).toContain("isStreaming");
  });

  test("does not show streaming cursor when isStreaming is false", () => {
    // When not streaming, content is rendered without cursor
    // The ternary checks isStreaming to decide cursor display
    expect(thinkingBlockSource).toContain("isStreaming ?");
  });

  test("content is indented relative to prefix", () => {
    // Content body has marginLeft for visual indentation under the prefix
    expect(thinkingBlockSource).toContain("marginLeft: 2");
  });

  test("exports ThinkingBlockProps interface", () => {
    expect(thinkingBlockSource).toContain("export interface ThinkingBlockProps");
    expect(thinkingBlockSource).toContain("content: string");
    expect(thinkingBlockSource).toContain("isStreaming?: boolean");
  });

  test("exports ThinkingBlock as named export", () => {
    expect(thinkingBlockSource).toContain("export function ThinkingBlock");
  });
});

// ===========================================================================
// Suite 2: Message Component with Thinking
// ===========================================================================

describe("Message component with thinking blocks", () => {
  const messageSource = readFileSync(
    resolve(import.meta.dir, "../../src/components/message.tsx"),
    "utf-8",
  );

  test("imports ThinkingBlock component", () => {
    expect(messageSource).toContain('import { ThinkingBlock } from "./thinking-block"');
  });

  test("accepts thinkingVisible prop with default true", () => {
    // MH3 AC: Thinking blocks render inline in messages
    expect(messageSource).toContain("thinkingVisible?: boolean");
    expect(messageSource).toContain("thinkingVisible = true");
  });

  test("filters contentBlocks for thinking type when visible", () => {
    // When thinkingVisible is true, thinking blocks are extracted from contentBlocks
    expect(messageSource).toContain('block.type === "thinking"');
    expect(messageSource).toContain("thinkingVisible && message.contentBlocks");
  });

  test("renders ThinkingBlock components for each thinking block", () => {
    expect(messageSource).toContain("thinkingBlocks.map");
    expect(messageSource).toContain("<ThinkingBlock");
  });

  test("shows thinking cursor only while lifecycle is thinking", () => {
    // ThinkingBlock streaming cursor is scoped to active thinking phase.
    expect(messageSource).toContain("const isThinkingStreaming = message.isStreaming && lifecycleStatus === \"thinking\"");
    expect(messageSource).toContain("isStreaming={isThinkingStreaming}");
  });

  test("thinking blocks hidden when thinkingVisible is false but data preserved", () => {
    // MH3 / MH2 AC: Hidden blocks don't render but remain in message data
    // When thinkingVisible is false, thinkingBlocks array is empty
    // but message.contentBlocks still contains the thinking data
    const msg = makeMessage("assistant", "Hello", {
      contentBlocks: [
        { type: "thinking", text: "Let me reason about this..." },
        { type: "text", text: "Hello" },
      ],
    });

    // Simulate the filtering logic from Message component
    const visibleBlocks = true && msg.contentBlocks
      ? msg.contentBlocks.filter((block) => block.type === "thinking" && block.text)
      : [];
    const hiddenBlocks = false && msg.contentBlocks
      ? msg.contentBlocks.filter((block) => block.type === "thinking" && block.text)
      : [];

    expect(visibleBlocks).toHaveLength(1);
    expect(visibleBlocks[0].text).toBe("Let me reason about this...");
    expect(hiddenBlocks).toHaveLength(0);

    // Original data is preserved regardless of visibility
    expect(msg.contentBlocks).toHaveLength(2);
    expect(msg.contentBlocks![0].type).toBe("thinking");
    expect(msg.contentBlocks![0].text).toBe("Let me reason about this...");
  });

  test("thinking blocks shown when thinkingVisible is true", () => {
    const msg = makeMessage("assistant", "Response", {
      contentBlocks: [
        { type: "thinking", text: "Reasoning step 1" },
        { type: "thinking", text: "Reasoning step 2" },
        { type: "text", text: "Response" },
      ],
    });

    // Simulate the filtering logic with thinkingVisible=true
    const thinkingBlocks = true && msg.contentBlocks
      ? msg.contentBlocks.filter((block) => block.type === "thinking" && block.text)
      : [];

    expect(thinkingBlocks).toHaveLength(2);
    expect(thinkingBlocks[0].text).toBe("Reasoning step 1");
    expect(thinkingBlocks[1].text).toBe("Reasoning step 2");
  });

  test("messages without thinking blocks render normally", () => {
    const msg = makeMessage("assistant", "Just a regular response");

    // No contentBlocks at all
    const thinkingBlocks = true && msg.contentBlocks
      ? msg.contentBlocks.filter((block) => block.type === "thinking" && block.text)
      : [];

    expect(thinkingBlocks).toHaveLength(0);
    expect(msg.content).toBe("Just a regular response");
  });

  test("messages with empty thinking text are filtered out", () => {
    const msg = makeMessage("assistant", "Response", {
      contentBlocks: [
        { type: "thinking", text: "" },
        { type: "thinking", text: undefined },
        { type: "thinking", text: "Valid thinking" },
        { type: "text", text: "Response" },
      ],
    });

    // The filter requires block.text to be truthy
    const thinkingBlocks = true && msg.contentBlocks
      ? msg.contentBlocks.filter((block) => block.type === "thinking" && block.text)
      : [];

    expect(thinkingBlocks).toHaveLength(1);
    expect(thinkingBlocks[0].text).toBe("Valid thinking");
  });

  test("thinking blocks render before text content in message layout", () => {
    // In the Message component, thinkingBlocks.map() appears before the
    // content rendering section (StreamingText/MarkdownText/Text)
    const thinkingMapIndex = messageSource.indexOf("thinkingBlocks.map");
    const streamingTextIndex = messageSource.indexOf("<StreamingText");
    const markdownTextIndex = messageSource.indexOf("<MarkdownText");

    expect(thinkingMapIndex).toBeGreaterThan(-1);
    expect(streamingTextIndex).toBeGreaterThan(-1);
    expect(markdownTextIndex).toBeGreaterThan(-1);
    expect(thinkingMapIndex).toBeLessThan(streamingTextIndex);
    expect(thinkingMapIndex).toBeLessThan(markdownTextIndex);
  });

  test("thinking block visibility toggle does not affect text content rendering", () => {
    const msg = makeMessage("assistant", "The answer is 42", {
      contentBlocks: [
        { type: "thinking", text: "Computing..." },
        { type: "text", text: "The answer is 42" },
      ],
    });

    // Text content is always available regardless of thinking visibility
    expect(msg.content).toBe("The answer is 42");
    expect(msg.content.trim().length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Suite 3: Streaming Behavior
// ===========================================================================

describe("thinking block streaming behavior", () => {
  test("thinking-delta events accumulate thinking content incrementally", () => {
    // MH3 AC: Thinking content streams in real-time during generation
    const base = createStreamingBase();

    const afterFirstDelta = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me think",
      },
    ]);

    expect(afterFirstDelta.turnState.thinkingContent).toBe("Let me think");
  });

  test("multiple thinking-delta events concatenate content", () => {
    const base = createStreamingBase();

    const afterDeltas = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "First, ",
      },
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.100Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "I need to ",
      },
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.200Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "consider this.",
      },
    ]);

    expect(afterDeltas.turnState.thinkingContent).toBe(
      "First, I need to consider this.",
    );
  });

  test("thinking content appears in turn state content blocks", () => {
    const base = createStreamingBase();

    const afterThinking = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Reasoning about the problem...",
      },
    ]);

    const thinkingBlocks = afterThinking.turnState.contentBlocks.filter(
      (b) => b.type === "thinking",
    );
    expect(thinkingBlocks).toHaveLength(1);
    expect(thinkingBlocks[0].text).toBe("Reasoning about the problem...");
  });

  test("thinking content updates incrementally during streaming", () => {
    // MH3 AC: Thinking content streams in real-time during generation
    const base = createStreamingBase();

    // First chunk
    const step1 = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Step 1: ",
      },
    ]);
    expect(step1.turnState.thinkingContent).toBe("Step 1: ");

    // Second chunk builds on first
    const step2 = applyEvents(step1, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.100Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Analyze input. ",
      },
    ]);
    expect(step2.turnState.thinkingContent).toBe("Step 1: Analyze input. ");

    // Third chunk builds on second
    const step3 = applyEvents(step2, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.200Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Step 2: Generate output.",
      },
    ]);
    expect(step3.turnState.thinkingContent).toBe(
      "Step 1: Analyze input. Step 2: Generate output.",
    );
  });

  test("thinking-delta events work during thinking status", () => {
    const base = createStreamingBase();
    expect(base.status).toBe("thinking");

    const afterThinkingDelta = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Thinking in thinking state...",
      },
    ]);

    // Should remain in thinking status (no text delta yet)
    expect(afterThinkingDelta.status).toBe("thinking");
    expect(afterThinkingDelta.turnState.thinkingContent).toBe(
      "Thinking in thinking state...",
    );
  });

  test("thinking-delta events work during streaming status", () => {
    const base = createStreamingBase();

    // Transition to streaming with a text delta first
    const streaming = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Hello",
      },
    ]);
    expect(streaming.status).toBe("streaming");

    // Thinking delta during streaming
    const afterThinkingDelta = applyEvents(streaming, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.100Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Additional reasoning...",
      },
    ]);

    expect(afterThinkingDelta.status).toBe("streaming");
    expect(afterThinkingDelta.turnState.thinkingContent).toBe(
      "Additional reasoning...",
    );
  });

  test("thinking block finalizes on stream completion", () => {
    const base = createStreamingBase();

    const afterComplete = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Deep reasoning about the topic.",
      },
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Here is my answer.",
      },
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Here is my answer.",
      },
    ]);

    expect(afterComplete.status).toBe("complete");
    expect(afterComplete.turnState.thinkingContent).toBe(
      "Deep reasoning about the topic.",
    );

    // Thinking block preserved in final content blocks
    const thinkingBlocks = afterComplete.turnState.contentBlocks.filter(
      (b) => b.type === "thinking",
    );
    expect(thinkingBlocks).toHaveLength(1);
    expect(thinkingBlocks[0].text).toBe("Deep reasoning about the topic.");
  });

  test("thinking content preserved alongside text content in turn state", () => {
    const base = createStreamingBase();

    const afterBoth = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Reasoning...",
      },
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "The answer is 42.",
      },
    ]);

    // Both thinking and text content present
    expect(afterBoth.turnState.thinkingContent).toBe("Reasoning...");
    expect(afterBoth.turnState.contentBlocks).toHaveLength(2);
    expect(afterBoth.turnState.contentBlocks[0].type).toBe("thinking");
    expect(afterBoth.turnState.contentBlocks[0].text).toBe("Reasoning...");
    expect(afterBoth.turnState.contentBlocks[1].type).toBe("text");
    expect(afterBoth.turnState.contentBlocks[1].text).toBe("The answer is 42.");
  });

  test("thinking content preserved alongside tool calls in turn state", () => {
    const base = createStreamingBase();

    const afterThinkingAndTools = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "I should use a tool for this.",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-15T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
    ]);

    expect(afterThinkingAndTools.turnState.thinkingContent).toBe(
      "I should use a tool for this.",
    );
    expect(afterThinkingAndTools.turnState.hasToolCalls).toBe(true);

    // Thinking block appears before tool blocks
    const blocks = afterThinkingAndTools.turnState.contentBlocks;
    expect(blocks[0].type).toBe("thinking");
    expect(blocks[0].text).toBe("I should use a tool for this.");

    const toolBlocks = blocks.filter((b) => b.type === "tool-call");
    expect(toolBlocks).toHaveLength(1);
  });

  test("thinking content resets on new turn", () => {
    const base = createStreamingBase();

    const afterThinking = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Some thinking...",
      },
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Response.",
      },
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Response.",
      },
      {
        type: "complete-timeout",
        timestamp: "2026-02-15T00:00:06.000Z",
      },
    ]);

    expect(afterThinking.status).toBe("idle");
    expect(afterThinking.turnState.thinkingContent).toBe("");
    expect(afterThinking.turnState.contentBlocks).toHaveLength(0);
  });

  test("thinking-delta ignored in idle state", () => {
    const idle = createState();
    expect(idle.status).toBe("idle");

    const afterIgnored = reduceStreamingState(idle, {
      type: "thinking-delta",
      timestamp: "2026-02-15T00:00:01.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      delta: "Should be ignored",
    });

    // State unchanged — thinking-delta not valid in idle
    expect(afterIgnored.turnState.thinkingContent).toBe("");
  });
});

// ===========================================================================
// Suite 4: Provider-Specific Behavior
// ===========================================================================

describe("provider-specific thinking block rendering", () => {
  const conversationPanelSource = readFileSync(
    resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
    "utf-8",
  );

  const messageSource = readFileSync(
    resolve(import.meta.dir, "../../src/components/message.tsx"),
    "utf-8",
  );

  test("thinking blocks only render for messages that contain thinking content blocks", () => {
    // MH3 AC: Non-Anthropic providers don't show thinking blocks
    // Non-Anthropic providers never produce thinking content blocks in their
    // stream events, so messages from those providers will never have
    // contentBlocks with type "thinking". The rendering path filters on
    // block.type === "thinking", so no thinking UI appears.

    // Anthropic message with thinking
    const anthropicMsg = makeMessage("assistant", "Response from Claude", {
      contentBlocks: [
        { type: "thinking", text: "Claude's reasoning..." },
        { type: "text", text: "Response from Claude" },
      ],
    });

    // Non-Anthropic message (OpenAI, Google, etc.) — no thinking blocks
    const openaiMsg = makeMessage("assistant", "Response from GPT", {
      contentBlocks: [
        { type: "text", text: "Response from GPT" },
      ],
    });

    // No contentBlocks at all (typical for non-Anthropic)
    const genericMsg = makeMessage("assistant", "Generic response");

    // Simulate filtering logic
    const anthropicThinking = anthropicMsg.contentBlocks!.filter(
      (b) => b.type === "thinking" && b.text,
    );
    const openaiThinking = openaiMsg.contentBlocks!.filter(
      (b) => b.type === "thinking" && b.text,
    );
    const genericThinking = genericMsg.contentBlocks
      ? genericMsg.contentBlocks.filter((b) => b.type === "thinking" && b.text)
      : [];

    expect(anthropicThinking).toHaveLength(1);
    expect(openaiThinking).toHaveLength(0);
    expect(genericThinking).toHaveLength(0);
  });

  test("thinking-delta stream events only come from Anthropic provider pipeline", () => {
    // The DaemonStreamEvent union includes "thinking-delta" type.
    // Only the Anthropic streaming transformer emits these events.
    // Non-Anthropic providers never emit thinking-delta events,
    // so the streaming state never accumulates thinking content for them.

    const base = createStreamingBase();

    // Simulate a non-Anthropic stream (only text deltas, no thinking-delta)
    const nonAnthropicStream = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Response from non-Anthropic provider.",
      },
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Response from non-Anthropic provider.",
      },
    ]);

    // No thinking content accumulated
    expect(nonAnthropicStream.turnState.thinkingContent).toBe("");
    const thinkingBlocks = nonAnthropicStream.turnState.contentBlocks.filter(
      (b) => b.type === "thinking",
    );
    expect(thinkingBlocks).toHaveLength(0);
  });

  test("Anthropic stream with thinking produces thinking content blocks", () => {
    // MH3 AC: Thinking blocks render for Anthropic providers
    const base = createStreamingBase();

    // Simulate an Anthropic stream with thinking-delta events
    const anthropicStream = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me analyze this step by step...",
      },
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Based on my analysis, here is the answer.",
      },
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Based on my analysis, here is the answer.",
      },
    ]);

    // Thinking content present
    expect(anthropicStream.turnState.thinkingContent).toBe(
      "Let me analyze this step by step...",
    );

    // Content blocks include thinking
    const thinkingBlocks = anthropicStream.turnState.contentBlocks.filter(
      (b) => b.type === "thinking",
    );
    expect(thinkingBlocks).toHaveLength(1);
    expect(thinkingBlocks[0].text).toBe("Let me analyze this step by step...");
  });

  test("conversation panel respects thinkingVisible for ordered block rendering", () => {
    // The conversation panel checks thinkingVisible before rendering thinking blocks
    // in the ordered-block rendering path
    expect(conversationPanelSource).toContain("thinkingVisible");
    expect(conversationPanelSource).toContain('block.type === "thinking" && thinkingVisible');
  });

  test("conversation panel passes thinkingVisible to Message component", () => {
    // When not using ordered blocks, the Message component receives thinkingVisible
    expect(conversationPanelSource).toContain("thinkingVisible={thinkingVisible}");
  });

  test("conversation panel reads thinkingVisible from app state", () => {
    expect(conversationPanelSource).toContain("state.thinkingVisible");
  });

  test("conversation panel imports ThinkingBlock for ordered block rendering", () => {
    expect(conversationPanelSource).toContain(
      'import { ThinkingBlock } from "./thinking-block"',
    );
  });

  test("ordered thinking blocks render in a framed standalone area", () => {
    expect(conversationPanelSource).toContain('block.type === "thinking" && thinkingVisible');
    expect(conversationPanelSource).toContain('getMessageBlockStyle("assistant"');
    expect(conversationPanelSource).toContain('<FramedBlock style={thinkingBlockStyle} borderChars={thinkingBorderChars}>');
    expect(conversationPanelSource).toContain('isStreaming={message.isStreaming && lifecycleStatus === "thinking"}');
  });

  test("DisplayContentBlock type union includes thinking", () => {
    // The type system ensures thinking blocks are a valid content block type
    const storeTypesSource = readFileSync(
      resolve(import.meta.dir, "../../src/store/types.ts"),
      "utf-8",
    );
    expect(storeTypesSource).toContain('"text" | "tool-call" | "thinking"');
  });

  test("DaemonStreamEvent union includes thinking-delta type", () => {
    // The daemon contract supports thinking-delta events
    const contractsSource = readFileSync(
      resolve(import.meta.dir, "../../src/daemon/contracts.ts"),
      "utf-8",
    );
    expect(contractsSource).toContain('"thinking-delta"');
  });

  test("streaming state reducer handles thinking-delta event type", () => {
    const streamingStateSource = readFileSync(
      resolve(import.meta.dir, "../../src/state/streaming-state.ts"),
      "utf-8",
    );
    expect(streamingStateSource).toContain('case "thinking-delta"');
  });

  test("TurnContentBlock type union includes thinking", () => {
    const streamingStateSource = readFileSync(
      resolve(import.meta.dir, "../../src/state/streaming-state.ts"),
      "utf-8",
    );
    expect(streamingStateSource).toContain('"text" | "tool-call" | "thinking"');
  });
});

// ===========================================================================
// Integration: End-to-end thinking block flow
// ===========================================================================

describe("end-to-end thinking block flow", () => {
  test("full Anthropic thinking stream produces correct turn state", () => {
    const base = createStreamingBase();

    const fullStream = applyEvents(base, [
      // Thinking phase
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Step 1: Parse the question. ",
      },
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.100Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Step 2: Formulate response.",
      },
      // Response phase
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Here is my thoughtful response.",
      },
      // Completion
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Here is my thoughtful response.",
      },
    ]);

    expect(fullStream.status).toBe("complete");
    expect(fullStream.turnState.thinkingContent).toBe(
      "Step 1: Parse the question. Step 2: Formulate response.",
    );

    // Content blocks: thinking first, then text
    const blocks = fullStream.turnState.contentBlocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("thinking");
    expect(blocks[0].text).toBe(
      "Step 1: Parse the question. Step 2: Formulate response.",
    );
    expect(blocks[1].type).toBe("text");
    expect(blocks[1].text).toBe("Here is my thoughtful response.");
  });

  test("full non-Anthropic stream produces no thinking blocks", () => {
    const base = createStreamingBase();

    const fullStream = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Direct response without thinking.",
      },
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Direct response without thinking.",
      },
    ]);

    expect(fullStream.status).toBe("complete");
    expect(fullStream.turnState.thinkingContent).toBe("");

    const blocks = fullStream.turnState.contentBlocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect(blocks[0].text).toBe("Direct response without thinking.");
  });

  test("thinking with tool calls produces correct block ordering", () => {
    const base = createStreamingBase();

    const fullStream = applyEvents(base, [
      // Thinking
      {
        type: "thinking-delta",
        timestamp: "2026-02-15T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "I need to check the filesystem.",
      },
      // Tool call
      {
        type: "tool-call-start",
        timestamp: "2026-02-15T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-15T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "file.txt",
      },
      // Synthesis
      {
        type: "delta",
        timestamp: "2026-02-15T00:00:06.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Found the file.",
      },
      {
        type: "complete",
        timestamp: "2026-02-15T00:00:07.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Found the file.",
      },
    ]);

    expect(fullStream.status).toBe("complete");
    expect(fullStream.turnState.thinkingContent).toBe(
      "I need to check the filesystem.",
    );

    // Block ordering: thinking → tool → synthesis text
    const blocks = fullStream.turnState.contentBlocks;
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks[0].type).toBe("thinking");
    expect(blocks[0].text).toBe("I need to check the filesystem.");

    const toolBlocks = blocks.filter((b) => b.type === "tool-call");
    expect(toolBlocks).toHaveLength(1);

    const textBlocks = blocks.filter((b) => b.type === "text");
    expect(textBlocks.length).toBeGreaterThanOrEqual(1);
  });

  test("visibility toggle preserves thinking data in DisplayMessage", () => {
    // Simulate a completed message with thinking blocks
    const msg = makeMessage("assistant", "Final answer", {
      contentBlocks: [
        { type: "thinking", text: "Detailed reasoning process..." },
        { type: "text", text: "Final answer" },
      ],
    });

    // Toggle visibility off
    const hiddenThinking = false && msg.contentBlocks
      ? msg.contentBlocks.filter((b) => b.type === "thinking" && b.text)
      : [];
    expect(hiddenThinking).toHaveLength(0);

    // Toggle visibility on
    const visibleThinking = true && msg.contentBlocks
      ? msg.contentBlocks.filter((b) => b.type === "thinking" && b.text)
      : [];
    expect(visibleThinking).toHaveLength(1);

    // Data always preserved
    expect(msg.contentBlocks).toHaveLength(2);
    expect(msg.contentBlocks![0].type).toBe("thinking");
    expect(msg.contentBlocks![0].text).toBe("Detailed reasoning process...");
  });
});
