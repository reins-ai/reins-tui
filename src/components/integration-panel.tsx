import { useCallback, useEffect, useReducer } from "react";

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

interface PanelState {
  readonly connected: readonly IntegrationSummary[];
  readonly available: readonly IntegrationSummary[];
  readonly selectedId: string | null;
  readonly focusSection: FocusSection;
  readonly connectedIndex: number;
  readonly availableIndex: number;
  readonly statusMessage: string | null;
  readonly busy: boolean;
}

type PanelAction =
  | {
      type: "HYDRATE";
      connected: readonly IntegrationSummary[];
      available: readonly IntegrationSummary[];
    }
  | { type: "LOAD_FAILED"; message: string }
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "SWITCH_SECTION" }
  | { type: "SELECT_CURRENT" }
  | { type: "SET_BUSY"; busy: boolean }
  | { type: "DISMISS_STATUS" };

const INITIAL_STATE: PanelState = {
  connected: [],
  available: [],
  selectedId: null,
  focusSection: "connected",
  connectedIndex: 0,
  availableIndex: 0,
  statusMessage: null,
  busy: false,
};

function getActiveList(state: PanelState): readonly IntegrationSummary[] {
  return state.focusSection === "connected" || state.focusSection === "detail"
    ? state.connected
    : state.available;
}

function getActiveIndex(state: PanelState): number {
  return state.focusSection === "connected" || state.focusSection === "detail"
    ? state.connectedIndex
    : state.availableIndex;
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
      if (list.length === 0) return state;

      if (state.focusSection === "connected" || state.focusSection === "detail") {
        const nextIndex = state.connectedIndex <= 0
          ? list.length - 1
          : state.connectedIndex - 1;
        return {
          ...state,
          connectedIndex: nextIndex,
          selectedId: list[nextIndex]?.id ?? null,
          focusSection: "connected",
        };
      }

      const nextIndex = state.availableIndex <= 0
        ? list.length - 1
        : state.availableIndex - 1;
      return {
        ...state,
        availableIndex: nextIndex,
        selectedId: list[nextIndex]?.id ?? null,
      };
    }

    case "NAVIGATE_DOWN": {
      const list = getActiveList(state);
      if (list.length === 0) return state;

      if (state.focusSection === "connected" || state.focusSection === "detail") {
        const nextIndex = (state.connectedIndex + 1) % list.length;
        return {
          ...state,
          connectedIndex: nextIndex,
          selectedId: list[nextIndex]?.id ?? null,
          focusSection: "connected",
        };
      }

      const nextIndex = (state.availableIndex + 1) % list.length;
      return {
        ...state,
        availableIndex: nextIndex,
        selectedId: list[nextIndex]?.id ?? null,
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
      const list = getActiveList(state);
      const index = getActiveIndex(state);
      const item = list[index];
      if (!item) return state;
      return {
        ...state,
        selectedId: item.id,
        focusSection: "detail",
      };
    }

    case "SET_BUSY":
      return { ...state, busy: action.busy };

    case "DISMISS_STATUS":
      return { ...state, statusMessage: null };

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
  tokens,
}: {
  integration: IntegrationSummary | null;
  isFocused: boolean;
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
      </Box>
    </Box>
  );
}

