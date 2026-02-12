import type { DaemonClientError } from "../daemon/contracts";

export type ConversationLifecycleStatus = "idle" | "sending" | "thinking" | "streaming" | "complete" | "error";

export type StatusMachineState =
  | {
      status: "idle";
      enteredAt: string;
    }
  | {
      status: "sending";
      enteredAt: string;
      userMessageId?: string;
    }
  | {
      status: "thinking";
      enteredAt: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      status: "streaming";
      enteredAt: string;
      conversationId: string;
      assistantMessageId: string;
      chunkCount: number;
    }
  | {
      status: "complete";
      enteredAt: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      status: "error";
      enteredAt: string;
      from: ConversationLifecycleStatus;
      error: DaemonClientError;
    };

export type StatusMachineEvent =
  | {
      type: "user-send";
      timestamp: string;
      userMessageId?: string;
    }
  | {
      type: "message-ack";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-start";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-chunk";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "tool-call-start";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "tool-call-complete";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-complete";
      timestamp: string;
      conversationId: string;
      assistantMessageId: string;
    }
  | {
      type: "stream-error";
      timestamp: string;
      error: DaemonClientError;
    }
  | {
      type: "complete-timeout";
      timestamp: string;
    }
  | {
      type: "dismiss-error";
      timestamp: string;
    }
  | {
      type: "reset";
      timestamp: string;
    };

export function createInitialStatusMachineState(timestamp: string): StatusMachineState {
  return {
    status: "idle",
    enteredAt: timestamp,
  };
}

export function reduceStatusMachine(state: StatusMachineState, event: StatusMachineEvent): StatusMachineState {
  switch (event.type) {
    case "reset":
      return {
        status: "idle",
        enteredAt: event.timestamp,
      };
    case "stream-error":
      return {
        status: "error",
        enteredAt: event.timestamp,
        from: state.status,
        error: event.error,
      };
    case "user-send":
      if (state.status !== "idle" && state.status !== "complete" && state.status !== "error") {
        return state;
      }

      return {
        status: "sending",
        enteredAt: event.timestamp,
        userMessageId: event.userMessageId,
      };
    case "message-ack":
      if (state.status !== "sending") {
        return state;
      }

      return {
        status: "thinking",
        enteredAt: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
      };
    case "stream-start":
      if (state.status !== "thinking") {
        return state;
      }

      return {
        status: "streaming",
        enteredAt: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
        chunkCount: 0,
      };
    case "stream-chunk":
      if (state.status === "thinking") {
        return {
          status: "streaming",
          enteredAt: event.timestamp,
          conversationId: event.conversationId,
          assistantMessageId: event.assistantMessageId,
          chunkCount: 1,
        };
      }

      if (state.status !== "streaming") {
        return state;
      }

      return {
        ...state,
        chunkCount: state.chunkCount + 1,
      };
    case "tool-call-start":
    case "tool-call-complete":
      if (state.status === "thinking") {
        return {
          status: "streaming",
          enteredAt: event.timestamp,
          conversationId: event.conversationId,
          assistantMessageId: event.assistantMessageId,
          chunkCount: 0,
        };
      }

      return state;
    case "stream-complete":
      if (state.status !== "thinking" && state.status !== "streaming") {
        return state;
      }

      return {
        status: "complete",
        enteredAt: event.timestamp,
        conversationId: event.conversationId,
        assistantMessageId: event.assistantMessageId,
      };
    case "complete-timeout":
      if (state.status !== "complete") {
        return state;
      }

      return {
        status: "idle",
        enteredAt: event.timestamp,
      };
    case "dismiss-error":
      if (state.status !== "error") {
        return state;
      }

      return {
        status: "idle",
        enteredAt: event.timestamp,
      };
    default:
      return state;
  }
}
