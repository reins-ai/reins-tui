import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Box, Input, Text, useKeyboard } from "../../../ui";
import { getActiveDaemonUrl } from "../../../daemon/actions";
import { useDaemon } from "../../../daemon/daemon-context";
import { logger } from "../../../lib/debug-logger";
import { ConnectService } from "../../../providers/connect-service";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Provider catalog
// ---------------------------------------------------------------------------

type ProviderGroup = "cloud" | "local";

interface ProviderEntry {
  id: string;
  label: string;
  description: string;
  group: ProviderGroup;
}

const FALLBACK_PROVIDERS: ProviderEntry[] = [
  { id: "anthropic", label: "Anthropic", description: "Claude models (Sonnet, Opus, Haiku)", group: "cloud" },
  { id: "openai", label: "OpenAI", description: "GPT-4o, o1, o3 models", group: "cloud" },
  { id: "google", label: "Google", description: "Gemini models", group: "cloud" },
];

/** Human-readable metadata for known provider IDs. */
const PROVIDER_META: Record<string, { label: string; description: string; group: ProviderGroup }> = {
  anthropic: { label: "Anthropic", description: "Claude models (Sonnet, Opus, Haiku)", group: "cloud" },
  openai: { label: "OpenAI", description: "GPT-4o, o1, o3 models", group: "cloud" },
  google: { label: "Google", description: "Gemini models", group: "cloud" },
  fireworks: { label: "Fireworks", description: "Fast open-source model hosting", group: "cloud" },
  ollama: { label: "Ollama", description: "Local models via Ollama", group: "local" },
  vllm: { label: "vLLM", description: "Local models via vLLM", group: "local" },
  lmstudio: { label: "LM Studio", description: "Local models via LM Studio", group: "local" },
};

const FETCH_PROVIDERS_TIMEOUT_MS = 5_000;

interface DaemonProviderAuthStatus {
  provider: string;
  requiresAuth: boolean;
  configured: boolean;
  connectionState: string;
}

/**
 * Fetch the provider list from the daemon's auth service.
 * Returns null on any failure so the caller can fall back silently.
 */
