import { describe, expect, test } from "bun:test";

import {
  createQueuedToolCall,
  getToolGlyph,
  toolCallReducer,
  toolCallToMessageContent,
  type ToolCall,
} from "../../src/tools/tool-lifecycle";
import {
  addToolCall,
  collapseAll,
  createInitialToolDetailState,
  expandAll,
  getVisibleCalls,
  toggleCollapse,
  toolDetailReducer,
  updateToolCall,
  type ToolDetailState,
} from "../../src/tools/tool-detail-store";
import { appReducer } from "../../src/store/index";
import { DEFAULT_STATE } from "../../src/store/types";
import type { StreamToolCall } from "../../src/state/streaming-state";

function createQueuedCall(): ToolCall {
  return createQueuedToolCall({
    type: "ToolQueued",
    id: "tool-1",
    toolName: "search",
    args: { query: "reins" },
    timestamp: 1_000,
  });
}

describe("tool lifecycle transitions", () => {
  test("transitions queued -> running -> success", () => {
    const queued = createQueuedCall();
    const running = toolCallReducer(queued, {
      type: "ToolStarted",
      id: "tool-1",
      timestamp: 1_100,
    });
    const success = toolCallReducer(running, {
      type: "ToolCompleted",
      id: "tool-1",
      timestamp: 1_334,
      result: { items: 3 },
    });

    expect(running.status).toBe("running");
    expect(success.status).toBe("success");
    expect(success.duration).toBe(234);
    expect(success.result).toEqual({ items: 3 });
  });

  test("transitions queued -> running -> error", () => {
    const queued = createQueuedCall();
    const running = toolCallReducer(queued, {
      type: "ToolStarted",
      id: "tool-1",
      timestamp: 2_000,
    });
    const failed = toolCallReducer(running, {
      type: "ToolFailed",
      id: "tool-1",
      timestamp: 2_010,
      error: "timeout",
    });

    expect(failed.status).toBe("error");
    expect(failed.duration).toBe(10);
    expect(failed.error).toBe("timeout");
  });

  test("rejects invalid transitions", () => {
    const queued = createQueuedCall();
    const invalidComplete = toolCallReducer(queued, {
      type: "ToolCompleted",
      id: "tool-1",
      timestamp: 1_500,
      result: "done",
    });

    const running = toolCallReducer(queued, {
      type: "ToolStarted",
      id: "tool-1",
      timestamp: 1_200,
    });
    const success = toolCallReducer(running, {
      type: "ToolCompleted",
      id: "tool-1",
      timestamp: 1_300,
      result: "done",
    });
    const invalidBackward = toolCallReducer(success, {
      type: "ToolStarted",
      id: "tool-1",
      timestamp: 1_400,
    });

    expect(invalidComplete).toBe(queued);
    expect(invalidBackward).toBe(success);
  });

  test("maps glyphs for each lifecycle status", () => {
    expect(getToolGlyph("queued")).toBe("◎");
    expect(getToolGlyph("running")).toBe("◎");
    expect(getToolGlyph("success")).toBe("✦");
    expect(getToolGlyph("error")).toBe("✧");
  });

  test("handles completion without startedAt duration", () => {
    const runningWithoutStart: ToolCall = {
      id: "tool-2",
      toolName: "search",
      status: "running",
    };

    const completed = toolCallReducer(runningWithoutStart, {
      type: "ToolCompleted",
      id: "tool-2",
      timestamp: 2_000,
      result: "ok",
    });

    expect(completed.status).toBe("success");
    expect(completed.duration).toBeUndefined();
  });
});

