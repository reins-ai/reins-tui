import {
  createQueuedToolCall,
  toolCallReducer,
  toolCallToMessageContent,
  toolCallToVisualState,
  type ToolCall,
  type ToolEvent,
  type ToolMessageContent,
  type ToolQueuedEvent,
  type ToolVisualState,
} from "./tool-lifecycle";

export interface ToolDetailState {
  calls: Map<string, ToolCall>;
  collapsed: Set<string>;
}

export interface VisibleToolCall {
  id: string;
  call: ToolCall;
  collapsed: boolean;
  message: ToolMessageContent;
  visualState: ToolVisualState;
}

export type ToolDetailAction =
  | {
      type: "add-tool-call";
      event: ToolQueuedEvent;
    }
  | {
      type: "update-tool-call";
      event: ToolEvent;
    }
  | {
      type: "toggle-collapse";
      toolCallId: string;
    }
  | {
      type: "collapse-all";
    }
  | {
      type: "expand-all";
    };

export function createInitialToolDetailState(): ToolDetailState {
  return {
    calls: new Map<string, ToolCall>(),
    collapsed: new Set<string>(),
  };
}

export function addToolCall(state: ToolDetailState, event: ToolQueuedEvent): ToolDetailState {
  if (state.calls.has(event.id)) {
    return state;
  }

  const nextCalls = new Map(state.calls);
  nextCalls.set(event.id, createQueuedToolCall(event));

  return {
    calls: nextCalls,
    collapsed: new Set(state.collapsed),
  };
}

export function updateToolCall(state: ToolDetailState, event: ToolEvent): ToolDetailState {
  const existing = state.calls.get(event.id);
  if (!existing) {
    return state;
  }

  const nextCalls = new Map(state.calls);
  nextCalls.set(event.id, toolCallReducer(existing, event));

  return {
    calls: nextCalls,
    collapsed: new Set(state.collapsed),
  };
}

export function toggleCollapse(state: ToolDetailState, toolCallId: string): ToolDetailState {
  const nextCollapsed = new Set(state.collapsed);
  if (nextCollapsed.has(toolCallId)) {
    nextCollapsed.delete(toolCallId);
  } else {
    nextCollapsed.add(toolCallId);
  }

  return {
    calls: new Map(state.calls),
    collapsed: nextCollapsed,
  };
}

export function collapseAll(state: ToolDetailState): ToolDetailState {
  return {
    calls: new Map(state.calls),
    collapsed: new Set(state.calls.keys()),
  };
}

export function expandAll(state: ToolDetailState): ToolDetailState {
  return {
    calls: new Map(state.calls),
    collapsed: new Set<string>(),
  };
}

export function getVisibleCalls(state: ToolDetailState): VisibleToolCall[] {
  return Array.from(state.calls.values()).map((call) => {
    const isCollapsed = state.collapsed.has(call.id);
    return {
      id: call.id,
      call,
      collapsed: isCollapsed,
      message: toolCallToMessageContent(call),
      visualState: toolCallToVisualState(call, !isCollapsed),
    };
  });
}

export function toolDetailReducer(state: ToolDetailState, action: ToolDetailAction): ToolDetailState {
  switch (action.type) {
    case "add-tool-call":
      return addToolCall(state, action.event);
    case "update-tool-call":
      return updateToolCall(state, action.event);
    case "toggle-collapse":
      return toggleCollapse(state, action.toolCallId);
    case "collapse-all":
      return collapseAll(state);
    case "expand-all":
      return expandAll(state);
    default:
      return state;
  }
}
