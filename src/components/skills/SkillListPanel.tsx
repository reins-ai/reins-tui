import { useCallback, useReducer } from "react";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";
import { ModalPanel } from "../modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SkillListPanelProps {
  visible: boolean;
  skills: readonly SkillListItem[];
  onSelect: (name: string) => void;
  onClose: () => void;
}

export interface SkillListItem {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly trustLevel: "trusted" | "untrusted" | "verified";
  readonly hasIntegration: boolean;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

interface PanelState {
  readonly selectedIndex: number;
  readonly searchMode: boolean;
  readonly searchQuery: string;
}

type PanelAction =
  | { type: "NAVIGATE_UP"; listLength: number }
  | { type: "NAVIGATE_DOWN"; listLength: number }
  | { type: "ENTER_SEARCH" }
  | { type: "EXIT_SEARCH" }
  | { type: "SET_SEARCH_QUERY"; query: string };

export const INITIAL_STATE: PanelState = {
  selectedIndex: 0,
  searchMode: false,
  searchQuery: "",
};

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
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

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Filters skills by a search query, matching against name and description
 * (case-insensitive). Returns the full list when query is empty.
 */
export function filterSkills(
  skills: readonly SkillListItem[],
  query: string,
): readonly SkillListItem[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return skills;

  return skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(trimmed) ||
      skill.description.toLowerCase().includes(trimmed),
  );
}

/**
 * Returns a status glyph for enabled/disabled state.
 */
export function getStatusGlyph(enabled: boolean): string {
  return enabled ? "●" : "○";
}

/**
 * Returns the theme color token key for enabled/disabled state.
 */
export function getStatusColorToken(enabled: boolean): string {
  return enabled ? "status.success" : "text.muted";
}

/**
 * Returns a trust level indicator glyph.
 */
export function getTrustGlyph(trustLevel: "trusted" | "untrusted" | "verified"): string {
  switch (trustLevel) {
    case "trusted":
      return "✓";
    case "untrusted":
      return "⚠";
    case "verified":
      return "🛡";
  }
}

/**
 * Returns the theme color token key for a trust level.
 */
export function getTrustColorToken(trustLevel: "trusted" | "untrusted" | "verified"): string {
  switch (trustLevel) {
    case "trusted":
      return "status.success";
    case "untrusted":
      return "status.warning";
    case "verified":
      return "status.info";
  }
}

/**
 * Returns a type badge label based on whether the skill has an integration.
 */
export function getTypeBadge(hasIntegration: boolean): string {
  return hasIntegration ? "integration" : "native";
}

/**
 * Truncates a description to a maximum length, appending "…" if truncated.
 */
export function truncateDescription(description: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (description.length <= maxLen) return description;
  return description.slice(0, maxLen - 1) + "…";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkillRow({
  skill,
  isSelected,
  tokens,
}: {
  skill: SkillListItem;
  isSelected: boolean;
  tokens: Record<string, string>;
}) {
  const statusGlyph = getStatusGlyph(skill.enabled);
  const statusColor = tokens[getStatusColorToken(skill.enabled)];
  const trustGlyph = getTrustGlyph(skill.trustLevel);
  const trustColor = tokens[getTrustColorToken(skill.trustLevel)];
  const typeBadge = getTypeBadge(skill.hasIntegration);
  const desc = truncateDescription(skill.description, 40);

  return (
    <Box
      style={{
        flexDirection: "row",
        paddingLeft: 1,
        backgroundColor: isSelected ? tokens["surface.elevated"] : "transparent",
      }}
    >
      <Text
        content={isSelected ? "> " : "  "}
        style={{ color: tokens["accent.primary"] }}
      />
      <Text content={statusGlyph} style={{ color: statusColor }} />
      <Text content=" " style={{ color: tokens["text.primary"] }} />
      <Text
        content={skill.name}
        style={{
          color: isSelected ? tokens["text.primary"] : tokens["text.secondary"],
        }}
      />
      <Text
        content={`  [${typeBadge}]`}
        style={{ color: tokens["text.muted"] }}
      />
      <Text content={`  ${trustGlyph}`} style={{ color: trustColor }} />
      <Text
        content={`  ${desc}`}
        style={{ color: tokens["text.muted"] }}
      />
    </Box>
  );
}

function ActionBar({ searchMode, tokens }: { searchMode: boolean; tokens: Record<string, string> }) {
  const actions = searchMode
    ? [{ key: "Esc", label: "Cancel" }]
    : [
        { key: "j/k", label: "Navigate" },
        { key: "Enter", label: "Select" },
        { key: "/", label: "Search" },
        { key: "Esc", label: "Close" },
      ];

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

export function SkillListPanel({ visible, skills, onSelect, onClose }: SkillListPanelProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(panelReducer, INITIAL_STATE);

  const filteredSkills = filterSkills(skills, state.searchQuery);

  const selectedSkill = filteredSkills.length > 0
    ? filteredSkills[Math.min(state.selectedIndex, filteredSkills.length - 1)] ?? null
    : null;

  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // --- Search mode input handling ---
    if (state.searchMode) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "EXIT_SEARCH" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
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

    // --- Normal mode ---

    if (keyName === "/" || sequence === "/") {
      dispatch({ type: "ENTER_SEARCH" });
      return;
    }

    if (keyName === "escape" || keyName === "esc") {
      onClose();
      return;
    }

    if (keyName === "up" || keyName === "k") {
      dispatch({ type: "NAVIGATE_UP", listLength: filteredSkills.length });
      return;
    }
    if (keyName === "down" || keyName === "j") {
      dispatch({ type: "NAVIGATE_DOWN", listLength: filteredSkills.length });
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      if (selectedSkill) {
        onSelect(selectedSkill.name);
      }
      return;
    }
  }, [visible, state.searchMode, state.searchQuery, filteredSkills.length, selectedSkill, onClose, onSelect]));

  const searchResultCount = filteredSkills.length;

  const hintText = state.searchMode
    ? "Type to search · Esc cancel"
    : "j/k nav · Enter select · / search · Esc close";

  return (
    <ModalPanel
      visible={visible}
      title="Skills"
      hint={hintText}
      width={76}
      height={24}
      closeOnEscape={false}
      onClose={onClose}
    >
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
              content={`  ${searchResultCount} found`}
              style={{ color: tokens["text.muted"] }}
            />
          ) : null}
        </Box>
      ) : null}

      {/* Skill list header */}
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text
          content={`Installed (${filteredSkills.length})`}
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>

      {/* Skill list or empty state */}
      <Box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        {filteredSkills.length === 0 ? (
          <Box style={{ paddingLeft: 2 }}>
            <Text
              content={skills.length === 0 ? "No skills installed" : "No matching skills"}
              style={{ color: tokens["text.muted"] }}
            />
          </Box>
        ) : (
          filteredSkills.map((skill, index) => {
            const clampedIndex = Math.min(state.selectedIndex, filteredSkills.length - 1);
            return (
              <SkillRow
                key={skill.name}
                skill={skill}
                isSelected={index === clampedIndex}
                tokens={tokens}
              />
            );
          })
        )}
      </Box>

      {/* Action bar */}
      <Box style={{ marginTop: 1 }}>
        <ActionBar searchMode={state.searchMode} tokens={tokens} />
      </Box>
    </ModalPanel>
  );
}
