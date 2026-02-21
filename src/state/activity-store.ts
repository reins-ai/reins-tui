export type ActivityEventKind =
  | "tool_call"
  | "thinking"
  | "compaction"
  | "error"
  | "done"
  | "aborted"
  | "child_agent";

export interface ActivityEventBase {
  id: string;
  timestamp: number;
}

export interface ToolCallActivityEvent extends ActivityEventBase {
  kind: "tool_call";
  toolCallId: string;
  toolName: string;
  toolArgs: unknown;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

export interface ThinkingActivityEvent extends ActivityEventBase {
  kind: "thinking";
  content: string;
  estimatedTokens: number;
}

export interface CompactionActivityEvent extends ActivityEventBase {
  kind: "compaction";
  summary: string;
  beforeTokenEstimate: number;
  afterTokenEstimate: number;
}

export interface ErrorActivityEvent extends ActivityEventBase {
  kind: "error";
  error: Error;
  code?: string;
  retryable?: boolean;
}

export interface DoneActivityEvent extends ActivityEventBase {
  kind: "done";
  totalTokensUsed?: number;
  finishReason: string;
}

export interface AbortedActivityEvent extends ActivityEventBase {
  kind: "aborted";
  reason?: string;
  initiatedBy: "user" | "system";
}

export interface ChildAgentActivityEvent extends ActivityEventBase {
  kind: "child_agent";
  childId: string;
  eventType: string;
  payload: unknown;
}

export type ActivityEvent =
  | ToolCallActivityEvent
  | ThinkingActivityEvent
  | CompactionActivityEvent
  | ErrorActivityEvent
  | DoneActivityEvent
  | AbortedActivityEvent
  | ChildAgentActivityEvent;

export interface ActivityStats {
  totalToolCalls: number;
  totalTokensUsed: number;
  totalWallMs: number;
}

function createEmptyStats(): ActivityStats {
  return {
    totalToolCalls: 0,
    totalTokensUsed: 0,
    totalWallMs: 0,
  };
}

function isCompletedToolCall(event: ActivityEvent): event is ToolCallActivityEvent {
  return event.kind === "tool_call" && event.status !== "running";
}

export class ActivityStore {
  private readonly maxSize: number;
  private buffer: ActivityEvent[];
  private stats: ActivityStats;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.buffer = [];
    this.stats = createEmptyStats();
  }

  push(event: ActivityEvent): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(event);
    this.updateStatsOnPush(event);
  }

  update(id: string, updatedEvent: ActivityEvent): boolean {
    const index = this.buffer.findIndex((e) => e.id === id);
    if (index === -1) {
      return false;
    }
    this.buffer[index] = updatedEvent;
    this.updateStatsOnUpdate(updatedEvent);
    return true;
  }

  getAll(): ActivityEvent[] {
    return [...this.buffer].reverse();
  }

  getStats(): ActivityStats {
    return { ...this.stats };
  }

  clear(): void {
    this.buffer = [];
    this.stats = createEmptyStats();
  }

  get size(): number {
    return this.buffer.length;
  }

  private updateStatsOnPush(event: ActivityEvent): void {
    if (isCompletedToolCall(event)) {
      this.stats.totalToolCalls += 1;
      this.stats.totalWallMs += event.durationMs ?? 0;
    }
    if (event.kind === "done" && event.totalTokensUsed !== undefined) {
      this.stats.totalTokensUsed += event.totalTokensUsed;
    }
  }

  private updateStatsOnUpdate(event: ActivityEvent): void {
    if (isCompletedToolCall(event)) {
      this.stats.totalToolCalls += 1;
      this.stats.totalWallMs += event.durationMs ?? 0;
    }
  }
}
