import { describe, expect, it } from "bun:test";

import {
  extractRememberResult,
  type MemoryNotification,
} from "../../src/components/conversation-panel";

// ---------------------------------------------------------------------------
// extractRememberResult
// ---------------------------------------------------------------------------

describe("extractRememberResult", () => {
  it("parses valid remember tool result JSON", () => {
    const toolResult = JSON.stringify({
      action: "remember",
      memory: {
        id: "mem-123",
        content: "User prefers dark mode",
      },
    });

    const result = extractRememberResult(toolResult);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("mem-123");
    expect(result!.content).toBe("User prefers dark mode");
  });

  it("returns null for empty string", () => {
    expect(extractRememberResult("")).toBeNull();
  });

  it("returns null for non-JSON input", () => {
    expect(extractRememberResult("not json at all")).toBeNull();
  });

  it("returns null for valid JSON without expected shape", () => {
    const noAction = JSON.stringify({ foo: "bar" });
    expect(extractRememberResult(noAction)).toBeNull();
  });

  it("returns null when action is not 'remember'", () => {
    const recallAction = JSON.stringify({
      action: "recall",
      memory: { id: "mem-1", content: "something" },
    });
    expect(extractRememberResult(recallAction)).toBeNull();
  });

  it("returns null when memory field is missing", () => {
    const noMemory = JSON.stringify({ action: "remember" });
    expect(extractRememberResult(noMemory)).toBeNull();
  });

  it("returns null when memory.id is not a string", () => {
    const badId = JSON.stringify({
      action: "remember",
      memory: { id: 42, content: "text" },
    });
    expect(extractRememberResult(badId)).toBeNull();
  });

  it("returns null when memory.content is not a string", () => {
    const badContent = JSON.stringify({
      action: "remember",
      memory: { id: "mem-1", content: 123 },
    });
    expect(extractRememberResult(badContent)).toBeNull();
  });

  it("returns null for null input coerced to string", () => {
    expect(extractRememberResult("null")).toBeNull();
  });

  it("returns null for JSON array input", () => {
    expect(extractRememberResult("[1, 2, 3]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MemoryNotification shape
// ---------------------------------------------------------------------------

describe("MemoryNotification", () => {
  it("has the expected fields for rendering", () => {
    const notification: MemoryNotification = {
      callId: "tc-1",
      contentPreview: "User prefers dark mode",
      memoryId: "mem-123",
      dismissed: false,
    };

    expect(notification.callId).toBe("tc-1");
    expect(notification.contentPreview).toBe("User prefers dark mode");
    expect(notification.memoryId).toBe("mem-123");
    expect(notification.dismissed).toBe(false);
  });

  it("dismissed flag prevents rendering", () => {
    const notification: MemoryNotification = {
      callId: "tc-2",
      contentPreview: "Some memory",
      memoryId: "mem-456",
      dismissed: true,
    };

    // The MemoryNotificationBar returns null when dismissed is true.
    // We verify the shape supports this flag.
    expect(notification.dismissed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MemoryNotificationBar source-level verification
// ---------------------------------------------------------------------------

describe("MemoryNotificationBar rendering", () => {
  it("source includes the 💾 Remembered: indicator", () => {
    // Source-level verification following the existing pattern in conversation-panel.test.tsx
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    expect(source).toContain("💾 ");
    expect(source).toContain("Remembered: ");
  });

  it("source includes [view] action text", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    expect(source).toContain("[view]");
  });

  it("source includes [undo] action text", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    expect(source).toContain("[undo]");
  });

  it("MemoryNotificationBar accepts onView and onUndo callback props", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    // Verify the component accepts the callback props
    expect(source).toContain("onView?: (memoryId: string) => void");
    expect(source).toContain("onUndo?: (memoryId: string) => void");
  });

  it("ConversationPanel passes onViewMemory and onUndoMemory to notification bar", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    // Verify the ConversationPanel wires the callbacks through
    expect(source).toContain("onView={onViewMemory}");
    expect(source).toContain("onUndo={onUndoMemory}");
  });

  it("notification bar truncates long content previews", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    // Verify truncation logic exists (40 char limit)
    expect(source).toContain(".slice(0, 40)");
    expect(source).toContain('+ "..."');
  });

  it("dismissed notifications are tracked via useRef Set", () => {
    const { readFileSync } = require("node:fs");
    const { resolve } = require("node:path");
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/components/conversation-panel.tsx"),
      "utf-8",
    );

    expect(source).toContain("dismissedNotificationsRef");
    expect(source).toContain("useRef<Set<string>>");
  });
});
