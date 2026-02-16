import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createActionSearchItems,
  createCommandSearchItems,
  createConversationSearchItems,
  createFuzzySearchIndex,
  createNoteSearchItems,
  type ConversationSearchSource,
  type FuzzySearchIndex,
  type HighlightRange,
  type NoteSearchSource,
  type PaletteAction,
  type SearchCategory,
} from "../palette/fuzzy-index";
import { rankSearchResults, RecencyTracker, type RankedSearchResult } from "../palette/ranking";
import { SLASH_COMMANDS } from "../commands/registry";
import { useThemeTokens } from "../theme";
import { Box, Input, ScrollBox, Text, useKeyboard, useTerminalDimensions } from "../ui";
import { ModalPanel } from "./modal-panel";

export interface CommandPaletteDataSources {
  readonly conversations?: readonly ConversationSearchSource[];
  readonly notes?: readonly NoteSearchSource[];
}

export interface CommandPaletteProps {
  isOpen: boolean;
  sources: CommandPaletteDataSources;
  onClose(): void;
  onExecute(action: PaletteAction): void;
}

const CATEGORY_LABELS: Readonly<Record<SearchCategory, string>> = {
  command: "Commands",
  action: "Actions",
  conversation: "Conversations",
  note: "Notes",
};

const CATEGORY_GLYPHS: Readonly<Record<SearchCategory, string>> = {
  command: "/",
  action: "*",
  conversation: "◇",
  note: "N",
};

const CATEGORY_DISPLAY_ORDER: readonly SearchCategory[] = [
  "command",
  "action",
  "conversation",
  "note",
];

interface CategoryGroup {
  readonly category: SearchCategory;
  readonly label: string;
  readonly glyph: string;
  readonly results: readonly RankedSearchResult<PaletteAction>[];
}

function groupResultsByCategory(
  results: readonly RankedSearchResult<PaletteAction>[],
): readonly CategoryGroup[] {
  const grouped = new Map<SearchCategory, RankedSearchResult<PaletteAction>[]>();

  for (const result of results) {
    const category = result.item.category;
    const existing = grouped.get(category);
    if (existing) {
      existing.push(result);
    } else {
      grouped.set(category, [result]);
    }
  }

  const groups: CategoryGroup[] = [];
  for (const category of CATEGORY_DISPLAY_ORDER) {
    const items = grouped.get(category);
    if (items && items.length > 0) {
      groups.push({
        category,
        label: CATEGORY_LABELS[category],
        glyph: CATEGORY_GLYPHS[category],
        results: items,
      });
    }
  }

  return groups;
}

function flattenGroupedResults(
  groups: readonly CategoryGroup[],
): readonly RankedSearchResult<PaletteAction>[] {
  const flat: RankedSearchResult<PaletteAction>[] = [];
  for (const group of groups) {
    for (const result of group.results) {
      flat.push(result);
    }
  }
  return flat;
}

function buildSearchIndex(sources: CommandPaletteDataSources): FuzzySearchIndex<PaletteAction> {
  const commandItems = createCommandSearchItems(SLASH_COMMANDS);
  const actionItems = createActionSearchItems();
  const conversationItems = createConversationSearchItems(sources.conversations ?? []);
  const noteItems = createNoteSearchItems(sources.notes ?? []);
  const allItems = [...commandItems, ...actionItems, ...conversationItems, ...noteItems];
  return createFuzzySearchIndex(allItems);
}

function extractInputValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") {
      return value.plainText;
    }

    if ("value" in value && typeof value.value === "string") {
      return value.value;
    }
  }

  return "";
}

const COMMAND_SHORTCUT_MAP: Readonly<Record<string, string>> = Object.freeze({
  help: "?",
  new: "Ctrl+N",
  quit: "q",
  model: "Ctrl+M",
});

const ACTION_SHORTCUT_MAP: Readonly<Record<string, string>> = Object.freeze({
  "new-chat": "Ctrl+N",
  "switch-model": "Ctrl+M",
  "toggle-drawer": "Ctrl+1",
  "toggle-today": "Ctrl+2",
  "open-help": "?",
});

function resolveShortcutHint(action: PaletteAction): string | null {
  if (action.type === "command") {
    return COMMAND_SHORTCUT_MAP[action.command] ?? null;
  }

  if (action.type === "action") {
    return ACTION_SHORTCUT_MAP[action.key] ?? null;
  }

  return null;
}

interface HighlightedTextProps {
  text: string;
  ranges: readonly HighlightRange[];
  matchedField: string;
  highlightColor: string;
  baseColor: string;
}

