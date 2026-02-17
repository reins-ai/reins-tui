import { useCallback, useEffect, useReducer, type ReactNode } from "react";

import type {
  MarketplaceSkill,
  MarketplaceSource,
  MarketplaceSortMode,
  MarketplaceTrustLevel,
} from "@reins/core";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MarketplaceListPanelProps {
  readonly source: MarketplaceSource | null;
  readonly onSelectSkill: (slug: string) => void;
  /** Optional slot rendered above the list (e.g. a TabBar). */
  readonly tabBar?: ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SORT_MODES: readonly MarketplaceSortMode[] = ["trending", "popular", "recent"];

const SORT_LABELS: Record<MarketplaceSortMode, string> = {
  trending: "Trending",
  popular: "Popular",
  recent: "Recent",
};

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export interface MarketplaceListState {
  readonly selectedIndex: number;
  readonly searchMode: boolean;
  readonly searchQuery: string;
  readonly sortMode: MarketplaceSortMode;
  readonly skills: readonly MarketplaceSkill[];
  readonly isLoading: boolean;
  readonly error: string | null;
}

export type MarketplaceListAction =
  | { type: "NAVIGATE_UP"; listLength: number }
  | { type: "NAVIGATE_DOWN"; listLength: number }
  | { type: "ENTER_SEARCH" }
  | { type: "EXIT_SEARCH" }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "SET_SORT"; sortMode: MarketplaceSortMode }
  | { type: "CYCLE_SORT" }
  | { type: "SET_SKILLS"; skills: readonly MarketplaceSkill[] }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" };

export const INITIAL_MARKETPLACE_STATE: MarketplaceListState = {
  selectedIndex: 0,
  searchMode: false,
  searchQuery: "",
  sortMode: "trending",
  skills: [],
  isLoading: false,
  error: null,
};

export function marketplaceListReducer(
  state: MarketplaceListState,
  action: MarketplaceListAction,
): MarketplaceListState {
  switch (action.type) {
    case "NAVIGATE_UP": {
      if (action.listLength === 0) return state;
      const nextIndex = state.selectedIndex <= 0
        ? action.listLength - 1
        : state.selectedIndex - 1;
      return { ...state, selectedIndex: nextIndex };
    }

    case "NAVIGATE_DOWN": {
      if (action.listLength === 0) return state;
      const nextIndex = (state.selectedIndex + 1) % action.listLength;
      return { ...state, selectedIndex: nextIndex };
    }

    case "ENTER_SEARCH":
      return { ...state, searchMode: true, searchQuery: "" };

    case "EXIT_SEARCH":
      return { ...state, searchMode: false, searchQuery: "", selectedIndex: 0 };

    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query, selectedIndex: 0 };

    case "SET_SORT":
      return { ...state, sortMode: action.sortMode, selectedIndex: 0 };

    case "CYCLE_SORT": {
      const currentIdx = SORT_MODES.indexOf(state.sortMode);
      const nextIdx = (currentIdx + 1) % SORT_MODES.length;
      return { ...state, sortMode: SORT_MODES[nextIdx], selectedIndex: 0 };
    }

    case "SET_SKILLS":
      return { ...state, skills: action.skills, isLoading: false, error: null };

    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };

    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Returns the next sort mode in the cycle: trending → popular → recent → trending.
 */
export function getNextSortMode(current: MarketplaceSortMode): MarketplaceSortMode {
  const currentIdx = SORT_MODES.indexOf(current);
  const nextIdx = (currentIdx + 1) % SORT_MODES.length;
  return SORT_MODES[nextIdx];
}

/**
 * Returns a trust level indicator glyph for marketplace skills.
 */
export function getMarketplaceTrustGlyph(trustLevel: MarketplaceTrustLevel): string {
  switch (trustLevel) {
    case "verified":
      return "[V]";
    case "trusted":
      return "[T]";
    case "community":
      return "[C]";
    case "untrusted":
      return "[!]";
  }
}

/**
 * Returns the theme color token key for a marketplace trust level.
 */
export function getMarketplaceTrustColorToken(trustLevel: MarketplaceTrustLevel): string {
  switch (trustLevel) {
    case "verified":
      return "status.success";
    case "trusted":
      return "status.info";
    case "community":
      return "status.warning";
    case "untrusted":
      return "status.error";
  }
}

/**
 * Formats an install count for display (e.g. 1234 → "1.2k").
 */
export function formatInstallCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) {
    const k = count / 1000;
    return `${k.toFixed(1)}k`;
  }
  if (count < 1000000) {
    const k = Math.round(count / 1000);
    return `${k}k`;
  }
  const m = count / 1000000;
  return `${m.toFixed(1)}M`;
}

/**
 * Truncates a description to a maximum length, appending "…" if truncated.
 */
export function truncateDescription(description: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (description.length <= maxLen) return description;
  return description.slice(0, maxLen - 1) + "…";
}

/**
 * Returns the help actions for the marketplace list panel.
 */
