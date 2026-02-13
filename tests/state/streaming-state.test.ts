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
    expect(afterToolsAndSynthesis.turnState.synthesisContent).toBe("I found 12 dependencies");

    const blocks = afterToolsAndSynthesis.turnState.contentBlocks;
    expect(blocks).toHaveLength(3); // 2 tool-call blocks + 1 synthesis text
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
    expect(afterBurst.turnState.synthesisContent).toBe("Synthesis after burst");

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

    expect(afterMixed.turnState.textBeforeTools).toBe("Checking...");
    expect(afterMixed.turnState.synthesisContent).toBe("Found it!");
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
});
