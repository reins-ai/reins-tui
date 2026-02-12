import { useCallback, useEffect, useMemo, useRef } from "react";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import type { DaemonMode } from "../daemon/daemon-context";
import type { FocusedPanel } from "../store";
import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";
import {
  resolveBreakpointState,
  createResizeDebouncer,
  didBandChange,
  type BreakpointState,
} from "../layout/breakpoints";
import { ChatScreen } from "../screens/chat-screen";
import { SidebarContent } from "./sidebar";
import { StatusBar } from "./status-bar";
import { DrawerPanel } from "./drawer-panel";
import { ModalPanel } from "./modal-panel";

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

export interface LayoutProps {
  version: string;
  dimensions: TerminalDimensions;
  showHelp: boolean;
  connectionStatus: DaemonConnectionStatus;
  daemonMode?: DaemonMode;
  onSubmitMessage(text: string): void;
}

/**
 * Apply breakpoint constraints to the current layout mode.
 * When the terminal is too narrow for the user's chosen mode,
 * the breakpoint engine overrides it to a valid alternative.
 */
function useBreakpointConstraints(columns: number): BreakpointState {
  const { state, dispatch } = useApp();
  const previousColumnsRef = useRef(columns);

  const breakpointState = useMemo(
    () => resolveBreakpointState(columns, state.layoutMode),
    [columns, state.layoutMode],
  );

  const applyBandConstraint = useCallback(
    (newColumns: number) => {
      if (!didBandChange(previousColumnsRef.current, newColumns)) {
        previousColumnsRef.current = newColumns;
        return;
      }

      previousColumnsRef.current = newColumns;
      const nextState = resolveBreakpointState(newColumns, state.layoutMode);

      if (nextState.constrainedMode !== state.layoutMode) {
        dispatch({ type: "SET_LAYOUT_MODE", payload: nextState.constrainedMode });
      }
    },
    [state.layoutMode, dispatch],
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

const DRAWER_WIDTH = 32;
const TODAY_PANEL_WIDTH = 34;

export function Layout({ version, dimensions, showHelp, connectionStatus, daemonMode, onSubmitMessage }: LayoutProps) {
  const { state, dispatch } = useApp();
  const { tokens } = useThemeTokens();

  const breakpoint = useBreakpointConstraints(dimensions.width);

  const panelBorders = getPanelBorderColors(state.focusedPanel, tokens["border.focus"], tokens["border.subtle"]);

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
      <Box style={{ flexDirection: "row", flexGrow: 1 }}>
        <ChatScreen
          panelBorders={panelBorders}
          focusedPanel={state.focusedPanel}
          showSidebar={false}
          showActivityPanel={false}
          showExpandedPanel={false}
          breakpoint={breakpoint}
          onSubmitMessage={onSubmitMessage}
        />
      </Box>

      {/* Summoned left drawer with sidebar content */}
      <DrawerPanel
        side="left"
        width={DRAWER_WIDTH}
        visible={state.panels.drawer.visible}
        title={state.panels.drawer.pinned ? "Conversations 📌" : "Conversations"}
        onClose={dismissDrawer}
      >
        <SidebarContent
          isFocused={state.panels.drawer.visible && state.focusedPanel === "sidebar"}
        />
      </DrawerPanel>

      {/* Summoned right today/activity panel */}
      <DrawerPanel
        side="right"
        width={TODAY_PANEL_WIDTH}
        visible={state.panels.today.visible}
        title={state.panels.today.pinned ? "Today 📌" : "Today"}
        onClose={dismissToday}
      >
        <Text content="Activity" style={{ color: tokens["text.secondary"] }} />
        <Text content="Tool calls and events" style={{ color: tokens["text.muted"] }} />
      </DrawerPanel>

      {/* Summoned center modal */}
      <ModalPanel
        visible={state.panels.modal.visible}
        title="Settings"
        onClose={dismissModal}
      >
        <Text content="Settings and preferences" style={{ color: tokens["text.secondary"] }} />
      </ModalPanel>

      <StatusBar version={version} dimensions={dimensions} showHelp={showHelp} connectionStatus={connectionStatus} daemonMode={daemonMode} />
    </Box>
  );
}
