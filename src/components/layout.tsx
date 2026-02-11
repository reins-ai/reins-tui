import type { FocusedPanel } from "../store";
import { useApp, getLayoutVisibility } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";
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

export function Layout({ version, dimensions, showHelp, onSubmitMessage }: LayoutProps) {
  const { state } = useApp();
  const { tokens } = useThemeTokens();
  const panelBorders = getPanelBorderColors(state.focusedPanel, tokens["border.focus"], tokens["border.subtle"]);
  const visibility = getLayoutVisibility(state.layoutMode);

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
              width: 32,
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
      </Box>

      <StatusBar version={version} dimensions={dimensions} showHelp={showHelp} />
    </Box>
  );
}
