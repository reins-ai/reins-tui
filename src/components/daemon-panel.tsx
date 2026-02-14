import { useReducer } from "react";

import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../daemon/client";
import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DaemonPanelProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Transport security classification.
 * Mirrors @reins/core TransportType — defined locally to avoid
 * depending on an unexported barrel member. Replace with the core
 * import once TransportType is re-exported from @reins/core.
 */
type TransportType = "localhost" | "tailscale" | "cloudflare" | "direct";

// ---------------------------------------------------------------------------
// Display types (structured for future DaemonProfileStore wiring)
// ---------------------------------------------------------------------------

interface DaemonProfileDisplay {
  readonly name: string;
  readonly url: string;
  readonly transport: TransportType;
  readonly isDefault: boolean;
  readonly encrypted: boolean;
}

interface ConnectionInfo {
  readonly address: string;
  readonly transport: TransportType;
  readonly latency: string;
  readonly authStatus: "authenticated" | "unauthenticated" | "unknown";
}

// ---------------------------------------------------------------------------
// Static data (replace with DaemonProfileStore integration later)
// ---------------------------------------------------------------------------

const MOCK_PROFILES: readonly DaemonProfileDisplay[] = [
  {
    name: "local",
    url: DEFAULT_DAEMON_HTTP_BASE_URL,
    transport: "localhost",
    isDefault: true,
    encrypted: true,
  },
];

const MOCK_CONNECTION: ConnectionInfo = {
  address: DEFAULT_DAEMON_HTTP_BASE_URL,
  transport: "localhost",
  latency: "<1ms",
  authStatus: "authenticated",
};

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type PanelStep = "ready" | "action-prompt";

interface PanelState {
  readonly step: PanelStep;
  readonly selectedIndex: number;
  readonly profiles: readonly DaemonProfileDisplay[];
  readonly connection: ConnectionInfo;
  readonly statusMessage: string | null;
}

type PanelAction =
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "ACTION_ADD" }
  | { type: "ACTION_SWITCH" }
  | { type: "ACTION_REMOVE" }
  | { type: "ACTION_TOKEN" }
  | { type: "DISMISS_STATUS" };

const INITIAL_STATE: PanelState = {
  step: "ready",
  selectedIndex: 0,
  profiles: MOCK_PROFILES,
  connection: MOCK_CONNECTION,
  statusMessage: null,
};

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "NAVIGATE_UP": {
      if (state.profiles.length === 0) return state;
      return {
        ...state,
        selectedIndex: state.selectedIndex <= 0
          ? state.profiles.length - 1
          : state.selectedIndex - 1,
      };
    }

    case "NAVIGATE_DOWN": {
      if (state.profiles.length === 0) return state;
      return {
        ...state,
        selectedIndex: (state.selectedIndex + 1) % state.profiles.length,
      };
    }

    case "ACTION_ADD":
      return {
        ...state,
        step: "action-prompt",
        statusMessage: "Use /daemon add <name> <url> to add a profile",
      };

    case "ACTION_SWITCH": {
      const profile = state.profiles[state.selectedIndex];
      if (!profile) return state;
      return {
        ...state,
        step: "action-prompt",
        statusMessage: `Use /daemon switch ${profile.name} to switch`,
      };
    }

    case "ACTION_REMOVE": {
      const profile = state.profiles[state.selectedIndex];
      if (!profile) return state;
      if (profile.isDefault) {
        return {
          ...state,
          step: "action-prompt",
          statusMessage: "Cannot remove the default profile",
        };
      }
      return {
        ...state,
        step: "action-prompt",
        statusMessage: `Use /daemon remove ${profile.name} to remove`,
      };
    }

    case "ACTION_TOKEN":
      return {
        ...state,
        step: "action-prompt",
        statusMessage: "Use /daemon token show or /daemon token rotate",
      };

    case "DISMISS_STATUS":
      return {
        ...state,
        step: "ready",
        statusMessage: null,
      };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTransportBadge(transport: TransportType): string {
  switch (transport) {
    case "localhost":
      return "local";
    case "tailscale":
      return "tailscale";
    case "cloudflare":
      return "cloudflare";
    case "direct":
      return "direct";
  }
}

function isTransportEncrypted(transport: TransportType): boolean {
  return transport !== "direct";
}

