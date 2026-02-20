import { useCallback, useEffect, useReducer, useRef } from "react";

import { useThemeTokens, type ThemeTokens } from "../theme";
import type { ThemeTokenName } from "../theme/theme-schema";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocumentsPanelProps {
  visible: boolean;
  onClose: () => void;
  daemonBaseUrl: string;
  onIndexComplete?: () => void;
  refreshTrigger?: number;
}

// ---------------------------------------------------------------------------
// Response types from daemon API
// ---------------------------------------------------------------------------

export type DocumentSourceStatus =
  | "registered"
  | "indexing"
  | "indexed"
  | "error"
  | "removed";

export interface DocumentSourceResponse {
  id: string;
  rootPath: string;
  name: string;
  status: DocumentSourceStatus;
  lastIndexedAt?: string;
  fileCount?: number;
  errorMessage?: string;
  registeredAt: string;
}

export interface DocumentSourcesResponse {
  sources: DocumentSourceResponse[];
}

// ---------------------------------------------------------------------------
// Utility functions (exported for testability)
// ---------------------------------------------------------------------------

export function formatLastIndexed(isoString: string | undefined): string {
  if (!isoString) {
    return "Never";
  }

  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) {
    return "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
}

export function statusBadge(status: DocumentSourceStatus): string {
  switch (status) {
    case "indexed":
      return "indexed";
    case "indexing":
      return "indexing...";
    case "error":
      return "error";
    case "registered":
      return "pending";
    case "removed":
      return "removed";
  }
}

export function statusColorToken(status: DocumentSourceStatus): ThemeTokenName {
  switch (status) {
    case "indexed":
      return "status.success";
    case "indexing":
      return "status.warning";
    case "error":
      return "status.error";
    default:
      return "text.muted";
  }
}

// ---------------------------------------------------------------------------
// State machine (exported for tests)
// ---------------------------------------------------------------------------

export interface PanelState {
  readonly fetchState: "idle" | "loading" | "success" | "error";
  readonly sources: DocumentSourceResponse[];
  readonly selectedIndex: number;
  readonly errorMessage: string | null;
  readonly confirmingRemoveId: string | null;
  readonly reindexingId: string | null;
}

export type PanelAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; sources: DocumentSourceResponse[] }
  | { type: "FETCH_ERROR"; message: string }
  | { type: "RESET" }
  | { type: "SELECT_UP" }
  | { type: "SELECT_DOWN" }
  | { type: "CONFIRM_REMOVE"; id: string }
  | { type: "CANCEL_REMOVE" }
  | { type: "REINDEX_START"; id: string }
  | { type: "REINDEX_DONE" };

