import { describe, expect, test } from "bun:test";

import type { DaemonClient } from "../../src/daemon/client";
import { err, ok, type DaemonClientError, type DaemonConnectionState, type DaemonHealth, type DaemonResult, type DaemonStreamEvent } from "../../src/daemon/contracts";
import { createConversationStore } from "../../src/state/conversation-store";
import {
  createInitialStreamingState,
  reduceStreamingState,
  type StreamingEvent,
  type StreamingState,
} from "../../src/state/streaming-state";
import { appReducer, type AppAction } from "../../src/store";
import { DEFAULT_STATE, type AppState, type DisplayToolCall } from "../../src/store/types";
import {
  toolCallsToVisualStates,
  shouldAutoExpand,
  shouldRenderToolBlocks,
} from "../../src/components/conversation-panel";

function createError(overrides: Partial<DaemonClientError> = {}): DaemonClientError {
  return {
    code: "DAEMON_INTERNAL_ERROR",
    message: "stream failed",
    retryable: true,
    ...overrides,
  };
}

function createState() {
  return createInitialStreamingState("2026-02-11T00:00:00.000Z");
}

function createAsyncIterable(events: DaemonStreamEvent[]): AsyncIterable<DaemonStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

class FakeDaemonClient implements DaemonClient {
  public readonly connectionState: DaemonConnectionState = {
    status: "connected",
    retries: 0,
  };

  constructor(
    private readonly sendMessageResult: DaemonResult<{ conversationId: string; userMessageId: string; assistantMessageId: string }>,
    private readonly streamResult: DaemonResult<AsyncIterable<DaemonStreamEvent>>,
    private readonly cancelStreamResult: DaemonResult<void> = ok(undefined),
    private readonly onCancelStream?: () => void,
  ) {}

  public async connect(): Promise<DaemonResult<void>> {
    return ok(undefined);
  }

  public async reconnect(): Promise<DaemonResult<void>> {
    return ok(undefined);
  }

  public async disconnect(): Promise<DaemonResult<void>> {
    return ok(undefined);
  }

  public getConnectionState(): DaemonConnectionState {
    return this.connectionState;
  }

  public onConnectionStateChange(): () => void {
    return () => {};
  }

  public async healthCheck(): Promise<DaemonResult<DaemonHealth>> {
    return ok({
      healthy: true,
      timestamp: "2026-02-11T00:00:00.000Z",
      handshake: {
        daemonVersion: "1.0.0",
        contractVersion: "1.0.0",
        capabilities: [],
      },
    });
  }

  public async sendMessage(): Promise<DaemonResult<{ conversationId: string; userMessageId: string; assistantMessageId: string }>> {
    return this.sendMessageResult;
  }

  public async streamResponse(): Promise<DaemonResult<AsyncIterable<DaemonStreamEvent>>> {
    return this.streamResult;
  }

  public async cancelStream(): Promise<DaemonResult<void>> {
    this.onCancelStream?.();
    return this.cancelStreamResult;
  }

  public async listConversations(): Promise<DaemonResult<[]>> {
    return ok([]);
  }

  public async getConversation(): Promise<DaemonResult<never>> {
    return err(createError({ code: "DAEMON_NOT_FOUND", retryable: false }));
  }

  public async createConversation(): Promise<DaemonResult<never>> {
    return err(createError({ code: "DAEMON_NOT_FOUND", retryable: false }));
  }

  public async updateConversation(): Promise<DaemonResult<never>> {
    return err(createError({ code: "DAEMON_NOT_FOUND", retryable: false }));
  }

  public async deleteConversation(): Promise<DaemonResult<void>> {
    return ok(undefined);
  }
}

