import { useCallback, useEffect, useRef, useState } from "react";

import { Box, Text, useKeyboard } from "../../../ui";
import { getActiveDaemonUrl } from "../../../daemon/actions";
import { logger } from "../../../lib/debug-logger";
import { ConflictPrompt, type ConflictStrategy } from "../../conversion/ConflictPrompt";
import { ConversionProgress } from "../../conversion/ConversionProgress";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Conversion categories
// ---------------------------------------------------------------------------

const CONVERSION_CATEGORIES = [
  "agents",
  "workspace-memory",
  "auth-profiles",
  "channel-credentials",
  "skills",
  "conversations",
  "shared-references",
  "tool-config",
  "gateway-config",
] as const;

type ConversionCategory = (typeof CONVERSION_CATEGORIES)[number];

const CATEGORY_LABELS: Record<ConversionCategory, string> = {
  "agents": "Agents & Personas",
  "workspace-memory": "Workspace Memory",
  "auth-profiles": "API Keys",
  "channel-credentials": "Channel Credentials (Telegram/Discord)",
  "skills": "Skills / Plugins",
  "conversations": "Conversation History",
  "shared-references": "Shared References",
  "tool-config": "Tool Configuration",
  "gateway-config": "Gateway Settings",
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 5_000;

interface DetectionResponse {
  found: boolean;
  path?: string;
  version?: string;
}

async function detectOpenClaw(): Promise<DetectionResponse> {
  try {
    const baseUrl = await getActiveDaemonUrl();
    const response = await fetch(`${baseUrl}/api/openclaw/detect`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { found: false };
    }

    const data = (await response.json()) as DetectionResponse;
    return data;
  } catch {
    logger.app.warn("OpenClaw detection failed — daemon unreachable, advancing");
    return { found: false };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type MigrationPhase = "detecting" | "not-found" | "checklist" | "migrating" | "conflict" | "done";

// ---------------------------------------------------------------------------
// Daemon polling helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 500;

interface ConversionStatusResponse {
  status: "idle" | "running" | "complete" | "error" | "conflict";
  category?: string;
  processed?: number;
  total?: number;
  elapsedMs?: number;
  error?: string;
  conflict?: {
    id: string;
    type: "agent" | "provider" | "channel";
    description: string;
    strategies: ConflictStrategy[];
  };
}

function deriveConflictDisplay(conflict: NonNullable<ConversionStatusResponse["conflict"]>): {
  itemName: string;
  category: string;
} {
  const match = /'([^']+)'/.exec(conflict.description);
  const itemName = match?.[1] ?? conflict.description;
  return {
    itemName,
    category: conflict.type,
  };
}

async function pollConversionStatus(): Promise<ConversionStatusResponse> {
  try {
    const baseUrl = await getActiveDaemonUrl();
    const response = await fetch(`${baseUrl}/api/convert/status`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { status: "error", error: `HTTP ${response.status}` };
    }

    return (await response.json()) as ConversionStatusResponse;
  } catch {
    return { status: "error", error: "Daemon unreachable" };
  }
}

async function startConversion(categories: string[]): Promise<boolean> {
  try {
    const baseUrl = await getActiveDaemonUrl();
    const response = await fetch(`${baseUrl}/api/convert/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedCategories: categories }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    return response.ok || response.status === 201;
  } catch {
    return false;
  }
}

async function resolveConflict(strategy: ConflictStrategy): Promise<boolean> {
  try {
    const baseUrl = await getActiveDaemonUrl();
    const response = await fetch(`${baseUrl}/api/convert/resolve-conflict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function OpenClawMigrationStepView({
  tokens,
  engineState: _engineState,
  onStepData,
  onRequestNext,
}: StepViewProps) {
  const [phase, setPhase] = useState<MigrationPhase>("detecting");
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<ConversionCategory>>(
    new Set(CONVERSION_CATEGORIES),
  );
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Progress state
  const [progressCategory, setProgressCategory] = useState<string | null>(null);
  const [progressProcessed, setProgressProcessed] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressElapsedMs, setProgressElapsedMs] = useState(0);
  const [migrationError, setMigrationError] = useState<string | undefined>(undefined);

  // Conflict state
  const [conflictItemName, setConflictItemName] = useState("");
  const [conflictCategory, setConflictCategory] = useState("");

  const advancedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run detection on mount
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await detectOpenClaw();

      if (cancelled) return;

      if (!result.found) {
        setPhase("not-found");
        return;
      }

      setDetectedPath(result.path ?? null);
      setDetectedVersion(result.version ?? null);
      setPhase("checklist");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-advance when not found (after brief display)
  useEffect(() => {
    if (phase !== "not-found") return;

    const timer = setTimeout(() => {
      if (!advancedRef.current) {
        advancedRef.current = true;
        onStepData({
          migrationDetectionDone: true,
          migrationSkip: true,
        });
        onRequestNext();
      }
    }, 1_200);

    return () => clearTimeout(timer);
  }, [phase, onStepData, onRequestNext]);

  const handleStartMigration = useCallback(async () => {
    const categories = [...selectedCategories];
    setPhase("migrating");

    const started = await startConversion(categories);
    if (!started) {
      setMigrationError("Failed to start conversion. Is the daemon running?");
      // Fall through to done with error info
      onStepData({
        migrationDetectionDone: true,
        migrationDetected: true,
        migrationPath: detectedPath,
        migrationSelectedCategories: categories,
        migrationSkip: false,
        migrationError: "Failed to start conversion",
      });
      setPhase("done");
    }
  }, [selectedCategories, detectedPath, onStepData]);

  const handleSkip = useCallback(() => {
    onStepData({
      migrationDetectionDone: true,
      migrationSkip: true,
    });
    onRequestNext();
  }, [onStepData, onRequestNext]);

  const toggleCategory = useCallback((index: number) => {
    const category = CONVERSION_CATEGORIES[index];
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleConflictResolve = useCallback(async (strategy: ConflictStrategy) => {
    const resolved = await resolveConflict(strategy);
    if (resolved) {
      setPhase("migrating");
    } else {
      setMigrationError("Failed to send conflict resolution to daemon");
      setPhase("done");
    }
  }, []);

  // Poll conversion status during migrating phase
  useEffect(() => {
    if (phase !== "migrating") return;

    let cancelled = false;

    const poll = async () => {
      const status = await pollConversionStatus();
      if (cancelled) return;

      if (status.status === "conflict" && status.conflict) {
        const display = deriveConflictDisplay(status.conflict);
        setConflictItemName(display.itemName);
        setConflictCategory(display.category);
        setPhase("conflict");
        return;
      }

      if (status.status === "running") {
        setProgressCategory(status.category ?? null);
        setProgressProcessed(status.processed ?? 0);
        setProgressTotal(status.total ?? 0);
        setProgressElapsedMs(status.elapsedMs ?? 0);
      }

      if (status.status === "complete") {
        onStepData({
          migrationDetectionDone: true,
          migrationDetected: true,
          migrationPath: detectedPath,
          migrationSelectedCategories: [...selectedCategories],
          migrationSkip: false,
          migrationComplete: true,
        });
        setPhase("done");
        return;
      }

      if (status.status === "error") {
        setMigrationError(status.error ?? "Unknown error");
        setPhase("done");
        return;
      }

      // Schedule next poll
      if (!cancelled) {
        pollTimerRef.current = setTimeout(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [phase, detectedPath, selectedCategories, onStepData]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (phase === "not-found") {
      if (!advancedRef.current) {
        advancedRef.current = true;
        onStepData({
          migrationDetectionDone: true,
          migrationSkip: true,
        });
        onRequestNext();
      }
      return;
    }

    // During conflict phase, ConflictPrompt handles its own keyboard
    if (phase === "conflict" || phase === "migrating") {
      return;
    }

    if (phase === "checklist") {
      if (keyName === "up") {
        setFocusedIndex((prev) =>
          prev <= 0 ? CONVERSION_CATEGORIES.length - 1 : prev - 1,
        );
        return;
      }
      if (keyName === "down") {
        setFocusedIndex((prev) =>
          (prev + 1) % CONVERSION_CATEGORIES.length,
        );
        return;
      }
      if (keyName === "space" || sequence === " ") {
        toggleCategory(focusedIndex);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        void handleStartMigration();
        return;
      }
      if (keyName === "escape" || keyName === "esc" || sequence === "s" || sequence === "S") {
        handleSkip();
        return;
      }
      return;
    }

    if (phase === "done") {
      if (keyName === "return" || keyName === "enter") {
        onRequestNext();
      }
    }
  });

  // --- Render ---

  if (phase === "detecting") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="OpenClaw Migration"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "row" }}>
          <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
          <Text
            content="Checking for OpenClaw installation..."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "not-found") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="OpenClaw Migration"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "row" }}>
          <Text content="- " style={{ color: tokens["text.muted"] }} />
          <Text
            content="No OpenClaw installation found. Skipping migration."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "checklist") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="OpenClaw Migration"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text content="* " style={{ color: tokens["status.success"] }} />
            <Text
              content="OpenClaw installation detected"
              style={{ color: tokens["text.primary"] }}
            />
          </Box>
          {detectedPath !== null ? (
            <Box style={{ paddingLeft: 4 }}>
              <Text
                content={`Path: ${detectedPath}`}
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          ) : null}
          {detectedVersion !== null ? (
            <Box style={{ paddingLeft: 4 }}>
              <Text
                content={`Version: ${detectedVersion}`}
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          ) : null}
        </Box>

        <Box style={{ marginTop: 2 }}>
          <Text
            content="Select data to migrate:"
            style={{ color: tokens["text.primary"] }}
          />
        </Box>

        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          {CONVERSION_CATEGORIES.map((category, index) => {
            const isFocused = index === focusedIndex;
            const isSelected = selectedCategories.has(category);
            const label = CATEGORY_LABELS[category];

            return (
              <Box
                key={category}
                style={{
                  flexDirection: "row",
                  paddingLeft: 1,
                  backgroundColor: isFocused
                    ? tokens["surface.elevated"]
                    : "transparent",
                }}
              >
                <Text
                  content={isFocused ? "> " : "  "}
                  style={{ color: tokens["accent.primary"] }}
                />
                <Text
                  content={isSelected ? "[x] " : "[ ] "}
                  style={{
                    color: isSelected
                      ? tokens["status.success"]
                      : tokens["text.muted"],
                  }}
                />
                <Text
                  content={label}
                  style={{
                    color: isFocused
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
              </Box>
            );
          })}
        </Box>

        <Box style={{ marginTop: 2 }}>
          <Text
            content={`${selectedCategories.size} of ${CONVERSION_CATEGORIES.length} categories selected`}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>

        <Box style={{ marginTop: 1 }}>
          <Text
            content="Up/Down navigate  ·  Space toggle  ·  Enter start migration  ·  s skip"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "migrating") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="OpenClaw Migration"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 1 }}>
          <ConversionProgress
            currentCategory={progressCategory}
            processed={progressProcessed}
            total={progressTotal}
            elapsedMs={progressElapsedMs}
            status="running"
            tokens={tokens}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "conflict") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="OpenClaw Migration"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 1 }}>
          <ConflictPrompt
            itemName={conflictItemName}
            category={conflictCategory}
            selectedStrategy="overwrite"
            onStrategySelect={(strategy) => {
              void handleConflictResolve(strategy);
            }}
            tokens={tokens}
          />
        </Box>
      </Box>
    );
  }

  // phase === "done"
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="OpenClaw Migration"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1, flexDirection: "row" }}>
        {migrationError !== undefined ? (
          <>
            <Text content="x " style={{ color: tokens["status.error"] }} />
            <Text
              content={migrationError}
              style={{ color: tokens["text.primary"] }}
            />
          </>
        ) : (
          <>
            <Text content="* " style={{ color: tokens["status.success"] }} />
            <Text
              content="Migration complete. Press Enter to continue."
              style={{ color: tokens["text.secondary"] }}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
