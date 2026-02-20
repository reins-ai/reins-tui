import { useCallback, useEffect, useReducer, useRef } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SchedulePanelProps {
  visible: boolean;
  onClose: () => void;
  daemonBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Response types from /api/schedule/list and /api/schedule/cancel
// ---------------------------------------------------------------------------

export interface ScheduleItem {
  id: string;
  type: "cron";
  title: string;
  schedule: string;
  nextRunAt: string | null;
  humanReadable: string;
}

export interface ScheduleListResponse {
  items: ScheduleItem[];
  error?: string;
}

export interface ScheduleCancelResponse {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) {
    return "unknown";
  }

  const target = Date.parse(isoString);
  if (Number.isNaN(target)) {
    return "unknown";
  }

  const now = Date.now();
  const diffMs = target - now;

  if (diffMs < 0) {
    return "overdue";
  }

  const totalSeconds = Math.floor(diffMs / 1000);

  if (totalSeconds < 60) {
    return `in ${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `in ${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `in ${hours}h ${remainingMinutes}m` : `in ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `in ${days}d ${remainingHours}h` : `in ${days}d`;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type FetchState = "idle" | "loading" | "success" | "error";

interface PanelState {
  readonly fetchState: FetchState;
  readonly items: ScheduleItem[];
  readonly errorMessage: string | null;
  readonly selectedIndex: number;
  readonly cancellingId: string | null;
}

type PanelAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; items: ScheduleItem[] }
  | { type: "FETCH_ERROR"; message: string }
  | { type: "RESET" }
  | { type: "SELECT_NEXT" }
  | { type: "SELECT_PREV" }
  | { type: "CANCEL_START"; id: string }
  | { type: "CANCEL_DONE" };

export const INITIAL_STATE: PanelState = {
  fetchState: "idle",
  items: [],
  errorMessage: null,
  selectedIndex: 0,
  cancellingId: null,
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, fetchState: "loading", errorMessage: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        fetchState: "success",
        items: action.items,
        errorMessage: null,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.items.length - 1)),
      };
    case "FETCH_ERROR":
      return { ...state, fetchState: "error", errorMessage: action.message };
    case "RESET":
      return INITIAL_STATE;
    case "SELECT_NEXT":
      return {
        ...state,
        selectedIndex: state.items.length > 0
          ? Math.min(state.selectedIndex + 1, state.items.length - 1)
          : 0,
      };
    case "SELECT_PREV":
      return {
        ...state,
        selectedIndex: Math.max(state.selectedIndex - 1, 0),
      };
    case "CANCEL_START":
      return { ...state, cancellingId: action.id };
    case "CANCEL_DONE":
      return { ...state, cancellingId: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchScheduleList(baseUrl: string): Promise<ScheduleItem[]> {
  const response = await fetch(`${baseUrl}/api/schedule/list`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as ScheduleListResponse;
  return data.items;
}

async function cancelScheduleItem(baseUrl: string, id: string, type: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/schedule/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, type }),
  });
  if (!response.ok) {
    const data = (await response.json()) as ScheduleCancelResponse;
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// Schedule item row
// ---------------------------------------------------------------------------

function ScheduleItemRow({
  item,
  isSelected,
  isCancelling,
  tokens,
}: {
  item: ScheduleItem;
  isSelected: boolean;
  isCancelling: boolean;
  tokens: Record<string, string>;
}) {
  const relativeTime = formatRelativeTime(item.nextRunAt);
  const timeColor = relativeTime === "overdue" ? tokens["status.error"] : tokens["text.muted"];
  const titleColor = isSelected ? tokens["accent.primary"] : tokens["text.secondary"];
  const indicator = isSelected ? "▸ " : "  ";

  return (
    <Box style={{ flexDirection: "column", marginBottom: 0 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content={indicator} style={{ color: tokens["accent.primary"] }} />
        <Text content={item.title} style={{ color: titleColor }} />
        <Text content={`  ${relativeTime}`} style={{ color: timeColor }} />
        {isCancelling ? (
          <Text content="  cancelling..." style={{ color: tokens["status.warning"] }} />
        ) : null}
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text content="    " />
        <Text content={item.humanReadable} style={{ color: tokens["text.muted"] }} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30_000;

export function SchedulePanel({ visible, onClose, daemonBaseUrl }: SchedulePanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const items = await fetchScheduleList(daemonBaseUrl);
      dispatch({ type: "FETCH_SUCCESS", items });
    } catch {
      dispatch({ type: "FETCH_ERROR", message: "Unable to reach daemon" });
    }
  }, [daemonBaseUrl]);

  const doCancel = useCallback(async (item: ScheduleItem) => {
    dispatch({ type: "CANCEL_START", id: item.id });
    try {
      await cancelScheduleItem(daemonBaseUrl, item.id, item.type);
    } catch {
      // Cancel failed — refresh will show current state
    }
    dispatch({ type: "CANCEL_DONE" });
    // Refresh list after cancel
    void doFetch();
  }, [daemonBaseUrl, doFetch]);

  // Fetch on open and auto-refresh every 30 seconds
  useEffect(() => {
    if (!visible) {
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

  // Keyboard: Escape/q to close, j/k or arrows to navigate, x/d to cancel
  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (keyName === "escape" || keyName === "esc" || sequence === "q") {
      onClose();
      return;
    }

    if (keyName === "down" || sequence === "j") {
      dispatch({ type: "SELECT_NEXT" });
      return;
    }

    if (keyName === "up" || sequence === "k") {
      dispatch({ type: "SELECT_PREV" });
      return;
    }

    if ((sequence === "x" || sequence === "d") && state.items.length > 0 && state.cancellingId === null) {
      const selectedItem = state.items[state.selectedIndex];
      if (selectedItem) {
        void doCancel(selectedItem);
      }
    }
  }, [visible, onClose, state.items, state.selectedIndex, state.cancellingId, doCancel]));

  const hintText = "q close · j/k navigate · x cancel · auto-refreshes every 30s";

  return (
    <ModalPanel
      visible={visible}
      title="Schedule"
      hint={hintText}
      width={64}
      height={20}
      closeOnEscape={false}
      onClose={onClose}
    >
      {/* Loading state — first load only */}
      {state.fetchState === "loading" && state.items.length === 0 ? (
        <Box style={{ flexDirection: "column" }}>
          <Text content="Loading scheduled tasks..." style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}

      {/* Error state — daemon unreachable */}
      {state.fetchState === "error" && state.items.length === 0 ? (
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

      {/* Empty state — no scheduled items */}
      {state.fetchState === "success" && state.items.length === 0 ? (
        <Box style={{ flexDirection: "column" }}>
          <Text
            content="No scheduled tasks or reminders"
            style={{ color: tokens["text.muted"] }}
          />
          <Box style={{ flexDirection: "row", marginTop: 1 }}>
            <Text
              content="Use /schedule or ask Reins to set up recurring tasks."
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        </Box>
      ) : null}

      {/* Success state — list of items */}
      {state.items.length > 0 ? (
        <Box style={{ flexDirection: "column" }}>
          {state.items.map((item, index) => (
            <ScheduleItemRow
              key={item.id}
              item={item}
              isSelected={index === state.selectedIndex}
              isCancelling={state.cancellingId === item.id}
              tokens={tokens}
            />
          ))}
        </Box>
      ) : null}
    </ModalPanel>
  );
}
