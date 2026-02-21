import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenUsageInfo } from "./input-area";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import type { DaemonMode } from "../daemon/daemon-context";
import type { FocusedPanel } from "../store";
import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, ZoneShell, type TerminalDimensions } from "../ui";
import {
  resolveBreakpointState,
  createResizeDebouncer,
  didBandChange,
  type BreakpointState,
} from "../layout/breakpoints";
import { ChatScreen } from "../screens/chat-screen";
import { SidebarContent, SIDEBAR_CONTEXT_WIDTH } from "./sidebar";
import { StatusBar } from "./status-bar";
import { DrawerPanel } from "./drawer-panel";
import { ModalPanel } from "./modal-panel";
import { BriefingPanel } from "./briefing-panel";
import { TaskPanel } from "./task-panel";

// --- Layout zone configuration ---

/**
 * The four explicit layout zones that compose the app shell.
 * Each zone maps to a surface token and optional border treatment
 * to create clear visual boundaries between regions.
 */
export type LayoutZoneName = "conversation" | "input" | "sidebar" | "status";

export interface LayoutZoneConfig {
  surfaceToken: string;
  borderSides?: string[];
}

export const LAYOUT_ZONES: Record<LayoutZoneName, LayoutZoneConfig> = {
  conversation: {
    surfaceToken: "surface.primary",
  },
  input: {
    surfaceToken: "surface.secondary",
    borderSides: ["top"],
  },
  sidebar: {
    surfaceToken: "surface.secondary",
    borderSides: ["left"],
  },
  status: {
    surfaceToken: "surface.secondary",
    borderSides: ["top"],
  },
};

// --- Panel border focus ---

export interface PanelBorderColors {
  sidebar: string;
  conversation: string;
  input: string;
}

export function resolvePanelBorderColor(isFocused: boolean, focusColor: string, defaultColor: string): string {
  return isFocused ? focusColor : defaultColor;
}

export function getPanelBorderColors(focusedPanel: FocusedPanel, focusColor: string, defaultColor: string): PanelBorderColors {
  return {
    sidebar: resolvePanelBorderColor(focusedPanel === "sidebar", focusColor, defaultColor),
    conversation: resolvePanelBorderColor(focusedPanel === "conversation", focusColor, defaultColor),
    input: resolvePanelBorderColor(focusedPanel === "input", focusColor, defaultColor),
  };
}

/** Duration (ms) for the compaction flash on the token bar and status bar. */
export const COMPACTION_FLASH_DURATION_MS = 2_000;

export interface LayoutProps {
  version: string;
  dimensions: TerminalDimensions;
  showHelp: boolean;
  suppressMainInput?: boolean;
  connectionStatus: DaemonConnectionStatus;
  daemonMode?: DaemonMode;
  /**
   * When true, triggers the compaction visual indicators:
   * token bar flashes red and status bar shows a compaction message.
   * The indicators auto-clear after `COMPACTION_FLASH_DURATION_MS`.
   */
  compactionActive?: boolean;
  /** Token usage info passed through to the input area token bar. */
  tokenUsage?: TokenUsageInfo;
  onSubmitMessage(text: string): void;
  onCancelPrompt?(): void | Promise<void>;
}

/**
 * Apply breakpoint constraints to the current layout mode.
 * When the terminal is too narrow for the user's chosen mode,
 * the breakpoint engine overrides it to a valid alternative.
 * Also auto-collapses the sidebar drawer when the terminal shrinks
 * below the minimum fit width.
 */
function useBreakpointConstraints(columns: number): BreakpointState {
  const { state, dispatch } = useApp();
  const previousColumnsRef = useRef(columns);

  const drawerVisible = state.panels.drawer.visible;

  const breakpointState = useMemo(
    () => resolveBreakpointState(columns, state.layoutMode, drawerVisible),
    [columns, state.layoutMode, drawerVisible],
  );

  const applyBandConstraint = useCallback(
    (newColumns: number) => {
      const bandChanged = didBandChange(previousColumnsRef.current, newColumns);
      previousColumnsRef.current = newColumns;

      const nextState = resolveBreakpointState(newColumns, state.layoutMode, drawerVisible);

      if (bandChanged && nextState.constrainedMode !== state.layoutMode) {
        dispatch({ type: "SET_LAYOUT_MODE", payload: nextState.constrainedMode });
      }

      if (drawerVisible && !nextState.sidebarVisible) {
        dispatch({ type: "DISMISS_PANEL", payload: "drawer" });
      }
    },
    [state.layoutMode, drawerVisible, dispatch],
  );

  const debouncerRef = useRef(createResizeDebouncer(applyBandConstraint));

  useEffect(() => {
    debouncerRef.current = createResizeDebouncer(applyBandConstraint);
    return () => debouncerRef.current.cancel();
  }, [applyBandConstraint]);

  useEffect(() => {
    debouncerRef.current.trigger(columns);
  }, [columns]);

  return breakpointState;
}

const DRAWER_WIDTH = SIDEBAR_CONTEXT_WIDTH;
const TODAY_PANEL_WIDTH = 34;

/**
 * Content rendered inside the Today drawer panel.
 *
 * Composes BriefingPanel and TaskPanel alongside the existing activity
 * summary. Both sub-components handle their own empty-state visibility:
 * BriefingPanel returns null when no briefing data is available or when
 * external channels are configured; TaskPanel returns null when the
 * tasks array is empty. This means the Today panel gracefully degrades
 * to showing only the activity summary when no briefing or task data
 * has been provided yet.
 */
