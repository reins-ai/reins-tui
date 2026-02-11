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
  updateToolCall,
} from "../../src/tools/tool-detail-store";

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