describe("streaming lifecycle reducer", () => {
  test("applies full lifecycle idle -> sending -> thinking -> streaming -> complete -> idle", () => {
    const userMessage = {
      id: "user-1",
      role: "user" as const,
      content: "hi",
      createdAt: "2026-02-11T00:00:01.000Z",
    };

    const sending = reduceStreamingState(createState(), {
      type: "user-send",
      timestamp: "2026-02-11T00:00:01.000Z",
      conversationId: "conv-1",
      userMessage,
    });
    expect(sending.status).toBe("sending");

    const thinking = reduceStreamingState(sending, {
      type: "message-ack",
      timestamp: "2026-02-11T00:00:02.000Z",
      conversationId: "conv-1",
      assistantMessageId: "assistant-1",
    });
    expect(thinking.status).toBe("thinking");

    const streaming = reduceStreamingState(thinking, {
      type: "delta",
      timestamp: "2026-02-11T00:00:03.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      delta: "Hello",
    });
    expect(streaming.status).toBe("streaming");

    const complete = reduceStreamingState(streaming, {
      type: "complete",
      timestamp: "2026-02-11T00:00:04.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      content: "Hello there",
    });
    expect(complete.status).toBe("complete");

    const idle = reduceStreamingState(complete, {
      type: "complete-timeout",
      timestamp: "2026-02-11T00:00:05.000Z",
    });
    expect(idle.status).toBe("idle");
  });

  test("cancelled-complete marks turn as cancelled", () => {
    const userMessage = {
      id: "user-1",
      role: "user" as const,
      content: "hi",
      createdAt: "2026-02-11T00:00:01.000Z",
    };

    const sending = reduceStreamingState(createState(), {
      type: "user-send",
      timestamp: "2026-02-11T00:00:01.000Z",
      conversationId: "conv-1",
      userMessage,
    });

    const thinking = reduceStreamingState(sending, {
      type: "message-ack",
      timestamp: "2026-02-11T00:00:02.000Z",
      conversationId: "conv-1",
      assistantMessageId: "assistant-1",
    });

    const streaming = reduceStreamingState(thinking, {
      type: "start",
      timestamp: "2026-02-11T00:00:03.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
    });

    const withContent = reduceStreamingState(streaming, {
      type: "delta",
      timestamp: "2026-02-11T00:00:04.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      delta: "Partial response",
    });

    const cancelled = reduceStreamingState(withContent, {
      type: "cancelled-complete",
      timestamp: "2026-02-11T00:00:05.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      content: "Partial response",
    });

    expect(cancelled.status).toBe("complete");
    if (cancelled.status === "complete") {
      expect(cancelled.turnState.wasCancelled).toBe(true);
      expect(cancelled.content).toBe("Partial response");
    }
  });

  test("rejects invalid transition from idle on stream-complete", () => {
    const initial = createState();
    const next = reduceStreamingState(initial, {
      type: "complete",
      timestamp: "2026-02-11T00:00:01.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      content: "unexpected",
    });

    expect(next).toBe(initial);
  });

  test("accumulates stream chunks deterministically", () => {
    const thinking = reduceStreamingState(
      reduceStreamingState(createState(), {
        type: "user-send",
        timestamp: "2026-02-11T00:00:01.000Z",
        conversationId: "conv-1",
        userMessage: {
          id: "user-1",
          role: "user",
          content: "hello",
          createdAt: "2026-02-11T00:00:01.000Z",
        },
      }),
      {
        type: "message-ack",
        timestamp: "2026-02-11T00:00:02.000Z",
        conversationId: "conv-1",
        assistantMessageId: "assistant-1",
      },
    );

    const afterChunk1 = reduceStreamingState(thinking, {
      type: "delta",
      timestamp: "2026-02-11T00:00:03.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      delta: "Hello",
    });

    const afterChunk2 = reduceStreamingState(afterChunk1, {
      type: "delta",
      timestamp: "2026-02-11T00:00:04.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      delta: " world",
    });

    expect(afterChunk2.status).toBe("streaming");
    if (afterChunk2.status === "streaming") {
      expect(afterChunk2.partialContent).toBe("Hello world");
    }
  });

  test("preserves partial content on error and recovers to idle", () => {
    const streaming = reduceStreamingState(
      reduceStreamingState(
        reduceStreamingState(createState(), {
          type: "user-send",
          timestamp: "2026-02-11T00:00:01.000Z",
          conversationId: "conv-1",
          userMessage: {
            id: "user-1",
            role: "user",
            content: "hello",
            createdAt: "2026-02-11T00:00:01.000Z",
          },
        }),
        {
          type: "message-ack",
          timestamp: "2026-02-11T00:00:02.000Z",
          conversationId: "conv-1",
          assistantMessageId: "assistant-1",
        },
      ),
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "partial",
      },
    );

    const errored = reduceStreamingState(streaming, {
      type: "error",
      timestamp: "2026-02-11T00:00:04.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      error: createError({ message: "network lost" }),
    });

    expect(errored.status).toBe("error");
    if (errored.status === "error") {
      expect(errored.partialContent).toBe("partial");
      expect(errored.error.message).toBe("network lost");
    }

    const recovered = reduceStreamingState(errored, {
      type: "dismiss-error",
      timestamp: "2026-02-11T00:00:05.000Z",
    });
    expect(recovered.status).toBe("idle");
  });

  test("tracks tool-call events during streaming", () => {
    const thinking = reduceStreamingState(
      reduceStreamingState(createState(), {
        type: "user-send",
        timestamp: "2026-02-11T00:00:01.000Z",
        conversationId: "conv-1",
        userMessage: {
          id: "user-1",
          role: "user",
          content: "use tool",
          createdAt: "2026-02-11T00:00:01.000Z",
        },
      }),
      {
        type: "message-ack",
        timestamp: "2026-02-11T00:00:02.000Z",
        conversationId: "conv-1",
        assistantMessageId: "assistant-1",
      },
    );

    const started = reduceStreamingState(thinking, {
      type: "tool-call-start",
      timestamp: "2026-02-11T00:00:03.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      toolCallId: "tool-1",
      name: "calendar.lookup",
    });

    expect(started.status).toBe("streaming");
    if (started.status === "streaming") {
      expect(started.toolCalls).toHaveLength(1);
      expect(started.toolCalls[0]?.status).toBe("running");
    }

    const completed = reduceStreamingState(started, {
      type: "tool-call-complete",
      timestamp: "2026-02-11T00:00:04.000Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      toolCallId: "tool-1",
      result: "done",
    });

    if (completed.status === "streaming") {
      expect(completed.toolCalls[0]?.status).toBe("complete");
      expect(completed.toolCalls[0]?.result).toBe("done");
    }
  });
});

function applyEvents(initial: StreamingState, events: StreamingEvent[]): StreamingState {
  return events.reduce(reduceStreamingState, initial);
}

function createStreamingBase(): StreamingState {
  return applyEvents(createState(), [
    {
      type: "user-send",
      timestamp: "2026-02-11T00:00:01.000Z",
      conversationId: "conv-1",
      userMessage: {
        id: "user-1",
        role: "user",
        content: "run tools",
        createdAt: "2026-02-11T00:00:01.000Z",
      },
    },
    {
      type: "message-ack",
      timestamp: "2026-02-11T00:00:02.000Z",
      conversationId: "conv-1",
      assistantMessageId: "assistant-1",
    },
  ]);
}

