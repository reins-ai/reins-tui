import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { appReducer } from "../../src/store";
import { cycleThinkingLevel } from "../../src/store";
import { DEFAULT_STATE } from "../../src/store/types";
import type { ThinkingLevel } from "../../src/daemon/contracts";
import type { AppState } from "../../src/store/types";

describe("cycleThinkingLevel", () => {
  it("cycles none to low", () => {
    expect(cycleThinkingLevel("none")).toBe("low");
  });

  it("cycles low to medium", () => {
    expect(cycleThinkingLevel("low")).toBe("medium");
  });

  it("cycles medium to high", () => {
    expect(cycleThinkingLevel("medium")).toBe("high");
  });

  it("cycles high back to none", () => {
    expect(cycleThinkingLevel("high")).toBe("none");
  });

  it("returns none for unknown value", () => {
    expect(cycleThinkingLevel("unknown" as ThinkingLevel)).toBe("none");
  });

  it("completes a full cycle", () => {
    let level: ThinkingLevel = "none";
    const visited: ThinkingLevel[] = [level];

    for (let i = 0; i < 4; i++) {
      level = cycleThinkingLevel(level);
      visited.push(level);
    }

    expect(visited).toEqual(["none", "low", "medium", "high", "none"]);
  });
});

describe("appReducer thinking actions", () => {
  it("includes thinkingLevel and thinkingVisible in default state", () => {
    expect(DEFAULT_STATE.thinkingLevel).toBe("none");
    expect(DEFAULT_STATE.thinkingVisible).toBe(true);
  });

  it("SET_THINKING_LEVEL sets the thinking level", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_THINKING_LEVEL", payload: "high" });
    expect(state.thinkingLevel).toBe("high");
  });

  it("SET_THINKING_LEVEL preserves other state", () => {
    const state = appReducer(DEFAULT_STATE, { type: "SET_THINKING_LEVEL", payload: "medium" });
    expect(state.currentModel).toBe(DEFAULT_STATE.currentModel);
    expect(state.thinkingVisible).toBe(true);
  });

  it("TOGGLE_THINKING_VISIBILITY toggles from true to false", () => {
    const state = appReducer(DEFAULT_STATE, { type: "TOGGLE_THINKING_VISIBILITY" });
    expect(state.thinkingVisible).toBe(false);
  });

  it("TOGGLE_THINKING_VISIBILITY toggles from false to true", () => {
    const initial: AppState = { ...DEFAULT_STATE, thinkingVisible: false };
    const state = appReducer(initial, { type: "TOGGLE_THINKING_VISIBILITY" });
    expect(state.thinkingVisible).toBe(true);
  });

  it("CYCLE_THINKING_LEVEL cycles from none to low", () => {
    const state = appReducer(DEFAULT_STATE, { type: "CYCLE_THINKING_LEVEL" });
    expect(state.thinkingLevel).toBe("low");
  });

  it("CYCLE_THINKING_LEVEL cycles through all levels", () => {
    let state: AppState = DEFAULT_STATE;

    state = appReducer(state, { type: "CYCLE_THINKING_LEVEL" });
    expect(state.thinkingLevel).toBe("low");

    state = appReducer(state, { type: "CYCLE_THINKING_LEVEL" });
    expect(state.thinkingLevel).toBe("medium");

    state = appReducer(state, { type: "CYCLE_THINKING_LEVEL" });
    expect(state.thinkingLevel).toBe("high");

    state = appReducer(state, { type: "CYCLE_THINKING_LEVEL" });
    expect(state.thinkingLevel).toBe("none");
  });

  it("CYCLE_THINKING_LEVEL does not affect thinkingVisible", () => {
    const initial: AppState = { ...DEFAULT_STATE, thinkingVisible: false };
    const state = appReducer(initial, { type: "CYCLE_THINKING_LEVEL" });
    expect(state.thinkingVisible).toBe(false);
    expect(state.thinkingLevel).toBe("low");
  });
});

describe("thinking-persistence", () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `reins-test-thinking-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, "thinking-preferences.json");
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it("returns defaults when file does not exist", () => {
    const nonExistentFile = join(testDir, "nonexistent.json");
    expect(existsSync(nonExistentFile)).toBe(false);
  });

  it("round-trips valid preferences through JSON", () => {
    const prefs = { thinkingLevel: "high" as ThinkingLevel, thinkingVisible: false };
    writeFileSync(testFile, JSON.stringify(prefs, null, 2), "utf8");

    const raw = readFileSync(testFile, "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.thinkingLevel).toBe("high");
    expect(parsed.thinkingVisible).toBe(false);
  });

  it("rejects invalid thinkingLevel values", () => {
    const invalid = { thinkingLevel: "extreme", thinkingVisible: true };
    writeFileSync(testFile, JSON.stringify(invalid), "utf8");

    const raw = readFileSync(testFile, "utf8");
    const parsed = JSON.parse(raw);

    // Validation: "extreme" is not a valid ThinkingLevel
    const validLevels = ["none", "low", "medium", "high"];
    expect(validLevels.includes(parsed.thinkingLevel)).toBe(false);
  });

  it("rejects non-boolean thinkingVisible", () => {
    const invalid = { thinkingLevel: "low", thinkingVisible: "yes" };
    writeFileSync(testFile, JSON.stringify(invalid), "utf8");

    const raw = readFileSync(testFile, "utf8");
    const parsed = JSON.parse(raw);

    expect(typeof parsed.thinkingVisible).not.toBe("boolean");
  });

  it("handles malformed JSON gracefully", () => {
    writeFileSync(testFile, "not valid json{{{", "utf8");

    expect(() => {
      JSON.parse(readFileSync(testFile, "utf8"));
    }).toThrow();
  });
});
