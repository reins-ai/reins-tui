import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

import { useThemeTokens, type ThemeTokens } from "../theme";
import type { ThemeTokenName } from "../theme/theme-schema";
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
// Response types from daemon API
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

export interface TabInfo {
  tabId: string;
  url: string;
  title: string;
  active: boolean;
}

export interface TabsResponse {
  tabs: TabInfo[];
}

export interface SnapshotResponse {
  snapshot: string;
  tabId?: string;
  url?: string;
}

export interface WatcherInfo {
  id: string;
  url: string;
  intervalSeconds: number;
  status: "active" | "paused" | "error";
  createdAt: number;
}

export interface WatchersResponse {
  watchers: WatcherInfo[];
}

// ---------------------------------------------------------------------------
// Extraction mode
// ---------------------------------------------------------------------------

export type ExtractionMode = "full" | "smart" | "lean";

export const EXTRACTION_MODES: ExtractionMode[] = ["full", "smart", "lean"];

export const DEFAULT_EXTRACTION_MODE: ExtractionMode = "smart";

export const PREFS_DIR = join(homedir(), ".reins");
export const PREFS_PATH = join(PREFS_DIR, "tui-prefs.json");

interface TuiPrefs {
  extractionMode?: ExtractionMode;
}

export async function loadExtractionMode(): Promise<ExtractionMode> {
  try {
    const file = Bun.file(PREFS_PATH);
    const exists = await file.exists();
    if (!exists) {
      return DEFAULT_EXTRACTION_MODE;
    }
    const prefs = (await file.json()) as TuiPrefs;
    if (prefs.extractionMode && EXTRACTION_MODES.includes(prefs.extractionMode)) {
      return prefs.extractionMode;
    }
    return DEFAULT_EXTRACTION_MODE;
  } catch {
    return DEFAULT_EXTRACTION_MODE;
  }
}

