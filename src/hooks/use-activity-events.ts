import { useEffect, useRef } from "react";

import type { TypedEventBus, HarnessEventMap } from "@reins/core";

import type {
  AbortedActivityEvent,
  ChildAgentActivityEvent,
  CompactionActivityEvent,
  DoneActivityEvent,
  ErrorActivityEvent,
  ToolCallActivityEvent,
} from "../state/activity-store";
import { ActivityStore } from "../state/activity-store";

let activityEventCounter = 0;

function createActivityEventId(): string {
  activityEventCounter += 1;
  return `ae_${Date.now()}_${activityEventCounter}`;
}

/**
 * Subscribes to harness events on the given event bus and pushes
 * corresponding activity events into the store. Cleans up all
 * subscriptions on unmount.
 */
export function useActivityEvents(
  eventBus: TypedEventBus<HarnessEventMap>,
  store: ActivityStore,
): void {
  const toolCallMapRef = useRef<Map<string, { eventId: string; startedAt: number }>>(
    new Map(),
  );

  useEffect(() => {
    const toolCallMap = toolCallMapRef.current;

    const unsubToolCallStart = eventBus.on("tool_call_start", (envelope) => {
      const { toolCall } = envelope.payload;
      const eventId = createActivityEventId();
      const now = Date.now();

      toolCallMap.set(toolCall.id, { eventId, startedAt: now });

      const event: ToolCallActivityEvent = {
        id: eventId,
        timestamp: now,
        kind: "tool_call",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        status: "running",
        startedAt: now,
      };

      store.push(event);
    });

    const unsubToolCallEnd = eventBus.on("tool_call_end", (envelope) => {
      const { result } = envelope.payload;
      const tracked = toolCallMap.get(result.callId);

      if (!tracked) {
        return;
      }

      const completedAt = Date.now();
      const hasError = result.error !== undefined;

      const updatedEvent: ToolCallActivityEvent = {
        id: tracked.eventId,
        timestamp: tracked.startedAt,
        kind: "tool_call",
        toolCallId: result.callId,
        toolName: result.name,
        toolArgs: {},
        status: hasError ? "error" : "success",
        result: hasError ? undefined : String(result.result),
        error: hasError ? result.error : undefined,
        startedAt: tracked.startedAt,
        completedAt,
        durationMs: completedAt - tracked.startedAt,
      };

      store.update(tracked.eventId, updatedEvent);
      toolCallMap.delete(result.callId);
    });

    const unsubCompaction = eventBus.on("compaction", (envelope) => {
      const { summary, beforeTokenEstimate, afterTokenEstimate } = envelope.payload;

      const event: CompactionActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "compaction",
        summary,
        beforeTokenEstimate,
        afterTokenEstimate,
      };

      store.push(event);
    });

    const unsubError = eventBus.on("error", (envelope) => {
      const { error, code, retryable } = envelope.payload;

      const event: ErrorActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "error",
        error,
        code,
        retryable,
      };

      store.push(event);
    });

    const unsubDone = eventBus.on("done", (envelope) => {
      const { usage, finishReason } = envelope.payload;

      const event: DoneActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "done",
        totalTokensUsed: usage.totalTokens,
        finishReason,
      };

      store.push(event);
    });

    const unsubAborted = eventBus.on("aborted", (envelope) => {
      const { reason, initiatedBy } = envelope.payload;

      const event: AbortedActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "aborted",
        reason,
        initiatedBy,
      };

      store.push(event);
    });

    const unsubChildAgent = eventBus.on("child_agent_event", (envelope) => {
      const { childId, eventType, payload } = envelope.payload;

      const event: ChildAgentActivityEvent = {
        id: createActivityEventId(),
        timestamp: Date.now(),
        kind: "child_agent",
        childId,
        eventType,
        payload,
      };

      store.push(event);
    });

    return () => {
      unsubToolCallStart();
      unsubToolCallEnd();
      unsubCompaction();
      unsubError();
      unsubDone();
      unsubAborted();
      unsubChildAgent();
      toolCallMap.clear();
    };
  }, [eventBus, store]);
}