describe("tool detail store", () => {
  test("adds and updates tool calls", () => {
    const added = addToolCall(createInitialToolDetailState(), {
      type: "ToolQueued",
      id: "tool-1",
      toolName: "search",
      args: { query: "inline tools" },
      timestamp: 100,
    });

    const updated = updateToolCall(added, {
      type: "ToolStarted",
      id: "tool-1",
      timestamp: 150,
    });

    const call = updated.calls.get("tool-1");
    expect(call?.status).toBe("running");
    expect(call?.args).toEqual({ query: "inline tools" });
  });

  test("toggles collapse, collapse-all, and expand-all", () => {
    const base = addToolCall(createInitialToolDetailState(), {
      type: "ToolQueued",
      id: "tool-1",
      toolName: "search",
      timestamp: 100,
    });

    const toggled = toggleCollapse(base, "tool-1");
    expect(toggled.collapsed.has("tool-1")).toBe(true);

    const untoggled = toggleCollapse(toggled, "tool-1");
    expect(untoggled.collapsed.has("tool-1")).toBe(false);

    const second = addToolCall(untoggled, {
      type: "ToolQueued",
      id: "tool-2",
      toolName: "calendar.lookup",
      timestamp: 120,
    });

    const allCollapsed = collapseAll(second);
    expect(allCollapsed.collapsed.has("tool-1")).toBe(true);
    expect(allCollapsed.collapsed.has("tool-2")).toBe(true);

    const allExpanded = expandAll(allCollapsed);
    expect(allExpanded.collapsed.size).toBe(0);
  });

  test("getVisibleCalls returns rendering shape with collapse metadata", () => {
    const withCall = updateToolCall(
      addToolCall(createInitialToolDetailState(), {
        type: "ToolQueued",
        id: "tool-1",
        toolName: "search",
        args: { query: "reins" },
        timestamp: 100,
      }),
      {
        type: "ToolStarted",
        id: "tool-1",
        timestamp: 120,
      },
    );
    const collapsed = toggleCollapse(withCall, "tool-1");

    const visible = getVisibleCalls(collapsed);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe("tool-1");
    expect(visible[0]?.collapsed).toBe(true);
    expect(visible[0]?.message.label).toBe("Running Search...");
    expect(visible[0]?.message.glyph).toBe("◎");
  });
});

describe("tool message adapter", () => {
  test("formats running, success, and error labels", () => {
    const running: ToolCall = {
      id: "a",
      toolName: "search",
      status: "running",
      args: { query: "test" },
      startedAt: 1_000,
    };
    const success: ToolCall = {
      ...running,
      status: "success",
      duration: 234,
      result: { ok: true },
      completedAt: 1_234,
    };
    const error: ToolCall = {
      ...running,
      status: "error",
      error: "timeout",
      completedAt: 1_500,
      duration: 500,
    };

    expect(toolCallToMessageContent(running).label).toBe("Running Search...");
    expect(toolCallToMessageContent(success).label).toBe("Search complete (234ms)");
    expect(toolCallToMessageContent(error).label).toBe("Search failed: timeout");
  });

  test("truncates large detail payloads", () => {
    const huge = "x".repeat(700);
    const call: ToolCall = {
      id: "tool-big",
      toolName: "search",
      status: "success",
      args: { query: huge },
      result: { content: huge },
    };

    const content = toolCallToMessageContent(call);
    expect(content.detail).toBeDefined();
    expect((content.detail ?? "").length).toBeLessThanOrEqual(503);
    expect(content.detail?.endsWith("...")).toBe(true);
  });
});

