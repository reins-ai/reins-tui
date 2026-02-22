import { useState } from "react";

import { Box, Text, useKeyboard } from "../../ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictStrategy = "overwrite" | "merge" | "skip";

export interface ConflictPromptProps {
  /** The item that conflicts (e.g., agent name). */
  itemName: string;
  /** Category of the conflict. */
  category: string;
  /** Currently selected strategy. */
  selectedStrategy: ConflictStrategy;
  /** Called when user selects a strategy. */
  onStrategySelect: (strategy: ConflictStrategy) => void;
  tokens: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Strategy options
// ---------------------------------------------------------------------------

const STRATEGIES: { value: ConflictStrategy; label: string; description: string }[] = [
  { value: "overwrite", label: "Overwrite", description: "Replace existing data with imported data" },
  { value: "merge", label: "Merge", description: "Combine existing and imported data" },
  { value: "skip", label: "Skip", description: "Keep existing data, ignore imported" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictPrompt({
  itemName,
  category,
  selectedStrategy,
  onStrategySelect,
  tokens,
}: ConflictPromptProps) {
  const initialIndex = STRATEGIES.findIndex((s) => s.value === selectedStrategy);
  const [focusedIndex, setFocusedIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (keyName === "up") {
      setFocusedIndex((prev) =>
        prev <= 0 ? STRATEGIES.length - 1 : prev - 1,
      );
      return;
    }
    if (keyName === "down") {
      setFocusedIndex((prev) =>
        (prev + 1) % STRATEGIES.length,
      );
      return;
    }
    if (keyName === "return" || keyName === "enter") {
      onStrategySelect(STRATEGIES[focusedIndex].value);
    }
  });

  return (
    <Box style={{ flexDirection: "column" }}>
      {/* Header */}
      <Box style={{ flexDirection: "row" }}>
        <Text content="! " style={{ color: tokens["status.warning"] }} />
        <Text
          content={`Conflict: ${category}`}
          style={{ color: tokens["text.primary"] }}
        />
        <Text
          content={` — ${itemName}`}
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>

      <Box style={{ marginTop: 1 }}>
        <Text
          content="This item already exists in Reins. How should it be handled?"
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Strategy options */}
      <Box style={{ marginTop: 1, flexDirection: "column" }}>
        {STRATEGIES.map((strategy, index) => {
          const isFocused = index === focusedIndex;

          return (
            <Box
              key={strategy.value}
              style={{
                flexDirection: "column",
                paddingLeft: 1,
                marginBottom: 1,
                backgroundColor: isFocused
                  ? tokens["surface.elevated"]
                  : "transparent",
              }}
            >
              <Box style={{ flexDirection: "row" }}>
                <Text
                  content={isFocused ? "> " : "  "}
                  style={{ color: tokens["accent.primary"] }}
                />
                <Text
                  content={strategy.label}
                  style={{
                    color: isFocused
                      ? tokens["text.primary"]
                      : tokens["text.secondary"],
                  }}
                />
              </Box>
              <Box style={{ paddingLeft: 4 }}>
                <Text
                  content={strategy.description}
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
          content="Up/Down select  ·  Enter confirm"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
