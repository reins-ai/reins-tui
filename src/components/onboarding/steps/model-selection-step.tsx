import { useCallback, useEffect, useRef, useState } from "react";

import { Box, Text, useKeyboard } from "../../../ui";
import { DEFAULT_DAEMON_HTTP_BASE_URL } from "../../../daemon/client";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  recommended: boolean;
}

/**
 * Fallback model list used when the daemon is unreachable or returns no models.
 * Kept as a safety net — the primary source is the daemon's GET /api/models.
 */
export const FALLBACK_MODELS: ModelEntry[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "Anthropic", recommended: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", recommended: false },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", recommended: false },
  { id: "claude-haiku-3.5", name: "Claude 3.5 Haiku", provider: "Anthropic", recommended: false },
];

type ModelSource = "daemon" | "fallback";
type FetchStatus = "loading" | "loaded" | "error";

const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch available models from the daemon's GET /api/models endpoint.
 * Returns the model list and source indicator, falling back to the
 * hardcoded list when the daemon is unreachable.
 */
export async function fetchModelsFromDaemon(
  baseUrl: string = DEFAULT_DAEMON_HTTP_BASE_URL,
): Promise<{ models: ModelEntry[]; source: ModelSource }> {
  try {
    const response = await fetch(`${baseUrl}/api/models`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { models: FALLBACK_MODELS, source: "fallback" };
    }

    const data = await response.json() as {
      models?: { id: string; name: string; provider: string }[];
    };

    const raw = data.models ?? [];
    if (raw.length === 0) {
      return { models: [], source: "daemon" };
    }

    const models: ModelEntry[] = raw.map((m, index) => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider || "Unknown",
      recommended: index === 0,
    }));

    return { models, source: "daemon" };
  } catch {
    return { models: FALLBACK_MODELS, source: "fallback" };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelectionStepView({ tokens, engineState, onStepData, onRequestNext }: StepViewProps) {
  const isQuickstart = engineState.mode === "quickstart";

  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("loading");
  const [modelSource, setModelSource] = useState<ModelSource>("fallback");
  const fetchStartedRef = useRef(false);

  // Fetch models from daemon on mount
  const loadModels = useCallback(async () => {
    setFetchStatus("loading");

    const result = await fetchModelsFromDaemon();

    // Empty list from daemon means no models available for configured providers
    if (result.source === "daemon" && result.models.length === 0) {
      setModels([]);
      setModelSource("daemon");
      setFetchStatus("error");
      return;
    }

    setModels(result.models);
    setModelSource(result.source);
    setFetchStatus("loaded");

    // Auto-select recommended model
    const recommendedIndex = result.models.findIndex((m) => m.recommended);
    setSelectedIndex(recommendedIndex >= 0 ? recommendedIndex : 0);
  }, []);

  useEffect(() => {
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    void loadModels();
  }, [loadModels]);

  // Emit step data on selection change
  useEffect(() => {
    if (models.length === 0) return;
    const selected = models[selectedIndex];
    if (!selected) return;
    onStepData({
      modelId: selected.id,
      modelName: selected.name,
      provider: selected.provider,
      autoSelected: isQuickstart,
    });
  }, [selectedIndex, isQuickstart, onStepData, models]);

  useKeyboard((event) => {
    if (fetchStatus === "loading") return;
    const keyName = event.name ?? "";

    if (keyName === "up" && models.length > 0) {
      setSelectedIndex((prev) =>
        prev <= 0 ? models.length - 1 : prev - 1,
      );
      return;
    }
    if (keyName === "down" && models.length > 0) {
      setSelectedIndex((prev) =>
        (prev + 1) % models.length,
      );
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      // Block proceeding when no models are available
      if (models.length === 0) return;
      onRequestNext();
    }
  });

  // --- Loading state ---
  if (fetchStatus === "loading") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="Model Selection"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 2, flexDirection: "row" }}>
          <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
          <Text
            content="Loading available models..."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      </Box>
    );
  }

  // --- Empty state (daemon returned no models) ---
  if (fetchStatus === "error" && models.length === 0) {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="Model Selection"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 2, flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text content="x " style={{ color: tokens["status.error"] }} />
            <Text
              content="No models available for this provider."
              style={{ color: tokens["text.primary"] }}
            />
          </Box>
          <Box style={{ marginTop: 1, paddingLeft: 2 }}>
            <Text
              content="Check your API key and try again."
              style={{ color: tokens["text.secondary"] }}
            />
          </Box>
        </Box>
        <Box style={{ marginTop: 2 }}>
          <Text
            content="Esc back"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Model Selection"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content={
            isQuickstart
              ? "A recommended model has been selected for you."
              : "Choose your default AI model."
          }
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Fallback warning banner */}
      {modelSource === "fallback" ? (
        <Box style={{ marginTop: 1 }}>
          <Text
            content="! Using cached model list — some models may not be available."
            style={{ color: tokens["status.warning"] }}
          />
        </Box>
      ) : null}

      {/* Model list */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {models.map((model, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box
              key={model.id}
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
                  content={model.name}
                  style={{
                    color: isSelected
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
                {model.recommended ? (
                  <Text
                    content=" (recommended)"
                    style={{ color: tokens["status.success"] }}
                  />
                ) : null}
              </Box>
              <Box style={{ paddingLeft: 4 }}>
                <Text
                  content={model.provider}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Hint */}
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Up/Down select  ·  Enter continue  ·  Esc back"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
