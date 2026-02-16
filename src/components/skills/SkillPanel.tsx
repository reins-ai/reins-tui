import { useCallback, useReducer } from "react";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";
import { ModalPanel } from "../modal-panel";
import { SkillDetailView, type SkillDetailData } from "./SkillDetailView";
import {
  SkillListPanel,
  type SkillListItem,
} from "./SkillListPanel";

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
  readonly selectedSkillName: string | null;
  readonly selectedDetail: SkillDetailData | null;
}

export type PanelAction =
  | { type: "SELECT_SKILL"; name: string; detail: SkillDetailData | null }
  | { type: "GO_BACK" }
  | { type: "TOGGLE_ENABLED"; updatedDetail: SkillDetailData | null }
  | { type: "CLOSE" };

export const INITIAL_PANEL_STATE: PanelState = {
  view: "list",
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

  // Keyboard handler for detail view shortcuts
  useKeyboard(
    useCallback(
      (event) => {
        if (!visible) return;
        if (state.view !== "detail") return;

        const keyName = event.name ?? "";

        if (keyName === "e" && state.selectedSkillName) {
          handleToggle(state.selectedSkillName);
          return;
        }

        if (keyName === "escape" || keyName === "esc") {
          handleBack();
          return;
        }
      },
      [visible, state.view, state.selectedSkillName, handleToggle, handleBack],
    ),
  );

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

  // List view — delegate entirely to SkillListPanel
  return (
    <SkillListPanel
      visible={visible}
      skills={[...skills]}
      onSelect={handleSelect}
      onClose={handleClose}
    />
  );
}
