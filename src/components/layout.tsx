import { useCallback, useEffect, useMemo, useRef } from "react";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import type { FocusedPanel } from "../store";
import { useApp, getLayoutVisibility } from "../store";
import { useThemeTokens } from "../theme";
import { Box, type TerminalDimensions } from "../ui";
import {
  resolveBreakpointState,
  createResizeDebouncer,
  didBandChange,
  type BreakpointState,
} from "../layout/breakpoints";
import { ChatScreen } from "../screens/chat-screen";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";

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

export function Layout({ version, dimensions, showHelp, connectionStatus, onSubmitMessage }: LayoutProps) {
  const { state } = useApp();
  const { tokens } = useThemeTokens();

  const breakpoint = useBreakpointConstraints(dimensions.width);
  const effectiveMode = breakpoint.constrainedMode;
  const visibility = getLayoutVisibility(effectiveMode);

  const panelBorders = getPanelBorderColors(state.focusedPanel, tokens["border.focus"], tokens["border.subtle"]);

  return (
    <Box style={{ flexDirection: "column", height: "100%" }}>
      <Box style={{ flexDirection: "row", flexGrow: 1 }}>
        {visibility.showSidebar ? (
          <Sidebar isFocused={state.focusedPanel === "sidebar"} borderColor={panelBorders.sidebar} />
        ) : null}

        <ChatScreen
          panelBorders={panelBorders}
          focusedPanel={state.focusedPanel}
          showSidebar={visibility.showSidebar}
          showActivityPanel={visibility.showActivityPanel}
          showExpandedPanel={breakpoint.showExpandedPanel}
          breakpoint={breakpoint}
          onSubmitMessage={onSubmitMessage}
        />
      </Box>

      <StatusBar version={version} dimensions={dimensions} showHelp={showHelp} connectionStatus={connectionStatus} />
    </Box>
  );
}
