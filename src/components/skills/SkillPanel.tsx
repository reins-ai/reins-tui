import { useCallback, useReducer } from "react";

import type {
  InstallResult,
  InstallStep,
  MarketplaceSkillDetail,
  MarketplaceSource,
} from "@reins/core";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";
import { ModalPanel } from "../modal-panel";
import { InstallFlow } from "./InstallFlow";
import { MarketplaceDetailView } from "./MarketplaceDetailView";
import { MarketplaceListPanel } from "./MarketplaceListPanel";
import { MarketplacePlaceholder } from "./MarketplacePlaceholder";
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

export type PanelView = "list" | "detail" | "install";

export interface SkillPanelProps {
  visible: boolean;
  skills: readonly SkillListItem[];
  onLoadSkillDetail: (name: string) => SkillDetailData | null;
  onToggleEnabled: (name: string) => void;
  onClose: () => void;
  /** Marketplace source for the ClawHub tab. Null when not configured. */
  marketplaceSource?: MarketplaceSource | null;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export interface InstallState {
  readonly slug: string;
  readonly version: string;
  readonly detail: MarketplaceSkillDetail;
  readonly progress: InstallStep | null;
  readonly error: string | null;
  readonly result: InstallResult | null;
}

export interface PanelState {
  readonly view: PanelView;
  readonly activeTabIndex: number;
  readonly selectedSkillName: string | null;
  readonly selectedDetail: SkillDetailData | null;
  readonly selectedMarketplaceSkill: string | null;
  readonly installState: InstallState | null;
}

export type PanelAction =
  | { type: "SELECT_SKILL"; name: string; detail: SkillDetailData | null }
  | { type: "SELECT_MARKETPLACE_SKILL"; slug: string }
  | { type: "GO_BACK" }
  | { type: "TOGGLE_ENABLED"; updatedDetail: SkillDetailData | null }
  | { type: "SWITCH_TAB"; index: number }
  | { type: "CLOSE" }
  | { type: "START_INSTALL"; slug: string; version: string; detail: MarketplaceSkillDetail }
  | { type: "INSTALL_PROGRESS"; step: InstallStep }
  | { type: "INSTALL_ERROR"; error: string }
  | { type: "INSTALL_COMPLETE"; result: InstallResult }
  | { type: "INSTALL_RESET" };

export const INITIAL_PANEL_STATE: PanelState = {
  view: "list",
  activeTabIndex: 0,
  selectedSkillName: null,
  selectedDetail: null,
  selectedMarketplaceSkill: null,
  installState: null,
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

    case "SELECT_MARKETPLACE_SKILL":
      return {
        ...state,
        view: "detail",
        selectedMarketplaceSkill: action.slug,
      };

    case "GO_BACK":
      return {
        ...state,
        view: "list",
        selectedSkillName: null,
        selectedDetail: null,
        selectedMarketplaceSkill: null,
        installState: null,
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
        selectedMarketplaceSkill: null,
        installState: null,
      };

    case "CLOSE":
      return INITIAL_PANEL_STATE;

    case "START_INSTALL":
      return {
        ...state,
        view: "install",
        installState: {
          slug: action.slug,
          version: action.version,
          detail: action.detail,
          progress: null,
          error: null,
          result: null,
        },
      };

    case "INSTALL_PROGRESS":
      if (!state.installState) return state;
      return {
        ...state,
        installState: {
          ...state.installState,
          progress: action.step,
        },
      };

    case "INSTALL_ERROR":
      if (!state.installState) return state;
      return {
        ...state,
        installState: {
          ...state.installState,
          error: action.error,
        },
      };

    case "INSTALL_COMPLETE":
      if (!state.installState) return state;
      return {
        ...state,
        installState: {
          ...state.installState,
          result: action.result,
        },
      };

    case "INSTALL_RESET":
      if (!state.installState) return state;
      return {
        ...state,
        installState: {
          ...state.installState,
          progress: null,
          error: null,
          result: null,
        },
      };

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

export function getHelpActions(view: PanelView, activeTabIndex?: number): readonly HelpAction[] {
  if (view === "detail") {
    return [
      { key: "e", label: "Toggle" },
      { key: "Esc", label: "Back" },
    ];
  }

  if (view === "install") {
    // InstallFlow manages its own help bar
    return [];
  }

  // Reins Marketplace placeholder tab — minimal actions
  if (activeTabIndex === 2) {
    return [
      { key: "Tab", label: "Switch Tab" },
      { key: "Esc", label: "Close" },
    ];
  }

  // ClawHub tab — includes sort action
  if (activeTabIndex === 1) {
    return [
      { key: "Tab", label: "Switch Tab" },
      { key: "j/k", label: "Navigate" },
      { key: "Enter", label: "Select" },
      { key: "/", label: "Search" },
      { key: "s", label: "Sort" },
      { key: "Esc", label: "Close" },
    ];
  }

  // Installed tab (default)
  return [
    { key: "Tab", label: "Switch Tab" },
    { key: "j/k", label: "Navigate" },
    { key: "Enter", label: "Select" },
    { key: "/", label: "Search" },
    { key: "e", label: "Toggle" },
    { key: "Esc", label: "Close" },
  ];
}

function HelpBar({ view, activeTabIndex, tokens }: { view: PanelView; activeTabIndex?: number; tokens: Record<string, string> }) {
  const actions = getHelpActions(view, activeTabIndex);

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
  marketplaceSource = null,
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

  // Handle marketplace skill selection (ClawHub tab)
  const handleMarketplaceSelect = useCallback((slug: string) => {
    dispatch({ type: "SELECT_MARKETPLACE_SKILL", slug });
  }, []);

  // Handle marketplace skill install — transitions to install flow view.
  // The actual SkillInstaller.install() call will be wired in Task 5.5;
  // for now this sets up the UI flow with the detail data from the source.
  const handleMarketplaceInstall = useCallback((slug: string, version: string) => {
    if (!marketplaceSource) return;

    marketplaceSource.getDetail(slug).then((result) => {
      if (result.ok) {
        dispatch({ type: "START_INSTALL", slug, version, detail: result.value });
      }
    }).catch(() => {
      // Silently ignore — detail view already handles errors
    });
  }, [marketplaceSource]);

  // Install flow callbacks
  const handleInstallConfirm = useCallback(() => {
    // Actual SkillInstaller.install() call will be wired in Task 5.5.
    // The InstallFlow component transitions to "progress" step on confirm.
  }, []);

  const handleInstallCancel = useCallback(() => {
    dispatch({ type: "GO_BACK" });
  }, []);

  const handleInstallComplete = useCallback(() => {
    dispatch({ type: "GO_BACK" });
  }, []);

  const handleInstallRetry = useCallback(() => {
    dispatch({ type: "INSTALL_RESET" });
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

  // Install flow view — shown when user triggers install from detail view
  if (state.view === "install" && state.installState) {
    const inst = state.installState;
    return (
      <ModalPanel
        visible={visible}
        title={`Install ${inst.detail.name}`}
        hint="Installing skill"
        width={76}
        height={24}
        closeOnEscape={false}
        onClose={handleClose}
      >
        <InstallFlow
          skillName={inst.detail.name}
          skillVersion={inst.version}
          skillAuthor={inst.detail.author}
          trustLevel={inst.detail.trustLevel}
          requiredTools={inst.detail.requiredTools}
          onConfirm={handleInstallConfirm}
          onCancel={handleInstallCancel}
          onComplete={handleInstallComplete}
          onRetry={handleInstallRetry}
          installProgress={inst.progress}
          installError={inst.error}
          installResult={inst.result}
        />
      </ModalPanel>
    );
  }

  // Marketplace detail view — shown when a marketplace skill is selected on ClawHub tab
  if (state.view === "detail" && state.selectedMarketplaceSkill && marketplaceSource) {
    return (
      <ModalPanel
        visible={visible}
        title={state.selectedMarketplaceSkill}
        hint="Enter install · Esc back"
        width={76}
        height={24}
        closeOnEscape={false}
        onClose={handleClose}
      >
        <MarketplaceDetailView
          slug={state.selectedMarketplaceSkill}
          source={marketplaceSource}
          onBack={handleBack}
          onInstall={handleMarketplaceInstall}
        />
      </ModalPanel>
    );
  }

  // Installed skill detail view — shown when an installed skill is selected
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

  // ClawHub tab — marketplace skill list
  if (state.activeTabIndex === 1) {
    return (
      <ModalPanel
        visible={visible}
        title="Skills"
        hint="Tab switch · s sort · / search · Esc close"
        width={76}
        height={24}
        closeOnEscape={false}
        onClose={handleClose}
      >
        <MarketplaceListPanel
          source={marketplaceSource}
          onSelectSkill={handleMarketplaceSelect}
          tabBar={
            <TabBar
              tabs={SKILL_PANEL_TABS}
              activeIndex={state.activeTabIndex}
              onTabChange={handleTabChange}
            />
          }
        />
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
      <MarketplacePlaceholder
        tabBar={
          <TabBar
            tabs={SKILL_PANEL_TABS}
            activeIndex={state.activeTabIndex}
            onTabChange={handleTabChange}
          />
        }
      />
      <Box style={{ marginTop: 1 }}>
        <HelpBar view="list" activeTabIndex={state.activeTabIndex} tokens={tokens} />
      </Box>
    </ModalPanel>
  );
}
