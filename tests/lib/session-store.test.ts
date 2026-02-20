import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadSessionToken,
  saveSessionToken,
  clearSessionToken,
} from "../../src/lib/session-store";

describe("session-store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `reins-session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when no session file exists", async () => {
    const token = await loadSessionToken({ dataRoot: tempDir });
    expect(token).toBeNull();
  });

  it("saves and loads a session token", async () => {
    await saveSessionToken("rcs_test_token_123", { dataRoot: tempDir });
    const loaded = await loadSessionToken({ dataRoot: tempDir });
    expect(loaded).toBe("rcs_test_token_123");
  });

  it("persists token as JSON with issuedAt field", async () => {
    await saveSessionToken("rcs_abc", { dataRoot: tempDir });

    const files = await readdir(tempDir);
    expect(files).toContain("session.json");

    const raw = await Bun.file(join(tempDir, "session.json")).json();
    expect(raw.sessionToken).toBe("rcs_abc");
    expect(typeof raw.issuedAt).toBe("string");
    // issuedAt should be a valid ISO date
    expect(Number.isNaN(new Date(raw.issuedAt).getTime())).toBe(false);
  });

  it("clears a session token", async () => {
    await saveSessionToken("rcs_to_clear", { dataRoot: tempDir });
    const before = await loadSessionToken({ dataRoot: tempDir });
    expect(before).toBe("rcs_to_clear");

    await clearSessionToken({ dataRoot: tempDir });
    const after = await loadSessionToken({ dataRoot: tempDir });
    expect(after).toBeNull();
  });

  it("clearSessionToken is safe when no file exists", async () => {
    // Should not throw
    await clearSessionToken({ dataRoot: tempDir });
  });

  it("returns null for malformed JSON", async () => {
    await Bun.write(join(tempDir, "session.json"), "not valid json{{{");
    const token = await loadSessionToken({ dataRoot: tempDir });
    expect(token).toBeNull();
  });

  it("returns null for JSON missing sessionToken field", async () => {
    await Bun.write(join(tempDir, "session.json"), JSON.stringify({ foo: "bar" }));
    const token = await loadSessionToken({ dataRoot: tempDir });
    expect(token).toBeNull();
  });

  it("returns null for empty sessionToken string", async () => {
    await Bun.write(join(tempDir, "session.json"), JSON.stringify({ sessionToken: "" }));
    const token = await loadSessionToken({ dataRoot: tempDir });
    expect(token).toBeNull();
  });

  it("overwrites existing token on save", async () => {
    await saveSessionToken("rcs_first", { dataRoot: tempDir });
    await saveSessionToken("rcs_second", { dataRoot: tempDir });
    const loaded = await loadSessionToken({ dataRoot: tempDir });
    expect(loaded).toBe("rcs_second");
  });

  it("creates parent directory if missing", async () => {
    const nestedDir = join(tempDir, "nested", "deep");
    await saveSessionToken("rcs_nested", { dataRoot: nestedDir });
    const loaded = await loadSessionToken({ dataRoot: nestedDir });
    expect(loaded).toBe("rcs_nested");
  });
});