async function fetchProvidersFromDaemon(
  daemonBaseUrl: string,
): Promise<ProviderEntry[] | null> {
  try {
    const url = `${daemonBaseUrl}/api/providers/auth/list`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_PROVIDERS_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    const rawList: unknown[] = Array.isArray(payload)
      ? payload
      : (typeof payload === "object" && payload !== null && Array.isArray((payload as Record<string, unknown>).providers))
        ? (payload as Record<string, unknown>).providers as unknown[]
        : [];

    if (rawList.length === 0) {
      return null;
    }

    const entries: ProviderEntry[] = [];
    for (const item of rawList) {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const record = item as DaemonProviderAuthStatus;
      const id = typeof record.provider === "string" ? record.provider : "";
      if (id.length === 0) {
        continue;
      }

      const meta = PROVIDER_META[id];
      entries.push({
        id,
        label: meta?.label ?? id.charAt(0).toUpperCase() + id.slice(1),
        description: meta?.description ?? "AI provider",
        group: meta?.group ?? "cloud",
      });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
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

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return "*".repeat(value.length - 4) + value.slice(-4);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ProviderValidationResult {
  configured: boolean;
  models: string[];
}

type ValidationState =
  | "idle"
  | "validating"
  | "valid"
  | "invalid"
  | "unreachable";

const VALIDATION_TIMEOUT_MS = 10_000;

async function validateProviderKey(
  providerId: string,
  daemonBaseUrl: string,
): Promise<{ state: ValidationState; models: string[] }> {
  try {
    const url = `${daemonBaseUrl}/api/onboarding/validate-provider?provider=${encodeURIComponent(providerId)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.connect.warn("Provider validation HTTP error", {
        provider: providerId,
        status: response.status,
      });
      return { state: "unreachable", models: [] };
    }

    const payload = (await response.json()) as ProviderValidationResult;
    if (payload.configured) {
      return { state: "valid", models: payload.models ?? [] };
    }

    return { state: "invalid", models: [] };
  } catch (error) {
    logger.connect.warn("Provider validation failed", {
      provider: providerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { state: "unreachable", models: [] };
  }
}

// ---------------------------------------------------------------------------
// Hint text
// ---------------------------------------------------------------------------

function hintForState(isBusy: boolean, validation: ValidationState): string {
  if (isBusy) {
    return "Please wait...";
  }

  if (validation === "invalid") {
    return "Tab retry  ·  Enter dismiss  ·  Esc back";
  }

  if (validation === "unreachable") {
    return "Tab retry  ·  s validate later  ·  Enter dismiss  ·  Esc back";
  }

  return "Up/Down select  ·  Type API key  ·  Enter connect/continue  ·  Esc back";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderSetupStepView({ tokens, engineState: _engineState, onStepData, onRequestNext }: StepViewProps) {
  const { client: daemonClient } = useDaemon();
  const connectService = useMemo(() => new ConnectService({ daemonClient }), [daemonClient]);
  const [providers, setProviders] = useState<ProviderEntry[]>(FALLBACK_PROVIDERS);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track the provider being validated so retry works correctly
  const validatingProviderRef = useRef<string | null>(null);

  // Fetch dynamic provider list from daemon on mount
  useEffect(() => {
    let cancelled = false;

    async function loadProviders(): Promise<void> {
      const daemonBaseUrl = await getActiveDaemonUrl();
      const fetched = await fetchProvidersFromDaemon(daemonBaseUrl);

      if (cancelled) {
        return;
      }

      if (fetched !== null && fetched.length > 0) {
        setProviders(fetched);
        logger.connect.info("Loaded dynamic provider list from daemon", {
          count: fetched.length,
        });
      }

      setIsLoadingProviders(false);
    }

    void loadProviders();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProvider = providers[selectedIndex];

  const isValidating = validationState === "validating";
  const isBusy = isSubmitting || isValidating;

  const runValidation = useCallback(async (providerId: string, providerLabel: string) => {
    setValidationState("validating");
    setErrorMessage(null);
    setStatusMessage(`Validating ${providerLabel} API key...`);
    validatingProviderRef.current = providerId;

    const daemonBaseUrl = await getActiveDaemonUrl();
    const result = await validateProviderKey(providerId, daemonBaseUrl);

    if (result.state === "valid") {
      setValidationState("valid");
      setStatusMessage(
        result.models.length > 0
          ? `${providerLabel} connected — ${result.models.length} model${result.models.length === 1 ? "" : "s"} available.`
          : `${providerLabel} connected and verified.`,
      );
      setConfiguredProviders((previous) => {
        const next = new Set(previous);
        next.add(providerId);
        return next;
      });
      setApiKeyInput("");
      validatingProviderRef.current = null;
      return;
    }

    if (result.state === "invalid") {
      setValidationState("invalid");
      setStatusMessage(null);
      setErrorMessage(
        "API key is invalid or the provider is unreachable. Please check your key and try again.",
      );
      return;
    }

    // unreachable — daemon could not be contacted
    setValidationState("unreachable");
    setStatusMessage(null);
    setErrorMessage(
      "Could not reach the Reins daemon to validate your key. Make sure the daemon is running and try again.",
    );
  }, []);

  const handleConfigureProvider = useCallback(async () => {
    const normalizedKey = apiKeyInput.trim();
    if (normalizedKey.length === 0) {
      setErrorMessage("Enter an API key to connect the selected provider.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setValidationState("idle");
    setStatusMessage(`Configuring ${selectedProvider.label}...`);

    const result = await connectService.configureBYOK(selectedProvider.id, normalizedKey);
    if (!result.ok) {
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(result.error.message);
      return;
    }

    setIsSubmitting(false);

    // Key stored — now validate it against the daemon
    await runValidation(selectedProvider.id, selectedProvider.label);
  }, [apiKeyInput, connectService, runValidation, selectedProvider.id, selectedProvider.label]);

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

    if (isBusy) {
      return;
    }

    // When validation failed, offer retry (Tab) and skip (s)
    if (validationState === "invalid" || validationState === "unreachable") {
      if (keyName === "tab") {
        const providerId = validatingProviderRef.current;
        if (providerId) {
          const entry = providers.find((p) => p.id === providerId);
          if (entry) {
            void runValidation(entry.id, entry.label);
          }
        }
        return;
      }

      if (keyName === "s" && validationState === "unreachable") {
        // Skip validation — key is stored but unverified
        logger.connect.warn("User skipped API key validation", {
          provider: validatingProviderRef.current,
        });
        const providerId = validatingProviderRef.current;
        if (providerId) {
          setConfiguredProviders((previous) => {
            const next = new Set(previous);
            next.add(providerId);
            return next;
          });
        }
        setValidationState("idle");
        setApiKeyInput("");
        setErrorMessage(null);
        setStatusMessage("Key saved — validation skipped. You can verify later.");
        validatingProviderRef.current = null;
        return;
      }

      // Allow Enter to dismiss and return to input
      if (keyName === "return" || keyName === "enter") {
        setValidationState("idle");
        setErrorMessage(null);
        setStatusMessage(null);
        validatingProviderRef.current = null;
        return;
      }

      return;
    }

    if (keyName === "up") {
      setSelectedIndex((prev) =>
        prev <= 0 ? providers.length - 1 : prev - 1,
      );
      setErrorMessage(null);
      setStatusMessage(null);
      setValidationState("idle");
      return;
    }
    if (keyName === "down") {
      setSelectedIndex((prev) =>
        (prev + 1) % providers.length,
      );
      setErrorMessage(null);
      setStatusMessage(null);
      setValidationState("idle");
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

  const hasCloudProviders = providers.some((p) => p.group === "cloud");
  const hasLocalProviders = providers.some((p) => p.group === "local");
  const showGroupHeaders = hasCloudProviders && hasLocalProviders;

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
        {isLoadingProviders ? (
          <Box style={{ paddingLeft: 1 }}>
            <Text
              content="Loading providers..."
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        ) : (
          providers.map((provider, index) => {
            const isSelected = index === selectedIndex;
            const isConfigured = configuredProviders.has(provider.id);

            // Show group header before the first provider in each group
            const showHeader = showGroupHeaders && (
              index === 0 ||
              providers[index - 1].group !== provider.group
            );

            return (
              <Box
                key={provider.id}
                style={{ flexDirection: "column" }}
              >
                {showHeader ? (
                  <Box style={{ paddingLeft: 1, marginBottom: 1, marginTop: index > 0 ? 1 : 0 }}>
                    <Text
                      content={provider.group === "cloud" ? "Cloud" : "Local"}
                      style={{ color: tokens["text.secondary"] }}
                    />
                  </Box>
                ) : null}
                <Box
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
              </Box>
            );
          })
        )}
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
          <Text
            content={isValidating ? `* ${statusMessage}` : `* ${statusMessage}`}
            style={{
              color: isValidating
                ? tokens["text.secondary"]
                : tokens["status.success"],
            }}
          />
        </Box>
      ) : null}

      {errorMessage !== null ? (
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Text content={`x ${errorMessage}`} style={{ color: tokens["status.error"] }} />
        </Box>
      ) : null}

      {/* Hint */}
      <Box style={{ marginTop: 1 }}>
        <Text
          content={hintForState(isBusy, validationState)}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
