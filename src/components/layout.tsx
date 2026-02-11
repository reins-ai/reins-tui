import { useCallback, useEffect, useMemo, useRef } from "react";

import type { FocusedPanel } from "../store";
import { useApp, getLayoutVisibility } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";
import {
  resolveBreakpointState,
  createResizeDebouncer,
  didBandChange,
  type BreakpointState,
} from "../layout/breakpoints";
import { ConversationPanel } from "./conversation-panel";
import { InputArea } from "./input-area";
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

export function Layout({ version, dimensions, showHelp, onSubmitMessage }: LayoutProps) {
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

        <Box style={{ flexGrow: 1, marginLeft: visibility.showSidebar ? 1 : 0, flexDirection: "column" }}>
          <ConversationPanel
            isFocused={state.focusedPanel === "conversation"}
            borderColor={panelBorders.conversation}
          />
          <InputArea
            isFocused={state.focusedPanel === "input"}
            borderColor={panelBorders.input}
            onSubmit={onSubmitMessage}
          />
        </Box>

        {visibility.showActivityPanel ? (
          <Box
            style={{
              width: breakpoint.panelWidths.activity,
              marginLeft: 1,
              border: true,
              borderColor: tokens["border.subtle"],
              padding: 1,
              flexDirection: "column",
            }}
          >
            <Text content="Activity" style={{ color: tokens["text.secondary"] }} />
            <Text content="Tool calls and events" style={{ color: tokens["text.muted"] }} />
          </Box>
        ) : null}

        {breakpoint.showExpandedPanel ? (
          <Box
            style={{
              width: breakpoint.panelWidths.expanded,
              marginLeft: 1,
              border: true,
              borderColor: tokens["border.subtle"],
              padding: 1,
              flexDirection: "column",
            }}
          >
            <Text content="Details" style={{ color: tokens["text.secondary"] }} />
            <Text content="Expanded view" style={{ color: tokens["text.muted"] }} />
          </Box>
        ) : null}
      </Box>

      <StatusBar version={version} dimensions={dimensions} showHelp={showHelp} />
    </Box>
  );
}