describe("multi-tool sequence rendering", () => {
  test("tracks 3 tool calls with correct sequence indices", () => {
    const base = createStreamingBase();

    const afterTools = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        name: "grep",
      },
    ]);

    expect(afterTools.toolCalls).toHaveLength(3);
    expect(afterTools.toolCalls[0].sequenceIndex).toBe(0);
    expect(afterTools.toolCalls[1].sequenceIndex).toBe(1);
    expect(afterTools.toolCalls[2].sequenceIndex).toBe(2);
    expect(afterTools.toolCalls[0].name).toBe("bash");
    expect(afterTools.toolCalls[1].name).toBe("read");
    expect(afterTools.toolCalls[2].name).toBe("grep");
  });

  test("preserves sequence order when tools complete out of order", () => {
    const base = createStreamingBase();

    const afterTools = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        name: "grep",
      },
      // Complete out of order: tool-3 first, then tool-1, then tool-2
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        result: "grep result",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "bash result",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        result: "read result",
      },
    ]);

    // Sequence indices should be preserved from start order, not completion order
    const sorted = [...afterTools.toolCalls].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    expect(sorted[0].name).toBe("bash");
    expect(sorted[0].sequenceIndex).toBe(0);
    expect(sorted[1].name).toBe("read");
    expect(sorted[1].sequenceIndex).toBe(1);
    expect(sorted[2].name).toBe("grep");
    expect(sorted[2].sequenceIndex).toBe(2);
  });

  test("builds turn content blocks with tool calls and synthesis text", () => {
    const base = createStreamingBase();

    const afterToolsAndSynthesis = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        result: "ok",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "I found 12 dependencies",
      },
    ]);

    expect(afterToolsAndSynthesis.turnState.hasToolCalls).toBe(true);

    const blocks = afterToolsAndSynthesis.turnState.contentBlocks;
    expect(blocks).toHaveLength(3); // 2 tool-call blocks + 1 text block after tools
    expect(blocks[0].type).toBe("tool-call");
    expect(blocks[0].toolCallId).toBe("tool-1");
    expect(blocks[1].type).toBe("tool-call");
    expect(blocks[1].toolCallId).toBe("tool-2");
    expect(blocks[2].type).toBe("text");
    expect(blocks[2].text).toBe("I found 12 dependencies");
  });

  test("preserves text before tools as separate content block", () => {
    const base = createStreamingBase();

    const afterTextAndTools = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me check...",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Done!",
      },
    ]);

    const blocks = afterTextAndTools.turnState.contentBlocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("text");
    expect(blocks[0].text).toBe("Let me check...");
    expect(blocks[1].type).toBe("tool-call");
    expect(blocks[1].toolCallId).toBe("tool-1");
    expect(blocks[2].type).toBe("text");
    expect(blocks[2].text).toBe("Done!");
  });

  test("handles 5+ tool calls with stable ordering", () => {
    const base = createStreamingBase();

    const toolNames = ["bash", "read", "grep", "glob", "ls"];
    const startEvents: StreamingEvent[] = toolNames.map((name, i) => ({
      type: "tool-call-start" as const,
      timestamp: `2026-02-11T00:00:03.${String(i).padStart(3, "0")}Z`,
      conversationId: "conv-1",
      messageId: "assistant-1",
      toolCallId: `tool-${i + 1}`,
      name,
    }));

    const completeEvents: StreamingEvent[] = toolNames.map((_, i) => ({
      type: "tool-call-complete" as const,
      timestamp: `2026-02-11T00:00:04.${String(i).padStart(3, "0")}Z`,
      conversationId: "conv-1",
      messageId: "assistant-1",
      toolCallId: `tool-${i + 1}`,
      result: `result-${i + 1}`,
    }));

    const afterAll = applyEvents(base, [
      ...startEvents,
      ...completeEvents,
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "All done.",
      },
    ]);

    expect(afterAll.toolCalls).toHaveLength(5);
    expect(afterAll.turnState.contentBlocks).toHaveLength(6); // 5 tools + 1 synthesis

    for (let i = 0; i < 5; i++) {
      expect(afterAll.turnState.contentBlocks[i].type).toBe("tool-call");
      expect(afterAll.turnState.contentBlocks[i].toolCallId).toBe(`tool-${i + 1}`);
    }
    expect(afterAll.turnState.contentBlocks[5].type).toBe("text");
    expect(afterAll.turnState.contentBlocks[5].text).toBe("All done.");
  });

  test("handles burst events without state corruption", () => {
    const base = createStreamingBase();

    // Simulate rapid burst: all starts, then all completes, then synthesis
    const burstEvents: StreamingEvent[] = [];
    for (let i = 0; i < 3; i++) {
      burstEvents.push({
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z", // Same timestamp for burst
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: `burst-${i}`,
        name: `tool-${i}`,
      });
    }
    for (let i = 0; i < 3; i++) {
      burstEvents.push({
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: `burst-${i}`,
        result: `result-${i}`,
      });
    }
    burstEvents.push({
      type: "delta",
      timestamp: "2026-02-11T00:00:03.002Z",
      conversationId: "conv-1",
      messageId: "assistant-1",
      delta: "Synthesis after burst",
    });

    const afterBurst = applyEvents(base, burstEvents);

    expect(afterBurst.toolCalls).toHaveLength(3);
    expect(afterBurst.turnState.contentBlocks).toHaveLength(4);
    // Verify synthesis text appears as last content block
    const lastBlock = afterBurst.turnState.contentBlocks[3];
    expect(lastBlock.type).toBe("text");
    expect(lastBlock.text).toBe("Synthesis after burst");

    // All tool calls should be complete
    for (const tc of afterBurst.toolCalls) {
      expect(tc.status).toBe("complete");
    }
  });

  test("handles mixed text and tool events without dropping content", () => {
    const base = createStreamingBase();

    const afterMixed = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Checking...",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        result: "ok",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Found it!",
      },
    ]);

    // Verify interleaved content blocks are in event-arrival order
    expect(afterMixed.turnState.contentBlocks).toHaveLength(4);
    expect(afterMixed.turnState.contentBlocks[0]).toEqual({ type: "text", text: "Checking..." });
    expect(afterMixed.turnState.contentBlocks[1]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(afterMixed.turnState.contentBlocks[2]).toEqual({ type: "tool-call", toolCallId: "tool-2" });
    expect(afterMixed.turnState.contentBlocks[3]).toEqual({ type: "text", text: "Found it!" });
  });

  test("handles abort mid-sequence preserving completed tool state", () => {
    const base = createStreamingBase();

    const afterAbort = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      // tool-2 never completes — abort happens
      {
        type: "error",
        timestamp: "2026-02-11T00:00:04.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        error: createError({ message: "aborted" }),
      },
    ]);

    expect(afterAbort.status).toBe("error");
    expect(afterAbort.toolCalls).toHaveLength(2);
    expect(afterAbort.toolCalls[0].status).toBe("complete");
    expect(afterAbort.toolCalls[1].status).toBe("running"); // Still running when aborted
    expect(afterAbort.turnState.hasToolCalls).toBe(true);
  });

  test("complete event builds final turn state with synthesis", () => {
    const base = createStreamingBase();

    const afterComplete = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "The command succeeded.",
      },
    ]);

    expect(afterComplete.status).toBe("complete");
    expect(afterComplete.turnState.contentBlocks).toHaveLength(2);
    expect(afterComplete.turnState.contentBlocks[0].type).toBe("tool-call");
    expect(afterComplete.turnState.contentBlocks[1].type).toBe("text");
    expect(afterComplete.turnState.contentBlocks[1].text).toBe("The command succeeded.");
  });

  test("tool-call-complete without prior start creates entry with correct index", () => {
    const base = createStreamingBase();

    const afterOrphan = applyEvents(base, [
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "orphan-1",
        result: "surprise",
      },
    ]);

    expect(afterOrphan.toolCalls).toHaveLength(1);
    expect(afterOrphan.toolCalls[0].name).toBe("unknown");
    expect(afterOrphan.toolCalls[0].sequenceIndex).toBe(0);
    expect(afterOrphan.toolCalls[0].status).toBe("complete");
  });

  test("turn state resets on new user-send", () => {
    const base = createStreamingBase();

    const withTools = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Done.",
      },
      {
        type: "complete-timeout",
        timestamp: "2026-02-11T00:00:06.000Z",
      },
    ]);

    expect(withTools.status).toBe("idle");
    expect(withTools.toolCalls).toHaveLength(0);
    expect(withTools.turnState.hasToolCalls).toBe(false);
    expect(withTools.turnState.contentBlocks).toHaveLength(0);

    // New turn
    const newTurn = applyEvents(withTools, [
      {
        type: "user-send",
        timestamp: "2026-02-11T00:00:07.000Z",
        conversationId: "conv-1",
        userMessage: {
          id: "user-2",
          role: "user",
          content: "next question",
          createdAt: "2026-02-11T00:00:07.000Z",
        },
      },
    ]);

    expect(newTurn.toolCalls).toHaveLength(0);
    expect(newTurn.turnState.hasToolCalls).toBe(false);
    expect(newTurn.turnState.contentBlocks).toHaveLength(0);
  });

  test("text-only turn has no tool blocks in turn state", () => {
    const base = createStreamingBase();

    const textOnly = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Just text, no tools.",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Just text, no tools.",
      },
    ]);

    expect(textOnly.turnState.hasToolCalls).toBe(false);
    expect(textOnly.turnState.contentBlocks).toHaveLength(1);
    expect(textOnly.turnState.contentBlocks[0]).toEqual({
      type: "text",
      text: "Just text, no tools.",
    });
  });

  test("tool error status propagates correctly in turn state", () => {
    const base = createStreamingBase();

    const afterError = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        error: "command not found",
      },
    ]);

    expect(afterError.toolCalls[0].status).toBe("error");
    expect(afterError.toolCalls[0].error).toBe("command not found");
    expect(afterError.turnState.contentBlocks).toHaveLength(1);
    expect(afterError.turnState.contentBlocks[0].type).toBe("tool-call");
  });
});

