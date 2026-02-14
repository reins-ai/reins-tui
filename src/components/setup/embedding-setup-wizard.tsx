import { useCallback, useEffect, useReducer } from "react";

import type { DaemonMemoryClient, MemoryCapabilitiesResponse } from "../../daemon/memory-client";
import { useThemeTokens } from "../../theme";
import { Box, Text, Input, ScrollBox, useKeyboard } from "../../ui";
import { ModalPanel } from "../modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EmbeddingSetupResult {
  readonly configured: boolean;
  readonly provider?: string;
  readonly model?: string;
}

export interface EmbeddingSetupWizardProps {
  memoryClient: DaemonMemoryClient;
  onComplete: (result: EmbeddingSetupResult) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

export interface EmbeddingProviderOption {
  readonly id: string;
  readonly label: string;
  readonly defaultModel: string;
  readonly requiresApiKey: boolean;
  readonly description: string;
}

export const EMBEDDING_PROVIDERS: readonly EmbeddingProviderOption[] = [
  {
    id: "ollama",
    label: "Ollama (Local)",
    defaultModel: "nomic-embed-text",
    requiresApiKey: false,
    description: "Free, runs locally. Requires Ollama installed.",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "text-embedding-3-small",
    requiresApiKey: true,
    description: "Cloud-hosted. Requires an OpenAI API key.",
  },
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type SetupStep =
  | "loading"
  | "already-configured"
  | "provider-select"
  | "model-entry"
  | "saving"
  | "success"
  | "error";

export interface SetupState {
  step: SetupStep;
  selectedProviderIndex: number;
  provider: EmbeddingProviderOption | null;
  modelInput: string;
  existingConfig: MemoryCapabilitiesResponse | null;
  error: string | null;
}

export type SetupAction =
  | { type: "CAPABILITIES_LOADED"; capabilities: MemoryCapabilitiesResponse }
  | { type: "CAPABILITIES_FAILED"; error: string }
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "SELECT_PROVIDER" }
  | { type: "RECONFIGURE" }
  | { type: "SET_MODEL"; value: string }
  | { type: "SUBMIT_MODEL" }
  | { type: "GO_BACK" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR"; error: string };

export const INITIAL_SETUP_STATE: SetupState = {
  step: "loading",
  selectedProviderIndex: 0,
  provider: null,
  modelInput: "",
  existingConfig: null,
  error: null,
};

export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "CAPABILITIES_LOADED": {
      if (action.capabilities.embeddingConfigured) {
        return {
          ...state,
          step: "already-configured",
          existingConfig: action.capabilities,
        };
      }
      return {
        ...state,
        step: "provider-select",
        existingConfig: action.capabilities,
      };
    }

    case "CAPABILITIES_FAILED":
      return { ...state, step: "error", error: action.error };

    case "NAVIGATE_UP": {
      if (state.step !== "provider-select") return state;
      return {
        ...state,
        selectedProviderIndex: state.selectedProviderIndex <= 0
          ? EMBEDDING_PROVIDERS.length - 1
          : state.selectedProviderIndex - 1,
      };
    }

    case "NAVIGATE_DOWN": {
      if (state.step !== "provider-select") return state;
      return {
        ...state,
        selectedProviderIndex: (state.selectedProviderIndex + 1) % EMBEDDING_PROVIDERS.length,
      };
    }

    case "SELECT_PROVIDER": {
      if (state.step !== "provider-select") return state;
      const provider = EMBEDDING_PROVIDERS[state.selectedProviderIndex];
      return {
        ...state,
        step: "model-entry",
        provider,
        modelInput: provider.defaultModel,
      };
    }

    case "RECONFIGURE":
      return {
        ...state,
        step: "provider-select",
        selectedProviderIndex: 0,
        provider: null,
        modelInput: "",
        error: null,
      };

    case "SET_MODEL":
      return { ...state, modelInput: action.value };

    case "SUBMIT_MODEL": {
      if (state.step !== "model-entry") return state;
      if (state.modelInput.trim().length === 0) return state;
      return { ...state, step: "saving" };
    }

    case "GO_BACK": {
      if (state.step === "model-entry") {
        return { ...state, step: "provider-select", provider: null, modelInput: "" };
      }
      if (state.step === "error") {
        return { ...state, step: "provider-select", error: null };
      }
      return state;
    }

    case "SAVE_SUCCESS":
      return { ...state, step: "success", error: null };

    case "SAVE_ERROR":
      return { ...state, step: "error", error: action.error };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      width={80}
      height={20}
      closeOnEscape={false}
      onClose={() => {}}
    >
      <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <ScrollBox
          style={{
            flexDirection: "column",
            flexGrow: 1,
            backgroundColor: tokens["surface.secondary"],
          }}
        >
          {children}
        </ScrollBox>
      </Box>
    </ModalPanel>
  );
}