function getAuthLabel(status: ConnectionInfo["authStatus"]): string {
  switch (status) {
    case "authenticated":
      return "authenticated";
    case "unauthenticated":
      return "unauthenticated";
    case "unknown":
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionSection({
  connection,
  tokens,
}: {
  connection: ConnectionInfo;
  tokens: Record<string, string>;
}) {
  const encrypted = isTransportEncrypted(connection.transport);
  const securityGlyph = encrypted ? "●" : "▲";
  const securityColor = encrypted ? tokens["status.success"] : tokens["status.warning"];
  const securityLabel = encrypted ? "encrypted" : "unencrypted";

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text
          content="Connection"
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>
      <Box style={{ flexDirection: "column", paddingLeft: 2 }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Address:   " style={{ color: tokens["text.muted"] }} />
          <Text content={connection.address} style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Transport: " style={{ color: tokens["text.muted"] }} />
          <Text
            content={`${getTransportBadge(connection.transport)} `}
            style={{ color: tokens["text.primary"] }}
          />
          <Text content={securityGlyph} style={{ color: securityColor }} />
          <Text content={` ${securityLabel}`} style={{ color: securityColor }} />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Latency:   " style={{ color: tokens["text.muted"] }} />
          <Text content={connection.latency} style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Auth:      " style={{ color: tokens["text.muted"] }} />
          <Text
            content={getAuthLabel(connection.authStatus)}
            style={{
              color: connection.authStatus === "authenticated"
                ? tokens["status.success"]
                : tokens["text.secondary"],
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function ProfileList({
  profiles,
  selectedIndex,
  tokens,
}: {
  profiles: readonly DaemonProfileDisplay[];
  selectedIndex: number;
  tokens: Record<string, string>;
}) {
  if (profiles.length === 0) {
    return (
      <Box style={{ flexDirection: "column", marginBottom: 1 }}>
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text content="Profiles" style={{ color: tokens["accent.primary"] }} />
        </Box>
        <Box style={{ paddingLeft: 2 }}>
          <Text content="No saved profiles" style={{ color: tokens["text.muted"] }} />
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text content="Profiles" style={{ color: tokens["accent.primary"] }} />
      </Box>
      {profiles.map((profile, index) => {
        const isSelected = index === selectedIndex;
        const encrypted = profile.encrypted;
        const securityGlyph = encrypted ? "●" : "▲";
        const securityColor = encrypted
          ? tokens["status.success"]
          : tokens["status.warning"];
        const defaultMarker = profile.isDefault ? " *" : "";

        return (
          <Box
            key={profile.name}
            style={{
              flexDirection: "row",
              paddingLeft: 1,
              backgroundColor: isSelected
                ? tokens["surface.elevated"]
                : "transparent",
            }}
          >
            <Text
              content={isSelected ? "> " : "  "}
              style={{ color: tokens["accent.primary"] }}
            />
            <Text
              content={securityGlyph}
              style={{ color: securityColor }}
            />
            <Text content=" " style={{ color: tokens["text.primary"] }} />
            <Text
              content={profile.name}
              style={{
                color: isSelected
                  ? tokens["text.primary"]
                  : tokens["text.secondary"],
              }}
            />
            <Text
              content={defaultMarker}
              style={{ color: tokens["accent.primary"] }}
            />
            <Text content="  " style={{ color: tokens["text.primary"] }} />
            <Text
              content={profile.url}
              style={{ color: tokens["text.muted"] }}
            />
            <Text content="  " style={{ color: tokens["text.primary"] }} />
            <Text
              content={getTransportBadge(profile.transport)}
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

function ActionBar({ tokens }: { tokens: Record<string, string> }) {
  const actions = [
    { key: "a", label: "Add" },
    { key: "s", label: "Switch" },
    { key: "r", label: "Remove" },
    { key: "t", label: "Token" },
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

function StatusBar({
  message,
  tokens,
}: {
  message: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "row", marginTop: 1 }}>
      <Text content="→ " style={{ color: tokens["accent.primary"] }} />
      <Text content={message} style={{ color: tokens["text.secondary"] }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DaemonPanel({ visible, onClose }: DaemonPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);

  useKeyboard((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";

    // Dismiss status message on any key when showing action prompt
    if (state.step === "action-prompt" && state.statusMessage !== null) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "DISMISS_STATUS" });
        return;
      }
      dispatch({ type: "DISMISS_STATUS" });
      return;
    }

    // Navigation
    if (keyName === "up" || keyName === "k") {
      dispatch({ type: "NAVIGATE_UP" });
      return;
    }
    if (keyName === "down" || keyName === "j") {
      dispatch({ type: "NAVIGATE_DOWN" });
      return;
    }

    // Actions
    if (keyName === "a") {
      dispatch({ type: "ACTION_ADD" });
      return;
    }
    if (keyName === "s") {
      dispatch({ type: "ACTION_SWITCH" });
      return;
    }
    if (keyName === "r") {
      dispatch({ type: "ACTION_REMOVE" });
      return;
    }
    if (keyName === "t") {
      dispatch({ type: "ACTION_TOKEN" });
      return;
    }
  });

  return (
    <ModalPanel
      visible={visible}
      title="Daemon"
      hint="↑↓ navigate  Esc close"
      width={72}
      height={20}
      closeOnEscape
      onClose={onClose}
    >
      <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <ConnectionSection connection={state.connection} tokens={tokens} />
        <ProfileList
          profiles={state.profiles}
          selectedIndex={state.selectedIndex}
          tokens={tokens}
        />
        <ActionBar tokens={tokens} />
        {state.statusMessage !== null ? (
          <StatusBar message={state.statusMessage} tokens={tokens} />
        ) : null}
      </Box>
    </ModalPanel>
  );
}
