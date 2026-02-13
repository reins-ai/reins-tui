import { describe, expect, test } from "bun:test";

import {
  createQueuedToolCall,
  displayToolCallToVisualState,
  getToolColorToken,
  getToolGlyph,
  streamToolCallToVisualState,
  toolCallReducer,
  toolCallToMessageContent,
  toolCallToVisualState,
  type DisplayToolCallLike,
  type StreamToolCallLike,
  type ToolCall,
  type ToolVisualState,
  type ToolVisualStatus,
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

describe("tool visual state model", () => {
  describe("getToolColorToken", () => {
    test("maps queued and running to running token", () => {
      expect(getToolColorToken("queued")).toBe("glyph.tool.running");
      expect(getToolColorToken("running")).toBe("glyph.tool.running");
    });

    test("maps success to done token", () => {
      expect(getToolColorToken("success")).toBe("glyph.tool.done");
    });

    test("maps error to error token", () => {
      expect(getToolColorToken("error")).toBe("glyph.tool.error");
    });
  });

  describe("toolCallToVisualState", () => {
    test("converts running ToolCall to visual state", () => {
      const call: ToolCall = {
        id: "tc-1",
        toolName: "search",
        status: "running",
        args: { query: "test" },
        startedAt: 1_000,
      };

      const vs = toolCallToVisualState(call, true);

      expect(vs.id).toBe("tc-1");
      expect(vs.toolName).toBe("search");
      expect(vs.status).toBe("running");
      expect(vs.glyph).toBe("◎");
      expect(vs.label).toBe("Running Search...");
      expect(vs.colorToken).toBe("glyph.tool.running");
      expect(vs.hasDetail).toBe(true);
      expect(vs.expanded).toBe(true);
    });

    test("converts success ToolCall with duration", () => {
      const call: ToolCall = {
        id: "tc-2",
        toolName: "bash",
        status: "success",
        result: { output: "ok" },
        startedAt: 1_000,
        completedAt: 1_234,
        duration: 234,
      };

      const vs = toolCallToVisualState(call, false);

      expect(vs.status).toBe("success");
      expect(vs.label).toBe("Bash complete (234ms)");
      expect(vs.colorToken).toBe("glyph.tool.done");
      expect(vs.glyph).toBe("✦");
      expect(vs.duration).toBe(234);
      expect(vs.expanded).toBe(false);
    });

    test("converts error ToolCall", () => {
      const call: ToolCall = {
        id: "tc-3",
        toolName: "read",
        status: "error",
        error: "file not found",
        startedAt: 1_000,
        completedAt: 1_100,
        duration: 100,
      };

      const vs = toolCallToVisualState(call, true);

      expect(vs.status).toBe("error");
      expect(vs.label).toBe("Read failed: file not found");
      expect(vs.colorToken).toBe("glyph.tool.error");
      expect(vs.glyph).toBe("✧");
    });

    test("converts queued ToolCall", () => {
      const call: ToolCall = {
        id: "tc-4",
        toolName: "grep",
        status: "queued",
      };

      const vs = toolCallToVisualState(call, false);

      expect(vs.status).toBe("queued");
      expect(vs.label).toBe("Queued Grep...");
      expect(vs.colorToken).toBe("glyph.tool.running");
    });

    test("expanded is false when no detail exists", () => {
      const call: ToolCall = {
        id: "tc-5",
        toolName: "ls",
        status: "running",
      };

      const vs = toolCallToVisualState(call, true);

      expect(vs.hasDetail).toBe(false);
      expect(vs.expanded).toBe(false);
    });
  });

  describe("streamToolCallToVisualState", () => {
    test("normalizes 'complete' status to 'success'", () => {
      const stream: StreamToolCallLike = {
        id: "stc-1",
        name: "bash",
        status: "complete",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.500Z",
        result: "output text",
      };

      const vs = streamToolCallToVisualState(stream, false);

      expect(vs.status).toBe("success");
      expect(vs.label).toBe("Bash complete (500ms)");
      expect(vs.colorToken).toBe("glyph.tool.done");
      expect(vs.duration).toBe(500);
    });

    test("handles running stream tool call", () => {
      const stream: StreamToolCallLike = {
        id: "stc-2",
        name: "read",
        status: "running",
        startedAt: "2026-01-01T00:00:00.000Z",
        args: { path: "/tmp/file.txt" },
      };

      const vs = streamToolCallToVisualState(stream, true);

      expect(vs.status).toBe("running");
      expect(vs.label).toBe("Running Read...");
      expect(vs.hasDetail).toBe(true);
      expect(vs.expanded).toBe(true);
    });

    test("handles error stream tool call", () => {
      const stream: StreamToolCallLike = {
        id: "stc-3",
        name: "write",
        status: "error",
        error: "permission denied",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
      };

      const vs = streamToolCallToVisualState(stream, true);

      expect(vs.status).toBe("error");
      expect(vs.label).toBe("Write failed: permission denied");
      expect(vs.colorToken).toBe("glyph.tool.error");
      expect(vs.hasDetail).toBe(true);
    });

    test("handles missing timestamps gracefully", () => {
      const stream: StreamToolCallLike = {
        id: "stc-4",
        name: "glob",
        status: "complete",
        startedAt: "2026-01-01T00:00:00.000Z",
        result: "found 3 files",
      };

      const vs = streamToolCallToVisualState(stream, false);

      expect(vs.duration).toBeUndefined();
      expect(vs.label).toBe("Glob complete");
    });

    test("handles invalid date strings", () => {
      const stream: StreamToolCallLike = {
        id: "stc-5",
        name: "bash",
        status: "complete",
        startedAt: "not-a-date",
        completedAt: "also-not-a-date",
      };

      const vs = streamToolCallToVisualState(stream, false);

      expect(vs.duration).toBeUndefined();
    });
  });

  describe("displayToolCallToVisualState", () => {
    test("normalizes 'pending' status to 'queued'", () => {
      const display: DisplayToolCallLike = {
        id: "dtc-1",
        name: "search",
        status: "pending",
      };

      const vs = displayToolCallToVisualState(display, false);

      expect(vs.status).toBe("queued");
      expect(vs.label).toBe("Queued Search...");
      expect(vs.colorToken).toBe("glyph.tool.running");
    });

    test("normalizes 'complete' status to 'success'", () => {
      const display: DisplayToolCallLike = {
        id: "dtc-2",
        name: "calendar",
        status: "complete",
        result: "event created",
      };

      const vs = displayToolCallToVisualState(display, true);

      expect(vs.status).toBe("success");
      expect(vs.label).toBe("Calendar complete");
      expect(vs.colorToken).toBe("glyph.tool.done");
      expect(vs.hasDetail).toBe(true);
      expect(vs.expanded).toBe(true);
    });

    test("handles error with isError flag and result as error text", () => {
      const display: DisplayToolCallLike = {
        id: "dtc-3",
        name: "bash",
        status: "error",
        result: "command not found",
        isError: true,
      };

      const vs = displayToolCallToVisualState(display, false);

      expect(vs.status).toBe("error");
      expect(vs.label).toBe("Bash failed: command not found");
      expect(vs.colorToken).toBe("glyph.tool.error");
    });

    test("handles running display tool call", () => {
      const display: DisplayToolCallLike = {
        id: "dtc-4",
        name: "grep",
        status: "running",
        args: { pattern: "TODO" },
      };

      const vs = displayToolCallToVisualState(display, true);

      expect(vs.status).toBe("running");
      expect(vs.label).toBe("Running Grep...");
      expect(vs.hasDetail).toBe(true);
    });

    test("duration is always undefined for display tool calls", () => {
      const display: DisplayToolCallLike = {
        id: "dtc-5",
        name: "read",
        status: "complete",
      };

      const vs = displayToolCallToVisualState(display, false);

      expect(vs.duration).toBeUndefined();
    });
  });

  describe("visual state consistency across adapters", () => {
    test("all adapters produce same glyph for equivalent status", () => {
      const toolCall: ToolCall = {
        id: "x",
        toolName: "bash",
        status: "success",
        result: "ok",
        duration: 100,
      };
      const streamCall: StreamToolCallLike = {
        id: "x",
        name: "bash",
        status: "complete",
        result: "ok",
      };
      const displayCall: DisplayToolCallLike = {
        id: "x",
        name: "bash",
        status: "complete",
        result: "ok",
      };

      const vsFromTool = toolCallToVisualState(toolCall, false);
      const vsFromStream = streamToolCallToVisualState(streamCall, false);
      const vsFromDisplay = displayToolCallToVisualState(displayCall, false);

      expect(vsFromTool.glyph).toBe("✦");
      expect(vsFromStream.glyph).toBe("✦");
      expect(vsFromDisplay.glyph).toBe("✦");

      expect(vsFromTool.status).toBe("success");
      expect(vsFromStream.status).toBe("success");
      expect(vsFromDisplay.status).toBe("success");
    });

    test("all adapters produce same color token for equivalent status", () => {
      const statuses: Array<{
        toolStatus: ToolCall["status"];
        streamStatus: StreamToolCallLike["status"];
        displayStatus: DisplayToolCallLike["status"];
        expectedToken: string;
      }> = [
        { toolStatus: "running", streamStatus: "running", displayStatus: "running", expectedToken: "glyph.tool.running" },
        { toolStatus: "success", streamStatus: "complete", displayStatus: "complete", expectedToken: "glyph.tool.done" },
        { toolStatus: "error", streamStatus: "error", displayStatus: "error", expectedToken: "glyph.tool.error" },
      ];

      for (const { toolStatus, streamStatus, displayStatus, expectedToken } of statuses) {
        const tc: ToolCall = { id: "x", toolName: "t", status: toolStatus };
        const sc: StreamToolCallLike = { id: "x", name: "t", status: streamStatus };
        const dc: DisplayToolCallLike = { id: "x", name: "t", status: displayStatus };

        expect(toolCallToVisualState(tc, false).colorToken).toBe(expectedToken);
        expect(streamToolCallToVisualState(sc, false).colorToken).toBe(expectedToken);
        expect(displayToolCallToVisualState(dc, false).colorToken).toBe(expectedToken);
      }
    });
  });
});

describe("tool detail store visual state integration", () => {
  test("getVisibleCalls includes visualState field", () => {
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

    const visible = getVisibleCalls(withCall);
    expect(visible).toHaveLength(1);

    const vs = visible[0]?.visualState;
    expect(vs).toBeDefined();
    expect(vs?.status).toBe("running");
    expect(vs?.glyph).toBe("◎");
    expect(vs?.colorToken).toBe("glyph.tool.running");
    expect(vs?.expanded).toBe(true);
    expect(vs?.hasDetail).toBe(true);
  });

  test("collapsed tool has expanded=false in visualState", () => {
    const withCall = addToolCall(createInitialToolDetailState(), {
      type: "ToolQueued",
      id: "tool-1",
      toolName: "search",
      args: { query: "reins" },
      timestamp: 100,
    });
    const collapsed = toggleCollapse(withCall, "tool-1");

    const visible = getVisibleCalls(collapsed);
    expect(visible[0]?.collapsed).toBe(true);
    expect(visible[0]?.visualState.expanded).toBe(false);
  });

  test("visualState and message fields are consistent", () => {
    const withCall = updateToolCall(
      addToolCall(createInitialToolDetailState(), {
        type: "ToolQueued",
        id: "tool-1",
        toolName: "bash",
        args: { cmd: "ls" },
        timestamp: 100,
      }),
      {
        type: "ToolStarted",
        id: "tool-1",
        timestamp: 120,
      },
    );

    const visible = getVisibleCalls(withCall);
    const entry = visible[0];

    expect(entry?.message.glyph).toBe(entry?.visualState.glyph);
    expect(entry?.message.label).toBe(entry?.visualState.label);
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
