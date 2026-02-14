import { useCallback, useEffect, useReducer } from "react";

import { readUserConfig, writeUserConfig } from "@reins/core/config";
import type { ConnectService } from "../providers/connect-service";
import { useThemeTokens } from "../theme";
import { Box, Text, Input, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SearchSettingsModalProps {
  visible: boolean;
  connectService: ConnectService;
  onClose: () => void;
  onProviderChanged?: (provider: string) => void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type KeyStatus = "unknown" | "configured" | "not_configured" | "checking";

type SearchProvider = "brave" | "exa";

interface SearchSettingsState {
  activeProvider: SearchProvider;
  braveKeyStatus: KeyStatus;
  exaKeyStatus: KeyStatus;
  keyInput: string;
  editingProvider: SearchProvider | null;
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  section: "provider" | "keys";
  providerCursor: number;
  keyCursor: number;
}

type SearchSettingsAction =
  | { type: "SET_ACTIVE_PROVIDER"; provider: SearchProvider }
  | { type: "SET_KEY_STATUS"; provider: SearchProvider; status: KeyStatus }
  | { type: "SET_EDITING_PROVIDER"; provider: SearchProvider | null }
  | { type: "SET_KEY_INPUT"; value: string }
  | { type: "SET_LOADING"; value: boolean }
  | { type: "SET_ERROR"; message: string | null }
  | { type: "SET_SUCCESS"; message: string | null }
  | { type: "SET_SECTION"; section: "provider" | "keys" }
  | { type: "SET_PROVIDER_CURSOR"; index: number }
  | { type: "SET_KEY_CURSOR"; index: number }
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "RESET" };

const PROVIDERS: readonly { id: SearchProvider; label: string; keyName: string }[] = [
  { id: "brave", label: "Brave Search", keyName: "brave_search" },
  { id: "exa", label: "Exa", keyName: "exa" },
];

const INITIAL_STATE: SearchSettingsState = {
  activeProvider: "brave",
  braveKeyStatus: "unknown",
  exaKeyStatus: "unknown",
  keyInput: "",
  editingProvider: null,
  isLoading: false,
  error: null,
  successMessage: null,
  section: "provider",
  providerCursor: 0,
  keyCursor: 0,
};

function settingsReducer(state: SearchSettingsState, action: SearchSettingsAction): SearchSettingsState {
  switch (action.type) {
    case "SET_ACTIVE_PROVIDER":
      return { ...state, activeProvider: action.provider, error: null };
    case "SET_KEY_STATUS": {
      if (action.provider === "brave") {
        return { ...state, braveKeyStatus: action.status };
      }
      return { ...state, exaKeyStatus: action.status };
    }
    case "SET_EDITING_PROVIDER":
      return { ...state, editingProvider: action.provider, keyInput: "", error: null };
    case "SET_KEY_INPUT":
      return { ...state, keyInput: action.value };
    case "SET_LOADING":
      return { ...state, isLoading: action.value };
    case "SET_ERROR":
      return { ...state, error: action.message, successMessage: null };
    case "SET_SUCCESS":
      return { ...state, successMessage: action.message, error: null };
    case "SET_SECTION":
      return { ...state, section: action.section };
    case "SET_PROVIDER_CURSOR":
      return { ...state, providerCursor: action.index };
    case "SET_KEY_CURSOR":
      return { ...state, keyCursor: action.index };
    case "NAVIGATE_UP": {
      if (state.section === "provider") {
        return {
          ...state,
          providerCursor: state.providerCursor <= 0
            ? PROVIDERS.length - 1
            : state.providerCursor - 1,
        };
      }
      return {
        ...state,
        keyCursor: state.keyCursor <= 0
          ? PROVIDERS.length - 1
          : state.keyCursor - 1,
      };
    }
    case "NAVIGATE_DOWN": {
      if (state.section === "provider") {
        return {
          ...state,
          providerCursor: (state.providerCursor + 1) % PROVIDERS.length,
        };
      }
      return {
        ...state,
        keyCursor: (state.keyCursor + 1) % PROVIDERS.length,
      };
    }
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getKeyStatus(state: SearchSettingsState, provider: SearchProvider): KeyStatus {
  return provider === "brave" ? state.braveKeyStatus : state.exaKeyStatus;
}

function getProviderKeyName(provider: SearchProvider): string {
  const entry = PROVIDERS.find((p) => p.id === provider);
  return entry?.keyName ?? provider;
}

function getProviderLabel(provider: SearchProvider): string {
  const entry = PROVIDERS.find((p) => p.id === provider);
  return entry?.label ?? provider;
}

function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") return value.plainText;
    if ("value" in value && typeof value.value === "string") return value.value;
  }
  return "";
}

function maskKey(value: string): string {
  if (value.length <= 4) {
    return "●".repeat(value.length);
  }
  return "●".repeat(value.length - 4) + value.slice(-4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchSettingsModal({
  visible,
  connectService,
  onClose,
  onProviderChanged,
}: SearchSettingsModalProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(settingsReducer, INITIAL_STATE);

  // Load current provider preference and key statuses on mount/visible
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const loadState = async () => {
      // Load provider preference from user config
      const configResult = await readUserConfig();
      if (!cancelled && configResult.ok && configResult.value) {
        const searchProvider = configResult.value.provider.search?.provider;
        if (searchProvider === "brave" || searchProvider === "exa") {
          dispatch({ type: "SET_ACTIVE_PROVIDER", provider: searchProvider });
          dispatch({
            type: "SET_PROVIDER_CURSOR",
            index: PROVIDERS.findIndex((p) => p.id === searchProvider),
          });
        }
      }

      // Check key status for both providers
      for (const provider of PROVIDERS) {
        dispatch({ type: "SET_KEY_STATUS", provider: provider.id, status: "checking" });
        try {
          const result = await connectService.getProviderAuthStatus(provider.keyName);
          if (cancelled) return;
          if (result.ok && result.value.configured) {
            dispatch({ type: "SET_KEY_STATUS", provider: provider.id, status: "configured" });
          } else {
            dispatch({ type: "SET_KEY_STATUS", provider: provider.id, status: "not_configured" });
          }
        } catch {
          if (!cancelled) {
            dispatch({ type: "SET_KEY_STATUS", provider: provider.id, status: "not_configured" });
          }
        }
      }
    };

    void loadState();

    return () => {
      cancelled = true;
    };
  }, [visible, connectService]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      dispatch({ type: "RESET" });
    }
  }, [visible]);

  const switchProvider = useCallback(async (provider: SearchProvider) => {
    dispatch({ type: "SET_LOADING", value: true });
    dispatch({ type: "SET_ERROR", message: null });

    try {
      const existingResult = await readUserConfig();
      const existing = existingResult.ok ? existingResult.value : null;
      const mode = existing?.provider.mode ?? "none";

      await writeUserConfig({
        provider: {
          mode,
          search: { provider },
        },
      });

      dispatch({ type: "SET_ACTIVE_PROVIDER", provider });
      dispatch({ type: "SET_SUCCESS", message: `Provider switched to ${getProviderLabel(provider)}` });
      onProviderChanged?.(provider);
    } catch {
      dispatch({ type: "SET_ERROR", message: "Failed to save provider preference" });
    } finally {
      dispatch({ type: "SET_LOADING", value: false });
    }
  }, [onProviderChanged]);

  const addKey = useCallback(async (provider: SearchProvider, key: string) => {
    dispatch({ type: "SET_LOADING", value: true });
    dispatch({ type: "SET_ERROR", message: null });

    const keyName = getProviderKeyName(provider);
    const result = await connectService.configureBYOK(keyName, key);

    if (result.ok) {
      const statusResult = await connectService.getProviderAuthStatus(keyName);
      const isConfigured = statusResult.ok && statusResult.value.configured;

      dispatch({
        type: "SET_KEY_STATUS",
        provider,
        status: isConfigured ? "configured" : "not_configured",
      });
      dispatch({ type: "SET_EDITING_PROVIDER", provider: null });

      if (isConfigured) {
        dispatch({ type: "SET_SUCCESS", message: `${getProviderLabel(provider)} API key configured` });
      } else {
        dispatch({
          type: "SET_ERROR",
          message: `${getProviderLabel(provider)} API key could not be verified after saving`,
        });
      }
    } else {
      dispatch({ type: "SET_ERROR", message: result.error.message });
    }

    dispatch({ type: "SET_LOADING", value: false });
  }, [connectService]);

  const removeKey = useCallback(async (provider: SearchProvider) => {
    dispatch({ type: "SET_LOADING", value: true });
    dispatch({ type: "SET_ERROR", message: null });

    const keyName = getProviderKeyName(provider);
    const result = await connectService.disconnect(keyName);

    if (result.ok) {
      dispatch({ type: "SET_KEY_STATUS", provider, status: "not_configured" });
      dispatch({ type: "SET_SUCCESS", message: `${getProviderLabel(provider)} API key removed` });
    } else {
      dispatch({ type: "SET_ERROR", message: result.error.message });
    }

    dispatch({ type: "SET_LOADING", value: false });
  }, [connectService]);

  const handleKeyInput = useCallback((value: string) => {
    dispatch({ type: "SET_KEY_INPUT", value });
  }, []);

  useKeyboard((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";

    // When editing a key, handle input-specific keys
    if (state.editingProvider !== null) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "SET_EDITING_PROVIDER", provider: null });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        if (state.keyInput.trim().length > 0 && !state.isLoading) {
          void addKey(state.editingProvider, state.keyInput);
        }
        return;
      }
      // Let Input component handle other keys
      return;
    }

    if (state.isLoading) return;

    // Tab: switch between sections
    if (keyName === "tab") {
      dispatch({
        type: "SET_SECTION",
        section: state.section === "provider" ? "keys" : "provider",
      });
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

    // Enter: select/activate
    if (keyName === "return" || keyName === "enter") {
      if (state.section === "provider") {
        const selected = PROVIDERS[state.providerCursor];
        if (selected && selected.id !== state.activeProvider) {
          void switchProvider(selected.id);
        }
        return;
      }

      // Keys section
      const selectedProvider = PROVIDERS[state.keyCursor];
      if (!selectedProvider) return;

      const status = getKeyStatus(state, selectedProvider.id);
      if (status === "configured") {
        void removeKey(selectedProvider.id);
      } else if (status === "not_configured") {
        dispatch({ type: "SET_EDITING_PROVIDER", provider: selectedProvider.id });
      }
      return;
    }
  });

  if (!visible) return null;

  return (
    <ModalPanel
      visible={visible}
      title="Search Settings"
      hint="Tab section · ↑↓ navigate · Enter select · Esc close"
      width={60}
      height={18}
      onClose={onClose}
    >
      <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        {/* Provider Selection Section */}
        <Box style={{ marginBottom: 1 }}>
          <Text
            content="Active Provider"
            style={{
              color: state.section === "provider"
                ? tokens["text.primary"]
                : tokens["text.muted"],
            }}
          />
        </Box>
        <Box style={{ flexDirection: "column", marginBottom: 1 }}>
          {PROVIDERS.map((provider, index) => {
            const isActive = state.activeProvider === provider.id;
            const isHighlighted = state.section === "provider" && state.providerCursor === index;

            return (
              <Box
                key={provider.id}
                style={{
                  flexDirection: "row",
                  paddingLeft: 1,
                  backgroundColor: isHighlighted ? tokens["surface.secondary"] : "transparent",
                }}
              >
                <Text
                  content={isActive ? "[●] " : "[○] "}
                  style={{
                    color: isActive
                      ? tokens["accent.primary"]
                      : tokens["text.muted"],
                  }}
                />
                <Text
                  content={provider.label}
                  style={{
                    color: isHighlighted
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
              </Box>
            );
          })}
        </Box>

        {/* API Keys Section */}
        <Box style={{ marginBottom: 1 }}>
          <Text
            content="API Keys"
            style={{
              color: state.section === "keys"
                ? tokens["text.primary"]
                : tokens["text.muted"],
            }}
          />
        </Box>
        <Box style={{ flexDirection: "column" }}>
          {PROVIDERS.map((provider, index) => {
            const status = getKeyStatus(state, provider.id);
            const isHighlighted = state.section === "keys" && state.keyCursor === index;
            const isConfigured = status === "configured";
            const isChecking = status === "checking" || status === "unknown";

            const statusText = isChecking
              ? "◎ Checking..."
              : isConfigured
                ? "✓ Configured"
                : "✗ Not set";

            const statusColor = isChecking
              ? tokens["text.muted"]
              : isConfigured
                ? tokens["status.success"]
                : tokens["text.muted"];

            const actionText = isConfigured ? "[Remove]" : "[Add Key]";

            return (
              <Box
                key={provider.id}
                style={{
                  flexDirection: "row",
                  paddingLeft: 1,
                  backgroundColor: isHighlighted ? tokens["surface.secondary"] : "transparent",
                }}
              >
                <Text
                  content={`${provider.label}: `}
                  style={{ color: tokens["text.secondary"] }}
                />
                <Text
                  content={statusText}
                  style={{ color: statusColor }}
                />
                {!isChecking ? (
                  <Text
                    content={`  ${actionText}`}
                    style={{
                      color: isHighlighted
                        ? tokens["accent.primary"]
                        : tokens["text.muted"],
                    }}
                  />
                ) : null}
              </Box>
            );
          })}
        </Box>

        {/* Key Input Area */}
        {state.editingProvider !== null ? (
          <Box style={{ flexDirection: "column", marginTop: 1 }}>
            <Text
              content={`Enter API key for ${getProviderLabel(state.editingProvider)}:`}
              style={{ color: tokens["text.primary"] }}
            />
            <Box style={{ flexDirection: "row", marginTop: 0 }}>
              <Text
                content={maskKey(state.keyInput) || " "}
                style={{ color: tokens["text.secondary"] }}
              />
            </Box>
            <Input
              focused
              placeholder=""
              value={state.keyInput}
              onInput={(value) => handleKeyInput(extractInputValue(value))}
            />
          </Box>
        ) : null}

        {/* Status Messages */}
        {state.successMessage ? (
          <Box style={{ marginTop: 1 }}>
            <Text
              content={`✓ ${state.successMessage}`}
              style={{ color: tokens["status.success"] }}
            />
          </Box>
        ) : null}
        {state.error ? (
          <Box style={{ marginTop: 1 }}>
            <Text
              content={`✗ ${state.error}`}
              style={{ color: tokens["status.error"] }}
            />
          </Box>
        ) : null}
        {state.isLoading ? (
          <Box style={{ marginTop: 1 }}>
            <Text
              content="◎ Processing..."
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        ) : null}
      </Box>
    </ModalPanel>
  );
}