export const INITIAL_STATE: PanelState = {
  fetchState: "idle",
  sources: [],
  selectedIndex: 0,
  errorMessage: null,
  confirmingRemoveId: null,
  reindexingId: null,
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, fetchState: "loading", errorMessage: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        fetchState: "success",
        sources: action.sources,
        errorMessage: null,
        selectedIndex: Math.min(
          state.selectedIndex,
          Math.max(0, action.sources.length - 1),
        ),
      };
    case "FETCH_ERROR":
      return { ...state, fetchState: "error", errorMessage: action.message };
    case "RESET":
      return INITIAL_STATE;
    case "SELECT_UP":
      return {
        ...state,
        selectedIndex: Math.max(0, state.selectedIndex - 1),
      };
    case "SELECT_DOWN":
      return {
        ...state,
        selectedIndex: Math.min(
          state.sources.length - 1,
          state.selectedIndex + 1,
        ),
      };
    case "CONFIRM_REMOVE":
      return { ...state, confirmingRemoveId: action.id };
    case "CANCEL_REMOVE":
      return { ...state, confirmingRemoveId: null };
    case "REINDEX_START":
      return { ...state, reindexingId: action.id };
    case "REINDEX_DONE":
      return { ...state, reindexingId: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSources(baseUrl: string): Promise<DocumentSourceResponse[]> {
  const response = await fetch(`${baseUrl}/api/documents/sources`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as DocumentSourcesResponse;
  return data.sources ?? [];
}

async function triggerReindex(baseUrl: string, id: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/documents/sources/${id}/reindex`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function removeSource(baseUrl: string, id: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/documents/sources/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

// ---------------------------------------------------------------------------
// Section header (matches BrowserPanel pattern)
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  isSelected,
  tokens,
}: {
  title: string;
  isSelected: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const indicator = isSelected ? "▸ " : "  ";
  const color = isSelected ? tokens["accent.primary"] : tokens["text.muted"];
  return (
    <Box style={{ flexDirection: "row", marginTop: 1 }}>
      <Text content={indicator} style={{ color: tokens["accent.primary"] }} />
      <Text content={`── ${title} ──`} style={{ color }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Source row
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  isSelected,
  isReindexing,
  tokens,
}: {
  source: DocumentSourceResponse;
  isSelected: boolean;
  isReindexing: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const prefix = isSelected ? "  ▸ " : "    ";
  const nameColor = isSelected ? tokens["text.primary"] : tokens["text.secondary"];

  const badge = isReindexing ? "re-indexing..." : statusBadge(source.status);
  const badgeColor = isReindexing
    ? tokens["status.warning"]
    : tokens[statusColorToken(source.status)];

  const fileCountText = source.fileCount !== undefined
    ? ` (${source.fileCount} files)`
    : "";

  return (
    <Box style={{ flexDirection: "row" }}>
      <Text content={prefix} style={{ color: tokens["accent.primary"] }} />
      <Text content={source.name} style={{ color: nameColor }} />
      <Text content={fileCountText} style={{ color: tokens["text.muted"] }} />
      <Text content="  " />
      <Text content={`● ${badge}`} style={{ color: badgeColor }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 3000;

export function DocumentsPanel(props: DocumentsPanelProps) {
  const { visible, onClose, daemonBaseUrl, onIndexComplete, refreshTrigger } = props;
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const sources = await fetchSources(daemonBaseUrl);
      dispatch({ type: "FETCH_SUCCESS", sources });
    } catch {
      dispatch({ type: "FETCH_ERROR", message: "Unable to reach daemon" });
    }
  }, [daemonBaseUrl]);

  // Fetch on open and auto-refresh every 3 seconds
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

  // Re-fetch when refreshTrigger changes (parent pushes updates)
  useEffect(() => {
    if (visible && refreshTrigger !== undefined) {
      void doFetch();
    }
  }, [refreshTrigger, visible, doFetch]);

  const doReindex = useCallback(async (id: string) => {
    dispatch({ type: "REINDEX_START", id });
    try {
      await triggerReindex(daemonBaseUrl, id);
    } catch {
      // Reindex failed — refresh will show current state
    }
    dispatch({ type: "REINDEX_DONE" });
    void doFetch();
    onIndexComplete?.();
  }, [daemonBaseUrl, doFetch, onIndexComplete]);

  const doRemove = useCallback(async (id: string) => {
    try {
      await removeSource(daemonBaseUrl, id);
    } catch {
      // Remove failed — refresh will show current state
    }
    dispatch({ type: "CANCEL_REMOVE" });
    void doFetch();
  }, [daemonBaseUrl, doFetch]);

  // Keyboard navigation
  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // When confirmation is pending, only Enter and Escape/q are active
    if (state.confirmingRemoveId !== null) {
      if (keyName === "return" || keyName === "enter") {
        void doRemove(state.confirmingRemoveId);
        return;
      }
      if (keyName === "escape" || keyName === "esc" || sequence === "q") {
        dispatch({ type: "CANCEL_REMOVE" });
        return;
      }
      return;
    }

    // Close panel
    if (keyName === "escape" || keyName === "esc" || sequence === "q") {
      onClose();
      return;
    }

    // Navigate down
    if (keyName === "down" || sequence === "j") {
      dispatch({ type: "SELECT_DOWN" });
      return;
    }

    // Navigate up
    if (keyName === "up" || sequence === "k") {
      dispatch({ type: "SELECT_UP" });
      return;
    }

    // Re-index selected source
    if (sequence === "r" && state.sources.length > 0 && state.reindexingId === null) {
      const selected = state.sources[state.selectedIndex];
      if (selected) {
        void doReindex(selected.id);
      }
      return;
    }

    // Remove selected source (show confirmation)
    if (sequence === "x" && state.sources.length > 0) {
      const selected = state.sources[state.selectedIndex];
      if (selected) {
        dispatch({ type: "CONFIRM_REMOVE", id: selected.id });
      }
      return;
    }
  }, [visible, onClose, state.confirmingRemoveId, state.sources, state.selectedIndex, state.reindexingId, doReindex, doRemove]));

  // Derive selected source for detail view
  const selectedSource = state.sources.length > 0
    ? state.sources[state.selectedIndex]
    : undefined;

  // Find source name for confirmation prompt
  const confirmingSource = state.confirmingRemoveId !== null
    ? state.sources.find((s) => s.id === state.confirmingRemoveId)
    : undefined;

  const hintText = "q close · j/k navigate · r re-index · x remove";

  return (
    <ModalPanel
      visible={visible}
      title="Documents"
      hint={hintText}
      width={68}
      height={24}
      closeOnEscape={false}
      onClose={onClose}
    >
      {/* Loading state */}
      {state.fetchState === "loading" && state.sources.length === 0 ? (
        <Box style={{ flexDirection: "column" }}>
          <Text content="Loading sources..." style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}

      {/* Error state — daemon unreachable */}
      {state.fetchState === "error" && state.sources.length === 0 ? (
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

      {/* Success state — empty */}
      {state.fetchState === "success" && state.sources.length === 0 ? (
        <Box style={{ flexDirection: "column" }}>
          <Text
            content="No document sources registered."
            style={{ color: tokens["text.muted"] }}
          />
          <Box style={{ flexDirection: "row", marginTop: 1 }}>
            <Text
              content="Use index_document tool to add sources."
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        </Box>
      ) : null}

      {/* Success state — source list */}
      {state.sources.length > 0 ? (
        <Box style={{ flexDirection: "column" }}>
          <SectionHeader
            title={`Sources (${state.sources.length})`}
            isSelected={true}
            tokens={tokens}
          />
          {state.sources.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              isSelected={index === state.selectedIndex}
              isReindexing={state.reindexingId === source.id}
              tokens={tokens}
            />
          ))}

          {/* Detail row for selected source */}
          {selectedSource ? (
            <Box style={{ flexDirection: "column", marginTop: 1 }}>
              <Box style={{ flexDirection: "row" }}>
                <Text content="  Path: " style={{ color: tokens["text.muted"] }} />
                <Text content={selectedSource.rootPath} style={{ color: tokens["text.secondary"] }} />
              </Box>
              <Box style={{ flexDirection: "row" }}>
                <Text content="  Last indexed: " style={{ color: tokens["text.muted"] }} />
                <Text
                  content={formatLastIndexed(selectedSource.lastIndexedAt)}
                  style={{ color: tokens["text.secondary"] }}
                />
              </Box>
              {selectedSource.errorMessage ? (
                <Box style={{ flexDirection: "row" }}>
                  <Text content="  Error: " style={{ color: tokens["status.error"] }} />
                  <Text content={selectedSource.errorMessage} style={{ color: tokens["status.error"] }} />
                </Box>
              ) : null}
            </Box>
          ) : null}

          {/* Confirmation prompt */}
          {confirmingSource ? (
            <Box style={{ flexDirection: "column", marginTop: 1 }}>
              <Box style={{ flexDirection: "row" }}>
                <Text content="  ⚠ " style={{ color: tokens["status.warning"] }} />
                <Text
                  content={`Remove "${confirmingSource.name}"? This will clear all indexed chunks.`}
                  style={{ color: tokens["status.warning"] }}
                />
              </Box>
              <Box style={{ flexDirection: "row" }}>
                <Text
                  content="  Press Enter to confirm, Esc to cancel."
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </ModalPanel>
  );
}