export function getMarketplaceHelpActions(
  searchMode: boolean,
  hasError: boolean,
): readonly { key: string; label: string }[] {
  if (hasError) {
    return [
      { key: "r", label: "Retry" },
      { key: "Esc", label: "Close" },
    ];
  }

  if (searchMode) {
    return [{ key: "Esc", label: "Cancel" }];
  }

  return [
    { key: "j/k", label: "Navigate" },
    { key: "Enter", label: "Select" },
    { key: "/", label: "Search" },
    { key: "s", label: "Sort" },
    { key: "Esc", label: "Close" },
  ];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortModeSelector({
  activeMode,
  tokens,
}: {
  activeMode: MarketplaceSortMode;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "row", paddingLeft: 2 }}>
      <Text content="Sort: " style={{ color: tokens["text.muted"] }} />
      {SORT_MODES.map((mode, index) => {
        const isActive = mode === activeMode;
        const label = SORT_LABELS[mode];

        return (
          <Box key={mode} style={{ flexDirection: "row" }}>
            {index > 0 ? (
              <Text content="  " style={{ color: tokens["text.muted"] }} />
            ) : null}
            <Text
              content={isActive ? `[${label}]` : ` ${label} `}
              style={{
                color: isActive
                  ? tokens["accent.primary"]
                  : tokens["text.muted"],
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Normalizes inline text for compact single-line rendering.
 */
function normalizeInlineText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function padTo(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + " ".repeat(len - str.length);
}

function MarketplaceSkillRow({
  skill,
  isSelected,
  tokens,
}: {
  skill: MarketplaceSkill;
  isSelected: boolean;
  tokens: Record<string, string>;
}) {
  const installs = formatInstallCount(skill.installCount);
  const indicator = isSelected ? "▸" : " ";
  const trustColor = tokens[getMarketplaceTrustColorToken(skill.trustLevel)];
  const name = padTo(truncateDescription(normalizeInlineText(skill.name), 18), 18);
  const description = truncateDescription(normalizeInlineText(skill.description), 38);

  return (
    <Box
      style={{
        flexDirection: "row",
        paddingLeft: 1,
        backgroundColor: isSelected ? tokens["surface.elevated"] : "transparent",
      }}
    >
      <Text
        content={`${indicator} `}
        style={{ color: tokens["accent.primary"] }}
      />
      <Text
        content="● "
        style={{ color: trustColor }}
      />
      <Text
        content={name}
        style={{
          color: isSelected ? tokens["text.primary"] : tokens["text.secondary"],
        }}
      />
      <Text
        content="  "
        style={{ color: tokens["text.muted"] }}
      />
      <Text
        content={description}
        style={{
          color: isSelected ? tokens["text.secondary"] : tokens["text.muted"],
        }}
      />
      <Text
        content={`  ↓ ${installs}`}
        style={{ color: tokens["status.info"] }}
      />
    </Box>
  );
}

function ActionBar({
  searchMode,
  hasError,
  tokens,
}: {
  searchMode: boolean;
  hasError: boolean;
  tokens: Record<string, string>;
}) {
  const actions = getMarketplaceHelpActions(searchMode, hasError);

  return (
    <Box style={{ flexDirection: "row" }}>
      {actions.map((action, index) => (
        <Box key={action.key} style={{ flexDirection: "row" }}>
          {index > 0 ? (
            <Text content="  " style={{ color: tokens["text.muted"] }} />
          ) : null}
          <Text
            content={action.key}
            style={{ color: tokens["accent.primary"] }}
          />
          <Text
            content={` ${action.label}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MarketplaceListPanel({
  source,
  onSelectSkill,
  tabBar,
}: MarketplaceListPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(marketplaceListReducer, INITIAL_MARKETPLACE_STATE);

  // --- Data fetching: browse ---
  useEffect(() => {
    if (!source) return;
    if (state.searchMode && state.searchQuery.length > 0) return;

    let cancelled = false;
    dispatch({ type: "SET_LOADING", isLoading: true });

    source.browse({ sort: state.sortMode }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        dispatch({ type: "SET_SKILLS", skills: result.value.skills });
      } else {
        dispatch({ type: "SET_ERROR", error: result.error.message });
      }
    }).catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SET_ERROR", error: message });
    });

    return () => { cancelled = true; };
  }, [source, state.sortMode, state.searchMode, state.searchQuery]);

  // --- Data fetching: search ---
  useEffect(() => {
    if (!source) return;
    if (!state.searchMode || state.searchQuery.length === 0) return;

    let cancelled = false;
    dispatch({ type: "SET_LOADING", isLoading: true });

    source.search(state.searchQuery).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        dispatch({ type: "SET_SKILLS", skills: result.value.skills });
      } else {
        dispatch({ type: "SET_ERROR", error: result.error.message });
      }
    }).catch((err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SET_ERROR", error: message });
    });

    return () => { cancelled = true; };
  }, [source, state.searchMode, state.searchQuery]);

  // --- Retry handler ---
  const handleRetry = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
    // Trigger re-fetch by cycling through a state change
    // The useEffect hooks will re-run because error is cleared
    dispatch({ type: "SET_LOADING", isLoading: true });
    if (!source) return;

    if (state.searchMode && state.searchQuery.length > 0) {
      source.search(state.searchQuery).then((result) => {
        if (result.ok) {
          dispatch({ type: "SET_SKILLS", skills: result.value.skills });
        } else {
          dispatch({ type: "SET_ERROR", error: result.error.message });
        }
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        dispatch({ type: "SET_ERROR", error: message });
      });
    } else {
      source.browse({ sort: state.sortMode }).then((result) => {
        if (result.ok) {
          dispatch({ type: "SET_SKILLS", skills: result.value.skills });
        } else {
          dispatch({ type: "SET_ERROR", error: result.error.message });
        }
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        dispatch({ type: "SET_ERROR", error: message });
      });
    }
  }, [source, state.searchMode, state.searchQuery, state.sortMode]);

  // --- Keyboard handling ---
  useKeyboard(useCallback((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // --- Search mode input handling ---
    if (state.searchMode) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "EXIT_SEARCH" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        // Keep search results visible but exit typing mode
        dispatch({ type: "EXIT_SEARCH" });
        return;
      }
      if (keyName === "backspace" || keyName === "delete") {
        dispatch({
          type: "SET_SEARCH_QUERY",
          query: state.searchQuery.slice(0, -1),
        });
        return;
      }
      if (sequence.length === 1 && !event.ctrl && !event.meta) {
        dispatch({
          type: "SET_SEARCH_QUERY",
          query: state.searchQuery + sequence,
        });
        return;
      }
      return;
    }

    // --- Error state: only r and Esc ---
    if (state.error) {
      if (keyName === "r" || sequence === "r") {
        handleRetry();
        return;
      }
      return;
    }

    // --- Normal mode ---

    if (keyName === "/" || sequence === "/") {
      dispatch({ type: "ENTER_SEARCH" });
      return;
    }

    if (keyName === "s" || sequence === "s") {
      dispatch({ type: "CYCLE_SORT" });
      return;
    }

    if (keyName === "up" || keyName === "k") {
      dispatch({ type: "NAVIGATE_UP", listLength: state.skills.length });
      return;
    }
    if (keyName === "down" || keyName === "j") {
      dispatch({ type: "NAVIGATE_DOWN", listLength: state.skills.length });
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      const skill = state.skills.length > 0
        ? state.skills[Math.min(state.selectedIndex, state.skills.length - 1)]
        : null;
      if (skill) {
        onSelectSkill(skill.slug);
      }
      return;
    }
  }, [state.searchMode, state.searchQuery, state.error, state.skills, state.selectedIndex, handleRetry, onSelectSkill]));

  // --- No source configured ---
  if (!source) {
    return (
      <Box style={{ flexDirection: "column" }}>
        {tabBar ?? null}
        <Box style={{ paddingLeft: 2, paddingTop: 1 }}>
          <Text
            content="No marketplace source configured"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      {/* Tab bar slot */}
      {tabBar ?? null}

      {/* Sort mode selector */}
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <SortModeSelector activeMode={state.sortMode} tokens={tokens} />
      </Box>

      {/* Search bar */}
      {state.searchMode ? (
        <Box style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text content="/ " style={{ color: tokens["accent.primary"] }} />
          <Text
            content={state.searchQuery.length > 0 ? state.searchQuery : ""}
            style={{ color: tokens["text.primary"] }}
          />
          <Text content="▌" style={{ color: tokens["accent.primary"] }} />
          {state.searchQuery.length > 0 ? (
            <Text
              content={`  ${state.skills.length} found`}
              style={{ color: tokens["text.muted"] }}
            />
          ) : null}
        </Box>
      ) : null}

      {/* Loading state */}
      {state.isLoading ? (
        <Box style={{ paddingLeft: 2, paddingTop: 1 }}>
          <Text
            content="Loading skills..."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}

      {/* Error state */}
      {state.error ? (
        <Box style={{ paddingLeft: 2, paddingTop: 1 }}>
          <Text
            content={`Failed to load: ${state.error}. Press r to retry.`}
            style={{ color: tokens["status.error"] }}
          />
        </Box>
      ) : null}

      {/* Skill list or empty state */}
      {!state.isLoading && !state.error ? (
        <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
          {state.skills.length === 0 ? (
            <Box style={{ paddingLeft: 2 }}>
              <Text
                content="No skills found"
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          ) : (
            state.skills.map((skill, index) => {
              const clampedIndex = Math.min(state.selectedIndex, state.skills.length - 1);
              return (
                <MarketplaceSkillRow
                  key={skill.slug}
                  skill={skill}
                  isSelected={index === clampedIndex}
                  tokens={tokens}
                />
              );
            })
          )}
        </Box>
      ) : null}

      {/* Action bar */}
      <Box style={{ marginTop: 1 }}>
        <ActionBar
          searchMode={state.searchMode}
          hasError={state.error !== null}
          tokens={tokens}
        />
      </Box>
    </Box>
  );
}