describe("streaming block rendering metadata", () => {
  test("in-progress streaming turn preserves assistant message in messages array", () => {
    const base = createStreamingBase();

    const streaming = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Working on it...",
      },
    ]);

    expect(streaming.status).toBe("streaming");
    const assistantMsg = streaming.messages.find((m) => m.id === "assistant-1");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.role).toBe("assistant");
    expect(assistantMsg!.content).toBe("Working on it...");
  });

  test("streaming turn with tools has content blocks suitable for block rendering", () => {
    const base = createStreamingBase();

    const withTools = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me check...",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
        args: { command: "ls" },
      },
    ]);

    expect(withTools.turnState.hasToolCalls).toBe(true);
    expect(withTools.turnState.contentBlocks.length).toBeGreaterThanOrEqual(2);
    // First block is text before tools
    expect(withTools.turnState.contentBlocks[0].type).toBe("text");
    expect(withTools.turnState.contentBlocks[0].text).toBe("Let me check...");
    // Second block is tool-call placeholder
    expect(withTools.turnState.contentBlocks[1].type).toBe("tool-call");
    expect(withTools.turnState.contentBlocks[1].toolCallId).toBe("tool-1");
  });

  test("tool-call content blocks carry toolCallId for block-level rendering", () => {
    const base = createStreamingBase();

    const withTools = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-abc",
        name: "read",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-def",
        name: "grep",
      },
    ]);

    const toolBlocks = withTools.turnState.contentBlocks.filter((b) => b.type === "tool-call");
    expect(toolBlocks).toHaveLength(2);
    expect(toolBlocks[0].toolCallId).toBe("tool-abc");
    expect(toolBlocks[1].toolCallId).toBe("tool-def");
  });

  test("multi-turn does not mix content blocks across turns", () => {
    const base = createStreamingBase();

    // First turn with tools
    const firstTurn = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Done.",
      },
      {
        type: "complete-timeout",
        timestamp: "2026-02-11T00:00:06.000Z",
      },
    ]);

    // After complete-timeout, turn state is reset
    expect(firstTurn.status).toBe("idle");
    expect(firstTurn.turnState.contentBlocks).toHaveLength(0);
    expect(firstTurn.turnState.hasToolCalls).toBe(false);
    expect(firstTurn.toolCalls).toHaveLength(0);

    // Second turn starts fresh
    const secondTurn = applyEvents(firstTurn, [
      {
        type: "user-send",
        timestamp: "2026-02-11T00:00:07.000Z",
        conversationId: "conv-1",
        userMessage: {
          id: "user-2",
          role: "user",
          content: "next",
          createdAt: "2026-02-11T00:00:07.000Z",
        },
      },
      {
        type: "message-ack",
        timestamp: "2026-02-11T00:00:08.000Z",
        conversationId: "conv-1",
        assistantMessageId: "assistant-2",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:09.000Z",
        conversationId: "conv-1",
        messageId: "assistant-2",
        delta: "Fresh response",
      },
    ]);

    expect(secondTurn.turnState.contentBlocks).toHaveLength(1);
    expect(secondTurn.turnState.contentBlocks[0].type).toBe("text");
    expect(secondTurn.turnState.contentBlocks[0].text).toBe("Fresh response");
    expect(secondTurn.turnState.hasToolCalls).toBe(false);
  });

  test("streaming state messages array preserves ordering for block rendering", () => {
    const base = createStreamingBase();

    const afterDelta = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Hello",
      },
    ]);

    // User message comes first, then assistant
    expect(afterDelta.messages).toHaveLength(2);
    expect(afterDelta.messages[0].role).toBe("user");
    expect(afterDelta.messages[0].id).toBe("user-1");
    expect(afterDelta.messages[1].role).toBe("assistant");
    expect(afterDelta.messages[1].id).toBe("assistant-1");
  });

  test("tool placeholders in content blocks align with toolCalls array", () => {
    const base = createStreamingBase();

    const withTools = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
    ]);

    // Every tool-call content block should reference a tool in toolCalls
    const toolBlockIds = withTools.turnState.contentBlocks
      .filter((b) => b.type === "tool-call")
      .map((b) => b.toolCallId);
    const toolCallIds = withTools.toolCalls.map((tc) => tc.id);

    for (const blockId of toolBlockIds) {
      expect(toolCallIds).toContain(blockId);
    }
  });
});

