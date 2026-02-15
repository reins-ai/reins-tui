import { useCallback, useEffect, useMemo, useState } from "react";

import { Box, Input, Text, useKeyboard } from "../../../ui";
import { useDaemon } from "../../../daemon/daemon-context";
import { ConnectService } from "../../../providers/connect-service";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

interface ProviderEntry {
  id: string;
  label: string;
  description: string;
}

const PROVIDERS: ProviderEntry[] = [
  { id: "anthropic", label: "Anthropic", description: "Claude models (Sonnet, Opus, Haiku)" },
  { id: "openai", label: "OpenAI", description: "GPT-4o, o1, o3 models" },
  { id: "google", label: "Google", description: "Gemini models" },
];

function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") return value.plainText;
    if ("value" in value && typeof value.value === "string") return value.value;
  }
  return "";
}

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return "*".repeat(value.length - 4) + value.slice(-4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderSetupStepView({ tokens, engineState: _engineState, onStepData, onRequestNext }: StepViewProps) {
  const { client: daemonClient } = useDaemon();
  const connectService = useMemo(() => new ConnectService({ daemonClient }), [daemonClient]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedProvider = PROVIDERS[selectedIndex];

  const handleConfigureProvider = useCallback(async () => {
    const normalizedKey = apiKeyInput.trim();
    if (normalizedKey.length === 0) {
      setErrorMessage("Enter an API key to connect the selected provider.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(`Configuring ${selectedProvider.label}...`);

    const result = await connectService.configureBYOK(selectedProvider.id, normalizedKey);
    if (!result.ok) {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(result.error.message);
      return;
    }

    setConfiguredProviders((previous) => {
      const next = new Set(previous);
      next.add(selectedProvider.id);
      return next;
    });
    setIsSubmitting(false);
    setApiKeyInput("");
    setErrorMessage(null);
    setStatusMessage(`${selectedProvider.label} connected.`);
  }, [apiKeyInput, connectService, selectedProvider.id, selectedProvider.label]);

  // Emit step data on selection change
  useEffect(() => {
    onStepData({
      selectedProvider: selectedProvider.id,
      providerMode: "byok",
      configuredProviders: [...configuredProviders],
    });
  }, [selectedProvider.id, configuredProviders, onStepData]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (isSubmitting) {
      return;
    }

    if (keyName === "up") {
      setSelectedIndex((prev) =>
        prev <= 0 ? PROVIDERS.length - 1 : prev - 1,
      );
      setErrorMessage(null);
      setStatusMessage(null);
      return;
    }
    if (keyName === "down") {
      setSelectedIndex((prev) =>
        (prev + 1) % PROVIDERS.length,
      );
      setErrorMessage(null);
      setStatusMessage(null);
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      if (apiKeyInput.trim().length > 0) {
        void handleConfigureProvider();
        return;
      }

      onRequestNext();
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Provider Setup"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Connect your AI providers. Enter an API key for the selected provider."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Provider list */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {PROVIDERS.map((provider, index) => {
          const isSelected = index === selectedIndex;
          const isConfigured = configuredProviders.has(provider.id);

          return (
            <Box
              key={provider.id}
              style={{
                flexDirection: "column",
                paddingLeft: 1,
                marginBottom: 1,
                backgroundColor: isSelected
                  ? tokens["surface.elevated"]
                  : "transparent",
              }}
            >
              <Box style={{ flexDirection: "row" }}>
                <Text
                  content={isSelected ? "> " : "  "}
                  style={{ color: tokens["accent.primary"] }}
                />
                <Text
                  content={isConfigured ? "* " : "o "}
                  style={{
                    color: isConfigured
                      ? tokens["status.success"]
                      : tokens["text.muted"],
                  }}
                />
                <Text
                  content={provider.label}
                  style={{
                    color: isSelected
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
              </Box>
              <Box style={{ paddingLeft: 6 }}>
                <Text
                  content={provider.description}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box style={{ marginTop: 1, flexDirection: "column" }}>
        <Text
          content={`API key for ${selectedProvider.label}:`}
          style={{ color: tokens["text.primary"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "row" }}>
          <Text
            content={maskSecret(apiKeyInput) || "(leave blank to continue without connecting)"}
            style={{
              color: apiKeyInput.length > 0
                ? tokens["text.secondary"]
                : tokens["text.muted"],
            }}
          />
        </Box>
        <Input
          focused
          placeholder=""
          value={apiKeyInput}
          onInput={(value) => {
            setApiKeyInput(extractInputValue(value));
            setErrorMessage(null);
          }}
        />
      </Box>

      {statusMessage !== null ? (
        <Box style={{ marginTop: 1 }}>
          <Text content={statusMessage} style={{ color: tokens["status.success"] }} />
        </Box>
      ) : null}

      {errorMessage !== null ? (
        <Box style={{ marginTop: 1 }}>
          <Text content={errorMessage} style={{ color: tokens["status.error"] }} />
        </Box>
      ) : null}

      {/* Hint */}
      <Box style={{ marginTop: 1 }}>
        <Text
          content={isSubmitting
            ? "Configuring provider..."
            : "Up/Down select  ·  Type API key  ·  Enter connect/continue  ·  Esc back"}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
