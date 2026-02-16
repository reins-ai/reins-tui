import { useCallback, useEffect, useReducer, useRef } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IntegrationPanelProps {
  visible: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Display types (structured for future daemon API wiring)
// ---------------------------------------------------------------------------

export type IntegrationStatus = "connected" | "error" | "auth_expired" | "suspended" | "disconnected";

export interface OperationSummary {
  readonly name: string;
  readonly description: string;
}

export interface IntegrationSummary {
  readonly id: string;
  readonly name: string;
  readonly status: IntegrationStatus;
  readonly version: string;
  readonly description: string;
  readonly category: string;
  readonly operations: readonly OperationSummary[];
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type FocusSection = "connected" | "available" | "detail";

export type IntegrationActionName =
  | "enable"
  | "disable"
  | "connect"
  | "disconnect"
  | "reconnect"
  | "resume"
  | "retry";

type ActionStep = "idle" | "confirm-disconnect" | "action-in-progress";

type FeedbackType = "success" | "error";

interface PanelState {
  readonly connected: readonly IntegrationSummary[];
  readonly available: readonly IntegrationSummary[];
  readonly selectedId: string | null;
  readonly focusSection: FocusSection;
  readonly connectedIndex: number;
  readonly availableIndex: number;
  readonly statusMessage: string | null;
  readonly busy: boolean;
  // Action state
  readonly actionStep: ActionStep;
  readonly actionFeedback: string | null;
  readonly actionFeedbackType: FeedbackType | null;
  readonly selectedActionIndex: number;
  // Search state
  readonly searchMode: boolean;
  readonly searchQuery: string;
}

type PanelAction =
  | {
      type: "HYDRATE";
      connected: readonly IntegrationSummary[];
      available: readonly IntegrationSummary[];
    }
  | { type: "LOAD_FAILED"; message: string }
  | { type: "NAVIGATE_UP"; listLength?: number }
  | { type: "NAVIGATE_DOWN"; listLength?: number }
  | { type: "SWITCH_SECTION" }
  | { type: "SELECT_CURRENT" }
  | { type: "SET_BUSY"; busy: boolean }
  | { type: "DISMISS_STATUS" }
  // Action flow
  | { type: "START_ACTION" }
  | { type: "ACTION_SUCCESS"; message: string }
  | { type: "ACTION_ERROR"; error: string }
  | { type: "CLEAR_ACTION_FEEDBACK" }
  | { type: "START_CONFIRM_DISCONNECT" }
  | { type: "CANCEL_CONFIRM" }
  | { type: "NAVIGATE_ACTION_LEFT" }
  | { type: "NAVIGATE_ACTION_RIGHT" }
  // Search flow
  | { type: "ENTER_SEARCH" }
  | { type: "EXIT_SEARCH" }
  | { type: "SET_SEARCH_QUERY"; query: string };

const INITIAL_STATE: PanelState = {
  connected: [],
  available: [],
  selectedId: null,
  focusSection: "connected",
  connectedIndex: 0,
  availableIndex: 0,
  statusMessage: null,
  busy: false,
  actionStep: "idle",
  actionFeedback: null,
  actionFeedbackType: null,
  selectedActionIndex: 0,
  searchMode: false,
  searchQuery: "",
};

function getActiveList(state: PanelState): readonly IntegrationSummary[] {
  return state.focusSection === "connected" || state.focusSection === "detail"
    ? state.connected
    : state.available;
}

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "HYDRATE": {
      const firstConnected = action.connected[0] ?? null;
      return {
        ...state,
        connected: action.connected,
        available: action.available,
        selectedId: firstConnected?.id ?? null,
        connectedIndex: 0,
        availableIndex: 0,
        statusMessage: null,
      };
    }

    case "LOAD_FAILED":
      return { ...state, statusMessage: action.message };

    case "NAVIGATE_UP": {
      const list = getActiveList(state);
      const len = action.listLength ?? list.length;
      if (len === 0) return state;

      if (state.focusSection === "connected" || state.focusSection === "detail") {
        const nextIndex = state.connectedIndex <= 0
          ? len - 1
          : state.connectedIndex - 1;
        return {
          ...state,
          connectedIndex: nextIndex,
          // selectedId is resolved by the component from the filtered list
          focusSection: "connected",
        };
      }

      const nextIndex = state.availableIndex <= 0
        ? len - 1
        : state.availableIndex - 1;
      return {
        ...state,
        availableIndex: nextIndex,
      };
    }

    case "NAVIGATE_DOWN": {
      const list = getActiveList(state);
      const len = action.listLength ?? list.length;
      if (len === 0) return state;

      if (state.focusSection === "connected" || state.focusSection === "detail") {
        const nextIndex = (state.connectedIndex + 1) % len;
        return {
          ...state,
          connectedIndex: nextIndex,
          focusSection: "connected",
        };
      }

      const nextIndex = (state.availableIndex + 1) % len;
      return {
        ...state,
        availableIndex: nextIndex,
      };
    }

    case "SWITCH_SECTION": {
      const sections: FocusSection[] = ["connected", "available", "detail"];
      const currentIdx = sections.indexOf(state.focusSection);
      const nextSection = sections[(currentIdx + 1) % sections.length];

      // When switching to a section, select the first item if nothing is selected
      if (nextSection === "connected") {
        const item = state.connected[state.connectedIndex];
        return { ...state, focusSection: nextSection, selectedId: item?.id ?? state.selectedId };
      }
      if (nextSection === "available") {
        const item = state.available[state.availableIndex];
        return { ...state, focusSection: nextSection, selectedId: item?.id ?? state.selectedId };
      }
      // detail — keep current selection
      return { ...state, focusSection: nextSection };
    }

    case "SELECT_CURRENT": {
      // Switch to detail view — the component derives the selected integration
      // from the current index and (possibly filtered) list.
      return {
        ...state,
        focusSection: "detail",
      };
    }

    case "SET_BUSY":
      return { ...state, busy: action.busy };

    case "DISMISS_STATUS":
      return { ...state, statusMessage: null };

    // --- Action flow ---

    case "START_ACTION":
      return {
        ...state,
        actionStep: "action-in-progress",
        busy: true,
        actionFeedback: null,
        actionFeedbackType: null,
      };

    case "ACTION_SUCCESS":
      return {
        ...state,
        actionStep: "idle",
        busy: false,
        actionFeedback: action.message,
        actionFeedbackType: "success",
      };

    case "ACTION_ERROR":
      return {
        ...state,
        actionStep: "idle",
        busy: false,
        actionFeedback: action.error,
        actionFeedbackType: "error",
      };

    case "CLEAR_ACTION_FEEDBACK":
      return {
        ...state,
        actionFeedback: null,
        actionFeedbackType: null,
      };

    case "START_CONFIRM_DISCONNECT":
      return {
        ...state,
        actionStep: "confirm-disconnect",
        actionFeedback: null,
        actionFeedbackType: null,
      };

    case "CANCEL_CONFIRM":
      return {
        ...state,
        actionStep: "idle",
      };

    case "NAVIGATE_ACTION_LEFT":
      return {
        ...state,
        selectedActionIndex: Math.max(0, state.selectedActionIndex - 1),
      };

    case "NAVIGATE_ACTION_RIGHT":
      return {
        ...state,
        selectedActionIndex: state.selectedActionIndex + 1,
      };

    // --- Search flow ---

    case "ENTER_SEARCH":
      return {
        ...state,
        searchMode: true,
        searchQuery: "",
      };

    case "EXIT_SEARCH":
      return {
        ...state,
        searchMode: false,
        searchQuery: "",
        connectedIndex: 0,
        availableIndex: 0,
      };

    case "SET_SEARCH_QUERY":
      return {
        ...state,
        searchQuery: action.query,
        connectedIndex: 0,
        availableIndex: 0,
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStatusGlyph(status: IntegrationStatus): string {
  switch (status) {
    case "connected":
      return "●";
    case "error":
      return "●";
    case "auth_expired":
      return "▲";
    case "suspended":
      return "○";
    case "disconnected":
      return "○";
  }
}

export function getStatusColorToken(status: IntegrationStatus): string {
  switch (status) {
    case "connected":
      return "status.success";
    case "error":
      return "status.error";
    case "auth_expired":
      return "status.warning";
    case "suspended":
      return "text.muted";
    case "disconnected":
      return "text.muted";
  }
}

export function getStatusLabel(status: IntegrationStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "error":
      return "Error";
    case "auth_expired":
      return "Auth Expired";
    case "suspended":
      return "Suspended";
    case "disconnected":
      return "Not Connected";
  }
}

export function findIntegration(
  connected: readonly IntegrationSummary[],
  available: readonly IntegrationSummary[],
  id: string | null,
): IntegrationSummary | null {
  if (!id) return null;
  return (
    connected.find((i) => i.id === id)
    ?? available.find((i) => i.id === id)
    ?? null
  );
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

/**
 * Filters integrations by a search query, matching against name, id, and
 * description (case-insensitive). Returns the full list when query is empty.
 */
export function filterIntegrations(
  integrations: readonly IntegrationSummary[],
  query: string,
): readonly IntegrationSummary[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return integrations;

  return integrations.filter(
    (item) =>
      item.name.toLowerCase().includes(trimmed) ||
      item.id.toLowerCase().includes(trimmed) ||
      item.description.toLowerCase().includes(trimmed),
  );
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

/**
 * Returns the list of available actions for a given integration status.
 * Actions are displayed as keyboard-driven buttons in the detail pane.
 */
export function getAvailableActions(status: IntegrationStatus): readonly IntegrationActionName[] {
  switch (status) {
    case "connected":
      return ["disable", "disconnect"];
    case "disconnected":
      return ["enable", "connect"];
    case "auth_expired":
      return ["reconnect", "disconnect"];
    case "suspended":
      return ["resume", "disconnect"];
    case "error":
      return ["retry", "disconnect"];
  }
}

export function getActionLabel(action: IntegrationActionName): string {
  switch (action) {
    case "enable":
      return "Enable";
    case "disable":
      return "Disable";
    case "connect":
      return "Connect";
    case "disconnect":
      return "Disconnect";
    case "reconnect":
      return "Reconnect";
    case "resume":
      return "Resume";
    case "retry":
      return "Retry";
  }
}

function getActionKeyHint(action: IntegrationActionName): string {
  switch (action) {
    case "enable":
      return "e";
    case "disable":
      return "d";
    case "connect":
      return "c";
    case "disconnect":
      return "x";
    case "reconnect":
      return "c";
    case "resume":
      return "e";
    case "retry":
      return "e";
  }
}

// ---------------------------------------------------------------------------
// Daemon API (mock — all integration logic lives in the daemon)
// ---------------------------------------------------------------------------

const ACTIVE_NATIVE_INTEGRATION_ID = "obsidian";

/**
 * Mock daemon API call for integration actions.
 *
 * TODO: Replace with actual daemon HTTP calls once the daemon integration
 * service (Wave 9) is wired. The TUI never performs integration logic
 * directly — it only sends action requests and displays results.
 */
export async function callIntegrationAction(
  integrationId: string,
  action: string,
  config?: Record<string, unknown>,
): Promise<{ success: boolean; message: string; error?: string }> {
  // Simulate network delay to daemon
  await new Promise((resolve) => setTimeout(resolve, 400));

  // TODO: Replace with actual fetch to daemon API:
  //   const url = `${daemonBaseUrl}/integrations/${integrationId}/${action}`;
  //   const response = await fetch(url, { method: "POST", body: JSON.stringify(config) });
  //   return response.json();

  void config;

  if (integrationId !== ACTIVE_NATIVE_INTEGRATION_ID) {
    return {
      success: false,
      message: `${action} failed for ${integrationId}`,
      error: "Only Obsidian is enabled as a native integration in this milestone.",
    };
  }

  return {
    success: true,
    message: `${action} completed for ${integrationId}`,
  };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function executeIntegrationAction(
  integrationId: string,
  action: IntegrationActionName,
  dispatch: React.Dispatch<PanelAction>,
): Promise<void> {
  dispatch({ type: "START_ACTION" });

  try {
    const endpoint = action === "reconnect" ? "connect" : action;
    const result = await callIntegrationAction(integrationId, endpoint);

    if (result.success) {
      const label = getActionLabel(action);
      dispatch({
        type: "ACTION_SUCCESS",
        message: result.message || `${label} successful`,
      });
    } else {
      dispatch({
        type: "ACTION_ERROR",
        error: result.error || `Failed to ${action} integration`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    dispatch({ type: "ACTION_ERROR", error: message });
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IntegrationList({
  title,
  items,
  selectedIndex,
  isFocused,
  tokens,
}: {
  title: string;
  items: readonly IntegrationSummary[];
  selectedIndex: number;
  isFocused: boolean;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text
          content={`${title} (${items.length})`}
          style={{ color: isFocused ? tokens["accent.primary"] : tokens["text.secondary"] }}
        />
      </Box>
      {items.length === 0 ? (
        <Box style={{ paddingLeft: 2 }}>
          <Text content="None" style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}
      {items.map((item, index) => {
        const isSelected = isFocused && index === selectedIndex;
        const statusGlyph = getStatusGlyph(item.status);
        const statusColor = tokens[getStatusColorToken(item.status)];
        const statusLabel = getStatusLabel(item.status);

        return (
          <Box
            key={item.id}
            style={{
              flexDirection: "row",
              paddingLeft: 1,
              backgroundColor: isSelected ? tokens["surface.elevated"] : "transparent",
            }}
          >
            <Text
              content={isSelected ? "> " : "  "}
              style={{ color: tokens["accent.primary"] }}
            />
            <Text content={statusGlyph} style={{ color: statusColor }} />
            <Text content=" " style={{ color: tokens["text.primary"] }} />
            <Text
              content={item.name}
              style={{
                color: isSelected ? tokens["text.primary"] : tokens["text.secondary"],
              }}
            />
            {item.status !== "disconnected" ? (
              <Text
                content={`  ${statusLabel}`}
                style={{ color: statusColor }}
              />
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function DetailPane({
  integration,
  isFocused,
  actionStep,
  actionFeedback,
  actionFeedbackType,
  selectedActionIndex,
  tokens,
}: {
  integration: IntegrationSummary | null;
  isFocused: boolean;
  actionStep: ActionStep;
  actionFeedback: string | null;
  actionFeedbackType: FeedbackType | null;
  selectedActionIndex: number;
  tokens: Record<string, string>;
}) {
  if (!integration) {
    return (
      <Box style={{ flexDirection: "column", flexGrow: 1 }}>
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text content="Detail" style={{ color: tokens["text.secondary"] }} />
        </Box>
        <Box style={{ paddingLeft: 2 }}>
          <Text content="Select an integration" style={{ color: tokens["text.muted"] }} />
        </Box>
      </Box>
    );
  }

  const statusGlyph = getStatusGlyph(integration.status);
  const statusColor = tokens[getStatusColorToken(integration.status)];
  const statusLabel = getStatusLabel(integration.status);
  const actions = getAvailableActions(integration.status);

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text
          content="Detail"
          style={{ color: isFocused ? tokens["accent.primary"] : tokens["text.secondary"] }}
        />
      </Box>
      <Box style={{ flexDirection: "column", paddingLeft: 2 }}>
        {/* Name and version */}
        <Box style={{ flexDirection: "row" }}>
          <Text content={integration.name} style={{ color: tokens["text.primary"] }} />
          <Text content={`  v${integration.version}`} style={{ color: tokens["text.muted"] }} />
        </Box>

        {/* Status with label */}
        <Box style={{ flexDirection: "row" }}>
          <Text content="Status: " style={{ color: tokens["text.muted"] }} />
          <Text content={statusGlyph} style={{ color: statusColor }} />
          <Text content={` ${statusLabel}`} style={{ color: statusColor }} />
        </Box>

        {/* Category */}
        {integration.category.length > 0 ? (
          <Box style={{ flexDirection: "row" }}>
            <Text content="Category: " style={{ color: tokens["text.muted"] }} />
            <Text content={integration.category} style={{ color: tokens["text.secondary"] }} />
          </Box>
        ) : null}

        {/* Description */}
        {integration.description.length > 0 ? (
          <Box style={{ flexDirection: "row", marginTop: 1 }}>
            <Text content={integration.description} style={{ color: tokens["text.secondary"] }} />
          </Box>
        ) : null}

        {/* Operations with descriptions */}
        {integration.operations.length > 0 ? (
          <Box style={{ flexDirection: "column", marginTop: 1 }}>
            <Text
              content={`Operations (${integration.operations.length}):`}
              style={{ color: tokens["text.muted"] }}
            />
            {integration.operations.map((op) => (
              <Box key={op.name} style={{ flexDirection: "column", paddingLeft: 2 }}>
                <Box style={{ flexDirection: "row" }}>
                  <Text content="• " style={{ color: tokens["accent.primary"] }} />
                  <Text content={op.name} style={{ color: tokens["text.primary"] }} />
                </Box>
                {op.description.length > 0 ? (
                  <Box style={{ flexDirection: "row", paddingLeft: 4 }}>
                    <Text content={op.description} style={{ color: tokens["text.muted"] }} />
                  </Box>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}

        {/* Action buttons — only when focused and not confirming */}
        {isFocused && actionStep !== "confirm-disconnect" ? (
          <IntegrationActionButtons
            actions={actions}
            selectedIndex={selectedActionIndex}
            disabled={actionStep === "action-in-progress"}
            tokens={tokens}
          />
        ) : null}

        {/* Confirm disconnect dialog */}
        {actionStep === "confirm-disconnect" ? (
          <ConfirmDisconnect integrationName={integration.name} tokens={tokens} />
        ) : null}

        {/* Action in progress indicator */}
        {actionStep === "action-in-progress" ? (
          <Box style={{ flexDirection: "row", marginTop: 1 }}>
            <Text content="⏳ " style={{ color: tokens["accent.primary"] }} />
            <Text content="Performing action..." style={{ color: tokens["text.muted"] }} />
          </Box>
        ) : null}

        {/* Action feedback */}
        {actionFeedback !== null && actionFeedbackType !== null ? (
          <ActionFeedback
            message={actionFeedback}
            feedbackType={actionFeedbackType}
            tokens={tokens}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function ActionBar({ searchMode, tokens }: { searchMode: boolean; tokens: Record<string, string> }) {
  const actions = searchMode
    ? [
        { key: "Esc", label: "Cancel" },
      ]
    : [
        { key: "Tab", label: "Section" },
        { key: "j/k", label: "Navigate" },
        { key: "Enter", label: "Select" },
        { key: "/", label: "Search" },
      ];

  return (
    <Box style={{ flexDirection: "row" }}>
      {actions.map((action, index) => (
        <Box key={action.key} style={{ flexDirection: "row" }}>
          {index > 0 ? (
            <Text content="  " style={{ color: tokens["text.muted"] }} />
          ) : null}
          <Text
            content={action.key}
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

function IntegrationActionButtons({
  actions,
  selectedIndex,
  disabled,
  tokens,
}: {
  actions: readonly IntegrationActionName[];
  selectedIndex: number;
  disabled: boolean;
  tokens: Record<string, string>;
}) {
  if (actions.length === 0) return null;

  // Clamp index to valid range
  const clampedIndex = Math.min(selectedIndex, actions.length - 1);

  return (
    <Box style={{ flexDirection: "column", marginTop: 1 }}>
      <Text content="Actions" style={{ color: tokens["text.muted"] }} />
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        {actions.map((action, index) => {
          const isSelected = index === clampedIndex;
          const label = getActionLabel(action);
          const keyHint = getActionKeyHint(action);
          const isDestructive = action === "disconnect" || action === "disable";

          let textColor = tokens["text.secondary"];
          if (disabled) {
            textColor = tokens["text.muted"];
          } else if (isSelected && isDestructive) {
            textColor = tokens["status.error"];
          } else if (isSelected) {
            textColor = tokens["accent.primary"];
          }

          return (
            <Box key={action} style={{ flexDirection: "row" }}>
              {index > 0 ? (
                <Text content="  " style={{ color: tokens["text.muted"] }} />
              ) : null}
              <Text
                content={isSelected ? `[${keyHint}] ${label}` : `${keyHint} ${label}`}
                style={{ color: textColor }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function ConfirmDisconnect({
  integrationName,
  tokens,
}: {
  integrationName: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column", marginTop: 1 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text
          content={`Disconnect '${integrationName}'? `}
          style={{ color: tokens["status.warning"] }}
        />
        <Text content="(y/n)" style={{ color: tokens["text.muted"] }} />
      </Box>
    </Box>
  );
}

function ActionFeedback({
  message,
  feedbackType,
  tokens,
}: {
  message: string;
  feedbackType: FeedbackType;
  tokens: Record<string, string>;
}) {
  const glyph = feedbackType === "success" ? "✓" : "✗";
  const color = feedbackType === "success" ? tokens["status.success"] : tokens["status.error"];

  return (
    <Box style={{ flexDirection: "row", marginTop: 1 }}>
      <Text content={`${glyph} `} style={{ color }} />
      <Text content={message} style={{ color }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntegrationPanel({ visible, onClose }: IntegrationPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);

  // Load integration data from daemon when panel becomes visible
  useEffect(() => {
    if (!visible) return;

    // TODO: Replace with actual daemon API call to fetch integration status.
    // The TUI only displays data — all integration logic lives in the daemon.
    dispatch({
      type: "HYDRATE",
      connected: [],
      available: [
        {
          id: "obsidian",
          name: "Obsidian",
          status: "disconnected",
          version: "1.0.0",
          description: "Local Markdown vault for notes and knowledge management.",
          category: "productivity",
          operations: [
            { name: "connect", description: "Connect to an Obsidian vault path" },
            { name: "search-notes", description: "Search notes by content and title" },
            { name: "read-note", description: "Read note content by path" },
            { name: "create-note", description: "Create new note with title and content" },
            { name: "list-notes", description: "List notes in a directory" },
            { name: "disconnect", description: "Disconnect Obsidian and clear local auth state" },
          ],
        },
      ],
    });
  }, [visible]);

  // Auto-clear success feedback after a delay
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.actionFeedback !== null && state.actionFeedbackType === "success") {
      feedbackTimerRef.current = setTimeout(() => {
        dispatch({ type: "CLEAR_ACTION_FEEDBACK" });
      }, 3000);
      return () => {
        if (feedbackTimerRef.current !== null) {
          clearTimeout(feedbackTimerRef.current);
        }
      };
    }
  }, [state.actionFeedback, state.actionFeedbackType]);

  // Compute filtered lists for search
  const filteredConnected = filterIntegrations(state.connected, state.searchQuery);
  const filteredAvailable = filterIntegrations(state.available, state.searchQuery);

  // Resolve the selected integration from filtered lists and current index.
  // Always derive from the visible (filtered) items so search works correctly.
  const selectedIntegration = (() => {
    if (state.focusSection === "connected" || state.focusSection === "detail") {
      const idx = Math.min(state.connectedIndex, Math.max(0, filteredConnected.length - 1));
      return filteredConnected[idx] ?? null;
    }
    const idx = Math.min(state.availableIndex, Math.max(0, filteredAvailable.length - 1));
    return filteredAvailable[idx] ?? null;
  })();

  // Trigger an action on the selected integration via daemon API
  const triggerAction = useCallback(
    (action: IntegrationActionName) => {
      if (!selectedIntegration) return;

      // Clear any previous feedback
      dispatch({ type: "CLEAR_ACTION_FEEDBACK" });

      // Disconnect requires confirmation
      if (action === "disconnect") {
        dispatch({ type: "START_CONFIRM_DISCONNECT" });
        return;
      }

      void executeIntegrationAction(selectedIntegration.id, action, dispatch);
    },
    [selectedIntegration],
  );

  // Keyboard handler
  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // --- Search mode input handling ---
    if (state.searchMode) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "EXIT_SEARCH" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        // Exit search mode but keep the filter active — user can navigate results
        dispatch({ type: "EXIT_SEARCH" });
        return;
      }
      if (keyName === "backspace" || keyName === "delete") {
        dispatch({
          type: "SET_SEARCH_QUERY",
          query: state.searchQuery.slice(0, -1),
        });
        return;
      }
      // Accept printable characters (single char, no ctrl/meta)
      if (sequence.length === 1 && !event.ctrl && !event.meta) {
        dispatch({
          type: "SET_SEARCH_QUERY",
          query: state.searchQuery + sequence,
        });
        return;
      }
      // Ignore all other keys in search mode
      return;
    }

    // --- Confirm disconnect step ---
    if (state.actionStep === "confirm-disconnect") {
      if (keyName === "y" && selectedIntegration) {
        void executeIntegrationAction(selectedIntegration.id, "disconnect", dispatch);
        return;
      }
      if (keyName === "n" || keyName === "escape" || keyName === "esc") {
        dispatch({ type: "CANCEL_CONFIRM" });
        return;
      }
      return;
    }

    // Block all input during action-in-progress
    if (state.busy) return;

    // / activates search mode (not in detail view to avoid conflict with action keys)
    if (keyName === "/" || sequence === "/") {
      dispatch({ type: "ENTER_SEARCH" });
      return;
    }

    // Escape closes the panel (or clears error feedback first)
    if (keyName === "escape" || keyName === "esc") {
      if (state.actionFeedback !== null && state.actionFeedbackType === "error") {
        dispatch({ type: "CLEAR_ACTION_FEEDBACK" });
        return;
      }
      onClose();
      return;
    }

    // Tab switches between sections
    if (keyName === "tab") {
      dispatch({ type: "SWITCH_SECTION" });
      dispatch({ type: "CLEAR_ACTION_FEEDBACK" });
      return;
    }

    // j/k or Up/Down for navigation — pass filtered list length for search-aware bounds
    if (keyName === "up" || keyName === "k") {
      const activeLen = (state.focusSection === "connected" || state.focusSection === "detail")
        ? filteredConnected.length
        : filteredAvailable.length;
      dispatch({ type: "NAVIGATE_UP", listLength: activeLen });
      return;
    }
    if (keyName === "down" || keyName === "j") {
      const activeLen = (state.focusSection === "connected" || state.focusSection === "detail")
        ? filteredConnected.length
        : filteredAvailable.length;
      dispatch({ type: "NAVIGATE_DOWN", listLength: activeLen });
      return;
    }

    // Enter selects current item and shows detail
    if (keyName === "return" || keyName === "enter") {
      if (state.focusSection === "detail" && selectedIntegration) {
        // In detail view, Enter triggers the currently highlighted action
        const actions = getAvailableActions(selectedIntegration.status);
        const clampedIndex = Math.min(state.selectedActionIndex, actions.length - 1);
        const action = actions[clampedIndex];
        if (action) {
          triggerAction(action);
        }
        return;
      }
      dispatch({ type: "SELECT_CURRENT" });
      return;
    }

    // Action keyboard shortcuts (only in detail view)
    if (state.focusSection === "detail" && selectedIntegration) {
      const actions = getAvailableActions(selectedIntegration.status);

      // Left/Right or h/l to navigate action buttons
      if (keyName === "left" || keyName === "h") {
        dispatch({ type: "NAVIGATE_ACTION_LEFT" });
        return;
      }
      if (keyName === "right" || keyName === "l") {
        dispatch({ type: "NAVIGATE_ACTION_RIGHT" });
        return;
      }

      // Direct key shortcuts for actions
      if (keyName === "e" && actions.includes("enable")) {
        triggerAction("enable");
        return;
      }
      if (keyName === "e" && actions.includes("resume")) {
        triggerAction("resume");
        return;
      }
      if (keyName === "e" && actions.includes("retry")) {
        triggerAction("retry");
        return;
      }
      if (keyName === "d" && actions.includes("disable")) {
        triggerAction("disable");
        return;
      }
      if (keyName === "c" && actions.includes("connect")) {
        triggerAction("connect");
        return;
      }
      if (keyName === "c" && actions.includes("reconnect")) {
        triggerAction("reconnect");
        return;
      }
      if (keyName === "x" && actions.includes("disconnect")) {
        triggerAction("disconnect");
        return;
      }
    }
  }, [visible, state.busy, state.actionStep, state.focusSection, state.selectedActionIndex, state.actionFeedback, state.actionFeedbackType, state.searchMode, state.searchQuery, filteredConnected, filteredAvailable, selectedIntegration, onClose, triggerAction]));

  const searchResultCount = filteredConnected.length + filteredAvailable.length;

  // Compute hint text based on current state
  const hintText = state.searchMode
    ? "Type to search · Esc cancel"
    : state.actionStep === "confirm-disconnect"
      ? "y confirm · n cancel"
      : state.focusSection === "detail"
        ? "h/l actions · Enter run · Tab section · / search · Esc close"
        : "Tab section · j/k nav · Enter select · / search · Esc close";

  return (
    <ModalPanel
      visible={visible}
      title="Integrations"
      hint={hintText}
      width={76}
      height={24}
      closeOnEscape={false}
      onClose={onClose}
    >
      {/* Search bar */}
      {state.searchMode ? (
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text content="/ " style={{ color: tokens["accent.primary"] }} />
          <Text
            content={state.searchQuery.length > 0 ? state.searchQuery : ""}
            style={{ color: tokens["text.primary"] }}
          />
          <Text content="▌" style={{ color: tokens["accent.primary"] }} />
          {state.searchQuery.length > 0 ? (
            <Text
              content={`  ${searchResultCount} found`}
              style={{ color: tokens["text.muted"] }}
            />
          ) : null}
        </Box>
      ) : null}

      <Box style={{ flexDirection: "row", flexGrow: 1, minHeight: 0 }}>
        {/* Left column: connected + available lists */}
        <Box style={{ flexDirection: "column", width: 32 }}>
          <IntegrationList
            title="Connected"
            items={filteredConnected}
            selectedIndex={state.connectedIndex}
            isFocused={state.focusSection === "connected"}
            tokens={tokens}
          />
          <IntegrationList
            title="Available"
            items={filteredAvailable}
            selectedIndex={state.availableIndex}
            isFocused={state.focusSection === "available"}
            tokens={tokens}
          />
          <ActionBar searchMode={state.searchMode} tokens={tokens} />
        </Box>

        {/* Right column: detail pane with actions */}
        <Box style={{ flexDirection: "column", flexGrow: 1, paddingLeft: 2 }}>
          <DetailPane
            integration={selectedIntegration}
            isFocused={state.focusSection === "detail"}
            actionStep={state.actionStep}
            actionFeedback={state.actionFeedback}
            actionFeedbackType={state.actionFeedbackType}
            selectedActionIndex={state.selectedActionIndex}
            tokens={tokens}
          />
        </Box>
      </Box>

      {/* Status messages */}
      {state.statusMessage !== null ? (
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text content="→ " style={{ color: tokens["accent.primary"] }} />
          <Text content={state.statusMessage} style={{ color: tokens["text.secondary"] }} />
        </Box>
      ) : null}

      {/* Busy indicator (only for non-action busy states like initial load) */}
      {state.busy && state.actionStep !== "action-in-progress" ? (
        <Box style={{ marginTop: 1 }}>
          <Text content="Loading..." style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}
    </ModalPanel>
  );
}
