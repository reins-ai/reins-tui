import type { ReactNode } from "react";

import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MarketplacePlaceholderProps {
  /** Optional slot rendered above the content (e.g. a TabBar). */
  readonly tabBar?: ReactNode;
}

// ---------------------------------------------------------------------------
// Planned features shown in the placeholder
// ---------------------------------------------------------------------------

const PLANNED_FEATURES: readonly string[] = [
  "Browse and install skills from the Reins community",
  "Verified publisher badges and trust scoring",
  "One-click install with automatic dependency resolution",
  "Skill ratings, reviews, and usage statistics",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketplacePlaceholder({ tabBar }: MarketplacePlaceholderProps) {
  const { tokens } = useThemeTokens();

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      {/* Tab bar slot */}
      {tabBar ?? null}

      {/* Header */}
      <Box style={{ flexDirection: "column", paddingLeft: 2, paddingTop: 1 }}>
        <Box style={{ flexDirection: "row" }}>
          <Text
            content="Reins Marketplace"
            style={{ color: tokens["text.primary"], fontWeight: "bold" }}
          />
          <Text content="  " style={{ color: tokens["text.muted"] }} />
          <Text
            content="Coming Soon"
            style={{ color: tokens["status.warning"] }}
          />
        </Box>

        {/* Description */}
        <Box style={{ marginTop: 1 }}>
          <Text
            content="The official Reins skill marketplace is under development. Browse and install skills directly from the Reins community."
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>

        {/* Planned features */}
        <Box style={{ flexDirection: "column", marginTop: 1 }}>
          <Text
            content="Planned Features"
            style={{ color: tokens["text.muted"] }}
          />
          {PLANNED_FEATURES.map((feature) => (
            <Box key={feature} style={{ flexDirection: "row", paddingLeft: 2 }}>
              <Text content="• " style={{ color: tokens["accent.primary"] }} />
              <Text content={feature} style={{ color: tokens["text.muted"] }} />
            </Box>
          ))}
        </Box>

        {/* Hint */}
        <Box style={{ marginTop: 2 }}>
          <Text
            content="In the meantime, browse community skills on the ClawHub tab."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </Box>
  );
}
