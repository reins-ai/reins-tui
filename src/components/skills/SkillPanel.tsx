import { useCallback, useReducer } from "react";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";
import { ModalPanel } from "../modal-panel";
import { SkillDetailView, type SkillDetailData } from "./SkillDetailView";
import {
  SkillListPanel,
  type SkillListItem,
} from "./SkillListPanel";
import {
  TabBar,
  SKILL_PANEL_TABS,
  getNextTabIndex,
} from "./TabBar";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PanelView = "list" | "detail";

export interface SkillPanelProps {
  visible: boolean;
  skills: readonly SkillListItem[];
  onLoadSkillDetail: (name: string) => SkillDetailData | null;
  onToggleEnabled: (name: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export interface PanelState {
  readonly view: PanelView;
  readonly activeTabIndex: number;
  readonly selectedSkillName: string | null;
  readonly selectedDetail: SkillDetailData | null;
}

export type PanelAction =
  | { type: "SELECT_SKILL"; name: string; detail: SkillDetailData | null }
  | { type: "GO_BACK" }
  | { type: "TOGGLE_ENABLED"; updatedDetail: SkillDetailData | null }
  | { type: "SWITCH_TAB"; index: number }
  | { type: "CLOSE" };

export const INITIAL_PANEL_STATE: PanelState = {
  view: "list",
  activeTabIndex: 0,
  selectedSkillName: null,
  selectedDetail: null,
};

export function skillPanelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "SELECT_SKILL":
      return {
        ...state,
        view: "detail",
        selectedSkillName: action.name,
        selectedDetail: action.detail,
      };

    case "GO_BACK":
      return {
        ...state,
        view: "list",
        selectedSkillName: null,
        selectedDetail: null,
      };

    case "TOGGLE_ENABLED":
      return {
        ...state,
        selectedDetail: action.updatedDetail,
      };

    case "SWITCH_TAB":
      return {
        ...state,
        activeTabIndex: action.index,
        // Reset detail view when switching tabs
        view: "list",
        selectedSkillName: null,
        selectedDetail: null,
      };

    case "CLOSE":
      return INITIAL_PANEL_STATE;

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Help bar
// ---------------------------------------------------------------------------

interface HelpAction {
  readonly key: string;
  readonly label: string;
}

export function getHelpActions(view: PanelView): readonly HelpAction[] {
  if (view === "detail") {
    return [
      { key: "e", label: "Toggle" },
      { key: "Esc", label: "Back" },
    ];
  }

  return [
    { key: "Tab", label: "Switch Tab" },
    { key: "j/k", label: "Navigate" },
    { key: "Enter", label: "Select" },
    { key: "/", label: "Search" },
    { key: "Esc", label: "Close" },
  ];
}

function HelpBar({ view, tokens }: { view: PanelView; tokens: Record<string, string> }) {
  const actions = getHelpActions(view);

  return (
    <Box style={{ flexDirection: "row" }}>
      {actions.map((action, index) => (
        <Box key={action.key} style={{ flexDirection: "row" }}>
          {index > 0 ? (
            <Text content="  " style={{ color: tokens["text.muted"] }} />
          ) : null}
          <Text
            content={`[${action.key}]`}
            style={{ color: tokens["accent.primary"] }}
          />
          <Text
            content={` ${action.label}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Placeholder content for non-Installed tabs
// ---------------------------------------------------------------------------

function PlaceholderContent({
  message,
  tokens,
}: {
  message: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column", flexGrow: 1, paddingLeft: 2, paddingTop: 1 }}>
      <Text content={message} style={{ color: tokens["text.muted"] }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SkillPanel({
  visible,
  skills,
  onLoadSkillDetail,
  onToggleEnabled,
  onClose,
}: SkillPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(skillPanelReducer, INITIAL_PANEL_STATE);

  // Handle skill selection from the list panel
  const handleSelect = useCallback(
    (name: string) => {
      const detail = onLoadSkillDetail(name);
      dispatch({ type: "SELECT_SKILL", name, detail });
    },
    [onLoadSkillDetail],
  );

  // Handle back navigation from detail view
  const handleBack = useCallback(() => {
    dispatch({ type: "GO_BACK" });
  }, []);

  // Handle enable/disable toggle
  const handleToggle = useCallback(
    (name: string) => {
      onToggleEnabled(name);
      // Reload the detail to reflect the updated enabled state
      const updatedDetail = onLoadSkillDetail(name);
      dispatch({ type: "TOGGLE_ENABLED", updatedDetail });
    },
    [onToggleEnabled, onLoadSkillDetail],
  );

  // Handle panel close — reset state and call parent
  const handleClose = useCallback(() => {
    dispatch({ type: "CLOSE" });
    onClose();
  }, [onClose]);

  // Handle tab change
  const handleTabChange = useCallback((index: number) => {
    dispatch({ type: "SWITCH_TAB", index });
  }, []);

  // Keyboard handler for panel-level shortcuts
  useKeyboard(
    useCallback(
      (event) => {
        if (!visible) return;

        const keyName = event.name ?? "";

        // Detail view shortcuts
        if (state.view === "detail") {
          if (keyName === "e" && state.selectedSkillName) {
            handleToggle(state.selectedSkillName);
            return;
          }

          if (keyName === "escape" || keyName === "esc") {
            handleBack();
            return;
          }
          return;
        }

        // Tab key cycles tabs (only in list view)
        if (keyName === "tab") {
          const nextIndex = getNextTabIndex(
            state.activeTabIndex,
            SKILL_PANEL_TABS.length,
          );
          handleTabChange(nextIndex);
          return;
        }
      },
      [visible, state.view, state.activeTabIndex, state.selectedSkillName, handleToggle, handleBack, handleTabChange],
    ),
  );

  // Detail view — shown regardless of active tab when a skill is selected
  if (state.view === "detail") {
    return (
      <ModalPanel
        visible={visible}
        title={state.selectedSkillName ?? "Skill Detail"}
        hint="e toggle · Esc back"
        width={76}
        height={24}
        closeOnEscape={false}
        onClose={handleClose}
      >
        <Box style={{ flexDirection: "column", flexGrow: 1 }}>
          <SkillDetailView
            skill={state.selectedDetail}
            onBack={handleBack}
            onToggleEnabled={handleToggle}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <HelpBar view="detail" tokens={tokens} />
        </Box>
      </ModalPanel>
    );
  }

  // Installed tab — delegate entirely to SkillListPanel
  if (state.activeTabIndex === 0) {
    return (
      <SkillListPanel
        visible={visible}
        skills={[...skills]}
        onSelect={handleSelect}
        onClose={handleClose}
        tabBar={
          <TabBar
            tabs={SKILL_PANEL_TABS}
            activeIndex={state.activeTabIndex}
            onTabChange={handleTabChange}
          />
        }
      />
    );
  }

  // ClawHub tab — placeholder
  if (state.activeTabIndex === 1) {
    return (
      <ModalPanel
        visible={visible}
        title="Skills"
        hint="Tab switch · Esc close"
        width={76}
        height={24}
        closeOnEscape={false}
        onClose={handleClose}
      >
        <TabBar
          tabs={SKILL_PANEL_TABS}
          activeIndex={state.activeTabIndex}
          onTabChange={handleTabChange}
        />
        <PlaceholderContent
          message="ClawHub marketplace - coming in Task 5.2"
          tokens={tokens}
        />
        <Box style={{ marginTop: 1 }}>
          <HelpBar view="list" tokens={tokens} />
        </Box>
      </ModalPanel>
    );
  }

  // Reins Marketplace tab — placeholder
  return (
    <ModalPanel
      visible={visible}
      title="Skills"
      hint="Tab switch · Esc close"
      width={76}
      height={24}
      closeOnEscape={false}
      onClose={handleClose}
    >
      <TabBar
        tabs={SKILL_PANEL_TABS}
        activeIndex={state.activeTabIndex}
        onTabChange={handleTabChange}
      />
      <PlaceholderContent
        message="Reins Marketplace - coming in Task 5.5"
        tokens={tokens}
      />
      <Box style={{ marginTop: 1 }}>
        <HelpBar view="list" tokens={tokens} />
      </Box>
    </ModalPanel>
  );
}
