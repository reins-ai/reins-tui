// Extracted from components/layout.tsx — screen-level composition of
// ConversationPanel + InputArea for the main chat experience.
// Each region is wrapped in a ZoneShell for explicit visual boundaries.

import type { BreakpointState } from "../layout/breakpoints";
import { useThemeTokens } from "../theme";
import { Box, Text, ZoneShell } from "../ui";
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
        {/* Conversation zone: scrollable message area */}
        <ZoneShell
          backgroundColor={tokens["surface.primary"]}
          style={{ flexGrow: 1 }}
        >
          <ConversationPanel
            isFocused={focusedPanel === "conversation"}
            borderColor={panelBorders.conversation}
          />
        </ZoneShell>

        {/* Input zone: message composition area with top border separator */}
        <ZoneShell
          borderSides={["top"]}
          borderColor={tokens["border.subtle"]}
          backgroundColor={tokens["surface.secondary"]}
        >
          <InputArea
            isFocused={focusedPanel === "input"}
            onSubmit={onSubmitMessage}
          />
        </ZoneShell>
      </Box>

      {showActivityPanel ? (
        <ZoneShell
          borderSides={["left"]}
          borderColor={tokens["border.subtle"]}
          backgroundColor={tokens["surface.secondary"]}
          style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}
        >
          <Box style={{ width: breakpoint.panelWidths.activity, flexDirection: "column" }}>
            <Text content="Activity" style={{ color: tokens["text.secondary"] }} />
            <Text content="Tool calls and events" style={{ color: tokens["text.muted"] }} />
          </Box>
        </ZoneShell>
      ) : null}

      {showExpandedPanel ? (
        <ZoneShell
          borderSides={["left"]}
          borderColor={tokens["border.subtle"]}
          backgroundColor={tokens["surface.secondary"]}
          style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}
        >
          <Box style={{ width: breakpoint.panelWidths.expanded, flexDirection: "column" }}>
            <Text content="Details" style={{ color: tokens["text.secondary"] }} />
            <Text content="Expanded view" style={{ color: tokens["text.muted"] }} />
          </Box>
        </ZoneShell>
      ) : null}
    </Box>
  );
}
