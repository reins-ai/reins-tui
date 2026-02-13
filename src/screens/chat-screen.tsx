// Extracted from components/layout.tsx — screen-level composition of
// ConversationPanel + InputArea for the main chat experience.

import type { BreakpointState } from "../layout/breakpoints";
import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";
import { ConversationPanel } from "../components/conversation-panel";
import { InputArea } from "../components/input-area";
import type { PanelBorderColors } from "../components/layout";

export interface ChatScreenProps {
  panelBorders: PanelBorderColors;
  focusedPanel: string;
  showSidebar: boolean;
  showActivityPanel: boolean;
  showExpandedPanel: boolean;
  breakpoint: BreakpointState;
  onSubmitMessage: (text: string) => void;
}

export function ChatScreen({
  panelBorders,
  focusedPanel,
  showSidebar,
  showActivityPanel,
  showExpandedPanel,
  breakpoint,
  onSubmitMessage,
}: ChatScreenProps) {
  const { tokens } = useThemeTokens();

  return (
    <Box style={{ flexDirection: "row", flexGrow: 1 }}>
      <Box style={{ flexGrow: 1, marginLeft: showSidebar ? 1 : 0, flexDirection: "column" }}>
        <ConversationPanel
          isFocused={focusedPanel === "conversation"}
          borderColor={panelBorders.conversation}
        />
        <InputArea
          isFocused={focusedPanel === "input"}
          borderColor={panelBorders.input}
          onSubmit={onSubmitMessage}
        />
      </Box>

      {showActivityPanel ? (
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

      {showExpandedPanel ? (
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
  );
}
