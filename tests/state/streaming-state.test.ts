import { describe, expect, test } from "bun:test";

import type { DaemonClient } from "../../src/daemon/client";
import { err, ok, type DaemonClientError, type DaemonConnectionState, type DaemonHealth, type DaemonResult, type DaemonStreamEvent } from "../../src/daemon/contracts";
import { createConversationStore } from "../../src/state/conversation-store";
import { createInitialStreamingState, reduceStreamingState } from "../../src/state/streaming-state";

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