export async function saveExtractionMode(mode: ExtractionMode): Promise<void> {
  try {
    await mkdir(PREFS_DIR, { recursive: true });
    let prefs: TuiPrefs = {};
    try {
      const file = Bun.file(PREFS_PATH);
      const exists = await file.exists();
      if (exists) {
        prefs = (await file.json()) as TuiPrefs;
      }
    } catch {
      // Start fresh if file is corrupt
    }
    prefs.extractionMode = mode;
    await Bun.write(PREFS_PATH, JSON.stringify(prefs, null, 2) + "\n");
  } catch {
    // Silently fail — preference persistence is best-effort
  }
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
// Snapshot truncation
// ---------------------------------------------------------------------------

export const SNAPSHOT_TRUNCATE_LINES = 50;

export function truncateSnapshot(snapshot: string, maxLines: number): string {
  const lines = snapshot.split("\n");
  if (lines.length <= maxLines) {
    return snapshot;
  }
  return lines.slice(0, maxLines).join("\n");
}

export function snapshotLineCount(snapshot: string): number {
  return snapshot.split("\n").length;
}

// ---------------------------------------------------------------------------
// Status label derivation
// ---------------------------------------------------------------------------

export type BrowserActivity = "idle" | "navigating" | "acting" | "watching";

export function deriveBrowserActivity(
  status: BrowserStatusResponse | null,
  watcherCount: number,
): BrowserActivity {
  if (!status || status.status !== "running") {
    return "idle";
  }
  if (watcherCount > 0) {
    return "watching";
  }
  return "idle";
}

export function activityLabel(activity: BrowserActivity): string {
  switch (activity) {
    case "idle":
      return "Idle";
    case "navigating":
      return "Navigating";
    case "acting":
      return "Acting";
    case "watching":
      return "Watching";
  }
}

export function activityColorToken(activity: BrowserActivity): ThemeTokenName {
  switch (activity) {
    case "idle":
      return "text.muted";
    case "navigating":
      return "status.info";
    case "acting":
      return "status.warning";
    case "watching":
      return "status.success";
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type FetchState = "idle" | "loading" | "success" | "error";

export interface PanelState {
  readonly fetchState: FetchState;
  readonly browserStatus: BrowserStatusResponse | null;
  readonly tabs: TabInfo[];
  readonly snapshot: string | null;
  readonly snapshotExpanded: boolean;
  readonly watchers: WatcherInfo[];
  readonly extractionMode: ExtractionMode;
  readonly removingWatcherId: string | null;
  readonly errorMessage: string | null;
  readonly selectedSection: number;
}

export type PanelAction =
  | { type: "FETCH_START" }
  | {
      type: "FETCH_SUCCESS";
      status: BrowserStatusResponse;
      tabs: TabInfo[];
      snapshot: string | null;
      watchers: WatcherInfo[];
    }
  | { type: "FETCH_ERROR"; message: string }
  | { type: "RESET" }
  | { type: "TOGGLE_SNAPSHOT_EXPAND" }
  | { type: "SET_EXTRACTION_MODE"; mode: ExtractionMode }
  | { type: "REMOVE_WATCHER_START"; id: string }
  | { type: "REMOVE_WATCHER_DONE" }
  | { type: "SELECT_SECTION"; index: number };

export const INITIAL_STATE: PanelState = {
  fetchState: "idle",
  browserStatus: null,
  tabs: [],
  snapshot: null,
  snapshotExpanded: false,
  watchers: [],
  extractionMode: DEFAULT_EXTRACTION_MODE,
  removingWatcherId: null,
  errorMessage: null,
  selectedSection: 0,
};

export const SECTION_COUNT = 5; // Status, Tabs, Snapshot, Watchers, Extraction Mode

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, fetchState: "loading", errorMessage: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        fetchState: "success",
        browserStatus: action.status,
        tabs: action.tabs,
        snapshot: action.snapshot,
        watchers: action.watchers,
        errorMessage: null,
      };
    case "FETCH_ERROR":
      return { ...state, fetchState: "error", errorMessage: action.message };
    case "RESET":
      return INITIAL_STATE;
    case "TOGGLE_SNAPSHOT_EXPAND":
      return { ...state, snapshotExpanded: !state.snapshotExpanded };
    case "SET_EXTRACTION_MODE":
      return { ...state, extractionMode: action.mode };
    case "REMOVE_WATCHER_START":
      return { ...state, removingWatcherId: action.id };
    case "REMOVE_WATCHER_DONE":
      return { ...state, removingWatcherId: null };
    case "SELECT_SECTION":
      return {
        ...state,
        selectedSection: Math.max(0, Math.min(action.index, SECTION_COUNT - 1)),
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
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

async function fetchTabs(baseUrl: string): Promise<TabInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/api/browser/tabs`);
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as TabsResponse;
    return data.tabs ?? [];
  } catch {
    return [];
  }
}

async function fetchSnapshot(
  baseUrl: string,
  mode: ExtractionMode,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${baseUrl}/api/browser/snapshot?mode=${mode}`,
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as SnapshotResponse;
    return data.snapshot ?? null;
  } catch {
    return null;
  }
}

async function fetchWatchers(baseUrl: string): Promise<WatcherInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/api/browser/watchers`);
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as WatchersResponse;
    return data.watchers ?? [];
  } catch {
    return [];
  }
}

async function removeWatcher(baseUrl: string, id: string): Promise<void> {
  await fetch(`${baseUrl}/api/browser/watchers/${id}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Section header
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
  tokens: Readonly<ThemeTokens>;
}) {
  return (
    <Box style={{ flexDirection: "row" }}>
      <Text content={`  ${label}: `} style={{ color: tokens["text.muted"] }} />
      <Text content={value} style={{ color: valueColor ?? tokens["text.secondary"] }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 1000;

export function BrowserPanel({ visible, onClose, daemonBaseUrl }: BrowserPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [modeLoaded, setModeLoaded] = useState(false);

  // Load extraction mode from preferences on mount
  useEffect(() => {
    if (!visible || modeLoaded) return;
    void loadExtractionMode().then((mode) => {
      dispatch({ type: "SET_EXTRACTION_MODE", mode });
      setModeLoaded(true);
    });
  }, [visible, modeLoaded]);

  // Reset modeLoaded when panel closes
  useEffect(() => {
    if (!visible) {
      setModeLoaded(false);
    }
  }, [visible]);

  const doFetch = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const [statusData, tabsData, snapshotData, watchersData] = await Promise.all([
        fetchBrowserStatus(daemonBaseUrl),
        fetchTabs(daemonBaseUrl),
        fetchSnapshot(daemonBaseUrl, state.extractionMode),
        fetchWatchers(daemonBaseUrl),
      ]);
      dispatch({
        type: "FETCH_SUCCESS",
        status: statusData,
        tabs: tabsData,
        snapshot: snapshotData,
        watchers: watchersData,
      });
    } catch {
      dispatch({ type: "FETCH_ERROR", message: "Unable to reach daemon" });
    }
  }, [daemonBaseUrl, state.extractionMode]);

  // Fetch on open and auto-refresh every 1 second
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

  const doRemoveWatcher = useCallback(async (id: string) => {
    dispatch({ type: "REMOVE_WATCHER_START", id });
    try {
      await removeWatcher(daemonBaseUrl, id);
    } catch {
      // Remove failed — refresh will show current state
    }
    dispatch({ type: "REMOVE_WATCHER_DONE" });
    void doFetch();
  }, [daemonBaseUrl, doFetch]);

  const cycleExtractionMode = useCallback(() => {
    const currentIndex = EXTRACTION_MODES.indexOf(state.extractionMode);
    const nextIndex = (currentIndex + 1) % EXTRACTION_MODES.length;
    const nextMode = EXTRACTION_MODES[nextIndex];
    dispatch({ type: "SET_EXTRACTION_MODE", mode: nextMode });
    void saveExtractionMode(nextMode);
  }, [state.extractionMode]);

  // Keyboard: Escape/q to close, j/k navigate sections, e expand snapshot,
  // m cycle extraction mode, x remove watcher
  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (keyName === "escape" || keyName === "esc" || sequence === "q") {
      onClose();
      return;
    }

    if (keyName === "down" || sequence === "j") {
      dispatch({ type: "SELECT_SECTION", index: state.selectedSection + 1 });
      return;
    }

    if (keyName === "up" || sequence === "k") {
      dispatch({ type: "SELECT_SECTION", index: state.selectedSection - 1 });
      return;
    }

    if (sequence === "e") {
      dispatch({ type: "TOGGLE_SNAPSHOT_EXPAND" });
      return;
    }

    if (sequence === "m") {
      cycleExtractionMode();
      return;
    }

    if (sequence === "x" && state.watchers.length > 0 && state.removingWatcherId === null) {
      const firstWatcher = state.watchers[0];
      if (firstWatcher) {
        void doRemoveWatcher(firstWatcher.id);
      }
    }
  }, [visible, onClose, state.selectedSection, state.watchers, state.removingWatcherId, cycleExtractionMode, doRemoveWatcher]));

  // Derive display content
  const browserStatus = state.browserStatus;
  const isRunning = browserStatus?.status === "running";
  const activity = deriveBrowserActivity(browserStatus, state.watchers.length);

  const statusGlyph = isRunning ? "●" : "●";
  const statusColor = isRunning ? tokens["status.success"] : tokens["status.error"];
  const statusLabel = isRunning ? "Running" : "Stopped";

  const hintText = "q close · j/k sections · e expand · m mode · x remove watcher";

  return (
    <ModalPanel
      visible={visible}
      title="Browser"
      hint={hintText}
      width={72}
      height={30}
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

      {/* Success state — browser data available */}
      {browserStatus !== null ? (
        <Box style={{ flexDirection: "column" }}>
          {/* ── Status Section ── */}
          <SectionHeader
            title="Status"
            isSelected={state.selectedSection === 0}
            tokens={tokens}
          />
          <Box style={{ flexDirection: "row" }}>
            <Text content={`  ${statusGlyph} `} style={{ color: statusColor }} />
            <Text content={statusLabel} style={{ color: statusColor }} />
            {isRunning ? (
              <Text
                content={`  (${activityLabel(activity)})`}
                style={{ color: tokens[activityColorToken(activity)] }}
              />
            ) : null}
          </Box>
          {isRunning ? (
            <Box style={{ flexDirection: "column" }}>
              {browserStatus.pid !== undefined ? (
                <StatusRow label="PID" value={String(browserStatus.pid)} tokens={tokens} />
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
              <StatusRow
                label="Mode"
                value={browserStatus.headless === false ? "Headed" : "Headless"}
                tokens={tokens}
              />
            </Box>
          ) : (
            <Box style={{ flexDirection: "row" }}>
              <Text
                content="  Browser not running — use a browser tool or /browser to start"
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          )}

          {/* ── Tabs Section ── */}
          <SectionHeader
            title={`Tabs (${state.tabs.length})`}
            isSelected={state.selectedSection === 1}
            tokens={tokens}
          />
          {state.tabs.length === 0 ? (
            <Box style={{ flexDirection: "row" }}>
              <Text content="  No tabs open" style={{ color: tokens["text.muted"] }} />
            </Box>
          ) : (
            <Box style={{ flexDirection: "column" }}>
              {state.tabs.map((tab) => (
                <Box key={tab.tabId} style={{ flexDirection: "row" }}>
                  <Text
                    content={tab.active ? "  ▸ " : "    "}
                    style={{ color: tokens["accent.primary"] }}
                  />
                  <Text
                    content={tab.title || "(untitled)"}
                    style={{ color: tab.active ? tokens["text.primary"] : tokens["text.secondary"] }}
                  />
                  <Text
                    content={`  ${tab.url}`}
                    style={{ color: tokens["text.muted"] }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {/* ── Snapshot Section ── */}
          <SectionHeader
            title="Snapshot"
            isSelected={state.selectedSection === 2}
            tokens={tokens}
          />
          {state.snapshot === null ? (
            <Box style={{ flexDirection: "row" }}>
              <Text content="  No snapshot available" style={{ color: tokens["text.muted"] }} />
            </Box>
          ) : (
            <Box style={{ flexDirection: "column" }}>
              <Box style={{ flexDirection: "row" }}>
                <Text
                  content={state.snapshotExpanded ? "  [collapse] e" : "  [expand] e"}
                  style={{ color: tokens["accent.secondary"] }}
                />
                <Text
                  content={`  (${snapshotLineCount(state.snapshot)} lines)`}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
              <Box style={{ flexDirection: "column" }}>
                <Text
                  content={
                    state.snapshotExpanded
                      ? state.snapshot
                      : truncateSnapshot(state.snapshot, SNAPSHOT_TRUNCATE_LINES)
                  }
                  style={{ color: tokens["text.secondary"] }}
                />
                {!state.snapshotExpanded &&
                  snapshotLineCount(state.snapshot) > SNAPSHOT_TRUNCATE_LINES ? (
                  <Text
                    content={`  ... ${snapshotLineCount(state.snapshot) - SNAPSHOT_TRUNCATE_LINES} more lines (press e to expand)`}
                    style={{ color: tokens["text.muted"] }}
                  />
                ) : null}
              </Box>
            </Box>
          )}

          {/* ── Watchers Section ── */}
          <SectionHeader
            title={`Watchers (${state.watchers.length})`}
            isSelected={state.selectedSection === 3}
            tokens={tokens}
          />
          {state.watchers.length === 0 ? (
            <Box style={{ flexDirection: "row" }}>
              <Text content="  No active watchers" style={{ color: tokens["text.muted"] }} />
            </Box>
          ) : (
            <Box style={{ flexDirection: "column" }}>
              {state.watchers.map((watcher) => (
                <Box key={watcher.id} style={{ flexDirection: "row" }}>
                  <Text content="  " />
                  <Text
                    content={watcher.url}
                    style={{ color: tokens["text.secondary"] }}
                  />
                  <Text
                    content={`  (${watcher.status})`}
                    style={{
                      color: watcher.status === "active"
                        ? tokens["status.success"]
                        : watcher.status === "error"
                          ? tokens["status.error"]
                          : tokens["text.muted"],
                    }}
                  />
                  {state.removingWatcherId === watcher.id ? (
                    <Text content="  removing..." style={{ color: tokens["status.warning"] }} />
                  ) : (
                    <Text content="  [x remove]" style={{ color: tokens["status.error"] }} />
                  )}
                </Box>
              ))}
            </Box>
          )}

          {/* ── Extraction Mode Section ── */}
          <SectionHeader
            title="Extraction Mode"
            isSelected={state.selectedSection === 4}
            tokens={tokens}
          />
          <Box style={{ flexDirection: "row" }}>
            <Text content="  " />
            {EXTRACTION_MODES.map((mode) => {
              const isActive = mode === state.extractionMode;
              return (
                <Box key={mode} style={{ flexDirection: "row" }}>
                  <Text
                    content={isActive ? `[${mode}]` : ` ${mode} `}
                    style={{
                      color: isActive ? tokens["accent.primary"] : tokens["text.muted"],
                    }}
                  />
                  <Text content=" " />
                </Box>
              );
            })}
            <Text content=" (m to cycle)" style={{ color: tokens["text.muted"] }} />
          </Box>
        </Box>
      ) : null}
    </ModalPanel>
  );
}
