import { useCallback, useEffect, useReducer, useRef } from "react";

import { useThemeTokens, type ThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PersonaEditorProps {
  visible: boolean;
  onClose: () => void;
  daemonBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Persona data shape (inline — no @reins/core import)
// ---------------------------------------------------------------------------

export type PersonalityPreset =
  | "balanced"
  | "concise"
  | "technical"
  | "warm"
  | "custom";

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
  "balanced",
  "concise",
  "technical",
  "warm",
  "custom",
];

export interface PersonaData {
  name: string;
  avatar: string;
  preset: PersonalityPreset;
  customInstructions: string;
}

const DEFAULT_PERSONA: PersonaData = {
  name: "Reins",
  avatar: "🤖",
  preset: "balanced",
  customInstructions: "",
};

export const AVATAR_EMOJIS = ["🤖", "🧠", "🦊", "🐉", "🌟", "⚡", "🎯", "🔮"] as const;

const AVATAR_GRID_COLS = 4;

// ---------------------------------------------------------------------------
// Field navigation
// ---------------------------------------------------------------------------

export type EditorField = "name" | "avatar" | "preset" | "instructions" | "actions";

const FIELD_ORDER: EditorField[] = [
  "name",
  "avatar",
  "preset",
  "instructions",
  "actions",
];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export interface PersonaEditorState {
  readonly fetchState: "idle" | "loading" | "success" | "error";
  readonly name: string;
  readonly avatar: string;
  readonly avatarIndex: number;
  readonly preset: PersonalityPreset;
  readonly presetIndex: number;
  readonly customInstructions: string;
  readonly activeField: EditorField;
  readonly errorMessage: string | null;
  readonly savedMessage: string | null;
  readonly isSaving: boolean;
}

export type PersonaEditorAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; data: PersonaData }
  | { type: "FETCH_ERROR"; message: string }
  | { type: "RESET" }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_AVATAR"; avatar: string; index: number }
  | { type: "SET_PRESET"; preset: PersonalityPreset; index: number }
  | { type: "SET_CUSTOM_INSTRUCTIONS"; text: string }
  | { type: "FOCUS_FIELD"; field: EditorField }
  | { type: "NEXT_FIELD" }
  | { type: "PREV_FIELD" }
  | { type: "SAVE_START" }
  | { type: "SAVE_DONE" }
  | { type: "SAVE_ERROR"; message: string }
  | { type: "CLEAR_SAVED" };

export const PERSONA_EDITOR_INITIAL_STATE: PersonaEditorState = {
  fetchState: "idle",
  name: DEFAULT_PERSONA.name,
  avatar: DEFAULT_PERSONA.avatar,
  avatarIndex: 0,
  preset: DEFAULT_PERSONA.preset,
  presetIndex: 0,
  customInstructions: DEFAULT_PERSONA.customInstructions,
  activeField: "name",
  errorMessage: null,
  savedMessage: null,
  isSaving: false,
};

function resolveAvatarIndex(avatar: string): number {
  const idx = AVATAR_EMOJIS.indexOf(avatar as (typeof AVATAR_EMOJIS)[number]);
  return idx >= 0 ? idx : 0;
}

function resolvePresetIndex(preset: PersonalityPreset): number {
  const idx = PERSONALITY_PRESETS.indexOf(preset);
  return idx >= 0 ? idx : 0;
}

