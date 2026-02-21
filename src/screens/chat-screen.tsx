// Extracted from components/layout.tsx — screen-level composition of
// ConversationPanel + InputArea for the main chat experience.
// Each region is wrapped in a ZoneShell for explicit visual boundaries.

import type { BreakpointState } from "../layout/breakpoints";
import type { ActivityEvent, ActivityStats } from "../state/activity-store";
import { useThemeTokens } from "../theme";
import { Box, Text, ZoneShell } from "../ui";
import { ConversationPanel } from "../components/conversation-panel";
import { InputArea } from "../components/input-area";
import type { TokenUsageInfo } from "../components/input-area";
import type { PanelBorderColors } from "../components/layout";
import { ActivityPanel } from "../components/task-panel";
import type { ExportFormat } from "../util/activity-export";

export interface ChatScreenProps {
  version: string;
  panelBorders: PanelBorderColors;
  focusedPanel: string;
  suppressMainInput?: boolean;
  showActivityPanel: boolean;
  showExpandedPanel: boolean;
  breakpoint: BreakpointState;
  /** Token usage info for the input area token bar. */
  tokenUsage?: TokenUsageInfo;
  /** When true, the token bar flashes red to indicate compaction in progress. */
  isCompacting?: boolean;
  /** Live activity events from the ActivityStore (newest-first). */
  activityEvents?: ActivityEvent[];
  /** Aggregated activity stats (tool call count, tokens, wall time). */
  activityStats?: ActivityStats;
  /** Called when the user clears the activity log. */
  onActivityClear?: () => void;
  /** Called when the user exports the activity log. */
  onActivityExport?: (format: ExportFormat) => void;
  onSubmitMessage: (text: string) => void;
  onCancelPrompt?: () => void | Promise<void>;
}

export function resolveMainWindowFocusedPanel(
  focusedPanel: string,
  suppressMainInput: boolean,
): string {
  return suppressMainInput ? "" : focusedPanel;
}

export function ChatScreen({
  version,
  panelBorders,
  focusedPanel,
  suppressMainInput = false,
  showActivityPanel,
  showExpandedPanel,
  breakpoint,
  tokenUsage,
  isCompacting,
  activityEvents,
  activityStats,
  onActivityClear,
  onActivityExport,
  onSubmitMessage,
  onCancelPrompt,
}: ChatScreenProps) {
  const { tokens } = useThemeTokens();
  const mainWindowFocusedPanel = resolveMainWindowFocusedPanel(focusedPanel, suppressMainInput);

  return (
    <Box style={{ flexDirection: "row", flexGrow: 1, minHeight: 0 }}>
      <Box style={{ flexGrow: 1, flexDirection: "column", minHeight: 0 }}>
        {/* Conversation zone: scrollable message area */}
        <ZoneShell
          backgroundColor={tokens["surface.primary"]}
          style={{ flexGrow: 1, minHeight: 0 }}
        >
          <ConversationPanel
            isFocused={mainWindowFocusedPanel === "conversation"}
            borderColor={panelBorders.conversation}
            version={version}
          />
        </ZoneShell>

        {/* Input zone: message composition area with top border separator */}
        <ZoneShell
          borderSides={["top"]}
          borderColor={tokens["border.subtle"]}
          backgroundColor={tokens["surface.secondary"]}
          style={{ flexGrow: 0, flexShrink: 0 }}
        >
          <InputArea
            isFocused={mainWindowFocusedPanel === "input"}
            onSubmit={onSubmitMessage}
            onCancelPrompt={onCancelPrompt}
            tokenUsage={tokenUsage}
            isCompacting={isCompacting}
          />
        </ZoneShell>
      </Box>

      {showActivityPanel ? (
        <ZoneShell
          borderSides={["left"]}
          borderColor={tokens["border.subtle"]}
          backgroundColor={tokens["surface.secondary"]}
          style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 0 }}
        >
          <Box style={{ width: breakpoint.panelWidths.activity, flexDirection: "column" }}>
            <ActivityPanel
              events={activityEvents ?? []}
              stats={activityStats}
              onClear={onActivityClear}
              onExport={onActivityExport}
              width={breakpoint.panelWidths.activity}
            />
          </Box>
        </ZoneShell>
      ) : null}

      {/* TODO: Implement expanded details panel when event selection is wired up */}
      {showExpandedPanel ? (
        <ZoneShell
          borderSides={["left"]}
          borderColor={tokens["border.subtle"]}
          backgroundColor={tokens["surface.secondary"]}
          style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}
        >
          <Box style={{ width: breakpoint.panelWidths.expanded, flexDirection: "column" }}>
            <Text content="No event selected" style={{ color: tokens["text.muted"] }} />
          </Box>
        </ZoneShell>
      ) : null}
    </Box>
  );
}
