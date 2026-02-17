import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TabDefinition {
  readonly label: string;
  readonly id: string;
}

export interface TabBarProps {
  readonly tabs: readonly TabDefinition[];
  readonly activeIndex: number;
  readonly onTabChange: (index: number) => void;
}

// ---------------------------------------------------------------------------
// Tab cycling logic (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Returns the next tab index, cycling forward with wrap-around.
 * Returns 0 when tabCount is 0 or 1.
 */
export function getNextTabIndex(currentIndex: number, tabCount: number): number {
  if (tabCount <= 1) return 0;
  return (currentIndex + 1) % tabCount;
}

/**
 * Returns the previous tab index, cycling backward with wrap-around.
 * Returns 0 when tabCount is 0 or 1.
 */
export function getPrevTabIndex(currentIndex: number, tabCount: number): number {
  if (tabCount <= 1) return 0;
  return currentIndex <= 0 ? tabCount - 1 : currentIndex - 1;
}

// ---------------------------------------------------------------------------
// Default tab definitions for the Skills panel
// ---------------------------------------------------------------------------

export const SKILL_PANEL_TABS: readonly TabDefinition[] = [
  { label: "Installed", id: "installed" },
  { label: "Reins Marketplace", id: "reins" },
  { label: "ClawHub", id: "clawhub" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TabBar({ tabs, activeIndex, onTabChange }: TabBarProps) {
  const { tokens } = useThemeTokens();

  // Suppress unused variable warning — onTabChange is used by parent via keyboard
  void onTabChange;

  if (tabs.length === 0) return null;

  const clampedIndex = Math.min(activeIndex, tabs.length - 1);

  return (
    <Box style={{ flexDirection: "row", marginBottom: 1 }}>
      {tabs.map((tab, index) => {
        const isActive = index === clampedIndex;
        const separator = index < tabs.length - 1 ? "  │  " : "";

        return (
          <Box key={tab.id} style={{ flexDirection: "row" }}>
            <Text
              content={tab.label}
              style={{
                color: isActive
                  ? tokens["accent.primary"]
                  : tokens["text.muted"],
                fontWeight: isActive ? "bold" : "normal",
              }}
            />
            {separator.length > 0 ? (
              <Text
                content={separator}
                style={{ color: tokens["border.subtle"] }}
              />
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
