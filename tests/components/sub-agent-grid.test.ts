import { describe, expect, test } from "bun:test";

import {
  deriveAgentStates,
  type AgentState,
} from "../../src/components/cards/sub-agent-grid";
import type { ChildAgentActivityEvent } from "../../src/state/activity-store";

// --- Test data factories ---

let nextId = 0;
function uid(): string {
  return `evt-${++nextId}`;
}

function makeChildEvent(
  overrides?: Partial<ChildAgentActivityEvent>,
): ChildAgentActivityEvent {
  return {
    id: uid(),
    timestamp: Date.now(),
    kind: "child_agent",
    childId: "agent-1",
    eventType: "tool_call_start",
    payload: { toolName: "search" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveAgentStates
// ---------------------------------------------------------------------------

describe("deriveAgentStates", () => {
  test("returns empty array for no events", () => {
    const result = deriveAgentStates([]);
    expect(result).toEqual([]);
  });

  test("assigns sequential indices to agents in order of first appearance", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "alpha", timestamp: 1000 }),
      makeChildEvent({ childId: "beta", timestamp: 2000 }),
      makeChildEvent({ childId: "gamma", timestamp: 3000 }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(3);
    expect(result[0].childId).toBe("alpha");
    expect(result[0].index).toBe(1);
    expect(result[1].childId).toBe("beta");
    expect(result[1].index).toBe(2);
    expect(result[2].childId).toBe("gamma");
    expect(result[2].index).toBe(3);
  });

  test("marks agent as done when done event arrives", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_end", timestamp: 2000 }),
      makeChildEvent({ childId: "agent-1", eventType: "done", timestamp: 3000 }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("done");
  });

  test("marks agent as failed on error event", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({
        childId: "agent-1",
        eventType: "error",
        timestamp: 2000,
        payload: { error: { message: "Provider timeout" } },
      }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("failed");
    expect(result[0].errorMessage).toBe("Provider timeout");
  });

  test("marks agent as failed on aborted event", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-1", eventType: "aborted", timestamp: 2500 }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("failed");
  });

  test("calculates durationMs from first to last event on done", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_end", timestamp: 2000 }),
      makeChildEvent({ childId: "agent-1", eventType: "done", timestamp: 4000 }),
    ];
    const result = deriveAgentStates(events);
    expect(result[0].durationMs).toBe(3000); // 4000 - 1000
  });

  test("calculates durationMs from first to last event on error", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-1", eventType: "error", timestamp: 2500 }),
    ];
    const result = deriveAgentStates(events);
    expect(result[0].durationMs).toBe(1500); // 2500 - 1000
  });

  test("multiple agents tracked independently", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-2", eventType: "tool_call_start", timestamp: 1500 }),
      makeChildEvent({ childId: "agent-1", eventType: "done", timestamp: 3000 }),
      makeChildEvent({
        childId: "agent-2",
        eventType: "error",
        timestamp: 4000,
        payload: { error: { message: "Timeout" } },
      }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(2);

    const agent1 = result.find((a) => a.childId === "agent-1")!;
    const agent2 = result.find((a) => a.childId === "agent-2")!;

    expect(agent1.status).toBe("done");
    expect(agent1.durationMs).toBe(2000); // 3000 - 1000
    expect(agent1.index).toBe(1);

    expect(agent2.status).toBe("failed");
    expect(agent2.durationMs).toBe(2500); // 4000 - 1500
    expect(agent2.index).toBe(2);
    expect(agent2.errorMessage).toBe("Timeout");
  });

  test("agent remains running when no terminal event arrives", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_end", timestamp: 2000 }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("running");
    expect(result[0].durationMs).toBeUndefined();
  });

  test("updates lastSeenAt on each event", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_start", timestamp: 1000 }),
      makeChildEvent({ childId: "agent-1", eventType: "tool_call_end", timestamp: 5000 }),
    ];
    const result = deriveAgentStates(events);
    expect(result[0].firstSeenAt).toBe(1000);
    expect(result[0].lastSeenAt).toBe(5000);
  });

  test("does not extract errorMessage when payload has no error field", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({
        childId: "agent-1",
        eventType: "error",
        timestamp: 1000,
        payload: { info: "no error field" },
      }),
    ];
    const result = deriveAgentStates(events);
    expect(result[0].status).toBe("failed");
    expect(result[0].errorMessage).toBeUndefined();
  });

  test("handles single event for a single agent", () => {
    const events: ChildAgentActivityEvent[] = [
      makeChildEvent({ childId: "solo", eventType: "tool_call_start", timestamp: 1000 }),
    ];
    const result = deriveAgentStates(events);
    expect(result).toHaveLength(1);
    expect(result[0].childId).toBe("solo");
    expect(result[0].index).toBe(1);
    expect(result[0].status).toBe("running");
  });
});
