import { useCallback, useReducer } from "react";

import type {
  ConnectError,
  ConnectService,
  ProviderConnection,
  ProviderMode,
} from "../providers/connect-service";
import { useThemeTokens } from "../theme";
import { Box, Text, Input, useKeyboard } from "../ui";

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
}

export const BYOK_PROVIDERS: readonly ProviderOption[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "fireworks", label: "Fireworks" },
  { id: "custom", label: "Custom" },
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type ConnectStep =
  | "mode-select"
  | "provider-select"
  | "api-key-entry"
  | "gateway-token-entry"
  | "validating"
  | "success"
  | "error";

interface ConnectState {
  step: ConnectStep;
  selectedModeIndex: number;
  selectedProviderIndex: number;
  mode: ProviderMode | null;
  provider: ProviderOption | null;
  secretInput: string;
  connection: ProviderConnection | null;
  error: ConnectError | null;
}

type ConnectAction =
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "SELECT_MODE" }
  | { type: "SELECT_PROVIDER" }
  | { type: "SET_SECRET"; value: string }
  | { type: "SUBMIT_SECRET" }
  | { type: "GO_BACK" }
  | { type: "VALIDATION_SUCCESS"; connection: ProviderConnection }
  | { type: "VALIDATION_ERROR"; error: ConnectError };

const MODE_OPTIONS: readonly { id: ProviderMode; label: string }[] = [
  { id: "byok", label: "BYOK (Bring Your Own Key)" },
  { id: "gateway", label: "Reins Gateway" },
];

const INITIAL_STATE: ConnectState = {
  step: "mode-select",
  selectedModeIndex: 0,
  selectedProviderIndex: 0,
  mode: null,
  provider: null,
  secretInput: "",
  connection: null,
  error: null,
};

export function connectReducer(state: ConnectState, action: ConnectAction): ConnectState {
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
            ? BYOK_PROVIDERS.length - 1
            : state.selectedProviderIndex - 1,
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
          selectedProviderIndex: (state.selectedProviderIndex + 1) % BYOK_PROVIDERS.length,
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
          step: "provider-select",
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

    case "SELECT_PROVIDER": {
      if (state.step !== "provider-select") return state;
      const provider = BYOK_PROVIDERS[state.selectedProviderIndex];
      return {
        ...state,
        step: "api-key-entry",
        provider,
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
      if (state.step === "provider-select") {
        return { ...state, step: "mode-select", mode: null };
      }
      if (state.step === "api-key-entry") {
        return { ...state, step: "provider-select", secretInput: "", provider: null };
      }
      if (state.step === "gateway-token-entry") {
        return { ...state, step: "mode-select", mode: null, secretInput: "" };
      }
      if (state.step === "error") {
        if (state.mode === "gateway") {
          return { ...state, step: "gateway-token-entry", secretInput: "", error: null };
        }
        return { ...state, step: "api-key-entry", secretInput: "", error: null };
      }
      return state;
    }

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
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: tokens["surface.primary"],
        flexDirection: "column",
        paddingTop: 2,
        paddingLeft: 4,
        paddingRight: 4,
      }}
    >
      <Box
        style={{
          border: true,
          borderColor: tokens["border.focus"],
          backgroundColor: tokens["surface.secondary"],
          padding: 1,
          flexDirection: "column",
        }}
      >
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text content={`◆ ${title}`} style={{ color: tokens["accent.primary"], bold: true }} />
        </Box>
        {children}
        <Box style={{ marginTop: 1 }}>
          <Text content={hint} style={{ color: tokens["text.muted"] }} />
        </Box>
      </Box>
    </Box>
  );
}

interface SelectionListProps {
  items: readonly { id: string; label: string }[];
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

function ProviderSelectStep({ state, tokens }: StepProps) {
  return (
    <OverlayFrame
      title="BYOK Setup"
      hint="↑↓ select · Enter confirm · Esc back"
      tokens={tokens}
    >
      <Box style={{ marginBottom: 1 }}>
        <Text content="Select provider:" style={{ color: tokens["text.primary"] }} />
      </Box>
      <SelectionList items={BYOK_PROVIDERS} selectedIndex={state.selectedProviderIndex} tokens={tokens} />
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

  return (
    <OverlayFrame title="Connected!" hint="Press any key to continue" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="✦ " style={{ color: tokens["status.success"] }} />
        <Text content={`${providerName} connected`} style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        <Text content={`Models: ${modelDisplay}`} style={{ color: tokens["text.secondary"] }} />
      </Box>
    </OverlayFrame>
  );
}

function ErrorStep({ state, tokens }: { state: ConnectState; tokens: Record<string, string> }) {
  const errorMessage = state.error?.message ?? "Connection failed";

  return (
    <OverlayFrame title="Connection Failed" hint="Esc to go back · Press any key to retry" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="✧ " style={{ color: tokens["status.error"] }} />
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

  const runValidation = useCallback(
    async (currentState: ConnectState) => {
      if (currentState.mode === "byok" && currentState.provider) {
        const result = await connectService.connectBYOK(
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

  const handleSecretInput = useCallback((value: string) => {
    dispatch({ type: "SET_SECRET", value });
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
      if (state.step === "api-key-entry" || state.step === "gateway-token-entry") {
        if (state.secretInput.trim().length === 0) return;
        dispatch({ type: "SUBMIT_SECRET" });
        // Trigger async validation
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
    case "provider-select":
      return <ProviderSelectStep {...stepProps} />;
    case "api-key-entry":
      return <ApiKeyEntryStep {...stepProps} />;
    case "gateway-token-entry":
      return <GatewayTokenEntryStep {...stepProps} />;
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