function ActionBar({ tokens }: { tokens: Record<string, string> }) {
  const actions = [
    { key: "Tab", label: "Section" },
    { key: "j/k", label: "Navigate" },
    { key: "Enter", label: "Select" },
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
      connected: [
        {
          id: "obsidian",
          name: "Obsidian",
          status: "connected",
          version: "1.0.0",
          description: "Local Markdown vault for notes and knowledge management.",
          category: "productivity",
          operations: [
            { name: "search-notes", description: "Search notes by content and title" },
            { name: "read-note", description: "Read note content by path" },
            { name: "create-note", description: "Create new note with title and content" },
            { name: "list-notes", description: "List notes in a directory" },
          ],
        },
        {
          id: "gmail",
          name: "Gmail",
          status: "auth_expired",
          version: "1.0.0",
          description: "Google email with OAuth2 authentication.",
          category: "communication",
          operations: [
            { name: "read-email", description: "Read email by ID" },
            { name: "search-emails", description: "Search emails by query" },
            { name: "send-email", description: "Send email with to/cc/bcc/subject/body" },
            { name: "list-emails", description: "List recent inbox emails" },
          ],
        },
        {
          id: "spotify",
          name: "Spotify",
          status: "error",
          version: "1.0.0",
          description: "Music playback and library management.",
          category: "media",
          operations: [
            { name: "get-playback", description: "Get current playback state" },
            { name: "control-playback", description: "Play, pause, skip, or go to previous track" },
            { name: "search", description: "Search tracks, albums, artists, playlists" },
            { name: "get-playlists", description: "Get user's playlists" },
          ],
        },
      ],
      available: [
        {
          id: "slack",
          name: "Slack",
          status: "disconnected",
          version: "1.0.0",
          description: "Team messaging and collaboration.",
          category: "communication",
          operations: [
            { name: "send-message", description: "Send a message to a channel or user" },
            { name: "list-channels", description: "List available channels" },
            { name: "search-messages", description: "Search messages across channels" },
          ],
        },
        {
          id: "notion",
          name: "Notion",
          status: "disconnected",
          version: "1.0.0",
          description: "Workspace for notes, docs, and project management.",
          category: "productivity",
          operations: [
            { name: "search-pages", description: "Search pages by title or content" },
            { name: "read-page", description: "Read page content by ID" },
            { name: "create-page", description: "Create a new page in a database" },
          ],
        },
      ],
    });
  }, [visible]);

  // Keyboard handler
  useKeyboard(useCallback((event) => {
    if (!visible) return;
    if (state.busy) return;

    const keyName = event.name ?? "";

    // Escape closes the panel
    if (keyName === "escape" || keyName === "esc") {
      onClose();
      return;
    }

    // Tab switches between sections
    if (keyName === "tab") {
      dispatch({ type: "SWITCH_SECTION" });
      return;
    }

    // j/k or Up/Down for navigation
    if (keyName === "up" || keyName === "k") {
      dispatch({ type: "NAVIGATE_UP" });
      return;
    }
    if (keyName === "down" || keyName === "j") {
      dispatch({ type: "NAVIGATE_DOWN" });
      return;
    }

    // Enter selects current item and shows detail
    if (keyName === "return" || keyName === "enter") {
      dispatch({ type: "SELECT_CURRENT" });
      return;
    }
  }, [visible, state.busy, onClose]));

  const selectedIntegration = findIntegration(
    state.connected,
    state.available,
    state.selectedId,
  );

  const hintText = "Tab section · j/k nav · Enter select · Esc close";

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
      <Box style={{ flexDirection: "row", flexGrow: 1, minHeight: 0 }}>
        {/* Left column: connected + available lists */}
        <Box style={{ flexDirection: "column", width: 32 }}>
          <IntegrationList
            title="Connected"
            items={state.connected}
            selectedIndex={state.connectedIndex}
            isFocused={state.focusSection === "connected"}
            tokens={tokens}
          />
          <IntegrationList
            title="Available"
            items={state.available}
            selectedIndex={state.availableIndex}
            isFocused={state.focusSection === "available"}
            tokens={tokens}
          />
          <ActionBar tokens={tokens} />
        </Box>

        {/* Right column: detail pane */}
        <Box style={{ flexDirection: "column", flexGrow: 1, paddingLeft: 2 }}>
          <DetailPane
            integration={selectedIntegration}
            isFocused={state.focusSection === "detail"}
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

      {/* Busy indicator */}
      {state.busy ? (
        <Box style={{ marginTop: 1 }}>
          <Text content="Loading..." style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}
    </ModalPanel>
  );
}