describe("conversation store pipeline", () => {
  test("streams daemon events and auto-returns to idle after complete", async () => {
    const streamEvents: DaemonStreamEvent[] = [
      {
        type: "start",
        conversationId: "conv-1",
        messageId: "assistant-1",
        timestamp: "2026-02-11T00:00:02.000Z",
      },
      {
        type: "delta",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Hello",
        timestamp: "2026-02-11T00:00:03.000Z",
      },
      {
        type: "complete",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Hello world",
        timestamp: "2026-02-11T00:00:04.000Z",
      },
    ];

    const store = createConversationStore({
      daemonClient: new FakeDaemonClient(
        ok({
          conversationId: "conv-1",
          userMessageId: "user-remote-1",
          assistantMessageId: "assistant-1",
        }),
        ok(createAsyncIterable(streamEvents)),
      ),
      completeDisplayMs: 5,
    });

    const result = await store.sendUserMessage({
      content: "Hi",
      conversationId: "conv-1",
    });

    expect(result.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const snapshot = store.getState();
    expect(snapshot.streaming.status).toBe("idle");
    expect(snapshot.messages.at(-1)?.content).toBe("Hello world");
  });

  test("returns error result and enters error state when stream fails", async () => {
    const streamError = createError({ code: "DAEMON_TIMEOUT", message: "timeout" });
    const store = createConversationStore({
      daemonClient: new FakeDaemonClient(
        ok({
          conversationId: "conv-1",
          userMessageId: "user-remote-1",
          assistantMessageId: "assistant-1",
        }),
        err(streamError),
      ),
      completeDisplayMs: 1,
    });

    const result = await store.sendUserMessage({
      content: "Hi",
      conversationId: "conv-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DAEMON_TIMEOUT");
    }

    const snapshot = store.getState();
    expect(snapshot.streaming.status).toBe("error");
  });

  test("cancelActiveResponse finalizes an active stream without entering error", async () => {
    let cancelled = false;
    const cancellableStream: AsyncIterable<DaemonStreamEvent> = {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "start",
          conversationId: "conv-1",
          messageId: "assistant-1",
          timestamp: "2026-02-11T00:00:02.000Z",
        };

        while (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      },
    };

    const store = createConversationStore({
      daemonClient: new FakeDaemonClient(
        ok({
          conversationId: "conv-1",
          userMessageId: "user-remote-1",
          assistantMessageId: "assistant-1",
        }),
        ok(cancellableStream),
        ok(undefined),
        () => {
          cancelled = true;
        },
      ),
      completeDisplayMs: 1_000,
    });

    const sendPromise = store.sendUserMessage({
      content: "Please stream",
      conversationId: "conv-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const cancelResult = await store.cancelActiveResponse();
    expect(cancelResult.ok).toBe(true);

    const sendResult = await sendPromise;
    expect(sendResult.ok).toBe(true);

    const snapshot = store.getState();
    expect(snapshot.streaming.status).toBe("complete");
  });
});

// --- Expand/collapse interaction tests ---

function createToolCall(overrides: Partial<DisplayToolCall> = {}): DisplayToolCall {
  return {
    id: "tool-1",
    name: "bash",
    status: "complete",
    args: { command: "ls" },
    result: "file1.ts\nfile2.ts",
    ...overrides,
  };
}

describe("expand/collapse state management", () => {
  test("TOGGLE_TOOL_EXPAND adds tool call id to expanded set", () => {
    const state = appReducer(DEFAULT_STATE, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });

    expect(state.expandedToolCalls.has("tool-1")).toBe(true);
  });

  test("TOGGLE_TOOL_EXPAND removes tool call id when already expanded", () => {
    let state = appReducer(DEFAULT_STATE, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    expect(state.expandedToolCalls.has("tool-1")).toBe(true);

    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    expect(state.expandedToolCalls.has("tool-1")).toBe(false);
  });

  test("TOGGLE_TOOL_EXPAND handles multiple tool calls independently", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-2" },
    });

    expect(state.expandedToolCalls.has("tool-1")).toBe(true);
    expect(state.expandedToolCalls.has("tool-2")).toBe(true);

    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });

    expect(state.expandedToolCalls.has("tool-1")).toBe(false);
    expect(state.expandedToolCalls.has("tool-2")).toBe(true);
  });

  test("COLLAPSE_ALL_TOOLS clears all expanded tool calls", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-2" },
    });
    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-3" },
    });

    expect(state.expandedToolCalls.size).toBe(3);

    state = appReducer(state, { type: "COLLAPSE_ALL_TOOLS" });
    expect(state.expandedToolCalls.size).toBe(0);
  });

  test("CLEAR_MESSAGES resets expanded tool calls", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    expect(state.expandedToolCalls.size).toBe(1);

    state = appReducer(state, { type: "CLEAR_MESSAGES" });
    expect(state.expandedToolCalls.size).toBe(0);
  });

  test("SET_ACTIVE_CONVERSATION resets expanded tool calls", () => {
    let state = DEFAULT_STATE;

    state = appReducer(state, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    expect(state.expandedToolCalls.size).toBe(1);

    state = appReducer(state, {
      type: "SET_ACTIVE_CONVERSATION",
      payload: "new-conv",
    });
    expect(state.expandedToolCalls.size).toBe(0);
  });

  test("expanded set is immutable across toggles", () => {
    const state1 = appReducer(DEFAULT_STATE, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-1" },
    });
    const state2 = appReducer(state1, {
      type: "TOGGLE_TOOL_EXPAND",
      payload: { toolCallId: "tool-2" },
    });

    // Original set should not be mutated
    expect(state1.expandedToolCalls.size).toBe(1);
    expect(state2.expandedToolCalls.size).toBe(2);
    expect(state1.expandedToolCalls).not.toBe(state2.expandedToolCalls);
  });
});

