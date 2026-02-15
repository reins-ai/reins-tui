import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { DaemonProfileStore, type TransportType } from "@reins/core";

import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../daemon/client";
import {
  addDaemonProfile,
  switchDaemonProfile,
  removeDaemonProfile,
  showDaemonToken,
  rotateDaemonToken,
} from "../daemon/actions";
import { useDaemon } from "../daemon/daemon-context";
import { useThemeTokens } from "../theme";
import { Box, Input, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DaemonPanelProps {
  visible: boolean;
  onClose: () => void;
}

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
// State machine
// ---------------------------------------------------------------------------

type PanelStep =
  | "ready"
  | "adding"
  | "confirm-remove"
  | "token-show"
  | "token-rotate-confirm"
  | "action-prompt";

type ActiveInput = "name" | "url";

interface PanelState {
  readonly step: PanelStep;
  readonly selectedIndex: number;
  readonly profiles: readonly DaemonProfileDisplay[];
  readonly connection: ConnectionInfo;
  readonly statusMessage: string | null;
  // Add form state
  readonly addName: string;
  readonly addUrl: string;
  readonly activeInput: ActiveInput;
  // Remove confirmation
  readonly pendingRemoveName: string | null;
  // Token state
  readonly tokenValue: string | null;
  readonly tokenProfile: string | null;
  // Busy flag for async operations
  readonly busy: boolean;
}

type PanelAction =
  | {
      type: "HYDRATE";
      profiles: readonly DaemonProfileDisplay[];
      connection: ConnectionInfo;
    }
  | { type: "LOAD_FAILED"; message: string }
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  // Add flow
  | { type: "START_ADD" }
  | { type: "SET_ADD_NAME"; value: string }
  | { type: "SET_ADD_URL"; value: string }
  | { type: "FOCUS_URL" }
  | { type: "SUBMIT_ADD_SUCCESS"; message: string }
  | { type: "SUBMIT_ADD_ERROR"; message: string }
  | { type: "CANCEL_ADD" }
  // Switch (immediate)
  | { type: "DO_SWITCH_SUCCESS"; message: string }
  | { type: "DO_SWITCH_ERROR"; message: string }
  // Remove flow
  | { type: "START_CONFIRM_REMOVE"; name: string }
  | { type: "CONFIRM_REMOVE_SUCCESS"; message: string }
  | { type: "CONFIRM_REMOVE_ERROR"; message: string }
  | { type: "CANCEL_REMOVE" }
  // Token flow
  | { type: "SHOW_TOKEN"; token: string; profile: string }
  | { type: "SHOW_TOKEN_ERROR"; message: string }
  | { type: "START_ROTATE_CONFIRM" }
  | { type: "CONFIRM_ROTATE_SUCCESS"; message: string }
  | { type: "CONFIRM_ROTATE_ERROR"; message: string }
  | { type: "CANCEL_TOKEN" }
  // General
  | { type: "SET_BUSY"; busy: boolean }
  | { type: "DISMISS_STATUS" }
  // Legacy (kept for status message display)
  | { type: "ACTION_ADD" }
  | { type: "ACTION_SWITCH" }
  | { type: "ACTION_REMOVE" }
  | { type: "ACTION_TOKEN" };

const INITIAL_STATE: PanelState = {
  step: "ready",
  selectedIndex: 0,
  profiles: [],
  connection: {
    address: DEFAULT_DAEMON_HTTP_BASE_URL,
    transport: "localhost",
    latency: "n/a",
    authStatus: "unknown",
  },
  statusMessage: null,
  addName: "",
  addUrl: "",
  activeInput: "name",
  pendingRemoveName: null,
  tokenValue: null,
  tokenProfile: null,
  busy: false,
};

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        profiles: action.profiles,
        connection: action.connection,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.profiles.length - 1)),
      };

    case "LOAD_FAILED":
      return {
        ...state,
        statusMessage: action.message,
      };

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

    // --- Add flow ---

    case "START_ADD":
      return {
        ...state,
        step: "adding",
        addName: "",
        addUrl: "",
        activeInput: "name",
        statusMessage: null,
      };

    case "SET_ADD_NAME":
      return { ...state, addName: action.value };

    case "SET_ADD_URL":
      return { ...state, addUrl: action.value };

    case "FOCUS_URL":
      return { ...state, activeInput: "url" };

    case "SUBMIT_ADD_SUCCESS":
      return {
        ...state,
        step: "ready",
        addName: "",
        addUrl: "",
        activeInput: "name",
        statusMessage: action.message,
        busy: false,
      };

    case "SUBMIT_ADD_ERROR":
      return {
        ...state,
        statusMessage: action.message,
        busy: false,
      };

    case "CANCEL_ADD":
      return {
        ...state,
        step: "ready",
        addName: "",
        addUrl: "",
        activeInput: "name",
        statusMessage: null,
      };

    // --- Switch (immediate) ---

    case "DO_SWITCH_SUCCESS":
      return {
        ...state,
        step: "ready",
        statusMessage: action.message,
        busy: false,
      };

    case "DO_SWITCH_ERROR":
      return {
        ...state,
        step: "ready",
        statusMessage: action.message,
        busy: false,
      };

    // --- Remove flow ---

    case "START_CONFIRM_REMOVE":
      return {
        ...state,
        step: "confirm-remove",
        pendingRemoveName: action.name,
        statusMessage: null,
      };

    case "CONFIRM_REMOVE_SUCCESS": {
      const newLength = state.profiles.length - 1;
      return {
        ...state,
        step: "ready",
        pendingRemoveName: null,
        statusMessage: action.message,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, newLength - 1)),
        busy: false,
      };
    }

    case "CONFIRM_REMOVE_ERROR":
      return {
        ...state,
        step: "ready",
        pendingRemoveName: null,
        statusMessage: action.message,
        busy: false,
      };

    case "CANCEL_REMOVE":
      return {
        ...state,
        step: "ready",
        pendingRemoveName: null,
        statusMessage: null,
      };

    // --- Token flow ---

    case "SHOW_TOKEN":
      return {
        ...state,
        step: "token-show",
        tokenValue: action.token,
        tokenProfile: action.profile,
        statusMessage: null,
        busy: false,
      };

    case "SHOW_TOKEN_ERROR":
      return {
        ...state,
        step: "ready",
        statusMessage: action.message,
        busy: false,
      };

    case "START_ROTATE_CONFIRM":
      return {
        ...state,
        step: "token-rotate-confirm",
      };

    case "CONFIRM_ROTATE_SUCCESS":
      return {
        ...state,
        step: "ready",
        tokenValue: null,
        tokenProfile: null,
        statusMessage: action.message,
        busy: false,
      };

    case "CONFIRM_ROTATE_ERROR":
      return {
        ...state,
        step: "ready",
        tokenValue: null,
        tokenProfile: null,
        statusMessage: action.message,
        busy: false,
      };

    case "CANCEL_TOKEN":
      return {
        ...state,
        step: "ready",
        tokenValue: null,
        tokenProfile: null,
        statusMessage: null,
      };

    // --- General ---

    case "SET_BUSY":
      return { ...state, busy: action.busy };

    case "DISMISS_STATUS":
      return {
        ...state,
        step: "ready",
        statusMessage: null,
      };

    // Legacy actions — kept for backward compat if any external dispatch
    case "ACTION_ADD":
      return panelReducer(state, { type: "START_ADD" });

    case "ACTION_SWITCH": {
      const profile = state.profiles[state.selectedIndex];
      if (!profile) return state;
      return {
        ...state,
        step: "action-prompt",
        statusMessage: `Switching to '${profile.name}'...`,
        busy: true,
      };
    }

    case "ACTION_REMOVE": {
      const profile = state.profiles[state.selectedIndex];
      if (!profile) return state;
      return panelReducer(state, { type: "START_CONFIRM_REMOVE", name: profile.name });
    }

    case "ACTION_TOKEN":
      return {
        ...state,
        busy: true,
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

function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") return value.plainText;
    if ("value" in value && typeof value.value === "string") return value.value;
  }
  return "";
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
  isError,
}: {
  message: string;
  tokens: Record<string, string>;
  isError?: boolean;
}) {
  return (
    <Box style={{ flexDirection: "row", marginTop: 1 }}>
      <Text content="→ " style={{ color: isError ? tokens["status.error"] : tokens["accent.primary"] }} />
      <Text content={message} style={{ color: isError ? tokens["status.error"] : tokens["text.secondary"] }} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Inline form sub-components
// ---------------------------------------------------------------------------

function AddForm({
  state,
  tokens,
  onNameInput,
  onUrlInput,
}: {
  state: PanelState;
  tokens: Record<string, string>;
  onNameInput: (value: string) => void;
  onUrlInput: (value: string) => void;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text content="Add Profile" style={{ color: tokens["accent.primary"] }} />
      </Box>

      {/* Name field */}
      <Box style={{ flexDirection: "row" }}>
        <Text content="Name: " style={{ color: tokens["text.muted"] }} />
        <Text
          content={state.addName || (state.activeInput === "name" ? " " : "")}
          style={{ color: tokens["text.primary"] }}
        />
      </Box>
      {state.activeInput === "name" ? (
        <Input
          focused
          placeholder="my-daemon"
          value={state.addName}
          onInput={(value) => onNameInput(extractInputValue(value))}
        />
      ) : null}

      {/* URL field */}
      <Box style={{ flexDirection: "row", marginTop: state.activeInput === "url" ? 0 : 0 }}>
        <Text content="URL:  " style={{ color: tokens["text.muted"] }} />
        <Text
          content={state.addUrl || (state.activeInput === "url" ? " " : "")}
          style={{ color: tokens["text.primary"] }}
        />
      </Box>
      {state.activeInput === "url" ? (
        <Input
          focused
          placeholder="http://localhost:7433"
          value={state.addUrl}
          onInput={(value) => onUrlInput(extractInputValue(value))}
        />
      ) : null}

      {/* Hint */}
      <Box style={{ marginTop: 1 }}>
        <Text
          content={state.activeInput === "name" ? "Enter next field · Esc cancel" : "Enter submit · Esc cancel"}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}

function ConfirmRemove({
  name,
  tokens,
}: {
  name: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Box style={{ flexDirection: "row" }}>
        <Text
          content={`Remove profile '${name}'? `}
          style={{ color: tokens["text.primary"] }}
        />
        <Text content="(y/n)" style={{ color: tokens["text.muted"] }} />
      </Box>
    </Box>
  );
}

function TokenDisplay({
  token,
  profile,
  step,
  tokens,
}: {
  token: string;
  profile: string;
  step: "token-show" | "token-rotate-confirm";
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text content="Token" style={{ color: tokens["accent.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text content="Profile: " style={{ color: tokens["text.muted"] }} />
        <Text content={profile} style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text content="Token:   " style={{ color: tokens["text.muted"] }} />
        <Text content={token} style={{ color: tokens["text.primary"] }} />
      </Box>
      {step === "token-show" ? (
        <Box style={{ marginTop: 1 }}>
          <Text content="t rotate · Esc close" style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : (
        <Box style={{ flexDirection: "column", marginTop: 1 }}>
          <Box style={{ flexDirection: "row" }}>
            <Text
              content="Rotate token? This cannot be undone. "
              style={{ color: tokens["status.warning"] }}
            />
            <Text content="(y/n)" style={{ color: tokens["text.muted"] }} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DaemonPanel({ visible, onClose }: DaemonPanelProps) {
  const { tokens } = useThemeTokens();
  const { connectionStatus } = useDaemon();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);
  const profileStore = useMemo(() => new DaemonProfileStore(), []);

  // Track a refresh counter so we can re-load profiles after mutations
  const refreshCounterRef = useRef(0);

  const reloadProfiles = useCallback(() => {
    refreshCounterRef.current += 1;
    const currentRefresh = refreshCounterRef.current;

    void (async () => {
      const profileResult = await profileStore.list();
      // Only apply if this is still the latest refresh
      if (currentRefresh !== refreshCounterRef.current) return;

      if (!profileResult.ok) {
        dispatch({ type: "LOAD_FAILED", message: profileResult.error.message });
        return;
      }

      const profiles = profileResult.value.map((profile) => ({
        name: profile.name,
        url: profile.httpUrl,
        transport: profile.transportType,
        isDefault: profile.isDefault,
        encrypted: isTransportEncrypted(profile.transportType),
      }));

      const defaultProfile = profiles.find((profile) => profile.isDefault) ?? null;
      const connection: ConnectionInfo = {
        address: defaultProfile?.url ?? DEFAULT_DAEMON_HTTP_BASE_URL,
        transport: defaultProfile?.transport ?? "localhost",
        latency: connectionStatus === "connected" ? "<1ms" : "n/a",
        authStatus: connectionStatus === "connected" ? "authenticated" : "unauthenticated",
      };

      dispatch({ type: "HYDRATE", profiles, connection });
    })();
  }, [connectionStatus, profileStore]);

  useEffect(() => {
    if (!visible) return;
    reloadProfiles();
  }, [connectionStatus, visible, reloadProfiles]);

  // --- Action handlers ---

  const handleAddSubmit = useCallback(async (name: string, url: string) => {
    dispatch({ type: "SET_BUSY", busy: true });
    const result = await addDaemonProfile(name.trim(), url.trim());
    if (result.ok) {
      dispatch({ type: "SUBMIT_ADD_SUCCESS", message: result.message });
      reloadProfiles();
    } else {
      dispatch({ type: "SUBMIT_ADD_ERROR", message: result.error });
    }
  }, [reloadProfiles]);

  const handleSwitch = useCallback(async (name: string) => {
    dispatch({ type: "SET_BUSY", busy: true });
    const result = await switchDaemonProfile(name);
    if (result.ok) {
      dispatch({ type: "DO_SWITCH_SUCCESS", message: result.message });
      reloadProfiles();
    } else {
      dispatch({ type: "DO_SWITCH_ERROR", message: result.error });
    }
  }, [reloadProfiles]);

  const handleRemoveConfirm = useCallback(async (name: string) => {
    dispatch({ type: "SET_BUSY", busy: true });
    const result = await removeDaemonProfile(name);
    if (result.ok) {
      dispatch({ type: "CONFIRM_REMOVE_SUCCESS", message: result.message });
      reloadProfiles();
    } else {
      dispatch({ type: "CONFIRM_REMOVE_ERROR", message: result.error });
    }
  }, [reloadProfiles]);

  const handleTokenShow = useCallback(async () => {
    dispatch({ type: "SET_BUSY", busy: true });
    const result = await showDaemonToken();
    if (result.ok) {
      // Extract profile name from "Profile: <name>"
      const profileName = result.message.replace("Profile: ", "");
      dispatch({ type: "SHOW_TOKEN", token: result.token ?? "(not configured)", profile: profileName });
    } else {
      dispatch({ type: "SHOW_TOKEN_ERROR", message: result.error });
    }
  }, []);

  const handleTokenRotate = useCallback(async () => {
    dispatch({ type: "SET_BUSY", busy: true });
    const result = await rotateDaemonToken();
    if (result.ok) {
      dispatch({ type: "CONFIRM_ROTATE_SUCCESS", message: `Token rotated. New: ${result.token ?? ""}` });
    } else {
      dispatch({ type: "CONFIRM_ROTATE_ERROR", message: result.error });
    }
  }, []);

  // --- Input handlers ---

  const handleNameInput = useCallback((value: string) => {
    dispatch({ type: "SET_ADD_NAME", value });
  }, []);

  const handleUrlInput = useCallback((value: string) => {
    dispatch({ type: "SET_ADD_URL", value });
  }, []);

  // --- Keyboard handler ---

  useKeyboard((event) => {
    if (!visible) return;
    if (state.busy) return;

    const keyName = event.name ?? "";

    // --- Adding step: input is focused, only handle Enter/Escape ---
    if (state.step === "adding") {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "CANCEL_ADD" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        if (state.activeInput === "name") {
          if (state.addName.trim().length > 0) {
            dispatch({ type: "FOCUS_URL" });
          }
        } else {
          // Submit
          if (state.addName.trim().length > 0 && state.addUrl.trim().length > 0) {
            void handleAddSubmit(state.addName, state.addUrl);
          }
        }
        return;
      }
      // Let Input component handle other keys
      return;
    }

    // --- Confirm remove step ---
    if (state.step === "confirm-remove") {
      if (keyName === "y" && state.pendingRemoveName) {
        void handleRemoveConfirm(state.pendingRemoveName);
        return;
      }
      if (keyName === "n" || keyName === "escape" || keyName === "esc") {
        dispatch({ type: "CANCEL_REMOVE" });
        return;
      }
      return;
    }

    // --- Token show step ---
    if (state.step === "token-show") {
      if (keyName === "t") {
        dispatch({ type: "START_ROTATE_CONFIRM" });
        return;
      }
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "CANCEL_TOKEN" });
        return;
      }
      return;
    }

    // --- Token rotate confirm step ---
    if (state.step === "token-rotate-confirm") {
      if (keyName === "y") {
        void handleTokenRotate();
        return;
      }
      if (keyName === "n" || keyName === "escape" || keyName === "esc") {
        dispatch({ type: "CANCEL_TOKEN" });
        return;
      }
      return;
    }

    // --- Action prompt (status message display) ---
    if (state.step === "action-prompt" && state.statusMessage !== null) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "DISMISS_STATUS" });
        return;
      }
      dispatch({ type: "DISMISS_STATUS" });
      return;
    }

    // --- Ready step ---

    // Escape in ready step closes the panel
    if (keyName === "escape" || keyName === "esc") {
      onClose();
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
      dispatch({ type: "START_ADD" });
      return;
    }
    if (keyName === "s") {
      const profile = state.profiles[state.selectedIndex];
      if (!profile) {
        dispatch({ type: "DISMISS_STATUS" });
        return;
      }
      void handleSwitch(profile.name);
      return;
    }
    if (keyName === "r") {
      const profile = state.profiles[state.selectedIndex];
      if (!profile) return;
      dispatch({ type: "START_CONFIRM_REMOVE", name: profile.name });
      return;
    }
    if (keyName === "t") {
      void handleTokenShow();
      return;
    }
  });

  // Determine the hint text based on current step
  const hintText = state.step === "ready"
    ? "↑↓ navigate  Esc close"
    : state.step === "adding"
      ? ""
      : state.step === "confirm-remove"
        ? ""
        : state.step === "token-show" || state.step === "token-rotate-confirm"
          ? ""
          : "Esc dismiss";

  // Determine if the status message looks like an error
  const isStatusError = state.statusMessage !== null && (
    state.statusMessage.startsWith("Cannot ")
    || state.statusMessage.startsWith("Unable to ")
    || state.statusMessage.includes("not found")
    || state.statusMessage.includes("error")
    || state.statusMessage.includes("Error")
  );

  return (
    <ModalPanel
      visible={visible}
      title="Daemon"
      hint={hintText}
      width={72}
      height={22}
      closeOnEscape={false}
      onClose={onClose}
    >
      <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <ConnectionSection connection={state.connection} tokens={tokens} />

        {/* Profile list — always visible except during add form */}
        {state.step !== "adding" && state.step !== "token-show" && state.step !== "token-rotate-confirm" ? (
          <ProfileList
            profiles={state.profiles}
            selectedIndex={state.selectedIndex}
            tokens={tokens}
          />
        ) : null}

        {/* Add form */}
        {state.step === "adding" ? (
          <AddForm
            state={state}
            tokens={tokens}
            onNameInput={handleNameInput}
            onUrlInput={handleUrlInput}
          />
        ) : null}

        {/* Confirm remove */}
        {state.step === "confirm-remove" && state.pendingRemoveName ? (
          <ConfirmRemove name={state.pendingRemoveName} tokens={tokens} />
        ) : null}

        {/* Token display */}
        {(state.step === "token-show" || state.step === "token-rotate-confirm") && state.tokenValue !== null ? (
          <TokenDisplay
            token={state.tokenValue}
            profile={state.tokenProfile ?? "unknown"}
            step={state.step}
            tokens={tokens}
          />
        ) : null}

        {/* Action bar — only in ready/action-prompt steps */}
        {state.step === "ready" || state.step === "action-prompt" || state.step === "confirm-remove" ? (
          <ActionBar tokens={tokens} />
        ) : null}

        {/* Status messages */}
        {state.statusMessage !== null ? (
          <StatusBar message={state.statusMessage} tokens={tokens} isError={isStatusError} />
        ) : null}

        {/* Busy indicator */}
        {state.busy ? (
          <Box style={{ marginTop: 1 }}>
            <Text content="Working..." style={{ color: tokens["text.muted"] }} />
          </Box>
        ) : null}
      </Box>
    </ModalPanel>
  );
}
