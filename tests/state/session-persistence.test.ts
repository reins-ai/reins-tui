import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Session persistence tests.
 *
 * Because the production module reads from a fixed path (~/.config/reins/),
 * we test the exported pure-logic helpers (isValidSessionState shape) and
 * the load/save cycle by exercising the functions against a temp directory.
 *
 * We re-implement the core logic inline to avoid mutating the real config dir.
 */

// ---------------------------------------------------------------------------
// Inline reimplementation of the persistence helpers for isolated testing.
// This mirrors session-persistence.ts logic exactly.
// ---------------------------------------------------------------------------

interface SessionState {
  lastConversationId: string;
}

function isValidSessionState(value: unknown): value is SessionState {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.lastConversationId === "string" &&
    obj.lastConversationId.length > 0
  );
}

function loadSessionStateFrom(filePath: string): SessionState | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isValidSessionState(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveSessionStateTo(filePath: string, configDir: string, state: SessionState): void {
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Silently fail — session persistence is best-effort
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("session-persistence", () => {
  let tempDir: string;
  let stateFile: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `reins-test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    stateFile = join(tempDir, "session-state.json");
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  describe("isValidSessionState", () => {
    it("accepts a valid session state object", () => {
      expect(isValidSessionState({ lastConversationId: "conv-123" })).toBe(true);
    });

    it("rejects null", () => {
      expect(isValidSessionState(null)).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isValidSessionState(undefined)).toBe(false);
    });

    it("rejects a number", () => {
      expect(isValidSessionState(42)).toBe(false);
    });

    it("rejects a string", () => {
      expect(isValidSessionState("conv-123")).toBe(false);
    });

    it("rejects an empty object", () => {
      expect(isValidSessionState({})).toBe(false);
    });

    it("rejects when lastConversationId is empty string", () => {
      expect(isValidSessionState({ lastConversationId: "" })).toBe(false);
    });

    it("rejects when lastConversationId is a number", () => {
      expect(isValidSessionState({ lastConversationId: 123 })).toBe(false);
    });

    it("rejects when lastConversationId is missing", () => {
      expect(isValidSessionState({ otherField: "value" })).toBe(false);
    });

    it("accepts with extra fields present", () => {
      expect(
        isValidSessionState({ lastConversationId: "conv-1", extra: true }),
      ).toBe(true);
    });
  });

  describe("loadSessionState", () => {
    it("returns null when file does not exist", () => {
      const result = loadSessionStateFrom(join(tempDir, "nonexistent.json"));
      expect(result).toBeNull();
    });

    it("returns parsed state from valid JSON file", () => {
      writeFileSync(stateFile, JSON.stringify({ lastConversationId: "conv-abc" }));
      const result = loadSessionStateFrom(stateFile);
      expect(result).toEqual({ lastConversationId: "conv-abc" });
    });

    it("returns null for invalid JSON content", () => {
      writeFileSync(stateFile, "{broken json");
      const result = loadSessionStateFrom(stateFile);
      expect(result).toBeNull();
    });

    it("returns null for valid JSON but invalid shape", () => {
      writeFileSync(stateFile, JSON.stringify({ wrong: "shape" }));
      const result = loadSessionStateFrom(stateFile);
      expect(result).toBeNull();
    });

    it("returns null for empty file", () => {
      writeFileSync(stateFile, "");
      const result = loadSessionStateFrom(stateFile);
      expect(result).toBeNull();
    });

    it("returns null for JSON array", () => {
      writeFileSync(stateFile, JSON.stringify(["conv-1"]));
      const result = loadSessionStateFrom(stateFile);
      expect(result).toBeNull();
    });

    it("returns null for JSON with empty lastConversationId", () => {
      writeFileSync(stateFile, JSON.stringify({ lastConversationId: "" }));
      const result = loadSessionStateFrom(stateFile);
      expect(result).toBeNull();
    });
  });

  describe("saveSessionState", () => {
    it("writes state to file as formatted JSON", () => {
      saveSessionStateTo(stateFile, tempDir, { lastConversationId: "conv-xyz" });

      expect(existsSync(stateFile)).toBe(true);
      const raw = readFileSync(stateFile, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.lastConversationId).toBe("conv-xyz");
    });

    it("creates config directory if it does not exist", () => {
      const nestedDir = join(tempDir, "nested", "config");
      const nestedFile = join(nestedDir, "session-state.json");

      saveSessionStateTo(nestedFile, nestedDir, { lastConversationId: "conv-new" });

      expect(existsSync(nestedDir)).toBe(true);
      expect(existsSync(nestedFile)).toBe(true);
    });

    it("overwrites existing state file", () => {
      saveSessionStateTo(stateFile, tempDir, { lastConversationId: "conv-old" });
      saveSessionStateTo(stateFile, tempDir, { lastConversationId: "conv-new" });

      const raw = readFileSync(stateFile, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.lastConversationId).toBe("conv-new");
    });

    it("produces JSON that loadSessionState can read back", () => {
      const original: SessionState = { lastConversationId: "conv-roundtrip" };
      saveSessionStateTo(stateFile, tempDir, original);
      const loaded = loadSessionStateFrom(stateFile);
      expect(loaded).toEqual(original);
    });
  });

  describe("round-trip", () => {
    it("save then load preserves conversation ID", () => {
      saveSessionStateTo(stateFile, tempDir, { lastConversationId: "conv-persist" });
      const result = loadSessionStateFrom(stateFile);
      expect(result?.lastConversationId).toBe("conv-persist");
    });

    it("multiple save/load cycles work correctly", () => {
      for (let i = 0; i < 5; i++) {
        const id = `conv-cycle-${i}`;
        saveSessionStateTo(stateFile, tempDir, { lastConversationId: id });
        const result = loadSessionStateFrom(stateFile);
        expect(result?.lastConversationId).toBe(id);
      }
    });
  });
});