describe("expand/collapse visual state mapping", () => {
  test("toolCallsToVisualStates respects expanded set", () => {
    const toolCalls: DisplayToolCall[] = [
      createToolCall({ id: "tool-1", name: "bash" }),
      createToolCall({ id: "tool-2", name: "read" }),
      createToolCall({ id: "tool-3", name: "grep" }),
    ];

    const expandedSet = new Set(["tool-2"]);
    const states = toolCallsToVisualStates(toolCalls, expandedSet);

    expect(states[0].expanded).toBe(false);
    expect(states[1].expanded).toBe(true);
    expect(states[2].expanded).toBe(false);
  });

  test("toolCallsToVisualStates defaults to collapsed when no expanded set", () => {
    const toolCalls: DisplayToolCall[] = [
      createToolCall({ id: "tool-1" }),
      createToolCall({ id: "tool-2" }),
    ];

    const states = toolCallsToVisualStates(toolCalls);

    expect(states[0].expanded).toBe(false);
    expect(states[1].expanded).toBe(false);
  });

  test("toolCallsToVisualStates preserves tool call ordering", () => {
    const toolCalls: DisplayToolCall[] = [
      createToolCall({ id: "tool-1", name: "bash" }),
      createToolCall({ id: "tool-2", name: "read" }),
      createToolCall({ id: "tool-3", name: "grep" }),
    ];

    const expandedSet = new Set(["tool-1", "tool-3"]);
    const states = toolCallsToVisualStates(toolCalls, expandedSet);

    expect(states).toHaveLength(3);
    expect(states[0].id).toBe("tool-1");
    expect(states[1].id).toBe("tool-2");
    expect(states[2].id).toBe("tool-3");
    expect(states[0].toolName).toBe("bash");
    expect(states[1].toolName).toBe("read");
    expect(states[2].toolName).toBe("grep");
  });

  test("toggling expand does not change ordering of visual states", () => {
    const toolCalls: DisplayToolCall[] = [
      createToolCall({ id: "tool-1", name: "bash" }),
      createToolCall({ id: "tool-2", name: "read" }),
      createToolCall({ id: "tool-3", name: "grep" }),
    ];

    // All collapsed
    const collapsed = toolCallsToVisualStates(toolCalls, new Set());
    // All expanded
    const expanded = toolCallsToVisualStates(toolCalls, new Set(["tool-1", "tool-2", "tool-3"]));
    // Mixed
    const mixed = toolCallsToVisualStates(toolCalls, new Set(["tool-2"]));

    // Ordering should be identical regardless of expand state
    for (const states of [collapsed, expanded, mixed]) {
      expect(states[0].id).toBe("tool-1");
      expect(states[1].id).toBe("tool-2");
      expect(states[2].id).toBe("tool-3");
    }
  });
});

