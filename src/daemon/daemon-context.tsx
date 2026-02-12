import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { DaemonClient } from "./client";
import type { DaemonConnectionStatus } from "./contracts";
import { LiveDaemonClient } from "./live-daemon-client";
import { MockDaemonClient } from "./mock-daemon";

export type DaemonMode = "live" | "mock";

export interface DaemonContextValue {
  client: DaemonClient;
  connectionStatus: DaemonConnectionStatus;
  isConnected: boolean;
  mode: DaemonMode;
}

export interface DaemonBootstrapResult {
  client: DaemonClient;
  connectionStatus: DaemonConnectionStatus;
  mode: DaemonMode;
}

export interface DaemonBootstrapOptions {
  createLiveClient?: () => DaemonClient;
  createMockClient?: () => DaemonClient;
}

const DEFAULT_MOCK_CLIENT: DaemonClient = new MockDaemonClient();

const DEFAULT_CONTEXT_VALUE: DaemonContextValue = {
  client: DEFAULT_MOCK_CLIENT,
  connectionStatus: "connecting",
  isConnected: false,
  mode: "mock",
};

const DaemonContext = createContext<DaemonContextValue>(DEFAULT_CONTEXT_VALUE);

export async function bootstrapDaemonClient(options: DaemonBootstrapOptions = {}): Promise<DaemonBootstrapResult> {
  const liveClient = options.createLiveClient?.() ?? new LiveDaemonClient();
  const liveConnect = await liveClient.connect();
  if (liveConnect.ok) {
    return {
      client: liveClient,
      connectionStatus: "connected",
      mode: "live",
    };
  }

  const mockClient = options.createMockClient?.() ?? new MockDaemonClient();
  const mockConnect = await mockClient.connect();
  if (!mockConnect.ok) {
    return {
      client: mockClient,
      connectionStatus: "disconnected",
      mode: "mock",
    };
  }

  return {
    client: mockClient,
    connectionStatus: "disconnected",
    mode: "mock",
  };
}

export interface DaemonProviderProps {
  children: ReactNode;
}

export function DaemonProvider({ children }: DaemonProviderProps) {
  const [contextValue, setContextValue] = useState<DaemonContextValue>(DEFAULT_CONTEXT_VALUE);

  useEffect(() => {
    let mounted = true;
    let teardown: (() => void) | null = null;

    const initialize = async () => {
      const result = await bootstrapDaemonClient();
      if (!mounted) {
        return;
      }

      const initialStatus = result.mode === "live" ? result.client.getConnectionState().status : "disconnected";

      setContextValue({
        client: result.client,
        connectionStatus: initialStatus,
        isConnected: result.mode === "live" && initialStatus === "connected",
        mode: result.mode,
      });

      teardown = result.client.onConnectionStateChange((state) => {
        if (!mounted) {
          return;
        }

        const nextStatus = result.mode === "live" ? state.status : "disconnected";
        setContextValue((current) => ({
          ...current,
          connectionStatus: nextStatus,
          isConnected: result.mode === "live" && nextStatus === "connected",
        }));
      });
    };

    void initialize();

    return () => {
      mounted = false;
      if (teardown) {
        teardown();
      }
    };
  }, []);

  const value = useMemo(() => contextValue, [contextValue]);
  return <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>;
}

export function useDaemon(): DaemonContextValue {
  return useContext(DaemonContext);
}