function HighlightedText({ text, ranges, matchedField, highlightColor, baseColor }: HighlightedTextProps) {
  if (matchedField !== "label" || ranges.length === 0) {
    return <Text content={text} style={{ color: baseColor }} />;
  }

  const segments: Array<{ text: string; highlighted: boolean; key: number }> = [];
  let cursor = 0;
  let segmentKey = 0;

  for (const range of ranges) {
    const start = Math.max(0, Math.min(range.start, text.length));
    const end = Math.max(start, Math.min(range.end, text.length));

    if (cursor < start) {
      segments.push({ text: text.slice(cursor, start), highlighted: false, key: segmentKey++ });
    }
    if (start < end) {
      segments.push({ text: text.slice(start, end), highlighted: true, key: segmentKey++ });
    }
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false, key: segmentKey++ });
  }

  if (segments.length === 0) {
    return <Text content={text} style={{ color: baseColor }} />;
  }

  return (
    <Box style={{ flexDirection: "row" }}>
      {segments.map((segment) => (
        <Text
          key={segment.key}
          content={segment.text}
          style={{
            color: segment.highlighted ? highlightColor : baseColor,
          }}
        />
      ))}
    </Box>
  );
}

function truncateWithEllipsis(value: string, maxLength: number): string {
  if (maxLength <= 0 || value.length <= maxLength) {
    return value;
  }

  if (maxLength === 1) {
    return "…";
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function clampRanges(ranges: readonly HighlightRange[], visibleLength: number): HighlightRange[] {
  if (visibleLength <= 0) {
    return [];
  }

  const clamped: HighlightRange[] = [];
  for (const range of ranges) {
    const start = Math.max(0, Math.min(range.start, visibleLength));
    const end = Math.max(start, Math.min(range.end, visibleLength));
    if (start < end) {
      clamped.push({ start, end });
    }
  }

  return clamped;
}

interface PaletteResultRowProps {
  result: RankedSearchResult<PaletteAction>;
  isSelected: boolean;
  categoryGlyph: string;
  labelMaxChars: number;
  descriptionMaxChars: number;
  shortcutMaxChars: number;
  tokens: Record<string, string>;
}

function PaletteResultRow({
  result,
  isSelected,
  categoryGlyph,
  labelMaxChars,
  descriptionMaxChars,
  shortcutMaxChars,
  tokens,
}: PaletteResultRowProps) {
  const bgColor = isSelected ? tokens["surface.elevated"] : "transparent";
  const highlightColor = tokens["accent.primary"];
  const shortcutHint = resolveShortcutHint(result.item.action);
  const hideLeadingCommandGlyph = result.item.category === "command" && categoryGlyph === "/";
  const glyphText = hideLeadingCommandGlyph ? "" : `${categoryGlyph} `;
  const displayLabel = truncateWithEllipsis(result.item.label, labelMaxChars);
  const labelVisibleLength = displayLabel.endsWith("…") ? displayLabel.length - 1 : displayLabel.length;
  const displayDescription = truncateWithEllipsis(result.item.description, descriptionMaxChars);
  const displayShortcut = shortcutHint ? truncateWithEllipsis(shortcutHint, shortcutMaxChars) : null;

  return (
    <Box
      style={{
        flexDirection: "row",
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bgColor,
      }}
    >
      <Text content={isSelected ? "▸ " : "  "} style={{ color: tokens["accent.primary"] }} />
      {glyphText.length > 0 ? (
        <Text content={glyphText} style={{ color: tokens["text.secondary"] }} />
      ) : null}
      <HighlightedText
        text={displayLabel}
        ranges={clampRanges(result.ranges, labelVisibleLength)}
        matchedField={result.matchedField}
        highlightColor={highlightColor}
        baseColor={tokens["text.primary"]}
      />
      <Text content={`  ${displayDescription}`} style={{ color: tokens["text.muted"] }} />
      {displayShortcut ? (
        <Text content={`  ${displayShortcut}`} style={{ color: tokens["text.secondary"] }} />
      ) : null}
    </Box>
  );
}

interface CategoryHeaderProps {
  label: string;
  glyph: string;
  tokens: Record<string, string>;
}

function CategoryHeader({ label, glyph, tokens }: CategoryHeaderProps) {
  return (
    <Box style={{ paddingLeft: 1, marginTop: 1 }}>
      <Text
        content={`${glyph}  ${label}`}
        style={{ color: tokens["text.secondary"] }}
      />
    </Box>
  );
}

interface EmptyStateProps {
  query: string;
  tokens: Record<string, string>;
}

function EmptyState({ query, tokens }: EmptyStateProps) {
  if (query.length === 0) {
    return (
      <Box style={{ flexDirection: "column", paddingLeft: 2, marginTop: 1 }}>
        <Text content="Start typing to search commands, conversations, and notes" style={{ color: tokens["text.muted"] }} />
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Text content="Quick actions:" style={{ color: tokens["text.secondary"] }} />
          <Text content="  /help     Show available commands" style={{ color: tokens["text.muted"] }} />
          <Text content="  /new      Start a new conversation" style={{ color: tokens["text.muted"] }} />
          <Text content="  /model    Switch the active model" style={{ color: tokens["text.muted"] }} />
          <Text content="  /theme    Change the visual theme" style={{ color: tokens["text.muted"] }} />
        </Box>
        <Box style={{ marginTop: 1, flexDirection: "column" }}>
          <Text content="Type / to browse slash commands" style={{ color: tokens["text.secondary"] }} />
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ paddingLeft: 2, marginTop: 1 }}>
      <Text content={`No results for "${query}"`} style={{ color: tokens["text.muted"] }} />
    </Box>
  );
}

const sessionRecencyTracker = new RecencyTracker();

export function CommandPalette({ isOpen, sources, onClose, onExecute }: CommandPaletteProps) {
  const { tokens } = useThemeTokens();
  const terminalDimensions = useTerminalDimensions() as { width?: number };
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchIndex = useMemo(() => buildSearchIndex(sources), [sources]);

  const rankedResults = useMemo(
    () => rankSearchResults(searchIndex, query, { recencyTracker: sessionRecencyTracker }),
    [searchIndex, query],
  );

  const categoryGroups = useMemo(
    () => groupResultsByCategory(rankedResults),
    [rankedResults],
  );

  const flatResults = useMemo(
    () => flattenGroupedResults(categoryGroups),
    [categoryGroups],
  );

  const totalResults = flatResults.length;
  const terminalWidth = typeof terminalDimensions.width === "number" ? terminalDimensions.width : 120;
  const panelWidth = Math.max(48, Math.min(108, terminalWidth - 4));
  const contentWidth = Math.max(32, panelWidth - 8);
  const labelMaxChars = Math.max(12, Math.floor(contentWidth * 0.4));
  const descriptionMaxChars = Math.max(10, Math.floor(contentWidth * 0.34));
  const shortcutMaxChars = Math.max(6, Math.floor(contentWidth * 0.16));

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (selectedIndex >= totalResults && totalResults > 0) {
      setSelectedIndex(totalResults - 1);
    }
  }, [totalResults, selectedIndex]);

  const executeSelected = useCallback(() => {
    if (totalResults === 0) {
      return;
    }

    const selected = flatResults[selectedIndex];
    if (selected) {
      sessionRecencyTracker.recordUsage(selected.item.id);
      onExecute(selected.item.action);
    }
  }, [flatResults, selectedIndex, totalResults, onExecute]);

  useKeyboard((event) => {
    if (!isOpen) {
      return;
    }

    const keyName = event.name ?? "";

    if (keyName === "escape" || keyName === "esc") {
      onClose();
      return;
    }

    if (keyName === "up") {
      setSelectedIndex((current) => {
        if (totalResults === 0) return 0;
        const next = current - 1;
        return next < 0 ? totalResults - 1 : next;
      });
      return;
    }

    if (keyName === "down") {
      setSelectedIndex((current) => {
        if (totalResults === 0) return 0;
        return (current + 1) % totalResults;
      });
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      executeSelected();
    }
  });

  if (!isOpen) {
    return null;
  }

  let flatIndex = 0;

  return (
    <ModalPanel
      visible={isOpen}
      title="Command Palette"
      hint="Esc close · ↑↓ navigate · Enter select"
      onClose={onClose}
      width={108}
      height={30}
    >
      <Input
        focused
        placeholder="Search commands, conversations, notes..."
        value={query}
        onInput={(value) => {
          setQuery(extractInputValue(value));
          setSelectedIndex(0);
        }}
      />

      <Box style={{ marginTop: 1, flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        {totalResults === 0 ? (
          <EmptyState query={query} tokens={tokens} />
        ) : (
          <ScrollBox style={{ flexGrow: 1 }} contentOptions={{ flexDirection: "column" }} scrollbarOptions={{ visible: false }}>
            {categoryGroups.map((group) => (
              <Box key={group.category} style={{ flexDirection: "column" }}>
                <CategoryHeader label={group.label} glyph={group.glyph} tokens={tokens} />
                {group.results.map((result) => {
                  const currentFlatIndex = flatIndex;
                  flatIndex += 1;
                  return (
                    <PaletteResultRow
                      key={result.item.id}
                      result={result}
                      isSelected={currentFlatIndex === selectedIndex}
                      categoryGlyph={group.glyph}
                      labelMaxChars={labelMaxChars}
                      descriptionMaxChars={descriptionMaxChars}
                      shortcutMaxChars={shortcutMaxChars}
                      tokens={tokens}
                    />
                  );
                })}
              </Box>
            ))}
          </ScrollBox>
        )}
      </Box>

      <Box style={{ marginTop: 1, flexDirection: "row" }}>
        <Text
          content={totalResults > 0 ? `${totalResults} results` : "Type to search"}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </ModalPanel>
  );
}
