import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { useThemeTokens, type ThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemoryPanelProps {
  visible: boolean;
  onClose: () => void;
  daemonBaseUrl: string;
  focusMemoryId?: string;
}

// ---------------------------------------------------------------------------
// Memory record shape (inline — no @reins/core import)
// ---------------------------------------------------------------------------

export interface MemoryRecordDisplay {
  id: string;
  content: string;
  type: "fact" | "preference" | "decision" | "episode" | "skill" | "entity" | "document_chunk";
  layer: "stm" | "ltm";
  tags: string[];
  entities: string[];
  importance: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
}

export const MEMORY_TYPES = [
  "fact",
  "preference",
  "decision",
  "episode",
  "skill",
  "entity",
  "document_chunk",
] as const;

export type MemoryTypeFilter = "all" | (typeof MEMORY_TYPES)[number];

const ALL_TYPE_FILTERS: MemoryTypeFilter[] = [
  "all",
  ...MEMORY_TYPES,
];

// ---------------------------------------------------------------------------
// Utility functions (exported for tests)
// ---------------------------------------------------------------------------

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) {
    return "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) {
    return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
}

export function importanceLabel(importance: number): string {
  if (importance >= 0.7) return "●●●";
  if (importance >= 0.4) return "●●○";
  return "●○○";
}

export function typeEmoji(type: MemoryRecordDisplay["type"]): string {
  switch (type) {
    case "fact":
      return "📌";
    case "preference":
      return "❤️";
    case "decision":
      return "⚡";
    case "episode":
      return "📖";
    case "skill":
      return "🔧";
    case "entity":
      return "👤";
    case "document_chunk":
      return "📄";
  }
}

export function truncateContent(content: string, maxChars = 60): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "...";
}

// ---------------------------------------------------------------------------
// Filtering logic (exported for tests)
// ---------------------------------------------------------------------------

export function filterMemories(
  memories: MemoryRecordDisplay[],
  filter: MemoryTypeFilter,
  searchQuery: string,
): MemoryRecordDisplay[] {
  return memories
    .filter((m) => filter === "all" || m.type === filter)
    .filter((m) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        m.content.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        m.type.toLowerCase().includes(q)
      );
    });
}

// ---------------------------------------------------------------------------
// State machine (exported)
// ---------------------------------------------------------------------------

export type SortField = "createdAt" | "importance" | "accessedAt";
export type SortOrder = "asc" | "desc";

const SORT_FIELDS: SortField[] = ["createdAt", "importance", "accessedAt"];

export interface MemoryPanelState {
  readonly fetchState: "idle" | "loading" | "success" | "error";
  readonly memories: MemoryRecordDisplay[];
  readonly selectedIndex: number;
  readonly typeFilter: MemoryTypeFilter;
  readonly sortBy: SortField;
  readonly sortOrder: SortOrder;
  readonly searchQuery: string;
  readonly isSearchFocused: boolean;
  readonly editingMemory: MemoryRecordDisplay | null;
  readonly editContent: string;
  readonly editTags: string;
  readonly editImportance: number;
  readonly isSaving: boolean;
  readonly isDeleting: boolean;
  readonly confirmingDeleteId: string | null;
  readonly errorMessage: string | null;
}

export type MemoryPanelAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; memories: MemoryRecordDisplay[] }
  | { type: "FETCH_ERROR"; message: string }
  | { type: "RESET" }
  | { type: "SELECT_UP" }
  | { type: "SELECT_DOWN" }
  | { type: "SET_TYPE_FILTER"; filter: MemoryTypeFilter }
  | { type: "CYCLE_SORT_BY" }
  | { type: "TOGGLE_SORT_ORDER" }
  | { type: "SET_SEARCH"; query: string }
  | { type: "FOCUS_SEARCH" }
  | { type: "BLUR_SEARCH" }
  | { type: "OPEN_EDIT"; memory: MemoryRecordDisplay }
  | { type: "CLOSE_EDIT" }
  | { type: "SET_EDIT_CONTENT"; content: string }
  | { type: "SET_EDIT_TAGS"; tags: string }
  | { type: "SET_EDIT_IMPORTANCE"; importance: number }
  | { type: "SAVE_START" }
  | { type: "SAVE_DONE"; updated: MemoryRecordDisplay }
  | { type: "DELETE_START" }
  | { type: "DELETE_DONE"; id: string }
  | { type: "CONFIRM_DELETE"; id: string }
  | { type: "CANCEL_DELETE" }
  | { type: "FOCUS_MEMORY"; id: string };