describe("error-state auto-expansion", () => {
  test("shouldAutoExpand returns true for error status", () => {
    expect(shouldAutoExpand(createToolCall({ status: "error" }))).toBe(true);
  });

  test("shouldAutoExpand returns true for isError flag", () => {
    expect(shouldAutoExpand(createToolCall({ status: "complete", isError: true }))).toBe(true);
  });

  test("shouldAutoExpand returns false for successful tool calls", () => {
    expect(shouldAutoExpand(createToolCall({ status: "complete" }))).toBe(false);
  });

  test("shouldAutoExpand returns false for running tool calls", () => {
    expect(shouldAutoExpand(createToolCall({ status: "running" }))).toBe(false);
  });

  test("shouldAutoExpand returns false for pending tool calls", () => {
    expect(shouldAutoExpand(createToolCall({ status: "pending" }))).toBe(false);
  });

  test("error tool calls are expanded even when not in expanded set", () => {
    const toolCalls: DisplayToolCall[] = [
      createToolCall({ id: "tool-1", status: "complete" }),
      createToolCall({ id: "tool-2", status: "error", result: "Permission denied", isError: true }),
      createToolCall({ id: "tool-3", status: "complete" }),
    ];

    // Empty expanded set — only error should be expanded
    const states = toolCalls.map((dtc) => {
      const expanded = shouldAutoExpand(dtc) || new Set<string>().has(dtc.id);
      return { id: dtc.id, expanded };
    });

    expect(states[0].expanded).toBe(false);
    expect(states[1].expanded).toBe(true);
    expect(states[2].expanded).toBe(false);
  });

  test("error tool calls remain expanded even when toggled off in expanded set", () => {
    const errorTool = createToolCall({
      id: "tool-err",
      status: "error",
      result: "command not found",
      isError: true,
    });

    // shouldAutoExpand overrides the expanded set
    expect(shouldAutoExpand(errorTool)).toBe(true);
  });
});

describe("ordering stability with expand/collapse", () => {
  test("multi-tool sequence ordering is stable across expand toggles", () => {
    const base = createStreamingBase();

    const afterTools = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "read",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        name: "grep",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        result: "ok",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        result: "ok",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "All done.",
      },
    ]);

    // Content blocks should maintain order regardless of expand state
    const blocks = afterTools.turnState.contentBlocks;
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe("tool-call");
    expect(blocks[0].toolCallId).toBe("tool-1");
    expect(blocks[1].type).toBe("tool-call");
    expect(blocks[1].toolCallId).toBe("tool-2");
    expect(blocks[2].type).toBe("tool-call");
    expect(blocks[2].toolCallId).toBe("tool-3");
    expect(blocks[3].type).toBe("text");
    expect(blocks[3].text).toBe("All done.");

    // Sequence indices are stable
    expect(afterTools.toolCalls[0].sequenceIndex).toBe(0);
    expect(afterTools.toolCalls[1].sequenceIndex).toBe(1);
    expect(afterTools.toolCalls[2].sequenceIndex).toBe(2);
  });

  test("synthesis text ordering preserved after tool completion", () => {
    const base = createStreamingBase();

    const afterComplete = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me check...",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Here are the results.",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:06.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Let me check...Here are the results.",
      },
    ]);

    expect(afterComplete.status).toBe("complete");
    const blocks = afterComplete.turnState.contentBlocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: "text", text: "Let me check..." });
    expect(blocks[1]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[2]).toEqual({ type: "text", text: "Here are the results." });
  });

  test("error tool calls preserve diagnostics in turn state", () => {
    const base = createStreamingBase();

    const afterError = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
        args: { command: "rm -rf /" },
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        error: "Permission denied: cannot remove root",
      },
    ]);

    expect(afterError.toolCalls[0].status).toBe("error");
    expect(afterError.toolCalls[0].error).toBe("Permission denied: cannot remove root");
    expect(afterError.toolCalls[0].args).toEqual({ command: "rm -rf /" });

    // Content block still references the tool call
    expect(afterError.turnState.contentBlocks).toHaveLength(1);
    expect(afterError.turnState.contentBlocks[0].type).toBe("tool-call");
    expect(afterError.turnState.contentBlocks[0].toolCallId).toBe("tool-1");
  });

  test("mixed success and error tools maintain ordering", () => {
    const base = createStreamingBase();

    const afterMixed = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "write",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        name: "read",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.001Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        error: "Permission denied",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.002Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-3",
        result: "file contents",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "One tool failed.",
      },
    ]);

    // Ordering preserved: tool-1 (success), tool-2 (error), tool-3 (success), synthesis
    const blocks = afterMixed.turnState.contentBlocks;
    expect(blocks).toHaveLength(4);
    expect(blocks[0].toolCallId).toBe("tool-1");
    expect(blocks[1].toolCallId).toBe("tool-2");
    expect(blocks[2].toolCallId).toBe("tool-3");
    expect(blocks[3].text).toBe("One tool failed.");

    // Error tool preserves diagnostics
    expect(afterMixed.toolCalls[1].status).toBe("error");
    expect(afterMixed.toolCalls[1].error).toBe("Permission denied");
  });
});