export function personaEditorReducer(
  state: PersonaEditorState,
  action: PersonaEditorAction,
): PersonaEditorState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, fetchState: "loading", errorMessage: null };
    case "FETCH_SUCCESS":
      return {
        ...state,
        fetchState: "success",
        name: action.data.name,
        avatar: action.data.avatar,
        avatarIndex: resolveAvatarIndex(action.data.avatar),
        preset: action.data.preset,
        presetIndex: resolvePresetIndex(action.data.preset),
        customInstructions: action.data.customInstructions,
        errorMessage: null,
      };
    case "FETCH_ERROR":
      return {
        ...state,
        fetchState: "error",
        errorMessage: action.message,
        name: DEFAULT_PERSONA.name,
        avatar: DEFAULT_PERSONA.avatar,
        avatarIndex: 0,
        preset: DEFAULT_PERSONA.preset,
        presetIndex: 0,
        customInstructions: DEFAULT_PERSONA.customInstructions,
      };
    case "RESET":
      return PERSONA_EDITOR_INITIAL_STATE;
    case "SET_NAME":
      return { ...state, name: action.name.slice(0, 50) };
    case "SET_AVATAR":
      return { ...state, avatar: action.avatar, avatarIndex: action.index };
    case "SET_PRESET": {
      const nextState: PersonaEditorState = {
        ...state,
        preset: action.preset,
        presetIndex: action.index,
      };
      // Clear custom instructions when switching away from custom
      if (action.preset !== "custom" && state.preset === "custom") {
        return { ...nextState, customInstructions: "" };
      }
      return nextState;
    }
    case "SET_CUSTOM_INSTRUCTIONS":
      return { ...state, customInstructions: action.text };
    case "FOCUS_FIELD":
      return { ...state, activeField: action.field };
    case "NEXT_FIELD": {
      const currentIdx = FIELD_ORDER.indexOf(state.activeField);
      // Skip instructions field when preset is not custom
      let nextIdx = (currentIdx + 1) % FIELD_ORDER.length;
      if (FIELD_ORDER[nextIdx] === "instructions" && state.preset !== "custom") {
        nextIdx = (nextIdx + 1) % FIELD_ORDER.length;
      }
      return { ...state, activeField: FIELD_ORDER[nextIdx] };
    }
    case "PREV_FIELD": {
      const currentIdx = FIELD_ORDER.indexOf(state.activeField);
      let prevIdx = (currentIdx - 1 + FIELD_ORDER.length) % FIELD_ORDER.length;
      if (FIELD_ORDER[prevIdx] === "instructions" && state.preset !== "custom") {
        prevIdx = (prevIdx - 1 + FIELD_ORDER.length) % FIELD_ORDER.length;
      }
      return { ...state, activeField: FIELD_ORDER[prevIdx] };
    }
    case "SAVE_START":
      return { ...state, isSaving: true, errorMessage: null, savedMessage: null };
    case "SAVE_DONE":
      return { ...state, isSaving: false, savedMessage: "Saved!" };
    case "SAVE_ERROR":
      return { ...state, isSaving: false, errorMessage: action.message };
    case "CLEAR_SAVED":
      return { ...state, savedMessage: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

interface PersonaApiResponse {
  name?: string;
  avatar?: string;
  preset?: string;
  customInstructions?: string;
}

async function fetchPersona(baseUrl: string): Promise<PersonaData> {
  const response = await fetch(`${baseUrl}/api/persona`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as PersonaApiResponse;
  return {
    name: data.name ?? DEFAULT_PERSONA.name,
    avatar: data.avatar ?? DEFAULT_PERSONA.avatar,
    preset: isValidPreset(data.preset) ? data.preset : DEFAULT_PERSONA.preset,
    customInstructions: data.customInstructions ?? DEFAULT_PERSONA.customInstructions,
  };
}

function isValidPreset(value: unknown): value is PersonalityPreset {
  return typeof value === "string" && PERSONALITY_PRESETS.includes(value as PersonalityPreset);
}

// ---------------------------------------------------------------------------
// Utility functions (exported for testability)
// ---------------------------------------------------------------------------

export function presetLabel(preset: PersonalityPreset): string {
  switch (preset) {
    case "balanced":
      return "Balanced";
    case "concise":
      return "Concise";
    case "technical":
      return "Technical";
    case "warm":
      return "Warm";
    case "custom":
      return "Custom";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldLabel({
  label,
  isActive,
  tokens,
}: {
  label: string;
  isActive: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const indicator = isActive ? "▸ " : "  ";
  return (
    <Box style={{ flexDirection: "row" }}>
      <Text
        content={indicator}
        style={{ color: isActive ? tokens["accent.primary"] : tokens["text.muted"] }}
      />
      <Text
        content={label}
        style={{ color: isActive ? tokens["accent.primary"] : tokens["text.muted"] }}
      />
    </Box>
  );
}

function NameField({
  name,
  isActive,
  tokens,
}: {
  name: string;
  isActive: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const cursor = isActive ? "▏" : "";
  return (
    <Box style={{ flexDirection: "column" }}>
      <FieldLabel label="Name" isActive={isActive} tokens={tokens} />
      <Box style={{ flexDirection: "row", marginLeft: 2 }}>
        <Text
          content={`${name}${cursor}`}
          style={{
            color: isActive ? tokens["text.primary"] : tokens["text.secondary"],
          }}
        />
        {isActive ? (
          <Text content="  (max 50)" style={{ color: tokens["text.muted"] }} />
        ) : null}
      </Box>
    </Box>
  );
}

function AvatarField({
  avatarIndex,
  isActive,
  tokens,
}: {
  avatarIndex: number;
  isActive: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  const rows: string[][] = [];
  for (let i = 0; i < AVATAR_EMOJIS.length; i += AVATAR_GRID_COLS) {
    rows.push(AVATAR_EMOJIS.slice(i, i + AVATAR_GRID_COLS) as unknown as string[]);
  }

  return (
    <Box style={{ flexDirection: "column" }}>
      <FieldLabel label="Avatar" isActive={isActive} tokens={tokens} />
      {rows.map((row, rowIdx) => (
        <Box key={`row-${rowIdx}`} style={{ flexDirection: "row", marginLeft: 2 }}>
          {row.map((emoji, colIdx) => {
            const globalIdx = rowIdx * AVATAR_GRID_COLS + colIdx;
            const isSelected = globalIdx === avatarIndex;
            const bracket = isSelected ? (isActive ? `[${emoji}]` : `(${emoji})`) : ` ${emoji} `;
            return (
              <Text
                key={`emoji-${globalIdx}`}
                content={bracket}
                style={{
                  color: isSelected
                    ? tokens["accent.primary"]
                    : tokens["text.secondary"],
                }}
              />
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function PresetField({
  presetIndex,
  isActive,
  tokens,
}: {
  presetIndex: number;
  isActive: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <FieldLabel label="Preset" isActive={isActive} tokens={tokens} />
      <Box style={{ flexDirection: "row", marginLeft: 2 }}>
        {PERSONALITY_PRESETS.map((preset, idx) => {
          const isSelected = idx === presetIndex;
          const radio = isSelected ? "◉" : "○";
          const label = presetLabel(preset);
          return (
            <Box key={preset} style={{ flexDirection: "row" }}>
              <Text
                content={`${radio} ${label}`}
                style={{
                  color: isSelected
                    ? (isActive ? tokens["accent.primary"] : tokens["text.primary"])
                    : tokens["text.muted"],
                }}
              />
              {idx < PERSONALITY_PRESETS.length - 1 ? (
                <Text content="  " />
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function InstructionsField({
  text,
  isActive,
  isEnabled,
  tokens,
}: {
  text: string;
  isActive: boolean;
  isEnabled: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  if (!isEnabled) {
    return (
      <Box style={{ flexDirection: "column" }}>
        <FieldLabel label="Custom Instructions" isActive={false} tokens={tokens} />
        <Box style={{ flexDirection: "row", marginLeft: 2 }}>
          <Text
            content="(select Custom preset to enable)"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    );
  }

  const cursor = isActive ? "▏" : "";
  const displayText = text.length > 0 ? text : "(empty)";
  const lines = displayText.split("\n");
  const displayLines = lines.slice(0, 5);
  const hasMore = lines.length > 5;

  return (
    <Box style={{ flexDirection: "column" }}>
      <FieldLabel label="Custom Instructions" isActive={isActive} tokens={tokens} />
      <Box style={{ flexDirection: "column", marginLeft: 2 }}>
        {displayLines.map((line, idx) => (
          <Text
            key={`line-${idx}`}
            content={idx === displayLines.length - 1 ? `${line}${cursor}` : line}
            style={{
              color: isActive ? tokens["text.primary"] : tokens["text.secondary"],
            }}
          />
        ))}
        {hasMore ? (
          <Text
            content={`... (${lines.length - 5} more lines)`}
            style={{ color: tokens["text.muted"] }}
          />
        ) : null}
      </Box>
      {isActive ? (
        <Box style={{ flexDirection: "row", marginLeft: 2 }}>
          <Text
            content="Ctrl+Enter new line"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function ActionsBar({
  isActive,
  isSaving,
  tokens,
}: {
  isActive: boolean;
  isSaving: boolean;
  tokens: Readonly<ThemeTokens>;
}) {
  return (
    <Box style={{ flexDirection: "row" }}>
      {isActive ? (
        <Text content="▸ " style={{ color: tokens["accent.primary"] }} />
      ) : (
        <Text content="  " />
      )}
      <Text
        content={isSaving ? "[Saving...]" : "[Save & Apply]"}
        style={{
          color: isSaving
            ? tokens["text.muted"]
            : (isActive ? tokens["status.success"] : tokens["text.secondary"]),
        }}
      />
      <Text content="  " />
      <Text
        content="[Cancel]"
        style={{ color: isActive ? tokens["text.secondary"] : tokens["text.muted"] }}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PersonaEditor(props: PersonaEditorProps) {
  const { visible, onClose, daemonBaseUrl } = props;
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(personaEditorReducer, PERSONA_EDITOR_INITIAL_STATE);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch persona on open
  useEffect(() => {
    if (!visible) {
      dispatch({ type: "RESET" });
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
      return;
    }

    const load = async () => {
      dispatch({ type: "FETCH_START" });
      try {
        const data = await fetchPersona(daemonBaseUrl);
        dispatch({ type: "FETCH_SUCCESS", data });
      } catch {
        // Use defaults on error (API may not exist yet)
        dispatch({ type: "FETCH_ERROR", message: "Could not load persona — using defaults" });
      }
    };

    void load();
  }, [visible, daemonBaseUrl]);

  // Auto-dismiss saved message after 2 seconds
  useEffect(() => {
    if (state.savedMessage === null) return;
    savedTimerRef.current = setTimeout(() => {
      dispatch({ type: "CLEAR_SAVED" });
      savedTimerRef.current = null;
    }, 2000);
    return () => {
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, [state.savedMessage]);

  // Save handler (placeholder — T11.2 wires actual save)
  const doSave = useCallback(async () => {
    dispatch({ type: "SAVE_START" });
    try {
      const response = await fetch(`${daemonBaseUrl}/api/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          avatar: state.avatar,
          preset: state.preset,
          customInstructions: state.customInstructions,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      dispatch({ type: "SAVE_DONE" });
    } catch {
      dispatch({ type: "SAVE_ERROR", message: "Save not yet wired — API endpoint pending" });
    }
  }, [daemonBaseUrl, state.name, state.avatar, state.preset, state.customInstructions]);

  // Keyboard navigation
  useKeyboard(useCallback((event) => {
    if (!visible) return;
    if (state.fetchState === "loading") return;

    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";
    const ctrl = event.ctrl ?? false;

    // --- Global shortcuts ---

    // Escape: close editor
    if (keyName === "escape" || keyName === "esc") {
      onClose();
      return;
    }

    // Ctrl+S: save from any field
    if (ctrl && sequence === "s") {
      if (!state.isSaving) {
        void doSave();
      }
      return;
    }

    // Tab / Shift+Tab: navigate between fields
    if (keyName === "tab") {
      if (event.shift) {
        dispatch({ type: "PREV_FIELD" });
      } else {
        dispatch({ type: "NEXT_FIELD" });
      }
      return;
    }

    // --- Field-specific keyboard ---

    switch (state.activeField) {
      case "name": {
        // Backspace
        if (keyName === "backspace" || keyName === "delete") {
          dispatch({ type: "SET_NAME", name: state.name.slice(0, -1) });
          return;
        }
        // Printable character
        if (sequence.length === 1 && sequence.charCodeAt(0) >= 32 && !ctrl) {
          dispatch({ type: "SET_NAME", name: state.name + sequence });
          return;
        }
        break;
      }

      case "avatar": {
        // Arrow keys to navigate emoji grid
        if (keyName === "left") {
          const newIdx = Math.max(0, state.avatarIndex - 1);
          dispatch({ type: "SET_AVATAR", avatar: AVATAR_EMOJIS[newIdx], index: newIdx });
          return;
        }
        if (keyName === "right") {
          const newIdx = Math.min(AVATAR_EMOJIS.length - 1, state.avatarIndex + 1);
          dispatch({ type: "SET_AVATAR", avatar: AVATAR_EMOJIS[newIdx], index: newIdx });
          return;
        }
        if (keyName === "up") {
          const newIdx = Math.max(0, state.avatarIndex - AVATAR_GRID_COLS);
          dispatch({ type: "SET_AVATAR", avatar: AVATAR_EMOJIS[newIdx], index: newIdx });
          return;
        }
        if (keyName === "down") {
          const newIdx = Math.min(AVATAR_EMOJIS.length - 1, state.avatarIndex + AVATAR_GRID_COLS);
          dispatch({ type: "SET_AVATAR", avatar: AVATAR_EMOJIS[newIdx], index: newIdx });
          return;
        }
        break;
      }

      case "preset": {
        // Left/right to cycle presets
        if (keyName === "left") {
          const newIdx = Math.max(0, state.presetIndex - 1);
          dispatch({ type: "SET_PRESET", preset: PERSONALITY_PRESETS[newIdx], index: newIdx });
          return;
        }
        if (keyName === "right") {
          const newIdx = Math.min(PERSONALITY_PRESETS.length - 1, state.presetIndex + 1);
          dispatch({ type: "SET_PRESET", preset: PERSONALITY_PRESETS[newIdx], index: newIdx });
          return;
        }
        break;
      }

      case "instructions": {
        // Only active when preset is custom
        if (state.preset !== "custom") break;

        // Ctrl+Enter: new line
        if (ctrl && (keyName === "return" || keyName === "enter")) {
          dispatch({
            type: "SET_CUSTOM_INSTRUCTIONS",
            text: state.customInstructions + "\n",
          });
          return;
        }

        // Backspace
        if (keyName === "backspace" || keyName === "delete") {
          dispatch({
            type: "SET_CUSTOM_INSTRUCTIONS",
            text: state.customInstructions.slice(0, -1),
          });
          return;
        }

        // Printable character
        if (sequence.length === 1 && sequence.charCodeAt(0) >= 32 && !ctrl) {
          dispatch({
            type: "SET_CUSTOM_INSTRUCTIONS",
            text: state.customInstructions + sequence,
          });
          return;
        }
        break;
      }

      case "actions": {
        // Enter: save
        if (keyName === "return" || keyName === "enter") {
          if (!state.isSaving) {
            void doSave();
          }
          return;
        }
        break;
      }
    }
  }, [
    visible,
    onClose,
    state.fetchState,
    state.activeField,
    state.name,
    state.avatar,
    state.avatarIndex,
    state.preset,
    state.presetIndex,
    state.customInstructions,
    state.isSaving,
    doSave,
  ]));

  const hintText = "Tab/Shift+Tab navigate · Ctrl+S save · Esc cancel";

  return (
    <ModalPanel
      visible={visible}
      title="Persona Editor"
      hint={hintText}
      width={68}
      height={24}
      closeOnEscape={false}
      onClose={onClose}
    >
      {/* Loading state */}
      {state.fetchState === "loading" ? (
        <Text content="Loading persona..." style={{ color: tokens["text.muted"] }} />
      ) : (
        <Box style={{ flexDirection: "column" }}>
          {/* Name field */}
          <NameField
            name={state.name}
            isActive={state.activeField === "name"}
            tokens={tokens}
          />

          {/* Avatar field */}
          <Box style={{ marginTop: 1 }}>
            <AvatarField
              avatarIndex={state.avatarIndex}
              isActive={state.activeField === "avatar"}
              tokens={tokens}
            />
          </Box>

          {/* Preset field */}
          <Box style={{ marginTop: 1 }}>
            <PresetField
              presetIndex={state.presetIndex}
              isActive={state.activeField === "preset"}
              tokens={tokens}
            />
          </Box>

          {/* Custom instructions field */}
          <Box style={{ marginTop: 1 }}>
            <InstructionsField
              text={state.customInstructions}
              isActive={state.activeField === "instructions"}
              isEnabled={state.preset === "custom"}
              tokens={tokens}
            />
          </Box>

          {/* Actions bar */}
          <Box style={{ marginTop: 1 }}>
            <ActionsBar
              isActive={state.activeField === "actions"}
              isSaving={state.isSaving}
              tokens={tokens}
            />
          </Box>

          {/* Saved feedback */}
          {state.savedMessage !== null ? (
            <Box style={{ flexDirection: "row", marginTop: 1 }}>
              <Text content="✓ " style={{ color: tokens["status.success"] }} />
              <Text content={state.savedMessage} style={{ color: tokens["status.success"] }} />
            </Box>
          ) : null}

          {/* Error message */}
          {state.errorMessage !== null ? (
            <Box style={{ flexDirection: "row", marginTop: 1 }}>
              <Text content="● " style={{ color: tokens["status.warning"] }} />
              <Text content={state.errorMessage} style={{ color: tokens["text.secondary"] }} />
            </Box>
          ) : null}
        </Box>
      )}
    </ModalPanel>
  );
}
