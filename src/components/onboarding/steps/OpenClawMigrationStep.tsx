import { useCallback, useEffect, useRef, useState } from "react";

import { Box, Text, useKeyboard } from "../../../ui";
import { getActiveDaemonUrl } from "../../../daemon/actions";
import { logger } from "../../../lib/debug-logger";
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

type MigrationPhase = "detecting" | "not-found" | "checklist" | "migrating" | "done";

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

  const advancedRef = useRef(false);

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

  const handleStartMigration = useCallback(() => {
    const categories = [...selectedCategories];
    onStepData({
      migrationDetectionDone: true,
      migrationDetected: true,
      migrationPath: detectedPath,
      migrationSelectedCategories: categories,
      migrationSkip: false,
    });
    onRequestNext();
  }, [selectedCategories, detectedPath, onStepData, onRequestNext]);

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
        handleStartMigration();
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

  if (phase === "done") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="OpenClaw Migration"
          style={{ color: tokens["accent.primary"] }}
        />
        <Box style={{ marginTop: 1, flexDirection: "row" }}>
          <Text content="* " style={{ color: tokens["status.success"] }} />
          <Text
            content="Migration data submitted. Press Enter to continue."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      </Box>
    );
  }

  // phase === "migrating" — should not normally render here since we advance immediately
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="OpenClaw Migration"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1, flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
        <Text
          content="Processing migration..."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>
    </Box>
  );
}
