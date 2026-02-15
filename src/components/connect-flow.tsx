import { useCallback, useEffect, useReducer } from "react";
import { spawn } from "node:child_process";
import { platform } from "node:os";

import type {
  ConnectError,
  ConnectService,
  ProviderAuthMethod,
  ProviderConnection,
  ProviderListEntry,
  ProviderMode,
} from "../providers/connect-service";
import { useThemeTokens } from "../theme";
import { Box, Text, Input, ScrollBox, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConnectResult {
  readonly success: boolean;
  readonly connection?: ProviderConnection;
  readonly error?: ConnectError;
}

export interface ConnectFlowProps {
  connectService: ConnectService;
  onComplete: (result: ConnectResult) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

export interface ProviderOption {
  readonly id: string;
  readonly label: string;
  readonly authMethods: readonly ProviderAuthMethod[];
  readonly displayStatus?: string;
  readonly connectionState?: string;
}

export const BYOK_PROVIDERS: readonly ProviderOption[] = [
  { id: "anthropic", label: "Anthropic", authMethods: ["api_key", "oauth"] },
  { id: "openai", label: "OpenAI", authMethods: ["api_key"] },
  { id: "custom", label: "Custom", authMethods: ["api_key"] },
];

export interface AuthMethodOption {
  readonly id: ProviderAuthMethod;
  readonly label: string;
  readonly description: string;
}

export const AUTH_METHOD_OPTIONS: readonly AuthMethodOption[] = [
  { id: "api_key", label: "API Key", description: "Enter your API key directly" },
  { id: "oauth", label: "Browser Login", description: "Sign in via browser" },
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type ConnectStep =
  | "mode-select"
  | "providers-loading"
  | "provider-select"
  | "auth-method-select"
  | "api-key-entry"
  | "gateway-token-entry"
  | "oauth-launching"
  | "oauth-waiting"
  | "oauth-code-entry"
  | "oauth-complete"
  | "validating"
  | "success"
  | "error";

interface ConnectState {
  step: ConnectStep;
  selectedModeIndex: number;
  selectedProviderIndex: number;
  selectedAuthMethodIndex: number;
  mode: ProviderMode | null;
  provider: ProviderOption | null;
  authMethod: ProviderAuthMethod | null;
  secretInput: string;
  oauthCodeInput: string;
  connection: ProviderConnection | null;
  error: ConnectError | null;
  oauthUrl: string | null;
  liveProviders: readonly ProviderOption[] | null;
}

type ConnectAction =
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "SELECT_MODE" }
  | { type: "SELECT_PROVIDER" }
  | { type: "SELECT_AUTH_METHOD" }
  | { type: "SET_SECRET"; value: string }
  | { type: "SUBMIT_SECRET" }
  | { type: "GO_BACK" }
  | { type: "OAUTH_LAUNCHING"; url: string }
  | { type: "OAUTH_WAITING" }
  | { type: "OAUTH_CODE_ENTRY" }
  | { type: "SET_OAUTH_CODE"; value: string }
  | { type: "SUBMIT_OAUTH_CODE" }
  | { type: "OAUTH_COMPLETE"; connection: ProviderConnection }
  | { type: "VALIDATION_SUCCESS"; connection: ProviderConnection }
  | { type: "VALIDATION_ERROR"; error: ConnectError }
  | { type: "PROVIDERS_LOADED"; providers: readonly ProviderOption[] }
  | { type: "PROVIDERS_LOAD_FAILED" };

const MODE_OPTIONS: readonly { id: ProviderMode; label: string }[] = [
  { id: "byok", label: "BYOK (Bring Your Own Key)" },
  { id: "gateway", label: "Reins Gateway" },
];

const INITIAL_STATE: ConnectState = {
  step: "mode-select",
  selectedModeIndex: 0,
  selectedProviderIndex: 0,
  selectedAuthMethodIndex: 0,
  mode: null,
  provider: null,
  authMethod: null,
  secretInput: "",
  oauthCodeInput: "",
  connection: null,
  error: null,
  oauthUrl: null,
  liveProviders: null,
};

function getAvailableAuthMethods(provider: ProviderOption | null): readonly AuthMethodOption[] {
  if (!provider) {
    return [];
  }

  return AUTH_METHOD_OPTIONS.filter((method) => provider.authMethods.includes(method.id));
}

export function getActiveProviders(state: ConnectState): readonly ProviderOption[] {
  return state.liveProviders ?? BYOK_PROVIDERS;
}

export function mapDaemonProviderToOption(entry: ProviderListEntry): ProviderOption {
  return {
    id: entry.providerId,
    label: entry.providerName,
    authMethods: entry.authMethods.length > 0 ? entry.authMethods : ["api_key"],
    displayStatus: entry.displayStatus,
    connectionState: entry.connectionState,
  };
}

export function formatAuthMethodBadges(methods: readonly ProviderAuthMethod[]): string {
  return methods
    .map((m) => (m === "api_key" ? "BYOK" : m === "oauth" ? "OAuth" : m))
    .join(" · ");
}

export function statusGlyph(connectionState: string | undefined): string {
  switch (connectionState) {
    case "ready":
      return "●";
    case "requires_reauth":
      return "◎";
    case "invalid":
      return "✗";
    default:
      return "○";
  }
}

export function statusColor(connectionState: string | undefined, tokens: Record<string, string>): string {
  switch (connectionState) {
    case "ready":
      return tokens["status.success"];
    case "requires_reauth":
      return tokens["status.warning"];
    case "invalid":
      return tokens["status.error"];
    default:
      return tokens["text.muted"];
  }
}

export function connectReducer(state: ConnectState, action: ConnectAction): ConnectState {
  const providers = getActiveProviders(state);

  switch (action.type) {
    case "NAVIGATE_UP": {
      if (state.step === "mode-select") {
        return {
          ...state,
          selectedModeIndex: state.selectedModeIndex <= 0
            ? MODE_OPTIONS.length - 1
            : state.selectedModeIndex - 1,
        };
      }
      if (state.step === "provider-select") {
        return {
          ...state,
          selectedProviderIndex: state.selectedProviderIndex <= 0
            ? providers.length - 1
            : state.selectedProviderIndex - 1,
        };
      }
      if (state.step === "auth-method-select") {
        const methods = getAvailableAuthMethods(state.provider);
        return {
          ...state,
          selectedAuthMethodIndex: state.selectedAuthMethodIndex <= 0
            ? methods.length - 1
            : state.selectedAuthMethodIndex - 1,
        };
      }
      return state;
    }

    case "NAVIGATE_DOWN": {
      if (state.step === "mode-select") {
        return {
          ...state,
          selectedModeIndex: (state.selectedModeIndex + 1) % MODE_OPTIONS.length,
        };
      }
      if (state.step === "provider-select") {
        return {
          ...state,
          selectedProviderIndex: (state.selectedProviderIndex + 1) % providers.length,
        };
      }
      if (state.step === "auth-method-select") {
        const methods = getAvailableAuthMethods(state.provider);
        return {
          ...state,
          selectedAuthMethodIndex: (state.selectedAuthMethodIndex + 1) % methods.length,
        };
      }
      return state;
    }

    case "SELECT_MODE": {
      if (state.step !== "mode-select") return state;
      const selected = MODE_OPTIONS[state.selectedModeIndex];
      if (selected.id === "byok") {
        return {
          ...state,
          step: state.liveProviders === null ? "providers-loading" : "provider-select",
          mode: "byok",
          selectedProviderIndex: 0,
        };
      }
      return {
        ...state,
        step: "gateway-token-entry",
        mode: "gateway",
        secretInput: "",
      };
    }

    case "PROVIDERS_LOADED": {
      return {
        ...state,
        step: "provider-select",
        liveProviders: action.providers,
        selectedProviderIndex: 0,
      };
    }

    case "PROVIDERS_LOAD_FAILED": {
      return {
        ...state,
        step: "provider-select",
        liveProviders: null,
        selectedProviderIndex: 0,
      };
    }

    case "SELECT_PROVIDER": {
      if (state.step !== "provider-select") return state;
      const provider = providers[state.selectedProviderIndex];

      if (provider.authMethods.length > 1) {
        return {
          ...state,
          step: "auth-method-select",
          provider,
          selectedAuthMethodIndex: 0,
        };
      }

      return {
        ...state,
        step: "api-key-entry",
        provider,
        authMethod: "api_key",
        secretInput: "",
      };
    }

    case "SELECT_AUTH_METHOD": {
      if (state.step !== "auth-method-select") return state;
      const methods = getAvailableAuthMethods(state.provider);
      const selected = methods[state.selectedAuthMethodIndex];
      if (!selected) return state;

      if (selected.id === "oauth") {
        return {
          ...state,
          step: "oauth-launching",
          authMethod: "oauth",
        };
      }

      return {
        ...state,
        step: "api-key-entry",
        authMethod: "api_key",
        secretInput: "",
      };
    }

    case "SET_SECRET":
      return { ...state, secretInput: action.value };

    case "SUBMIT_SECRET": {
      if (state.step !== "api-key-entry" && state.step !== "gateway-token-entry") return state;
      if (state.secretInput.trim().length === 0) return state;
      return { ...state, step: "validating" };
    }

    case "GO_BACK": {
      if (state.step === "providers-loading") {
        return { ...state, step: "mode-select", mode: null };
      }
      if (state.step === "provider-select") {
        return { ...state, step: "mode-select", mode: null };
      }
      if (state.step === "auth-method-select") {
        return { ...state, step: "provider-select", provider: null, authMethod: null, selectedAuthMethodIndex: 0 };
      }
      if (state.step === "api-key-entry") {
        if (state.provider && state.provider.authMethods.length > 1) {
          return { ...state, step: "auth-method-select", secretInput: "", authMethod: null };
        }
        return { ...state, step: "provider-select", secretInput: "", provider: null, authMethod: null };
      }
      if (state.step === "gateway-token-entry") {
        return { ...state, step: "mode-select", mode: null, secretInput: "" };
      }
      if (state.step === "oauth-launching" || state.step === "oauth-waiting" || state.step === "oauth-code-entry") {
        return { ...state, step: "auth-method-select", authMethod: null, oauthUrl: null, oauthCodeInput: "" };
      }
      if (state.step === "error") {
        if (state.mode === "gateway") {
          return { ...state, step: "gateway-token-entry", secretInput: "", error: null };
        }
        if (state.authMethod === "oauth") {
          return { ...state, step: "auth-method-select", error: null, authMethod: null, oauthUrl: null };
        }
        return { ...state, step: "api-key-entry", secretInput: "", error: null };
      }
      return state;
    }

    case "OAUTH_LAUNCHING":
      return { ...state, step: "oauth-launching", oauthUrl: action.url };

    case "OAUTH_WAITING":
      return { ...state, step: "oauth-waiting" };

    case "OAUTH_CODE_ENTRY":
      return { ...state, step: "oauth-code-entry", oauthCodeInput: "" };

    case "SET_OAUTH_CODE":
      return { ...state, oauthCodeInput: action.value };

    case "SUBMIT_OAUTH_CODE": {
      if (state.step !== "oauth-code-entry") return state;
      if (state.oauthCodeInput.trim().length === 0) return state;
      return { ...state, step: "validating" };
    }

    case "OAUTH_COMPLETE":
      return { ...state, step: "success", connection: action.connection, error: null, oauthUrl: null };

    case "VALIDATION_SUCCESS":
      return { ...state, step: "success", connection: action.connection, error: null };

    case "VALIDATION_ERROR":
      return { ...state, step: "error", error: action.error };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "●".repeat(value.length);
  }
  return "●".repeat(value.length - 4) + value.slice(-4);
}

function openBrowser(url: string): void {
  const os = platform();
  try {
    if (os === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else if (os === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    } else {
      // Linux / FreeBSD
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch {
    // Browser open is best-effort; URL is shown in TUI as fallback
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

interface OverlayFrameProps {
  title: string;
  hint: string;
  tokens: Record<string, string>;
  children: React.ReactNode;
}

function OverlayFrame({ title, hint, tokens, children }: OverlayFrameProps) {
  return (
    <ModalPanel
      visible
      title={title}
      hint={hint}
      width={96}
      height={24}
      closeOnEscape={false}
      onClose={() => {}}
    >
      <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <ScrollBox
          style={{
            flexGrow: 1,
            backgroundColor: tokens["surface.secondary"],
          }}
          contentOptions={{ flexDirection: "column" }}
          scrollbarOptions={{ visible: false }}
        >
          {children}
        </ScrollBox>
      </Box>
    </ModalPanel>
  );
}

interface SelectionListProps {
  items: readonly { id: string; label: string; description?: string }[];
  selectedIndex: number;
  tokens: Record<string, string>;
}

function SelectionList({ items, selectedIndex, tokens }: SelectionListProps) {
  return (
    <Box style={{ flexDirection: "column" }}>
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
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
              content={isSelected ? "› " : "  "}
              style={{ color: tokens["accent.primary"] }}
            />
            <Text
              content={item.label}
              style={{ color: isSelected ? tokens["text.primary"] : tokens["text.secondary"] }}
            />
            {item.description ? (
              <Text
                content={` — ${item.description}`}
                style={{ color: tokens["text.muted"] }}
              />
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step renderers
// ---------------------------------------------------------------------------

interface StepProps {
  state: ConnectState;
  tokens: Record<string, string>;
  onSecretInput: (value: string) => void;
}

function ModeSelectStep({ state, tokens }: StepProps) {
  return (
    <OverlayFrame
      title="Connect Provider"
      hint="↑↓ select · Enter confirm · Esc cancel"
      tokens={tokens}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text content="How would you like to connect?" style={{ color: tokens["text.primary"] }} />
      </Box>
      <SelectionList items={MODE_OPTIONS} selectedIndex={state.selectedModeIndex} tokens={tokens} />
    </OverlayFrame>
  );
}

function ProvidersLoadingStep({ tokens }: { tokens: Record<string, string> }) {
  return (
    <OverlayFrame title="Select Provider" hint="Esc to cancel" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="◎ " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Loading providers from daemon..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </OverlayFrame>
  );
}

function ProviderSelectStep({ state, tokens }: StepProps) {
  const providers = getActiveProviders(state);

  return (
    <OverlayFrame
      title="Select Provider"
      hint="↑↓ select · Enter confirm · Esc back"
      tokens={tokens}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text content="Choose a provider:" style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "column" }}>
        {providers.map((provider, index) => {
          const isSelected = index === state.selectedProviderIndex;
          const glyph = statusGlyph(provider.connectionState);
          const glyphColor = statusColor(provider.connectionState, tokens);
          const authBadges = formatAuthMethodBadges(provider.authMethods);
          const hasLiveStatus = provider.displayStatus !== undefined;

          return (
            <Box
              key={provider.id}
              style={{
                flexDirection: "row",
                paddingLeft: 1,
                backgroundColor: isSelected ? tokens["surface.elevated"] : "transparent",
              }}
            >
              <Text
                content={isSelected ? "› " : "  "}
                style={{ color: tokens["accent.primary"] }}
              />
              {hasLiveStatus ? (
                <Text content={`${glyph} `} style={{ color: glyphColor }} />
              ) : null}
              <Text
                content={provider.label}
                style={{ color: isSelected ? tokens["text.primary"] : tokens["text.secondary"] }}
              />
              {hasLiveStatus && provider.displayStatus ? (
                <Text
                  content={` [${provider.displayStatus}]`}
                  style={{ color: glyphColor }}
                />
              ) : null}
              <Text
                content={` (${authBadges})`}
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          );
        })}
      </Box>
    </OverlayFrame>
  );
}

function AuthMethodSelectStep({ state, tokens }: StepProps) {
  const providerLabel = state.provider?.label ?? "Provider";
  const methods = getAvailableAuthMethods(state.provider);

  return (
    <OverlayFrame
      title={`${providerLabel} — Authentication`}
      hint="↑↓ select · Enter confirm · Esc back"
      tokens={tokens}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text content="Choose how to authenticate:" style={{ color: tokens["text.primary"] }} />
      </Box>
      <SelectionList items={methods} selectedIndex={state.selectedAuthMethodIndex} tokens={tokens} />
    </OverlayFrame>
  );
}

function ApiKeyEntryStep({ state, tokens, onSecretInput }: StepProps) {
  const providerLabel = state.provider?.label ?? "Provider";
  const masked = maskSecret(state.secretInput);

  return (
    <OverlayFrame
      title={`${providerLabel} API Key`}
      hint="Enter confirm · Esc back"
      tokens={tokens}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text content="Enter your API key:" style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text content={masked || " "} style={{ color: tokens["text.secondary"] }} />
      </Box>
      <Input
        focused
        placeholder=""
        value={state.secretInput}
        onInput={(value) => onSecretInput(extractInputValue(value))}
      />
    </OverlayFrame>
  );
}

function GatewayTokenEntryStep({ state, tokens, onSecretInput }: StepProps) {
  const masked = maskSecret(state.secretInput);

  return (
    <OverlayFrame
      title="Reins Gateway"
      hint="Enter confirm · Esc back"
      tokens={tokens}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text content="Enter your gateway token:" style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text content={masked || " "} style={{ color: tokens["text.secondary"] }} />
      </Box>
      <Input
        focused
        placeholder=""
        value={state.secretInput}
        onInput={(value) => onSecretInput(extractInputValue(value))}
      />
    </OverlayFrame>
  );
}

function OAuthLaunchingStep({ state, tokens }: { state: ConnectState; tokens: Record<string, string> }) {
  const providerLabel = state.provider?.label ?? "Provider";

  return (
    <OverlayFrame title={`${providerLabel} — Browser Login`} hint="Esc to cancel" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="◎ " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Opening browser for login..." style={{ color: tokens["text.secondary"] }} />
      </Box>
      {state.oauthUrl ? (
        <Box style={{ flexDirection: "column", marginTop: 1 }}>
          <Text
            content="If the browser didn't open, visit this URL:"
            style={{ color: tokens["text.muted"] }}
          />
          <Box style={{ marginTop: 1 }}>
            <Text content={state.oauthUrl} style={{ color: tokens["accent.primary"] }} />
          </Box>
        </Box>
      ) : null}
    </OverlayFrame>
  );
}

function OAuthWaitingStep({ state, tokens }: { state: ConnectState; tokens: Record<string, string> }) {
  const providerLabel = state.provider?.label ?? "Provider";

  return (
    <OverlayFrame title={`${providerLabel} — Browser Login`} hint="Esc to cancel" tokens={tokens}>
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="◎ " style={{ color: tokens["glyph.tool.running"] }} />
          <Text content="Waiting for OAuth callback..." style={{ color: tokens["text.secondary"] }} />
        </Box>
        {state.oauthUrl ? (
          <Box style={{ flexDirection: "column", marginTop: 1 }}>
            <Text
              content="If the browser didn't open, visit this URL:"
              style={{ color: tokens["text.muted"] }}
            />
            <Box style={{ marginTop: 1 }}>
              <Text content={state.oauthUrl} style={{ color: tokens["accent.primary"] }} />
            </Box>
          </Box>
        ) : null}
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Complete the login in your browser. This page will update automatically."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </OverlayFrame>
  );
}

function OAuthCodeEntryStep({
  state,
  tokens,
  onCodeInput,
}: {
  state: ConnectState;
  tokens: Record<string, string>;
  onCodeInput: (value: string) => void;
}) {
  const providerLabel = state.provider?.label ?? "Provider";

  return (
    <OverlayFrame title={`${providerLabel} — Paste Authorization Code`} hint="Enter confirm · Esc back" tokens={tokens}>
      <Box style={{ flexDirection: "column" }}>
        {state.oauthUrl ? (
          <Box style={{ flexDirection: "column", marginBottom: 1 }}>
            <Text
              content="If the browser didn't open, visit:"
              style={{ color: tokens["text.muted"] }}
            />
            <Box style={{ marginTop: 1 }}>
              <Text content={state.oauthUrl} style={{ color: tokens["accent.primary"] }} />
            </Box>
          </Box>
        ) : null}
        <Box style={{ marginBottom: 1 }}>
          <Text
            content="Paste the authorization code or callback URL from the browser:"
            style={{ color: tokens["text.primary"] }}
          />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content={state.oauthCodeInput || " "} style={{ color: tokens["text.secondary"] }} />
        </Box>
        <Input
          focused
          placeholder=""
          value={state.oauthCodeInput}
          onInput={(value) => onCodeInput(extractInputValue(value))}
        />
      </Box>
    </OverlayFrame>
  );
}

function ValidatingStep({ tokens }: { tokens: Record<string, string> }) {
  return (
    <OverlayFrame title="Connecting..." hint="" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="◎ " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Validating credentials..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </OverlayFrame>
  );
}

function SuccessStep({ state, tokens }: { state: ConnectState; tokens: Record<string, string> }) {
  const connection = state.connection;
  const providerName = connection?.providerName ?? "Provider";
  const models = connection?.models ?? [];
  const modelDisplay = models.length > 0 ? models.join(", ") : "Available";
  const authLabel = state.authMethod === "oauth" ? " via OAuth" : "";

  return (
    <OverlayFrame title="Connected!" hint="Press any key to continue" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["status.success"] }} />
        <Text content={`${providerName} connected${authLabel}`} style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        <Text content={`Models: ${modelDisplay}`} style={{ color: tokens["text.secondary"] }} />
      </Box>
    </OverlayFrame>
  );
}

function ErrorStep({ state, tokens }: { state: ConnectState; tokens: Record<string, string> }) {
  const errorMessage = state.error?.message ?? "Connection failed";
  const isOAuthError = state.authMethod === "oauth";

  return (
    <OverlayFrame
      title={isOAuthError ? "OAuth Failed" : "Connection Failed"}
      hint="Esc to go back · Press any key to retry"
      tokens={tokens}
    >
      <Box style={{ flexDirection: "row" }}>
        <Text content="x " style={{ color: tokens["status.error"] }} />
        <Text content={errorMessage} style={{ color: tokens["text.primary"] }} />
      </Box>
      {state.error?.retryable ? (
        <Box style={{ marginTop: 1 }}>
          <Text content="This error may be temporary. Try again." style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : null}
    </OverlayFrame>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConnectFlow({ connectService, onComplete, onCancel }: ConnectFlowProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(connectReducer, INITIAL_STATE);

  // Load live provider list from daemon when entering providers-loading step
  useEffect(() => {
    if (state.step !== "providers-loading") return;

    let cancelled = false;

    void (async () => {
      const result = await connectService.listUserConfigurableProviders();
      if (cancelled) return;

      if (result.ok && result.value.length > 0) {
        const mapped = result.value.map(mapDaemonProviderToOption);
        dispatch({ type: "PROVIDERS_LOADED", providers: mapped });
      } else {
        dispatch({ type: "PROVIDERS_LOAD_FAILED" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.step, connectService]);

  const runValidation = useCallback(
    async (currentState: ConnectState) => {
      if (currentState.mode === "byok" && currentState.provider) {
        const result = await connectService.configureBYOK(
          currentState.provider.id,
          currentState.secretInput,
        );
        if (result.ok) {
          dispatch({ type: "VALIDATION_SUCCESS", connection: result.value });
        } else {
          dispatch({ type: "VALIDATION_ERROR", error: result.error });
        }
      } else if (currentState.mode === "gateway") {
        const result = await connectService.connectGateway(currentState.secretInput);
        if (result.ok) {
          dispatch({ type: "VALIDATION_SUCCESS", connection: result.value });
        } else {
          dispatch({ type: "VALIDATION_ERROR", error: result.error });
        }
      }
    },
    [connectService],
  );

  const runOAuthFlow = useCallback(
    async (provider: ProviderOption) => {
      const initResult = await connectService.initiateOAuth(provider.id);
      if (!initResult.ok) {
        dispatch({ type: "VALIDATION_ERROR", error: initResult.error });
        return;
      }

      const authUrl = initResult.value.authUrl;
      dispatch({ type: "OAUTH_LAUNCHING", url: authUrl });

      // Open the URL in the user's default browser
      openBrowser(authUrl);

      // Transition to code entry after a brief moment for browser to open
      setTimeout(() => {
        dispatch({ type: "OAUTH_CODE_ENTRY" });
      }, 1500);
    },
    [connectService],
  );

  const runOAuthCodeExchange = useCallback(
    async (provider: ProviderOption, code: string) => {
      const result = await connectService.exchangeOAuthCode(provider.id, code);
      if (result.ok) {
        dispatch({ type: "OAUTH_COMPLETE", connection: result.value });
      } else {
        dispatch({ type: "VALIDATION_ERROR", error: result.error });
      }
    },
    [connectService],
  );

  const handleSecretInput = useCallback((value: string) => {
    dispatch({ type: "SET_SECRET", value });
  }, []);

  const handleOAuthCodeInput = useCallback((value: string) => {
    dispatch({ type: "SET_OAUTH_CODE", value });
  }, []);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    // Success step: any key completes
    if (state.step === "success") {
      onComplete({ success: true, connection: state.connection ?? undefined });
      return;
    }

    // Error step: Esc goes back, any other key retries
    if (state.step === "error") {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "GO_BACK" });
        return;
      }
      // Retry: go back to entry step
      dispatch({ type: "GO_BACK" });
      return;
    }

    // Providers loading: only Esc to cancel
    if (state.step === "providers-loading") {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "GO_BACK" });
      }
      return;
    }

    // OAuth launching/waiting: only Esc to cancel
    if (state.step === "oauth-launching" || state.step === "oauth-waiting") {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "GO_BACK" });
      }
      return;
    }

    // OAuth code entry: Esc to go back, Enter to submit
    if (state.step === "oauth-code-entry") {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "GO_BACK" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        if (state.oauthCodeInput.trim().length === 0) return;
        dispatch({ type: "SUBMIT_OAUTH_CODE" });
        if (state.provider) {
          void runOAuthCodeExchange(state.provider, state.oauthCodeInput);
        }
        return;
      }
      return;
    }

    // Validating step: ignore input
    if (state.step === "validating") {
      return;
    }

    // Escape: go back or cancel
    if (keyName === "escape" || keyName === "esc") {
      if (state.step === "mode-select") {
        onCancel();
        return;
      }
      dispatch({ type: "GO_BACK" });
      return;
    }

    // Arrow navigation
    if (keyName === "up") {
      dispatch({ type: "NAVIGATE_UP" });
      return;
    }
    if (keyName === "down") {
      dispatch({ type: "NAVIGATE_DOWN" });
      return;
    }

    // Enter/Return: confirm selection or submit
    if (keyName === "return" || keyName === "enter") {
      if (state.step === "mode-select") {
        dispatch({ type: "SELECT_MODE" });
        return;
      }
      if (state.step === "provider-select") {
        dispatch({ type: "SELECT_PROVIDER" });
        return;
      }
      if (state.step === "auth-method-select") {
        dispatch({ type: "SELECT_AUTH_METHOD" });
        const methods = getAvailableAuthMethods(state.provider);
        const selected = methods[state.selectedAuthMethodIndex];
        if (selected?.id === "oauth" && state.provider) {
          void runOAuthFlow(state.provider);
        }
        return;
      }
      if (state.step === "api-key-entry" || state.step === "gateway-token-entry") {
        if (state.secretInput.trim().length === 0) return;
        dispatch({ type: "SUBMIT_SECRET" });
        const snapshot = { ...state, step: "validating" as ConnectStep };
        runValidation(snapshot);
        return;
      }
    }
  });

  const stepProps: StepProps = { state, tokens, onSecretInput: handleSecretInput };

  switch (state.step) {
    case "mode-select":
      return <ModeSelectStep {...stepProps} />;
    case "providers-loading":
      return <ProvidersLoadingStep tokens={tokens} />;
    case "provider-select":
      return <ProviderSelectStep {...stepProps} />;
    case "auth-method-select":
      return <AuthMethodSelectStep {...stepProps} />;
    case "api-key-entry":
      return <ApiKeyEntryStep {...stepProps} />;
    case "gateway-token-entry":
      return <GatewayTokenEntryStep {...stepProps} />;
    case "oauth-launching":
      return <OAuthLaunchingStep state={state} tokens={tokens} />;
    case "oauth-waiting":
      return <OAuthWaitingStep state={state} tokens={tokens} />;
    case "oauth-code-entry":
      return <OAuthCodeEntryStep state={state} tokens={tokens} onCodeInput={handleOAuthCodeInput} />;
    case "validating":
      return <ValidatingStep tokens={tokens} />;
    case "success":
      return <SuccessStep state={state} tokens={tokens} />;
    case "error":
      return <ErrorStep state={state} tokens={tokens} />;
    default:
      return null;
  }
}
