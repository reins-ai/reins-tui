import { useCallback, useEffect, useRef, useState } from "react";

import { Box, Text, useKeyboard } from "../../ui";
import { useThemeTokens } from "../../theme";
import { getActiveDaemonUrl } from "../../daemon/actions";
import { logger } from "../../lib/debug-logger";
import { ModalPanel } from "../modal-panel";
import { ConversionProgress } from "./ConversionProgress";
import { ConflictPrompt, type ConflictStrategy } from "./ConflictPrompt";
import { ConversionReport } from "./ConversionReport";

// ---------------------------------------------------------------------------
// Conversion categories (mirrors OpenClawMigrationStepView)
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
// Types
// ---------------------------------------------------------------------------

type FlowPhase =
  | "detecting"
  | "not-found"
  | "checklist"
  | "migrating"
  | "conflict"
  | "done"
  | "error";

interface DetectionResponse {
  found: boolean;
  path?: string;
  version?: string;
}

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

export interface ConvertFlowOverlayProps {
  visible: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Daemon helpers
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 500;

async function detectOpenClaw(): Promise<DetectionResponse> {
  try {
    const baseUrl = await getActiveDaemonUrl();
    const response = await fetch(`${baseUrl}/api/openclaw/detect`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { found: false };
    }

    return (await response.json()) as DetectionResponse;
  } catch {
    logger.app.warn("OpenClaw detection failed — daemon unreachable");
    return { found: false };
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

async function fetchReport(): Promise<string | null> {
  try {
    const baseUrl = await getActiveDaemonUrl();
    const response = await fetch(`${baseUrl}/api/convert/report`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { report: string | null };
    return body.report ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConvertFlowOverlay({ visible, onClose }: ConvertFlowOverlayProps) {
  const { tokens } = useThemeTokens();
  const [phase, setPhase] = useState<FlowPhase>("detecting");
  const [detectedPath, setDetectedPath] = useState<string | null>(null);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<ConversionCategory>>(
    new Set(CONVERSION_CATEGORIES),
  );
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Migration progress state
  const [progressCategory, setProgressCategory] = useState<string | null>(null);
  const [progressProcessed, setProgressProcessed] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressElapsedMs, setProgressElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // Conflict state
  const [conflictItemName, setConflictItemName] = useState("");
  const [conflictCategory, setConflictCategory] = useState("");

  // Report state
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when overlay becomes visible
  useEffect(() => {
    if (visible) {
      setPhase("detecting");
      setDetectedPath(null);
      setDetectedVersion(null);
      setSelectedCategories(new Set(CONVERSION_CATEGORIES));
      setFocusedIndex(0);
      setProgressCategory(null);
      setProgressProcessed(0);
      setProgressTotal(0);
      setProgressElapsedMs(0);
      setErrorMessage(undefined);
      setReportContent(null);
      setReportLoading(false);
    }

    return () => {
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [visible]);

  // Run detection when overlay opens
  useEffect(() => {
    if (!visible || phase !== "detecting") return;

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
  }, [visible, phase]);

  // Poll conversion status during migrating phase
  useEffect(() => {
    if (!visible || (phase !== "migrating" && phase !== "conflict")) return;

    // Only poll during migrating, not conflict (user is choosing)
    if (phase === "conflict") return;

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
        setProgressCategory(null);
        setProgressProcessed(status.processed ?? progressTotal);
        setProgressTotal(status.total ?? progressTotal);
        setProgressElapsedMs(status.elapsedMs ?? 0);
        setReportLoading(true);
        const report = await fetchReport();
        if (!cancelled) {
          setReportContent(report);
          setReportLoading(false);
          setPhase("done");
        }
        return;
      }

      if (status.status === "error") {
        setErrorMessage(status.error ?? "Unknown error");
        setPhase("error");
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
  }, [visible, phase, progressTotal]);

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

  const handleStartMigration = useCallback(async () => {
    const categories = [...selectedCategories];
    setPhase("migrating");
    const started = await startConversion(categories);
    if (!started) {
      setErrorMessage("Failed to start conversion. Is the daemon running?");
      setPhase("error");
    }
  }, [selectedCategories]);

  const handleConflictResolve = useCallback(async (strategy: ConflictStrategy) => {
    const resolved = await resolveConflict(strategy);
    if (resolved) {
      setPhase("migrating");
    } else {
      setErrorMessage("Failed to send conflict resolution to daemon");
      setPhase("error");
    }
  }, []);

  useKeyboard((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // Escape always closes (except during active migration)
    if (keyName === "escape" || keyName === "esc") {
      if (phase === "migrating" || phase === "conflict") {
        // Don't close during active migration
        return;
      }
      onClose();
      return;
    }

    if (phase === "not-found" || phase === "error") {
      if (keyName === "return" || keyName === "enter") {
        onClose();
      }
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
      return;
    }

    if (phase === "done") {
      if (keyName === "return" || keyName === "enter") {
        onClose();
      }
    }
  });

  // Derive hint text based on current phase
  const hintText =
    phase === "migrating" || phase === "conflict"
      ? ""
      : phase === "checklist"
        ? "Up/Down navigate  ·  Space toggle  ·  Enter start  ·  Esc cancel"
        : phase === "not-found" || phase === "error" || phase === "done"
          ? "Enter close"
          : "Esc cancel";

  return (
    <ModalPanel
      visible={visible}
      title="OpenClaw Migration"
      hint={hintText}
      width={80}
      height={24}
      closeOnEscape={false}
      onClose={onClose}
    >
      {phase === "detecting" ? (
        <Box style={{ flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
            <Text
              content="Checking for OpenClaw installation..."
              style={{ color: tokens["text.secondary"] }}
            />
          </Box>
        </Box>
      ) : phase === "not-found" ? (
        <Box style={{ flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text content="- " style={{ color: tokens["text.muted"] }} />
            <Text
              content="No OpenClaw installation found."
              style={{ color: tokens["text.secondary"] }}
            />
          </Box>
        </Box>
      ) : phase === "checklist" ? (
        <Box style={{ flexDirection: "column" }}>
          <Box style={{ flexDirection: "column" }}>
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

          <Box style={{ marginTop: 1 }}>
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

          <Box style={{ marginTop: 1 }}>
            <Text
              content={`${selectedCategories.size} of ${CONVERSION_CATEGORIES.length} categories selected`}
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        </Box>
      ) : phase === "migrating" ? (
        <ConversionProgress
          currentCategory={progressCategory}
          processed={progressProcessed}
          total={progressTotal}
          elapsedMs={progressElapsedMs}
          status="running"
          tokens={tokens}
        />
      ) : phase === "conflict" ? (
        <ConflictPrompt
          itemName={conflictItemName}
          category={conflictCategory}
          selectedStrategy="overwrite"
          onStrategySelect={(strategy) => {
            void handleConflictResolve(strategy);
          }}
          tokens={tokens}
        />
      ) : phase === "error" ? (
        <Box style={{ flexDirection: "column" }}>
          <Box style={{ flexDirection: "row" }}>
            <Text content="x " style={{ color: tokens["status.error"] }} />
            <Text
              content={errorMessage ?? "An error occurred during conversion."}
              style={{ color: tokens["text.primary"] }}
            />
          </Box>
        </Box>
      ) : (
        /* phase === "done" */
        <Box style={{ flexDirection: "column", flexGrow: 1 }}>
          <ConversionReport
            reportContent={reportContent}
            isLoading={reportLoading}
            tokens={tokens}
          />
        </Box>
      )}
    </ModalPanel>
  );
}