describe("multi-tool detail store sequences", () => {
  test("manages 3+ concurrent tool calls in insertion order", () => {
    let state = createInitialToolDetailState();

    const toolNames = ["bash", "read", "grep"];
    for (let i = 0; i < toolNames.length; i++) {
      state = addToolCall(state, {
        type: "ToolQueued",
        id: `tool-${i}`,
        toolName: toolNames[i],
        args: { index: i },
        timestamp: 100 + i,
      });
    }

    expect(state.calls.size).toBe(3);

    const visible = getVisibleCalls(state);
    expect(visible).toHaveLength(3);
    expect(visible[0].call.toolName).toBe("bash");
    expect(visible[1].call.toolName).toBe("read");
    expect(visible[2].call.toolName).toBe("grep");
  });

  test("updates individual tools without affecting others", () => {
    let state = createInitialToolDetailState();

    state = addToolCall(state, {
      type: "ToolQueued",
      id: "tool-a",
      toolName: "bash",
      timestamp: 100,
    });
    state = addToolCall(state, {
      type: "ToolQueued",
      id: "tool-b",
      toolName: "read",
      timestamp: 101,
    });
    state = addToolCall(state, {
      type: "ToolQueued",
      id: "tool-c",
      toolName: "grep",
      timestamp: 102,
    });

    // Start only tool-b
    state = updateToolCall(state, {
      type: "ToolStarted",
      id: "tool-b",
      timestamp: 200,
    });

    expect(state.calls.get("tool-a")?.status).toBe("queued");
    expect(state.calls.get("tool-b")?.status).toBe("running");
    expect(state.calls.get("tool-c")?.status).toBe("queued");

    // Complete tool-b
    state = updateToolCall(state, {
      type: "ToolCompleted",
      id: "tool-b",
      timestamp: 300,
      result: "file contents",
    });

    expect(state.calls.get("tool-a")?.status).toBe("queued");
    expect(state.calls.get("tool-b")?.status).toBe("success");
    expect(state.calls.get("tool-c")?.status).toBe("queued");
  });

  test("handles 5+ tools with mixed success and error", () => {
    let state = createInitialToolDetailState();

    for (let i = 0; i < 5; i++) {
      state = addToolCall(state, {
        type: "ToolQueued",
        id: `tool-${i}`,
        toolName: `tool-${i}`,
        timestamp: 100 + i,
      });
      state = updateToolCall(state, {
        type: "ToolStarted",
        id: `tool-${i}`,
        timestamp: 200 + i,
      });
    }

    // Complete some, fail others
    state = updateToolCall(state, { type: "ToolCompleted", id: "tool-0", timestamp: 300, result: "ok" });
    state = updateToolCall(state, { type: "ToolFailed", id: "tool-1", timestamp: 301, error: "timeout" });
    state = updateToolCall(state, { type: "ToolCompleted", id: "tool-2", timestamp: 302, result: "ok" });
    state = updateToolCall(state, { type: "ToolCompleted", id: "tool-3", timestamp: 303, result: "ok" });
    state = updateToolCall(state, { type: "ToolFailed", id: "tool-4", timestamp: 304, error: "denied" });

    const visible = getVisibleCalls(state);
    expect(visible).toHaveLength(5);
    expect(visible.filter((v) => v.call.status === "success")).toHaveLength(3);
    expect(visible.filter((v) => v.call.status === "error")).toHaveLength(2);
  });

  test("reducer handles all action types for multi-tool flow", () => {
    let state = createInitialToolDetailState();

    state = toolDetailReducer(state, {
      type: "add-tool-call",
      event: { type: "ToolQueued", id: "t1", toolName: "bash", timestamp: 100 },
    });
    state = toolDetailReducer(state, {
      type: "add-tool-call",
      event: { type: "ToolQueued", id: "t2", toolName: "read", timestamp: 101 },
    });
    state = toolDetailReducer(state, {
      type: "update-tool-call",
      event: { type: "ToolStarted", id: "t1", timestamp: 200 },
    });
    state = toolDetailReducer(state, {
      type: "update-tool-call",
      event: { type: "ToolStarted", id: "t2", timestamp: 201 },
    });

    expect(state.calls.get("t1")?.status).toBe("running");
    expect(state.calls.get("t2")?.status).toBe("running");

    state = toolDetailReducer(state, { type: "collapse-all" });
    expect(state.collapsed.size).toBe(2);

    state = toolDetailReducer(state, { type: "expand-all" });
    expect(state.collapsed.size).toBe(0);
  });
});

