import type { MarketplaceTrustLevel } from "@reins/core";

import { useThemeTokens, type ThemeTokenName } from "../../theme";
import { Box, Text } from "../../ui";

// ---------------------------------------------------------------------------
// Trust badge configuration (exported for reuse and testing)
// ---------------------------------------------------------------------------

export interface TrustBadgeConfig {
  readonly symbol: string;
  readonly label: string;
  readonly colorToken: ThemeTokenName;
}

export const TRUST_BADGE_CONFIG: Record<MarketplaceTrustLevel, TrustBadgeConfig> = {
  verified: { symbol: "✓", label: "Verified", colorToken: "status.success" },
  trusted: { symbol: "●", label: "Trusted", colorToken: "status.info" },
  community: { symbol: "◆", label: "Community", colorToken: "status.warning" },
  untrusted: { symbol: "⚠", label: "Untrusted", colorToken: "status.error" },
};

/**
 * Returns the trust badge config for a given trust level.
 */
export function getTrustBadgeConfig(level: MarketplaceTrustLevel): TrustBadgeConfig {
  return TRUST_BADGE_CONFIG[level];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TrustBadgeProps {
  readonly level: MarketplaceTrustLevel;
}

export function TrustBadge({ level }: TrustBadgeProps) {
  const { tokens } = useThemeTokens();
  const config = TRUST_BADGE_CONFIG[level];
  const color = tokens[config.colorToken];

  return (
    <Box style={{ flexDirection: "row" }}>
      <Text content={config.symbol} style={{ color }} />
      <Text content={` ${config.label}`} style={{ color }} />
    </Box>
  );
}
