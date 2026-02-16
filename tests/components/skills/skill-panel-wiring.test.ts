import { describe, expect, test } from "bun:test";

import { DEFAULT_STATE, appReducer, type AppAction } from "../../../src/store";
import { isToggleSkillPanelEvent } from "../../../src/app";
import { dispatchCommand, type CommandHandlerContext } from "../../../src/commands/handlers";
import { parseSlashCommand } from "../../../src/commands/parser";
import { SLASH_COMMANDS, PALETTE_ACTIONS } from "../../../src/commands/registry";
import type { KeyEvent } from "../../../src/ui";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyEvent(overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    name: overrides.name ?? "",
    sequence: overrides.sequence ?? "",
    ctrl: overrides.ctrl ?? false,
    meta: overrides.meta ?? false,
    shift: overrides.shift ?? false,
  };
}

function createMinimalContext(): CommandHandlerContext {
  return {
    catalog: SLASH_COMMANDS,
    model: {
      availableModels: ["default"],
      currentModel: "default",
      setModel() {},
    },
    theme: {
      activeTheme: "reins-dark",
      listThemes: () => ["reins-dark"],
      setTheme: () => true,
    },
    session: {
      activeConversationId: null,
      messages: [],
      createConversation: () => "c-1",
      clearConversation() {},
    },
    view: {
      compactMode: false,
      setCompactMode() {},
    },
    memory: null,
    environment: null,
    daemonClient: null,
  };
}

// ---------------------------------------------------------------------------
// Store reducer: SET_SKILL_PANEL_OPEN
// ---------------------------------------------------------------------------

describe("appReducer SET_SKILL_PANEL_OPEN", () => {
  test("defaults isSkillPanelOpen to false", () => {
    expect(DEFAULT_STATE.isSkillPanelOpen).toBe(false);
  });

  test("opens skill panel", () => {
    const action: AppAction = { type: "SET_SKILL_PANEL_OPEN", payload: true };
    const next = appReducer(DEFAULT_STATE, action);
    expect(next.isSkillPanelOpen).toBe(true);
  });

  test("closes skill panel", () => {
    const open = appReducer(DEFAULT_STATE, { type: "SET_SKILL_PANEL_OPEN", payload: true });
    const closed = appReducer(open, { type: "SET_SKILL_PANEL_OPEN", payload: false });
    expect(closed.isSkillPanelOpen).toBe(false);
  });

  test("ignores non-boolean payload", () => {
    const action = { type: "SET_SKILL_PANEL_OPEN", payload: "yes" } as unknown as AppAction;
    const next = appReducer(DEFAULT_STATE, action);
    expect(next.isSkillPanelOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut: Ctrl+L
// ---------------------------------------------------------------------------

describe("isToggleSkillPanelEvent", () => {
  test("returns true for Ctrl+L (name)", () => {
    expect(isToggleSkillPanelEvent(makeKeyEvent({ ctrl: true, name: "l" }))).toBe(true);
  });

  test("returns true for Ctrl+L (sequence \\x0c)", () => {
    expect(isToggleSkillPanelEvent(makeKeyEvent({ ctrl: true, sequence: "\x0c" }))).toBe(true);
  });

  test("returns true for Ctrl+L (sequence l)", () => {
    expect(isToggleSkillPanelEvent(makeKeyEvent({ ctrl: true, sequence: "l" }))).toBe(true);
  });

  test("returns false for plain L", () => {
    expect(isToggleSkillPanelEvent(makeKeyEvent({ name: "l" }))).toBe(false);
  });

  test("returns false for Ctrl+K", () => {
    expect(isToggleSkillPanelEvent(makeKeyEvent({ ctrl: true, name: "k" }))).toBe(false);
  });

  test("returns false for Ctrl+I", () => {
    expect(isToggleSkillPanelEvent(makeKeyEvent({ ctrl: true, name: "i" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /skills command handler
// ---------------------------------------------------------------------------

describe("/skills command handler", () => {
  test("parses /skills command", () => {
    const parsed = parseSlashCommand("/skills");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.command.handlerKey).toBe("SKILLS");
    }
  });

  test("parses /sk alias", () => {
    const parsed = parseSlashCommand("/sk");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.command.handlerKey).toBe("SKILLS");
    }
  });

  test("emits OPEN_SKILL_PANEL signal", async () => {
    const context = createMinimalContext();
    const parsed = parseSlashCommand("/skills");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = await dispatchCommand(parsed.value, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signals).toEqual([{ type: "OPEN_SKILL_PANEL" }]);
    expect(result.value.statusMessage).toBe("Skills panel");
  });
});

// ---------------------------------------------------------------------------
// Command registry and palette actions
// ---------------------------------------------------------------------------

describe("skills command registration", () => {
  test("/skills is registered in SLASH_COMMANDS", () => {
    const skillsCmd = SLASH_COMMANDS.find((c) => c.name === "skills");
    expect(skillsCmd).toBeDefined();
    expect(skillsCmd!.handlerKey).toBe("SKILLS");
    expect(skillsCmd!.aliases).toContain("sk");
  });

  test("Skills palette action is registered", () => {
    const skillsAction = PALETTE_ACTIONS.find((a) => a.actionKey === "open-skills");
    expect(skillsAction).toBeDefined();
    expect(skillsAction!.shortcutHint).toBe("Ctrl+L");
    expect(skillsAction!.label).toBe("Skills");
  });
});
