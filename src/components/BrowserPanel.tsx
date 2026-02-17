import { useCallback, useEffect, useReducer, useRef } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BrowserPanelProps {
  visible: boolean;
  onClose: () => void;
  daemonBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Response type from /api/browser/status
// ---------------------------------------------------------------------------

export interface BrowserStatusResponse {
  status: "running" | "stopped";
  pid?: number;
  tabCount?: number;
  memoryUsageMb?: number;
  profilePath?: string;
  uptimeMs?: number;
  headless?: boolean;
}

// ---------------------------------------------------------------------------
// Uptime formatting
// ---------------------------------------------------------------------------

export function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (totalSeconds < 3600) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type FetchState = "idle" | "loading" | "success" | "error";

interface PanelState {
  readonly fetchState: FetchState;
  readonly browserStatus: BrowserStatusResponse | null;
  readonly errorMessage: string | null;
}

type PanelAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; data: BrowserStatusResponse }
  | { type: "FETCH_ERROR"; message: string }
  | { type: "RESET" };

const INITIAL_STATE: PanelState = {
  fetchState: "idle",
  browserStatus: null,
  errorMessage: null,
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, fetchState: "loading", errorMessage: null };
    case "FETCH_SUCCESS":
      return { ...state, fetchState: "success", browserStatus: action.data, errorMessage: null };
    case "FETCH_ERROR":
      return { ...state, fetchState: "error", errorMessage: action.message };
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchBrowserStatus(
  baseUrl: string,
): Promise<BrowserStatusResponse> {
  const response = await fetch(`${baseUrl}/api/browser/status`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as BrowserStatusResponse;
}

// ---------------------------------------------------------------------------
// Status field row
// ---------------------------------------------------------------------------

function StatusRow({
  label,
  value,
  valueColor,
  tokens,
}: {
  label: string;
  value: string;
  valueColor?: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "row" }}>
      <Text content={`${label}: `} style={{ color: tokens["text.muted"] }} />
      <Text content={value} style={{ color: valueColor ?? tokens["text.secondary"] }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 5000;

export function BrowserPanel({ visible, onClose, daemonBaseUrl }: BrowserPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const data = await fetchBrowserStatus(daemonBaseUrl);
      dispatch({ type: "FETCH_SUCCESS", data });
    } catch {
      dispatch({ type: "FETCH_ERROR", message: "Unable to reach daemon" });
    }
  }, [daemonBaseUrl]);

  // Fetch on open and auto-refresh every 5 seconds
  useEffect(() => {
    if (!visible) {
      // Reset state when panel closes
      dispatch({ type: "RESET" });
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    void doFetch();

    // Set up auto-refresh
    intervalRef.current = setInterval(() => {
      void doFetch();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, doFetch]);

  // Keyboard: Escape or q to close
  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (keyName === "escape" || keyName === "esc" || sequence === "q") {
      onClose();
    }
  }, [visible, onClose]));

  // Derive display content
  const browserStatus = state.browserStatus;
  const isRunning = browserStatus?.status === "running";

  const statusGlyph = isRunning ? "●" : "●";
  const statusColor = isRunning ? tokens["status.success"] : tokens["status.error"];
  const statusLabel = isRunning ? "Running" : "Stopped";

  const hintText = "q close · auto-refreshes every 5s";

  return (
    <ModalPanel
      visible={visible}
      title="Browser"
      hint={hintText}
      width={60}
      height={16}
      closeOnEscape={false}
      onClose={onClose}
    >
      {/* Loading state */}
      {state.fetchState === "loading" && state.browserStatus === null ? (
        <Box style={{ flexDirection: "column" }}>
          <Text content="Loading browser status..." style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}

      {/* Error state — daemon unreachable */}
      {state.fetchState === "error" && state.browserStatus === null ? (
        <Box style={{ flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text content="● " style={{ color: tokens["status.error"] }} />
            <Text content="Unable to reach daemon" style={{ color: tokens["text.secondary"] }} />
          </Box>
          <Box style={{ flexDirection: "row", marginTop: 1 }}>
            <Text
              content="Ensure the daemon is running and try again."
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        </Box>
      ) : null}

      {/* Success state — browser status available */}
      {browserStatus !== null ? (
        <Box style={{ flexDirection: "column" }}>
          {/* Status line */}
          <Box style={{ flexDirection: "row", marginBottom: 1 }}>
            <Text content={statusGlyph} style={{ color: statusColor }} />
            <Text content={` ${statusLabel}`} style={{ color: statusColor }} />
          </Box>

          {isRunning ? (
            <Box style={{ flexDirection: "column" }}>
              {browserStatus.pid !== undefined ? (
                <StatusRow label="PID" value={String(browserStatus.pid)} tokens={tokens} />
              ) : null}
              {browserStatus.tabCount !== undefined ? (
                <StatusRow label="Tabs" value={String(browserStatus.tabCount)} tokens={tokens} />
              ) : null}
              {browserStatus.memoryUsageMb !== undefined ? (
                <StatusRow
                  label="Memory"
                  value={`${browserStatus.memoryUsageMb.toFixed(1)} MB`}
                  tokens={tokens}
                />
              ) : null}
              {browserStatus.uptimeMs !== undefined ? (
                <StatusRow label="Uptime" value={formatUptime(browserStatus.uptimeMs)} tokens={tokens} />
              ) : null}
              {browserStatus.profilePath !== undefined ? (
                <StatusRow label="Profile" value={browserStatus.profilePath} tokens={tokens} />
              ) : null}
              <StatusRow
                label="Mode"
                value={browserStatus.headless === false ? "Headed" : "Headless"}
                tokens={tokens}
              />
            </Box>
          ) : (
            <Box style={{ flexDirection: "row", marginTop: 1 }}>
              <Text
                content="Browser not running — use /browser headed to start"
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          )}
        </Box>
      ) : null}
    </ModalPanel>
  );
}