describe("interleaved text and tool content blocks", () => {
  test("text → tool → text → tool → text produces 5 interleaved blocks", () => {
    const base = createStreamingBase();

    const afterInterleaved = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me check...",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "load_skill",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:03.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "skill loaded",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "CLI is installed.",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:04.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-2",
        result: "0.28.2",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:05.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Running a test.",
      },
    ]);

    const blocks = afterInterleaved.turnState.contentBlocks;
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toEqual({ type: "text", text: "Let me check..." });
    expect(blocks[1]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[2]).toEqual({ type: "text", text: "CLI is installed." });
    expect(blocks[3]).toEqual({ type: "tool-call", toolCallId: "tool-2" });
    expect(blocks[4]).toEqual({ type: "text", text: "Running a test." });
  });

  test("tool-call-start before any deltas puts tool first, text after", () => {
    const base = createStreamingBase();

    const afterToolFirst = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "I ran a command.",
      },
    ]);

    const blocks = afterToolFirst.turnState.contentBlocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[1]).toEqual({ type: "text", text: "I ran a command." });
  });

  test("consecutive text deltas are merged into single text block", () => {
    const base = createStreamingBase();

    const afterDeltas = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Hello ",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.100Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "world",
      },
    ]);

    const blocks = afterDeltas.turnState.contentBlocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: "text", text: "Hello world" });
  });

  test("text after tool creates new block, not appended to pre-tool text", () => {
    const base = createStreamingBase();

    const afterTextToolText = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Before tools.",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "After tools.",
      },
    ]);

    const blocks = afterTextToolText.turnState.contentBlocks;
    expect(blocks).toHaveLength(3);
    // Text before tool is separate from text after tool
    expect(blocks[0]).toEqual({ type: "text", text: "Before tools." });
    expect(blocks[1]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[2]).toEqual({ type: "text", text: "After tools." });
  });

  test("duplicate tool-call-start for same ID does not create duplicate block", () => {
    const base = createStreamingBase();

    const afterDuplicate = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.100Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
    ]);

    const toolBlocks = afterDuplicate.turnState.contentBlocks.filter((b) => b.type === "tool-call");
    expect(toolBlocks).toHaveLength(1);
    expect(toolBlocks[0].toolCallId).toBe("tool-1");
  });

  test("complete event reconciles with extra text not seen in deltas", () => {
    const base = createStreamingBase();

    const afterComplete = applyEvents(base, [
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Partial",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "Partial result summary.",
      },
    ]);

    expect(afterComplete.status).toBe("complete");
    const blocks = afterComplete.turnState.contentBlocks;
    // Should have text block, tool block, and reconciled text with extra content
    const textBlocks = blocks.filter((b) => b.type === "text");
    const toolBlocks = blocks.filter((b) => b.type === "tool-call");
    expect(toolBlocks).toHaveLength(1);
    // All text from complete event should be present in text blocks
    const totalText = textBlocks.map((b) => b.text ?? "").join("");
    expect(totalText).toBe("Partial result summary.");
  });

  test("complete event with no streamed text creates trailing text block", () => {
    const base = createStreamingBase();

    const afterComplete = applyEvents(base, [
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "complete",
        timestamp: "2026-02-11T00:00:05.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        content: "The command succeeded.",
      },
    ]);

    const blocks = afterComplete.turnState.contentBlocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[1]).toEqual({ type: "text", text: "The command succeeded." });
  });

  test("thinking, text, and tools preserve arrival order", () => {
    const base = createStreamingBase();

    const afterThinkingAndTools = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Let me think...",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Here is my answer.",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Done!",
      },
    ]);

    const blocks = afterThinkingAndTools.turnState.contentBlocks;
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toEqual({ type: "thinking", text: "Let me think..." });
    expect(blocks[1]).toEqual({ type: "text", text: "Here is my answer." });
    expect(blocks[2]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[3]).toEqual({ type: "text", text: "Done!" });
  });

  test("bodyBlocks includes thinking content in sequence", () => {
    const base = createStreamingBase();

    const afterThinking = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Internal thought",
      },
      {
        type: "delta",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Visible text",
      },
    ]);

    expect(afterThinking.turnState.bodyBlocks).toHaveLength(2);
    expect(afterThinking.turnState.bodyBlocks[0]).toEqual({ type: "thinking", text: "Internal thought" });
    expect(afterThinking.turnState.bodyBlocks[1]).toEqual({ type: "text", text: "Visible text" });

    // contentBlocks should include thinking
    expect(afterThinking.turnState.contentBlocks).toHaveLength(2);
    expect(afterThinking.turnState.contentBlocks[0]).toEqual({ type: "thinking", text: "Internal thought" });
    expect(afterThinking.turnState.contentBlocks[1]).toEqual({ type: "text", text: "Visible text" });
  });

  test("thinking before and after tools remains split into separate blocks", () => {
    const base = createStreamingBase();

    const afterInterleavedThinking = applyEvents(base, [
      {
        type: "thinking-delta",
        timestamp: "2026-02-11T00:00:02.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "First thought.",
      },
      {
        type: "tool-call-start",
        timestamp: "2026-02-11T00:00:03.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "bash",
      },
      {
        type: "tool-call-complete",
        timestamp: "2026-02-11T00:00:03.500Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        result: "ok",
      },
      {
        type: "thinking-delta",
        timestamp: "2026-02-11T00:00:04.000Z",
        conversationId: "conv-1",
        messageId: "assistant-1",
        delta: "Second thought.",
      },
    ]);

    const blocks = afterInterleavedThinking.turnState.contentBlocks;
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: "thinking", text: "First thought." });
    expect(blocks[1]).toEqual({ type: "tool-call", toolCallId: "tool-1" });
    expect(blocks[2]).toEqual({ type: "thinking", text: "Second thought." });
  });
});