describe("SYNC_TOOL_TURN app reducer action", () => {
  test("syncs tool calls and content blocks to display message", () => {
    const messageId = "msg-1";
    const stateWithMessage = appReducer(DEFAULT_STATE, {
      type: "ADD_MESSAGE",
      payload: {
        id: messageId,
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date(),
      },
    });

    const toolCalls: StreamToolCall[] = [
      { id: "tc-1", name: "bash", status: "complete", sequenceIndex: 0, startedAt: "t1", completedAt: "t2", result: "ok" },
      { id: "tc-2", name: "read", status: "running", sequenceIndex: 1, startedAt: "t3" },
      { id: "tc-3", name: "grep", status: "complete", sequenceIndex: 2, startedAt: "t4", completedAt: "t5", result: "found" },
    ];

    const synced = appReducer(stateWithMessage, {
      type: "SYNC_TOOL_TURN",
      payload: {
        messageId,
        toolCalls,
        contentBlocks: [
          { type: "tool-call", toolCallId: "tc-1" },
          { type: "tool-call", toolCallId: "tc-2" },
          { type: "tool-call", toolCallId: "tc-3" },
          { type: "text", text: "Synthesis text" },
        ],
      },
    });

    const msg = synced.messages.find((m) => m.id === messageId);
    expect(msg?.toolCalls).toHaveLength(3);
    expect(msg?.toolCalls?.[0].name).toBe("bash");
    expect(msg?.toolCalls?.[0].status).toBe("complete");
    expect(msg?.toolCalls?.[1].name).toBe("read");
    expect(msg?.toolCalls?.[1].status).toBe("running");
    expect(msg?.toolCalls?.[2].name).toBe("grep");
    expect(msg?.toolCalls?.[2].status).toBe("complete");

    expect(msg?.contentBlocks).toHaveLength(4);
    expect(msg?.contentBlocks?.[0]).toEqual({ type: "tool-call", toolCallId: "tc-1", text: undefined });
    expect(msg?.contentBlocks?.[3]).toEqual({ type: "text", toolCallId: undefined, text: "Synthesis text" });
  });

  test("preserves display order from sequence indices", () => {
    const messageId = "msg-order";
    const stateWithMessage = appReducer(DEFAULT_STATE, {
      type: "ADD_MESSAGE",
      payload: {
        id: messageId,
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date(),
      },
    });

    // Tool calls arrive out of sequence index order
    const toolCalls: StreamToolCall[] = [
      { id: "tc-c", name: "grep", status: "complete", sequenceIndex: 2, startedAt: "t1", completedAt: "t2", result: "ok" },
      { id: "tc-a", name: "bash", status: "complete", sequenceIndex: 0, startedAt: "t3", completedAt: "t4", result: "ok" },
      { id: "tc-b", name: "read", status: "complete", sequenceIndex: 1, startedAt: "t5", completedAt: "t6", result: "ok" },
    ];

    const synced = appReducer(stateWithMessage, {
      type: "SYNC_TOOL_TURN",
      payload: {
        messageId,
        toolCalls,
        contentBlocks: [
          { type: "tool-call", toolCallId: "tc-a" },
          { type: "tool-call", toolCallId: "tc-b" },
          { type: "tool-call", toolCallId: "tc-c" },
        ],
      },
    });

    const msg = synced.messages.find((m) => m.id === messageId);
    // Display tool calls should be sorted by sequence index
    expect(msg?.toolCalls?.[0].name).toBe("bash");
    expect(msg?.toolCalls?.[1].name).toBe("read");
    expect(msg?.toolCalls?.[2].name).toBe("grep");
  });

  test("no-ops when message not found", () => {
    const result = appReducer(DEFAULT_STATE, {
      type: "SYNC_TOOL_TURN",
      payload: {
        messageId: "nonexistent",
        toolCalls: [],
        contentBlocks: [],
      },
    });

    expect(result).toBe(DEFAULT_STATE);
  });
});