function TodayPanelContent() {
  // Briefing state — populated when the daemon delivers a morning briefing
  // via WebSocket. Null until a briefing is received.
  const [briefing] = useState<import("./briefing-panel").BriefingData | null>(null);
  const [channelsConfigured] = useState(false);
  const [dismissedDates] = useState<ReadonlySet<string>>(() => new Set<string>());

  // Task state — populated when background task updates arrive via WebSocket.
  // Empty array until tasks are received.
  const [tasks] = useState<readonly import("./task-panel").TaskItem[]>([]);
  const [selectedTaskIndex] = useState<number | null>(null);

  return (
    <Box style={{ flexDirection: "column" }}>
      <BriefingPanel
        briefing={briefing}
        channelsConfigured={channelsConfigured}
        dismissedDates={dismissedDates}
      />
      <TaskPanel
        tasks={tasks}
        selectedIndex={selectedTaskIndex}
      />
      {/* TODO: Wire ActivityPanel here when ActivityStore events are
          propagated to the Today drawer via context or props */}
    </Box>
  );
}

export function Layout({
  version,
  dimensions,
  showHelp,
  suppressMainInput = false,
  connectionStatus,
  daemonMode,
  compactionActive: compactionProp,
  tokenUsage,
  onSubmitMessage,
  onCancelPrompt,
}: LayoutProps) {
  const { state, dispatch } = useApp();
  const { tokens } = useThemeTokens();

  const breakpoint = useBreakpointConstraints(dimensions.width);

  const panelBorders = getPanelBorderColors(state.focusedPanel, tokens["border.focus"], tokens["border.subtle"]);

  // --- Compaction flash state ---
  // When compactionProp transitions to true, flash the token bar red
  // and show a status bar message for COMPACTION_FLASH_DURATION_MS.
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactionMessage, setCompactionMessage] = useState<string | undefined>(undefined);
  const compactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (compactionProp) {
      setIsCompacting(true);
      setCompactionMessage("\u27F3 Auto-compacting context\u2026");

      if (compactionTimerRef.current !== null) {
        clearTimeout(compactionTimerRef.current);
      }

      compactionTimerRef.current = setTimeout(() => {
        setIsCompacting(false);
        setCompactionMessage(undefined);
        compactionTimerRef.current = null;
      }, COMPACTION_FLASH_DURATION_MS);
    }

    return () => {
      if (compactionTimerRef.current !== null) {
        clearTimeout(compactionTimerRef.current);
        compactionTimerRef.current = null;
      }
    };
  }, [compactionProp]);

  const dismissDrawer = useCallback(() => {
    dispatch({ type: "DISMISS_PANEL", payload: "drawer" });
  }, [dispatch]);

  const dismissToday = useCallback(() => {
    dispatch({ type: "DISMISS_PANEL", payload: "today" });
  }, [dispatch]);

  const dismissModal = useCallback(() => {
    dispatch({ type: "DISMISS_PANEL", payload: "modal" });
  }, [dispatch]);

  return (
    <Box style={{ flexDirection: "column", height: "100%" }}>
      {/* Main content zone: conversation + input + optional side panels */}
      <ZoneShell
        backgroundColor={tokens["surface.primary"]}
        style={{ flexGrow: 1, flexDirection: "row", minHeight: 0 }}
      >
        <ChatScreen
          version={version}
          panelBorders={panelBorders}
          focusedPanel={state.focusedPanel}
          suppressMainInput={suppressMainInput}
          showActivityPanel={false}
          showExpandedPanel={false}
          breakpoint={breakpoint}
          tokenUsage={tokenUsage}
          isCompacting={isCompacting}
          onSubmitMessage={onSubmitMessage}
          onCancelPrompt={onCancelPrompt}
        />
      </ZoneShell>

      {/* Summoned left drawer with contextual info panel */}
      <DrawerPanel
        side="left"
        width={DRAWER_WIDTH}
        visible={state.panels.drawer.visible}
        title={state.panels.drawer.pinned ? "Context [Pinned]" : "Context"}
        onClose={dismissDrawer}
      >
        <SidebarContent
          isFocused={state.panels.drawer.visible && state.focusedPanel === "sidebar"}
          connectionStatus={connectionStatus}
        />
      </DrawerPanel>

      {/* Summoned right today/activity panel */}
      <DrawerPanel
        side="right"
        width={TODAY_PANEL_WIDTH}
        visible={state.panels.today.visible}
        title={state.panels.today.pinned ? "Today [Pinned]" : "Today"}
        onClose={dismissToday}
      >
        <TodayPanelContent />
      </DrawerPanel>

      {/* Summoned center modal */}
      <ModalPanel
        visible={state.panels.modal.visible}
        title="Settings"
        onClose={dismissModal}
      >
        <Text content="Settings and preferences" style={{ color: tokens["text.secondary"] }} />
      </ModalPanel>

      {/* Status zone: anchored footer with connection/model/lifecycle info.
          flexShrink 0 prevents the footer from being squeezed by content above. */}
      <ZoneShell
        borderSides={["top"]}
        borderColor={tokens["border.subtle"]}
        backgroundColor={tokens["surface.secondary"]}
        style={{ flexShrink: 0 }}
      >
        <StatusBar version={version} dimensions={dimensions} showHelp={showHelp} connectionStatus={connectionStatus} daemonMode={daemonMode} compactionActive={compactionProp} compactionMessage={compactionMessage} />
      </ZoneShell>
    </Box>
  );
}
