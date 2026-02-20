import type { TaskUpdateEvent } from "./contracts";
import type { DaemonWsTransport } from "./ws-transport";

export type TaskEventListener = (event: TaskUpdateEvent) => void;

export interface TaskEventSubscription {
  unsubscribe(): void;
}

/**
 * Bridges the single-handler WS transport API to a multi-listener
 * subscription model for task status updates. Handles WebSocket
 * disconnects gracefully — listeners are preserved across reconnects.
 */
export class TaskEventEmitter {
  private readonly listeners = new Set<TaskEventListener>();
  private bound = false;

  constructor(private readonly transport: DaemonWsTransport) {}

  public subscribe(listener: TaskEventListener): TaskEventSubscription {
    this.listeners.add(listener);
    this.ensureBound();

    return {
      unsubscribe: () => {
        this.listeners.delete(listener);
      },
    };
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public clear(): void {
    this.listeners.clear();
  }

  private dispatch(event: TaskUpdateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors to prevent cascade failures.
      }
    }
  }

  private ensureBound(): void {
    if (this.bound) {
      return;
    }

    this.bound = true;
    this.transport.setTaskUpdateHandler((event) => {
      this.dispatch(event);
    });
  }
}