// ---------------------------------------------------------------------------
// Step renderers
// ---------------------------------------------------------------------------

function LoadingStep({ tokens }: { tokens: Record<string, string> }) {
  return (
    <OverlayFrame title="Memory Setup" hint="" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Checking memory configuration..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </OverlayFrame>
  );
}

function AlreadyConfiguredStep({
  state,
  tokens,
}: {
  state: SetupState;
  tokens: Record<string, string>;
}) {
  const embedding = state.existingConfig?.embedding;
  const providerLabel = embedding?.provider ?? "unknown";
  const modelLabel = embedding?.model ?? "unknown";

  return (
    <OverlayFrame
      title="Memory Setup"
      hint="Enter reconfigure . Esc close"
      tokens={tokens}
    >
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="* " style={{ color: tokens["status.success"] }} />
          <Text content="Embedding provider is already configured." style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Text
            content={`  Provider: ${providerLabel}`}
            style={{ color: tokens["text.secondary"] }}
          />
          <Text
            content={`  Model:    ${modelLabel}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Press Enter to reconfigure, or Esc to close."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </OverlayFrame>
  );
}

function ProviderSelectStep({
  state,
  tokens,
}: {
  state: SetupState;
  tokens: Record<string, string>;
}) {
  return (
    <OverlayFrame
      title="Memory Setup - Embedding Provider"
      hint="Up/Down select . Enter confirm . Esc cancel"
      tokens={tokens}
    >
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ marginBottom: 1 }}>
          <Text
            content="Choose an embedding provider for semantic memory:"
            style={{ color: tokens["text.primary"] }}
          />
        </Box>
        {EMBEDDING_PROVIDERS.map((provider, index) => {
          const isSelected = index === state.selectedProviderIndex;
          return (
            <Box
              key={provider.id}
              style={{
                flexDirection: "column",
                paddingLeft: 1,
                marginBottom: 1,
                backgroundColor: isSelected ? tokens["surface.elevated"] : "transparent",
              }}
            >
              <Box style={{ flexDirection: "row" }}>
                <Text
                  content={isSelected ? "> " : "  "}
                  style={{ color: tokens["accent.primary"] }}
                />
                <Text
                  content={provider.label}
                  style={{ color: isSelected ? tokens["text.primary"] : tokens["text.secondary"] }}
                />
              </Box>
              <Box style={{ paddingLeft: 4 }}>
                <Text
                  content={provider.description}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </OverlayFrame>
  );
}

function ModelEntryStep({
  state,
  tokens,
  onModelInput,
}: {
  state: SetupState;
  tokens: Record<string, string>;
  onModelInput: (value: string) => void;
}) {
  const providerLabel = state.provider?.label ?? "Provider";

  return (
    <OverlayFrame
      title={`Memory Setup - ${providerLabel} Model`}
      hint="Enter confirm . Esc back"
      tokens={tokens}
    >
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ marginBottom: 1 }}>
          <Text
            content="Enter the embedding model name:"
            style={{ color: tokens["text.primary"] }}
          />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text
            content={state.modelInput || " "}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
        <Input
          focused
          placeholder=""
          value={state.modelInput}
          onInput={(value) => onModelInput(extractInputValue(value))}
        />
        <Box style={{ marginTop: 1 }}>
          <Text
            content={`Default: ${state.provider?.defaultModel ?? ""}`}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </OverlayFrame>
  );
}

function SavingStep({ tokens }: { tokens: Record<string, string> }) {
  return (
    <OverlayFrame title="Memory Setup" hint="" tokens={tokens}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Saving embedding configuration..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </OverlayFrame>
  );
}

function SuccessStep({
  state,
  tokens,
}: {
  state: SetupState;
  tokens: Record<string, string>;
}) {
  const providerLabel = state.provider?.label ?? "Provider";
  const model = state.modelInput;

  return (
    <OverlayFrame title="Memory Setup" hint="Press any key to close" tokens={tokens}>
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="* " style={{ color: tokens["status.success"] }} />
          <Text content="Embedding provider configured!" style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Text
            content={`  Provider: ${providerLabel}`}
            style={{ color: tokens["text.secondary"] }}
          />
          <Text
            content={`  Model:    ${model}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Semantic search and consolidation are now available."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </OverlayFrame>
  );
}

function ErrorStep({
  state,
  tokens,
}: {
  state: SetupState;
  tokens: Record<string, string>;
}) {
  return (
    <OverlayFrame title="Memory Setup" hint="Esc back . Enter retry" tokens={tokens}>
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="x " style={{ color: tokens["status.error"] }} />
          <Text content={state.error ?? "Setup failed"} style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Press Esc to go back, or Enter to retry."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </OverlayFrame>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EmbeddingSetupWizard({
  memoryClient,
  onComplete,
  onCancel,
}: EmbeddingSetupWizardProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(setupReducer, INITIAL_SETUP_STATE);

  // Load capabilities on mount
  useEffect(() => {
    if (state.step !== "loading") return;

    let cancelled = false;

    void (async () => {
      const result = await memoryClient.checkCapabilities();
      if (cancelled) return;

      if (result.ok) {
        dispatch({ type: "CAPABILITIES_LOADED", capabilities: result.value });
      } else {
        dispatch({ type: "CAPABILITIES_FAILED", error: result.error.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.step, memoryClient]);

  // Save config when entering saving step
  const runSave = useCallback(
    async (currentState: SetupState) => {
      if (!currentState.provider) return;

      const result = await memoryClient.saveEmbeddingConfig({
        provider: currentState.provider.id,
        model: currentState.modelInput.trim(),
      });

      if (result.ok) {
        dispatch({ type: "SAVE_SUCCESS" });
      } else {
        dispatch({ type: "SAVE_ERROR", error: result.error.message });
      }
    },
    [memoryClient],
  );

  const handleModelInput = useCallback((value: string) => {
    dispatch({ type: "SET_MODEL", value });
  }, []);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (state.step === "loading" || state.step === "saving") {
      return;
    }

    if (state.step === "success") {
      onComplete({
        configured: true,
        provider: state.provider?.id,
        model: state.modelInput,
      });
      return;
    }

    if (state.step === "already-configured") {
      if (keyName === "escape" || keyName === "esc") {
        onCancel();
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        dispatch({ type: "RECONFIGURE" });
        return;
      }
      return;
    }

    if (state.step === "error") {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "GO_BACK" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        dispatch({ type: "GO_BACK" });
        return;
      }
      return;
    }

    // Escape: go back or cancel
    if (keyName === "escape" || keyName === "esc") {
      if (state.step === "provider-select") {
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

    // Enter: confirm selection or submit
    if (keyName === "return" || keyName === "enter") {
      if (state.step === "provider-select") {
        dispatch({ type: "SELECT_PROVIDER" });
        return;
      }
      if (state.step === "model-entry") {
        if (state.modelInput.trim().length === 0) return;
        dispatch({ type: "SUBMIT_MODEL" });
        void runSave(state);
        return;
      }
    }
  });

  switch (state.step) {
    case "loading":
      return <LoadingStep tokens={tokens} />;
    case "already-configured":
      return <AlreadyConfiguredStep state={state} tokens={tokens} />;
    case "provider-select":
      return <ProviderSelectStep state={state} tokens={tokens} />;
    case "model-entry":
      return (
        <ModelEntryStep
          state={state}
          tokens={tokens}
          onModelInput={handleModelInput}
        />
      );
    case "saving":
      return <SavingStep tokens={tokens} />;
    case "success":
      return <SuccessStep state={state} tokens={tokens} />;
    case "error":
      return <ErrorStep state={state} tokens={tokens} />;
    default:
      return null;
  }
}