export const MEMORY_PANEL_INITIAL_STATE: MemoryPanelState = {
  fetchState: "idle",
  memories: [],
  selectedIndex: 0,
  typeFilter: "all",
  sortBy: "createdAt",
  sortOrder: "desc",
  searchQuery: "",
  isSearchFocused: false,
  editingMemory: null,
  editContent: "",
  editTags: "",
  editImportance: 0.5,
  isSaving: false,
  isDeleting: false,
  confirmingDeleteId: null,
  errorMessage: null,
};

export function memoryPanelReducer(
  state: MemoryPanelState,
  action: MemoryPanelAction,
): MemoryPanelState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, fetchState: "loading", errorMessage: null };
    case "FETCH_SUCCESS": {
      const maxIndex = Math.max(0, action.memories.length - 1);
      return {
        ...state,
        fetchState: "success",
        memories: action.memories,
        errorMessage: null,
        selectedIndex: Math.min(state.selectedIndex, maxIndex),
      };
    }
    case "FETCH_ERROR":
      return { ...state, fetchState: "error", errorMessage: action.message };
    case "RESET":
      return MEMORY_PANEL_INITIAL_STATE;
    case "SELECT_UP":
      return {
        ...state,
        selectedIndex: Math.max(0, state.selectedIndex - 1),
      };
    case "SELECT_DOWN":
      return {
        ...state,
        selectedIndex: Math.min(
          Math.max(0, state.memories.length - 1),
          state.selectedIndex + 1,
        ),
      };
    case "SET_TYPE_FILTER":
      return { ...state, typeFilter: action.filter, selectedIndex: 0 };
    case "CYCLE_SORT_BY": {
      const currentIndex = SORT_FIELDS.indexOf(state.sortBy);
      const nextIndex = (currentIndex + 1) % SORT_FIELDS.length;
      return { ...state, sortBy: SORT_FIELDS[nextIndex], selectedIndex: 0 };
    }
    case "TOGGLE_SORT_ORDER":
      return {
        ...state,
        sortOrder: state.sortOrder === "asc" ? "desc" : "asc",
        selectedIndex: 0,
      };
    case "SET_SEARCH":
      return { ...state, searchQuery: action.query, selectedIndex: 0 };
    case "FOCUS_SEARCH":
      return { ...state, isSearchFocused: true };
    case "BLUR_SEARCH":
      return { ...state, isSearchFocused: false };
    case "OPEN_EDIT":
      return {
        ...state,
        editingMemory: action.memory,
        editContent: action.memory.content,
        editTags: action.memory.tags.join(", "),
        editImportance: action.memory.importance,
        confirmingDeleteId: null,
      };
    case "CLOSE_EDIT":
      return {
        ...state,
        editingMemory: null,
        editContent: "",
        editTags: "",
        editImportance: 0.5,
        isSaving: false,
        isDeleting: false,
        confirmingDeleteId: null,
      };
    case "SET_EDIT_CONTENT":
      return { ...state, editContent: action.content };
    case "SET_EDIT_TAGS":
      return { ...state, editTags: action.tags };
    case "SET_EDIT_IMPORTANCE":
      return { ...state, editImportance: action.importance };
    case "SAVE_START":
      return { ...state, isSaving: true };
    case "SAVE_DONE": {
      const updatedMemories = state.memories.map((m) =>
        m.id === action.updated.id ? action.updated : m,
      );
      return {
        ...state,
        isSaving: false,
        editingMemory: null,
        editContent: "",
        editTags: "",
        editImportance: 0.5,
        memories: updatedMemories,
      };
    }
    case "DELETE_START":
      return { ...state, isDeleting: true };
    case "DELETE_DONE": {
      const remaining = state.memories.filter((m) => m.id !== action.id);
      return {
        ...state,
        isDeleting: false,
        editingMemory: null,
        editContent: "",
        editTags: "",
        editImportance: 0.5,
        confirmingDeleteId: null,
        memories: remaining,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, remaining.length - 1)),
      };
    }
    case "CONFIRM_DELETE":
      return { ...state, confirmingDeleteId: action.id };
    case "CANCEL_DELETE":
      return { ...state, confirmingDeleteId: null };
    case "FOCUS_MEMORY": {
      const idx = state.memories.findIndex((m) => m.id === action.id);
      if (idx >= 0) {
        return { ...state, selectedIndex: idx };
      }
      return state;
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface MemoriesResponse {
  memories: MemoryRecordDisplay[];
  count: number;
}

async function fetchMemories(
  baseUrl: string,
  sortBy: SortField,
  sortOrder: SortOrder,
  typeFilter: MemoryTypeFilter,
): Promise<MemoryRecordDisplay[]> {
  const params = new URLSearchParams();
  params.set("sortBy", sortBy);
  params.set("sortOrder", sortOrder);
  params.set("limit", "500");
  if (typeFilter !== "all") {
    params.set("type", typeFilter);
  }
  const response = await fetch(`${baseUrl}/api/memories?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as MemoriesResponse;
  return data.memories ?? [];
}

// ---------------------------------------------------------------------------
// Importance color helper
// ---------------------------------------------------------------------------

function importanceColorToken(importance: number, tokens: Readonly<ThemeTokens>): string {
  if (importance >= 0.7) return tokens["status.success"];
  if (importance >= 0.4) return tokens["status.warning"];
  return tokens["text.muted"];
}

// ---------------------------------------------------------------------------
// Sort field display label
// ---------------------------------------------------------------------------

function sortFieldLabel(field: SortField): string {
  switch (field) {
    case "createdAt":
      return "created";
    case "importance":
      return "importance";
    case "accessedAt":
      return "accessed";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterSortBar({
  typeFilter,
  sortBy,
  sortOrder,
  tokens,
}: {
  typeFilter: MemoryTypeFilter;
  sortBy: SortField;
  sortOrder: SortOrder;
  tokens: Readonly<ThemeTokens>;
}) {
  const orderArrow = sortOrder === "desc" ? "↓" : "↑";
  return (
    <Box style={{ flexDirection: "row" }}>
      <Text content="Type: " style={{ color: tokens["text.muted"] }} />
      <Text content={`[${typeFilter}▾]`} style={{ color: tokens["accent.primary"] }} />
      <Text content="  Sort: " style={{ color: tokens["text.muted"] }} />
      <Text content={`[${sortFieldLabel(sortBy)}▾]`} style={{ color: tokens["accent.primary"] }} />
      <Text content={` [${orderArrow}]`} style={{ color: tokens["accent.secondary"] }} />
    </Box>
  );
}

function SearchBar({
  query,
  isFocused,
  tokens,
}: {
  query: string;
  isFocused: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const cursor = isFocused ? "_" : "";
  return (
    <Box style={{ flexDirection: "row", marginTop: 0 }}>
      <Text content="Search: " style={{ color: tokens["text.muted"] }} />
      <Text
        content={`${query}${cursor}`}
        style={{ color: isFocused ? tokens["text.primary"] : tokens["text.secondary"] }}
      />
    </Box>
  );
}

function MemoryRow({
  memory,
  isSelected,
  tokens,
}: {
  memory: MemoryRecordDisplay;
  isSelected: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const prefix = isSelected ? "▸ " : "  ";
  const emoji = typeEmoji(memory.type);
  const importance = importanceLabel(memory.importance);
  const content = truncateContent(memory.content);
  const tagsText = memory.tags.length > 0 ? memory.tags.join(", ") : "";
  const timeText = formatRelativeTime(memory.createdAt);

  return (
    <Box style={{ flexDirection: "row" }}>
      <Text content={prefix} style={{ color: tokens["accent.primary"] }} />
      <Text content={`${emoji} `} />
      <Text content={`${importance} `} style={{ color: importanceColorToken(memory.importance, tokens) }} />
      <Text
        content={content}
        style={{ color: isSelected ? tokens["text.primary"] : tokens["text.secondary"] }}
      />
      {tagsText ? (
        <Text content={`  ${tagsText}`} style={{ color: tokens["text.muted"] }} />
      ) : null}
      <Text content={`  ${timeText}`} style={{ color: tokens["text.muted"] }} />
    </Box>
  );
}

function EditView({
  state,
  tokens,
}: {
  state: MemoryPanelState;
  tokens: Readonly<ThemeTokens>;
}) {
  const memory = state.editingMemory;
  if (!memory) return null;

  const emoji = typeEmoji(memory.type);
  const layerLabel = memory.layer === "ltm" ? "LTM" : "STM";

  const importanceLevels: { label: string; value: number }[] = [
    { label: "●○○", value: 0.3 },
    { label: "●●○", value: 0.5 },
    { label: "●●●", value: 0.8 },
  ];

  return (
    <Box style={{ flexDirection: "column" }}>
      {/* Header */}
      <Box style={{ flexDirection: "row" }}>
        <Text content="◆ Edit Memory" style={{ color: tokens["accent.primary"] }} />
        <Text content={`  ${emoji} ${memory.type}`} style={{ color: tokens["accent.secondary"] }} />
        <Text content={`  [${layerLabel}]`} style={{ color: tokens["text.muted"] }} />
      </Box>

      {/* Content */}
      <Box style={{ flexDirection: "column", marginTop: 1 }}>
        <Text content="Content:" style={{ color: tokens["text.muted"] }} />
        <Box style={{ marginTop: 0 }}>
          <Text
            content={state.editContent || "(empty)"}
            style={{ color: tokens["text.primary"] }}
          />
        </Box>
      </Box>

      {/* Tags */}
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        <Text content="Tags: " style={{ color: tokens["text.muted"] }} />
        <Text
          content={state.editTags || "(none)"}
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Importance */}
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        <Text content="Importance: " style={{ color: tokens["text.muted"] }} />
        {importanceLevels.map((level) => {
          const isActive = Math.abs(state.editImportance - level.value) < 0.15;
          return (
            <Box key={level.label} style={{ flexDirection: "row" }}>
              <Text
                content={isActive ? `[${level.label}]` : ` ${level.label} `}
                style={{
                  color: isActive ? tokens["accent.primary"] : tokens["text.muted"],
                }}
              />
              <Text content=" " />
            </Box>
          );
        })}
      </Box>

      {/* Actions */}
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        <Text
          content={state.isSaving ? "[Saving...]" : "[Save]"}
          style={{ color: state.isSaving ? tokens["text.muted"] : tokens["status.success"] }}
        />
        <Text content="  " />
        <Text
          content={state.isDeleting ? "[Deleting...]" : "[Delete]"}
          style={{ color: state.isDeleting ? tokens["text.muted"] : tokens["status.error"] }}
        />
        <Text content="  " />
        <Text content="[Cancel]" style={{ color: tokens["text.secondary"] }} />
      </Box>

      {/* Delete confirmation */}
      {state.confirmingDeleteId !== null ? (
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text content="⚠ " style={{ color: tokens["status.warning"] }} />
          <Text
            content="Really delete? Enter=yes Esc=no"
            style={{ color: tokens["status.warning"] }}
          />
        </Box>
      ) : null}

      {/* Error message */}
      {state.errorMessage ? (
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text content="● " style={{ color: tokens["status.error"] }} />
          <Text content={state.errorMessage} style={{ color: tokens["status.error"] }} />
        </Box>
      ) : null}

      {/* Hint */}
      <Box style={{ flexDirection: "row", marginTop: 1 }}>
        <Text
          content="Esc cancel · s save · d delete · Tab cycle importance"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 3000;

export function MemoryPanel(props: MemoryPanelProps) {
  const { visible, onClose, daemonBaseUrl, focusMemoryId } = props;
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(memoryPanelReducer, MEMORY_PANEL_INITIAL_STATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusAppliedRef = useRef(false);

  const doFetch = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const memories = await fetchMemories(
        daemonBaseUrl,
        state.sortBy,
        state.sortOrder,
        state.typeFilter,
      );
      dispatch({ type: "FETCH_SUCCESS", memories });
    } catch {
      dispatch({ type: "FETCH_ERROR", message: "Unable to reach daemon" });
    }
  }, [daemonBaseUrl, state.sortBy, state.sortOrder, state.typeFilter]);

  // Fetch on open and auto-refresh
  useEffect(() => {
    if (!visible) {
      dispatch({ type: "RESET" });
      focusAppliedRef.current = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    void doFetch();

    intervalRef.current = setInterval(() => {
      void doFetch();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, doFetch]);

  // Focus on specific memory when focusMemoryId is provided
  useEffect(() => {
    if (
      focusMemoryId &&
      state.fetchState === "success" &&
      state.memories.length > 0 &&
      !focusAppliedRef.current
    ) {
      dispatch({ type: "FOCUS_MEMORY", id: focusMemoryId });
      focusAppliedRef.current = true;
    }
  }, [focusMemoryId, state.fetchState, state.memories]);

  // Filtered memories for display
  const filteredMemories = useMemo(
    () => filterMemories(state.memories, state.typeFilter, state.searchQuery),
    [state.memories, state.typeFilter, state.searchQuery],
  );

  const doSave = useCallback(async () => {
    if (!state.editingMemory) return;
    dispatch({ type: "SAVE_START" });
    try {
      const response = await fetch(`${daemonBaseUrl}/api/memories/${state.editingMemory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: state.editContent,
          tags: state.editTags.split(",").map((t) => t.trim()).filter(Boolean),
          importance: state.editImportance,
        }),
      });
      const updated = (await response.json()) as MemoryRecordDisplay;
      dispatch({ type: "SAVE_DONE", updated });
    } catch {
      void doFetch();
      dispatch({ type: "CLOSE_EDIT" });
    }
  }, [daemonBaseUrl, state.editingMemory, state.editContent, state.editTags, state.editImportance, doFetch]);

  const doDelete = useCallback(async (id: string) => {
    dispatch({ type: "DELETE_START" });
    try {
      await fetch(`${daemonBaseUrl}/api/memories/${id}`, { method: "DELETE" });
      dispatch({ type: "DELETE_DONE", id });
    } catch {
      void doFetch();
      dispatch({ type: "CLOSE_EDIT" });
    }
  }, [daemonBaseUrl, doFetch]);

  // Keyboard navigation
  useKeyboard(useCallback((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // --- Edit view keyboard ---
    if (state.editingMemory !== null) {
      // Delete confirmation mode
      if (state.confirmingDeleteId !== null) {
        if (keyName === "return" || keyName === "enter") {
          void doDelete(state.confirmingDeleteId);
          return;
        }
        if (keyName === "escape" || keyName === "esc") {
          dispatch({ type: "CANCEL_DELETE" });
          return;
        }
        return;
      }

      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "CLOSE_EDIT" });
        return;
      }

      if (sequence === "s") {
        void doSave();
        return;
      }

      if (sequence === "d") {
        dispatch({ type: "CONFIRM_DELETE", id: state.editingMemory.id });
        return;
      }

      // Tab cycles importance
      if (keyName === "tab") {
        const levels = [0.3, 0.5, 0.8];
        const closest = levels.reduce((prev, curr) =>
          Math.abs(curr - state.editImportance) < Math.abs(prev - state.editImportance) ? curr : prev,
        );
        const currentIdx = levels.indexOf(closest);
        const nextIdx = (currentIdx + 1) % levels.length;
        dispatch({ type: "SET_EDIT_IMPORTANCE", importance: levels[nextIdx] });
        return;
      }

      return;
    }

    // --- Search focused keyboard ---
    if (state.isSearchFocused) {
      if (keyName === "escape" || keyName === "esc") {
        dispatch({ type: "BLUR_SEARCH" });
        return;
      }

      if (keyName === "return" || keyName === "enter") {
        dispatch({ type: "BLUR_SEARCH" });
        return;
      }

      if (keyName === "backspace" || keyName === "delete") {
        dispatch({ type: "SET_SEARCH", query: state.searchQuery.slice(0, -1) });
        return;
      }

      // Printable character
      if (sequence.length === 1 && sequence.charCodeAt(0) >= 32) {
        dispatch({ type: "SET_SEARCH", query: state.searchQuery + sequence });
        return;
      }

      return;
    }

    // --- List view keyboard ---

    // Close panel
    if (keyName === "escape" || keyName === "esc" || sequence === "q") {
      onClose();
      return;
    }

    // Navigate
    if (keyName === "down" || sequence === "j") {
      dispatch({ type: "SELECT_DOWN" });
      return;
    }

    if (keyName === "up" || sequence === "k") {
      dispatch({ type: "SELECT_UP" });
      return;
    }

    // Search
    if (sequence === "/") {
      dispatch({ type: "FOCUS_SEARCH" });
      return;
    }

    // Type filter cycle
    if (sequence === "f") {
      const currentIdx = ALL_TYPE_FILTERS.indexOf(state.typeFilter);
      const nextIdx = (currentIdx + 1) % ALL_TYPE_FILTERS.length;
      dispatch({ type: "SET_TYPE_FILTER", filter: ALL_TYPE_FILTERS[nextIdx] });
      return;
    }

    // Sort cycle
    if (sequence === "s") {
      dispatch({ type: "CYCLE_SORT_BY" });
      return;
    }

    // Open edit
    if (keyName === "return" || keyName === "enter") {
      if (filteredMemories.length > 0 && state.selectedIndex < filteredMemories.length) {
        const memory = filteredMemories[state.selectedIndex];
        dispatch({ type: "OPEN_EDIT", memory });
      }
      return;
    }

    // Delete from list
    if (sequence === "d") {
      if (filteredMemories.length > 0 && state.selectedIndex < filteredMemories.length) {
        const memory = filteredMemories[state.selectedIndex];
        dispatch({ type: "CONFIRM_DELETE", id: memory.id });
      }
      return;
    }

    // Confirm delete from list view
    // (handled below in render — confirmation prompt shown inline)
  }, [
    visible,
    onClose,
    state.editingMemory,
    state.confirmingDeleteId,
    state.isSearchFocused,
    state.searchQuery,
    state.typeFilter,
    state.selectedIndex,
    state.editImportance,
    filteredMemories,
    doSave,
    doDelete,
  ]));

  // Handle list-view delete confirmation via separate keyboard handler
  useKeyboard(useCallback((event) => {
    if (!visible) return;
    if (state.editingMemory !== null) return;
    if (state.confirmingDeleteId === null) return;

    const keyName = event.name ?? "";

    if (keyName === "return" || keyName === "enter") {
      void doDelete(state.confirmingDeleteId);
      return;
    }

    if (keyName === "escape" || keyName === "esc") {
      dispatch({ type: "CANCEL_DELETE" });
      return;
    }
  }, [visible, state.editingMemory, state.confirmingDeleteId, doDelete]));

  const showSearch = state.isSearchFocused || state.searchQuery.length > 0;
  const totalCount = state.memories.length;
  const filteredCount = filteredMemories.length;

  const hintText = "q close · j/k navigate · / search · f type filter · s sort · Enter edit · d delete";

  return (
    <ModalPanel
      visible={visible}
      title="Memories"
      hint={hintText}
      width={76}
      height={28}
      closeOnEscape={false}
      onClose={onClose}
    >
      {/* Edit view */}
      {state.editingMemory !== null ? (
        <EditView state={state} tokens={tokens} />
      ) : (
        <Box style={{ flexDirection: "column" }}>
          {/* Loading state */}
          {state.fetchState === "loading" && state.memories.length === 0 ? (
            <Text content="Loading memories..." style={{ color: tokens["text.muted"] }} />
          ) : null}

          {/* Error state */}
          {state.fetchState === "error" && state.memories.length === 0 ? (
            <Box style={{ flexDirection: "column" }}>
              <Box style={{ flexDirection: "row" }}>
                <Text content="● " style={{ color: tokens["status.error"] }} />
                <Text content="Unable to reach daemon" style={{ color: tokens["text.secondary"] }} />
              </Box>
              <Box style={{ flexDirection: "row", marginTop: 1 }}>
                <Text
                  content="Ensure the daemon is running and try again."
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          ) : null}

          {/* Success state */}
          {state.fetchState === "success" || state.memories.length > 0 ? (
            <Box style={{ flexDirection: "column" }}>
              {/* Filter + sort bar */}
              <FilterSortBar
                typeFilter={state.typeFilter}
                sortBy={state.sortBy}
                sortOrder={state.sortOrder}
                tokens={tokens}
              />

              {/* Search bar */}
              {showSearch ? (
                <SearchBar
                  query={state.searchQuery}
                  isFocused={state.isSearchFocused}
                  tokens={tokens}
                />
              ) : null}

              {/* Memory list */}
              {filteredMemories.length === 0 ? (
                <Box style={{ flexDirection: "column", marginTop: 1 }}>
                  {totalCount === 0 ? (
                    <>
                      <Text
                        content="No memories found."
                        style={{ color: tokens["text.muted"] }}
                      />
                      <Text
                        content="Ask the assistant to remember something!"
                        style={{ color: tokens["text.muted"] }}
                      />
                    </>
                  ) : (
                    <>
                      <Text
                        content="No memories match your search."
                        style={{ color: tokens["text.muted"] }}
                      />
                      <Text
                        content="Try a different filter or search term."
                        style={{ color: tokens["text.muted"] }}
                      />
                    </>
                  )}
                </Box>
              ) : (
                <Box style={{ flexDirection: "column", marginTop: 1 }}>
                  {filteredMemories.map((memory, index) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      isSelected={index === state.selectedIndex}
                      tokens={tokens}
                    />
                  ))}
                </Box>
              )}

              {/* Delete confirmation in list view */}
              {state.confirmingDeleteId !== null && state.editingMemory === null ? (
                <Box style={{ flexDirection: "row", marginTop: 1 }}>
                  <Text content="⚠ " style={{ color: tokens["status.warning"] }} />
                  <Text
                    content="Really delete? Enter=yes Esc=no"
                    style={{ color: tokens["status.warning"] }}
                  />
                </Box>
              ) : null}

              {/* Status bar */}
              <Box style={{ flexDirection: "row", marginTop: 1 }}>
                <Text
                  content={`${totalCount} memories · Showing ${filteredCount}`}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            </Box>
          ) : null}
        </Box>
      )}
    </ModalPanel>
  );
}
