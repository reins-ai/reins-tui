import { describe, expect, it } from "bun:test";

import {
  personaEditorReducer,
  PERSONA_EDITOR_INITIAL_STATE,
  AVATAR_EMOJIS,
  PERSONALITY_PRESETS,
  presetLabel,
  type PersonaEditorState,
  type PersonaEditorAction,
  type PersonaData,
  type PersonalityPreset,
  type EditorField,
} from "../../src/components/persona-editor";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function dispatch(
  state: PersonaEditorState,
  ...actions: PersonaEditorAction[]
): PersonaEditorState {
  return actions.reduce(personaEditorReducer, state);
}

function loadedState(overrides?: Partial<PersonaData>): PersonaEditorState {
  const data: PersonaData = {
    name: "Reins",
    avatar: "🤖",
    preset: "balanced",
    customInstructions: "",
    ...overrides,
  };
  return personaEditorReducer(PERSONA_EDITOR_INITIAL_STATE, {
    type: "FETCH_SUCCESS",
    data,
  });
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("PersonaEditor initial state", () => {
  it("starts with default name", () => {
    expect(PERSONA_EDITOR_INITIAL_STATE.name).toBe("Reins");
  });

  it("starts with default avatar", () => {
    expect(PERSONA_EDITOR_INITIAL_STATE.avatar).toBe("🤖");
  });

  it("starts with balanced preset", () => {
    expect(PERSONA_EDITOR_INITIAL_STATE.preset).toBe("balanced");
  });

  it("starts with name field active", () => {
    expect(PERSONA_EDITOR_INITIAL_STATE.activeField).toBe("name");
  });

  it("starts in idle fetch state", () => {
    expect(PERSONA_EDITOR_INITIAL_STATE.fetchState).toBe("idle");
  });

  it("starts with empty custom instructions", () => {
    expect(PERSONA_EDITOR_INITIAL_STATE.customInstructions).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Fetch lifecycle
// ---------------------------------------------------------------------------

describe("PersonaEditor fetch lifecycle", () => {
  it("transitions to loading on FETCH_START", () => {
    const next = personaEditorReducer(PERSONA_EDITOR_INITIAL_STATE, {
      type: "FETCH_START",
    });
    expect(next.fetchState).toBe("loading");
    expect(next.errorMessage).toBeNull();
  });

  it("populates fields on FETCH_SUCCESS", () => {
    const state = loadedState({
      name: "Atlas",
      avatar: "🧠",
      preset: "technical",
      customInstructions: "Be precise",
    });

    expect(state.fetchState).toBe("success");
    expect(state.name).toBe("Atlas");
    expect(state.avatar).toBe("🧠");
    expect(state.preset).toBe("technical");
    expect(state.customInstructions).toBe("Be precise");
  });

  it("resolves avatar index from emoji", () => {
    const state = loadedState({ avatar: "🦊" });
    const expectedIndex = AVATAR_EMOJIS.indexOf("🦊");
    expect(state.avatarIndex).toBe(expectedIndex);
  });

  it("resolves preset index from preset name", () => {
    const state = loadedState({ preset: "warm" });
    const expectedIndex = PERSONALITY_PRESETS.indexOf("warm");
    expect(state.presetIndex).toBe(expectedIndex);
  });

  it("falls back to defaults on FETCH_ERROR", () => {
    const next = personaEditorReducer(PERSONA_EDITOR_INITIAL_STATE, {
      type: "FETCH_ERROR",
      message: "Network error",
    });

    expect(next.fetchState).toBe("error");
    expect(next.errorMessage).toBe("Network error");
    expect(next.name).toBe("Reins");
    expect(next.avatar).toBe("🤖");
    expect(next.preset).toBe("balanced");
  });

  it("resets to initial state on RESET", () => {
    const modified = loadedState({ name: "Custom" });
    const next = personaEditorReducer(modified, { type: "RESET" });
    expect(next).toEqual(PERSONA_EDITOR_INITIAL_STATE);
  });
});

// ---------------------------------------------------------------------------
// Name field
// ---------------------------------------------------------------------------

describe("PersonaEditor name field", () => {
  it("updates name on SET_NAME", () => {
    const state = loadedState();
    const next = personaEditorReducer(state, { type: "SET_NAME", name: "Atlas" });
    expect(next.name).toBe("Atlas");
  });

  it("truncates name to 50 characters", () => {
    const state = loadedState();
    const longName = "A".repeat(60);
    const next = personaEditorReducer(state, { type: "SET_NAME", name: longName });
    expect(next.name).toHaveLength(50);
  });

  it("allows empty name", () => {
    const state = loadedState();
    const next = personaEditorReducer(state, { type: "SET_NAME", name: "" });
    expect(next.name).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Avatar selection
// ---------------------------------------------------------------------------

describe("PersonaEditor avatar selection", () => {
  it("updates avatar and index on SET_AVATAR", () => {
    const state = loadedState();
    const next = personaEditorReducer(state, {
      type: "SET_AVATAR",
      avatar: "🐉",
      index: 3,
    });
    expect(next.avatar).toBe("🐉");
    expect(next.avatarIndex).toBe(3);
  });

  it("all avatar emojis are available", () => {
    expect(AVATAR_EMOJIS.length).toBe(8);
    expect(AVATAR_EMOJIS).toContain("🤖");
    expect(AVATAR_EMOJIS).toContain("🧠");
    expect(AVATAR_EMOJIS).toContain("🦊");
    expect(AVATAR_EMOJIS).toContain("🐉");
    expect(AVATAR_EMOJIS).toContain("🌟");
    expect(AVATAR_EMOJIS).toContain("⚡");
    expect(AVATAR_EMOJIS).toContain("🎯");
    expect(AVATAR_EMOJIS).toContain("🔮");
  });
});

// ---------------------------------------------------------------------------
// Preset selection
// ---------------------------------------------------------------------------

describe("PersonaEditor preset selection", () => {
  it("updates preset and index on SET_PRESET", () => {
    const state = loadedState();
    const next = personaEditorReducer(state, {
      type: "SET_PRESET",
      preset: "concise",
      index: 1,
    });
    expect(next.preset).toBe("concise");
    expect(next.presetIndex).toBe(1);
  });

  it("clears custom instructions when switching away from custom", () => {
    const state = loadedState({ preset: "custom", customInstructions: "Be brief" });
    const next = personaEditorReducer(state, {
      type: "SET_PRESET",
      preset: "balanced",
      index: 0,
    });
    expect(next.preset).toBe("balanced");
    expect(next.customInstructions).toBe("");
  });

  it("preserves custom instructions when switching to custom", () => {
    const state = loadedState({ preset: "balanced" });
    const withInstructions = personaEditorReducer(state, {
      type: "SET_CUSTOM_INSTRUCTIONS",
      text: "Be creative",
    });
    const next = personaEditorReducer(withInstructions, {
      type: "SET_PRESET",
      preset: "custom",
      index: 4,
    });
    expect(next.preset).toBe("custom");
    expect(next.customInstructions).toBe("Be creative");
  });

  it("all presets have labels", () => {
    for (const preset of PERSONALITY_PRESETS) {
      const label = presetLabel(preset);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("presetLabel returns capitalized names", () => {
    expect(presetLabel("balanced")).toBe("Balanced");
    expect(presetLabel("concise")).toBe("Concise");
    expect(presetLabel("technical")).toBe("Technical");
    expect(presetLabel("warm")).toBe("Warm");
    expect(presetLabel("custom")).toBe("Custom");
  });
});

// ---------------------------------------------------------------------------
// Field navigation
// ---------------------------------------------------------------------------

describe("PersonaEditor field navigation", () => {
  it("advances to next field on NEXT_FIELD", () => {
    const state = loadedState(); // activeField = "name"
    const next = personaEditorReducer(state, { type: "NEXT_FIELD" });
    expect(next.activeField).toBe("avatar");
  });

  it("goes back to previous field on PREV_FIELD", () => {
    const state = loadedState();
    const atAvatar = personaEditorReducer(state, { type: "NEXT_FIELD" });
    expect(atAvatar.activeField).toBe("avatar");
    const backToName = personaEditorReducer(atAvatar, { type: "PREV_FIELD" });
    expect(backToName.activeField).toBe("name");
  });

  it("skips instructions field when preset is not custom", () => {
    const state = loadedState({ preset: "balanced" });
    // Navigate: name → avatar → preset → (skip instructions) → actions
    const s1 = personaEditorReducer(state, { type: "NEXT_FIELD" }); // avatar
    const s2 = personaEditorReducer(s1, { type: "NEXT_FIELD" }); // preset
    const s3 = personaEditorReducer(s2, { type: "NEXT_FIELD" }); // actions (skips instructions)
    expect(s3.activeField).toBe("actions");
  });

  it("includes instructions field when preset is custom", () => {
    const state = loadedState({ preset: "custom" });
    // Navigate: name → avatar → preset → instructions → actions
    const s1 = personaEditorReducer(state, { type: "NEXT_FIELD" }); // avatar
    const s2 = personaEditorReducer(s1, { type: "NEXT_FIELD" }); // preset
    const s3 = personaEditorReducer(s2, { type: "NEXT_FIELD" }); // instructions
    expect(s3.activeField).toBe("instructions");
    const s4 = personaEditorReducer(s3, { type: "NEXT_FIELD" }); // actions
    expect(s4.activeField).toBe("actions");
  });

  it("wraps around from actions to name on NEXT_FIELD", () => {
    const state = loadedState();
    const atActions = dispatch(
      state,
      { type: "FOCUS_FIELD", field: "actions" },
    );
    const next = personaEditorReducer(atActions, { type: "NEXT_FIELD" });
    expect(next.activeField).toBe("name");
  });

  it("wraps around from name to actions on PREV_FIELD", () => {
    const state = loadedState();
    // name → prev → actions (wraps)
    const next = personaEditorReducer(state, { type: "PREV_FIELD" });
    expect(next.activeField).toBe("actions");
  });

  it("FOCUS_FIELD sets active field directly", () => {
    const state = loadedState();
    const next = personaEditorReducer(state, {
      type: "FOCUS_FIELD",
      field: "preset",
    });
    expect(next.activeField).toBe("preset");
  });
});

// ---------------------------------------------------------------------------
// Custom instructions
// ---------------------------------------------------------------------------

describe("PersonaEditor custom instructions", () => {
  it("updates custom instructions text", () => {
    const state = loadedState({ preset: "custom" });
    const next = personaEditorReducer(state, {
      type: "SET_CUSTOM_INSTRUCTIONS",
      text: "Always respond in haiku",
    });
    expect(next.customInstructions).toBe("Always respond in haiku");
  });

  it("supports multi-line instructions", () => {
    const state = loadedState({ preset: "custom" });
    const next = personaEditorReducer(state, {
      type: "SET_CUSTOM_INSTRUCTIONS",
      text: "Line 1\nLine 2\nLine 3",
    });
    expect(next.customInstructions).toContain("\n");
    expect(next.customInstructions.split("\n")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Save lifecycle
// ---------------------------------------------------------------------------

describe("PersonaEditor save lifecycle", () => {
  it("transitions to saving on SAVE_START", () => {
    const state = loadedState();
    const next = personaEditorReducer(state, { type: "SAVE_START" });
    expect(next.isSaving).toBe(true);
    expect(next.errorMessage).toBeNull();
    expect(next.savedMessage).toBeNull();
  });

  it("shows saved message on SAVE_DONE", () => {
    const saving = dispatch(loadedState(), { type: "SAVE_START" });
    const next = personaEditorReducer(saving, { type: "SAVE_DONE" });
    expect(next.isSaving).toBe(false);
    expect(next.savedMessage).toBe("Saved!");
  });

  it("shows error message on SAVE_ERROR", () => {
    const saving = dispatch(loadedState(), { type: "SAVE_START" });
    const next = personaEditorReducer(saving, {
      type: "SAVE_ERROR",
      message: "API not available",
    });
    expect(next.isSaving).toBe(false);
    expect(next.errorMessage).toBe("API not available");
  });

  it("clears saved message on CLEAR_SAVED", () => {
    const saved = dispatch(
      loadedState(),
      { type: "SAVE_START" },
      { type: "SAVE_DONE" },
    );
    expect(saved.savedMessage).toBe("Saved!");
    const next = personaEditorReducer(saved, { type: "CLEAR_SAVED" });
    expect(next.savedMessage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Source-level verification
// ---------------------------------------------------------------------------

describe("PersonaEditor source structure", () => {
  it("source includes Escape close handler", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/persona-editor.tsx"),
      "utf-8",
    );

    // Escape key triggers onClose
    expect(source).toContain("onClose()");
    expect(source).toContain('"escape"');
  });

  it("source includes Ctrl+S save shortcut", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/persona-editor.tsx"),
      "utf-8",
    );

    expect(source).toContain('ctrl && sequence === "s"');
  });

  it("source includes Save & Apply button", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/persona-editor.tsx"),
      "utf-8",
    );

    expect(source).toContain("[Save & Apply]");
  });

  it("source sends persona data shape on save", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/persona-editor.tsx"),
      "utf-8",
    );

    // Verify the save payload includes all expected fields
    expect(source).toContain("name: state.name");
    expect(source).toContain("avatar: state.avatar");
    expect(source).toContain("preset: state.preset");
    expect(source).toContain("customInstructions: state.customInstructions");
  });

  it("source uses ModalPanel with correct title", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/persona-editor.tsx"),
      "utf-8",
    );

    expect(source).toContain('title="Persona Editor"');
  });
});
