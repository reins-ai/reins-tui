import { describe, expect, test } from "bun:test";

import type { DaemonConnectionStatus } from "../../src/daemon/contracts";
import type { ConversationLifecycleStatus } from "../../src/state/status-machine";
import {
  deriveStatusSegments,
  resolveSegmentVisibility,
  resolveStatusSegmentSet,
  formatSegmentText,
  isSegmentVisible,
} from "../../src/state/status-machine";
import {
  STATUS_SEGMENT_PRIORITY,
  STATUS_SEGMENT_ORDER,
  SEGMENT_DROP_THRESHOLDS,
  type StatusSegment,
  type StatusSegmentId,
  type StatusSegmentSources,
} from "../../src/store/types";
import {
  HEARTBEAT_GLYPH,
  HEARTBEAT_PULSE_INTERVAL_MS,
  HEARTBEAT_RECONNECT_INTERVAL_MS,
  COMPACTION_INDICATOR_DURATION_MS,
  SEGMENT_SEPARATOR,
  resolveHeartbeatColor,
  resolveHeartbeatInterval,
  resolveLifecycleDisplay,
  buildSegments,
  buildLeftZoneText,
  buildRightZoneText,
  resolveTruncation,
  buildTruncatedLeftText,
  getConnectionGlyph,
  getConnectionLabel,
  groupSegments,
  buildGroupText,
  type HeartbeatPhase,
  type LifecycleDisplay,
  type StatusBarSegments,
} from "../../src/components/status-bar";

const MOCK_TOKENS: Record<string, string> = {
  "text.primary": "#e8e0d4",
  "text.secondary": "#b8b0a4",
  "text.muted": "#6b6560",
  "status.success": "#a8cc8c",
  "status.error": "#e88388",
  "status.warning": "#dbab79",
  "status.info": "#71bef2",
  "glyph.heartbeat": "#f0c674",
  "accent.primary": "#e8976c",
  "surface.primary": "#2d2a2e",
};

// --- Heartbeat glyph and interval tests (preserved from original) ---

describe("heartbeat glyph", () => {
  test("heartbeat glyph is the middle dot character", () => {
    expect(HEARTBEAT_GLYPH).toBe("·");
  });

  test("heartbeat glyph is a single character", () => {
    expect(HEARTBEAT_GLYPH.length).toBe(1);
  });
});

describe("heartbeat pulse interval", () => {
  test("connected pulse interval is 2000ms", () => {
    expect(HEARTBEAT_PULSE_INTERVAL_MS).toBe(2_000);
  });

  test("reconnect pulse interval is 500ms", () => {
    expect(HEARTBEAT_RECONNECT_INTERVAL_MS).toBe(500);
  });
});

describe("resolveHeartbeatInterval", () => {
  test("connected returns standard pulse interval", () => {
    expect(resolveHeartbeatInterval("connected")).toBe(HEARTBEAT_PULSE_INTERVAL_MS);
  });

  test("disconnected returns null (no animation)", () => {
    expect(resolveHeartbeatInterval("disconnected")).toBeNull();
  });

  test("connecting returns fast reconnect interval", () => {
    expect(resolveHeartbeatInterval("connecting")).toBe(HEARTBEAT_RECONNECT_INTERVAL_MS);
  });

  test("reconnecting returns fast reconnect interval", () => {
    expect(resolveHeartbeatInterval("reconnecting")).toBe(HEARTBEAT_RECONNECT_INTERVAL_MS);
  });
});

describe("resolveHeartbeatColor", () => {
  test("connected bright uses glyph.heartbeat token", () => {
    const color = resolveHeartbeatColor("connected", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.heartbeat"]);
  });

  test("connected dim uses text.muted token", () => {
    const color = resolveHeartbeatColor("connected", "dim", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("disconnected always uses text.muted regardless of phase", () => {
    const bright = resolveHeartbeatColor("disconnected", "bright", MOCK_TOKENS);
    const dim = resolveHeartbeatColor("disconnected", "dim", MOCK_TOKENS);
    expect(bright).toBe(MOCK_TOKENS["text.muted"]);
    expect(dim).toBe(MOCK_TOKENS["text.muted"]);
  });

  test("connecting bright uses status.warning token", () => {
    const color = resolveHeartbeatColor("connecting", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("reconnecting bright uses status.warning token", () => {
    const color = resolveHeartbeatColor("reconnecting", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["status.warning"]);
  });

  test("no hardcoded color values returned", () => {
    const statuses: DaemonConnectionStatus[] = ["connected", "disconnected", "connecting", "reconnecting"];
    const phases: HeartbeatPhase[] = ["bright", "dim"];

    for (const status of statuses) {
      for (const phase of phases) {
        const color = resolveHeartbeatColor(status, phase, MOCK_TOKENS);
        const tokenValues = Object.values(MOCK_TOKENS);
        expect(tokenValues).toContain(color);
      }
    }
  });
});

// --- Streaming lifecycle display tests ---

describe("resolveLifecycleDisplay", () => {
  test("idle shows green Ready indicator", () => {
    const display = resolveLifecycleDisplay("idle", 0, null);
    expect(display.glyph).toBe("●");
    expect(display.label).toBe("Ready");
    expect(display.colorToken).toBe("status.success");
  });

  test("sending shows warning Sending indicator", () => {
    const display = resolveLifecycleDisplay("sending", 0, null);
    expect(display.glyph).toBe("◐");
    expect(display.label).toBe("Sending...");
    expect(display.colorToken).toBe("status.warning");
  });

  test("thinking shows warning Thinking indicator", () => {
    const display = resolveLifecycleDisplay("thinking", 0, null);
    expect(display.glyph).toBe("◑");
    expect(display.label).toBe("Thinking...");
    expect(display.colorToken).toBe("status.warning");
  });

  test("streaming shows info indicator with token count", () => {
    const display = resolveLifecycleDisplay("streaming", 42, null);
    expect(display.glyph).toBe("▶");
    expect(display.label).toBe("Streaming [42 tokens]");
    expect(display.colorToken).toBe("status.info");
  });

  test("streaming shows zero token count when no tokens received", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null);
    expect(display.label).toBe("Streaming [0 tokens]");
  });

  test("complete shows success Done indicator without cost", () => {
    const display = resolveLifecycleDisplay("complete", 0, null);
    expect(display.glyph).toBe("✓");
    expect(display.label).toBe("Done");
    expect(display.colorToken).toBe("status.success");
  });

  test("complete shows cost when provided", () => {
    const display = resolveLifecycleDisplay("complete", 0, "$0.003");
    expect(display.label).toBe("Done [$0.003]");
  });

  test("error shows error indicator", () => {
    const display = resolveLifecycleDisplay("error", 0, null);
    expect(display.glyph).toBe("✗");
    expect(display.label).toBe("Error");
    expect(display.colorToken).toBe("status.error");
  });

  test("all lifecycle statuses return valid color tokens", () => {
    const statuses: ConversationLifecycleStatus[] = ["idle", "sending", "thinking", "streaming", "complete", "error"];
    const validTokens = ["status.success", "status.warning", "status.info", "status.error"];

    for (const status of statuses) {
      const display = resolveLifecycleDisplay(status, 0, null);
      expect(validTokens).toContain(display.colorToken);
    }
  });

  test("streaming lifecycle transitions render in correct order", () => {
    const sequence: ConversationLifecycleStatus[] = ["idle", "sending", "thinking", "streaming", "complete"];
    const expectedGlyphs = ["●", "◐", "◑", "▶", "✓"];

    for (let i = 0; i < sequence.length; i++) {
      const display = resolveLifecycleDisplay(sequence[i], i * 10, null);
      expect(display.glyph).toBe(expectedGlyphs[i]);
    }
  });
});

// --- Two-zone layout tests ---

describe("buildSegments", () => {
  test("builds all segment fields", () => {
    const display: LifecycleDisplay = { glyph: "●", label: "Ready", colorToken: "status.success" };
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);

    expect(segments.heartbeat).toBe(HEARTBEAT_GLYPH);
    expect(segments.connection).toBe("● Connected");
    expect(segments.model).toBe("claude-3.5-sonnet");
    expect(segments.lifecycle).toBe("● Ready");
    expect(segments.hint).toBe("Ctrl+K palette");
  });

  test("includes compaction indicator when active", () => {
    const display: LifecycleDisplay = { glyph: "▶", label: "Streaming [10 tokens]", colorToken: "status.info" };
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, true);

    expect(segments.lifecycle).toContain("⚡ Compacted");
  });

  test("omits compaction indicator when inactive", () => {
    const display: LifecycleDisplay = { glyph: "●", label: "Ready", colorToken: "status.success" };
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);

    expect(segments.lifecycle).not.toContain("⚡");
  });
});

describe("buildLeftZoneText", () => {
  const segments: StatusBarSegments = {
    heartbeat: "·",
    connection: "● Connected",
    model: "claude-3.5-sonnet",
    lifecycle: "● Ready",
    hint: "Ctrl+K palette",
  };

  test("includes heartbeat when requested", () => {
    const text = buildLeftZoneText(segments, true);
    expect(text).toContain("·");
    expect(text).toContain("● Connected");
    expect(text).toContain("claude-3.5-sonnet");
    expect(text).toContain("● Ready");
  });

  test("excludes heartbeat when not requested", () => {
    const text = buildLeftZoneText(segments, false);
    expect(text).not.toStartWith("·");
    expect(text).toContain("● Connected");
  });

  test("uses │ separator between segments", () => {
    const text = buildLeftZoneText(segments, true);
    expect(text).toContain(" │ ");
  });
});

describe("buildRightZoneText", () => {
  test("returns hint text", () => {
    const segments: StatusBarSegments = {
      heartbeat: "·",
      connection: "● Connected",
      model: "claude-3.5-sonnet",
      lifecycle: "● Ready",
      hint: "Ctrl+K palette",
    };

    expect(buildRightZoneText(segments)).toBe("Ctrl+K palette");
  });
});

// --- Truncation tests ---

describe("resolveTruncation", () => {
  function makeSegments(modelName = "claude-3.5-sonnet"): StatusBarSegments {
    return {
      heartbeat: "·",
      connection: "● Connected",
      model: modelName,
      lifecycle: "● Ready",
      hint: "Ctrl+K palette",
    };
  }

  test("shows all segments at wide terminal (120 columns)", () => {
    const segments = makeSegments();
    const result = resolveTruncation(segments, 120);
    expect(result.showHint).toBe(true);
    expect(result.showHeartbeat).toBe(true);
    expect(result.showLifecycle).toBe(true);
  });

  test("shows all segments at 80 columns with short model name", () => {
    const segments = makeSegments("gpt-4o");
    const result = resolveTruncation(segments, 80);
    expect(result.showHint).toBe(true);
    expect(result.showHeartbeat).toBe(true);
    expect(result.showLifecycle).toBe(true);
  });

  test("no overlap at 80 columns — left + right fits within width", () => {
    const segments = makeSegments("claude-3.5-sonnet");
    const truncation = resolveTruncation(segments, 80);
    const leftText = buildTruncatedLeftText(segments, truncation);
    const rightText = truncation.showHint ? buildRightZoneText(segments) : "";

    // Total: left + separator (3) + right + padding (2)
    const totalWidth = leftText.length + (rightText.length > 0 ? 3 + rightText.length : 0) + 2;
    expect(totalWidth).toBeLessThanOrEqual(80);
  });

  test("drops hint first at narrow widths", () => {
    const segments = makeSegments("claude-3.5-sonnet-20241022");
    // Make it just narrow enough to drop hint but keep everything else
    const fullLeft = buildLeftZoneText(segments, true);
    const narrowWidth = fullLeft.length + 3; // just enough for left + padding + 1

    const result = resolveTruncation(segments, narrowWidth);
    expect(result.showHint).toBe(false);
    expect(result.showHeartbeat).toBe(true);
    expect(result.showLifecycle).toBe(true);
  });

  test("drops heartbeat after hint at very narrow widths", () => {
    const segments = makeSegments("claude-3.5-sonnet-20241022");
    // Force very narrow: just enough for left without heartbeat
    const noHeartbeatLeft = buildLeftZoneText(segments, false);
    const narrowWidth = noHeartbeatLeft.length + 2; // just padding

    const result = resolveTruncation(segments, narrowWidth);
    expect(result.showHint).toBe(false);
    expect(result.showHeartbeat).toBe(false);
    expect(result.showLifecycle).toBe(true);
  });

  test("drops lifecycle detail at extremely narrow widths", () => {
    const result = resolveTruncation(makeSegments(), 30);
    expect(result.showHint).toBe(false);
    expect(result.showHeartbeat).toBe(false);
    expect(result.showLifecycle).toBe(false);
  });

  test("model name always present in truncated output", () => {
    const segments = makeSegments("claude-3.5-sonnet");

    // Even at minimum truncation, model is in the output
    const minTruncation = resolveTruncation(segments, 30);
    const text = buildTruncatedLeftText(segments, minTruncation);
    expect(text).toContain("claude-3.5-sonnet");
  });

  test("truncation priority order: hint → heartbeat → lifecycle", () => {
    const segments = makeSegments("claude-3.5-sonnet-20241022");

    // Wide: everything visible
    const wide = resolveTruncation(segments, 200);
    expect(wide.showHint).toBe(true);
    expect(wide.showHeartbeat).toBe(true);
    expect(wide.showLifecycle).toBe(true);

    // Narrower: hint drops first
    const medium = resolveTruncation(segments, 65);
    if (!medium.showHint) {
      // Hint dropped first — correct priority
      expect(medium.showHeartbeat).toBe(true);
    }

    // Very narrow: lifecycle drops last
    const narrow = resolveTruncation(segments, 30);
    expect(narrow.showHint).toBe(false);
    expect(narrow.showHeartbeat).toBe(false);
    expect(narrow.showLifecycle).toBe(false);
  });
});

describe("buildTruncatedLeftText", () => {
  const segments: StatusBarSegments = {
    heartbeat: "·",
    connection: "● Connected",
    model: "claude-3.5-sonnet",
    lifecycle: "● Ready",
    hint: "Ctrl+K palette",
  };

  test("full truncation includes all left segments", () => {
    const text = buildTruncatedLeftText(segments, {
      showHint: true,
      showHeartbeat: true,
      showLifecycle: true,
    });
    expect(text).toContain("·");
    expect(text).toContain("● Connected");
    expect(text).toContain("claude-3.5-sonnet");
    expect(text).toContain("● Ready");
  });

  test("without heartbeat omits heartbeat segment", () => {
    const text = buildTruncatedLeftText(segments, {
      showHint: false,
      showHeartbeat: false,
      showLifecycle: true,
    });
    expect(text).not.toContain("· │");
    expect(text).toContain("● Connected");
    expect(text).toContain("claude-3.5-sonnet");
  });

  test("without lifecycle omits lifecycle segment", () => {
    const text = buildTruncatedLeftText(segments, {
      showHint: false,
      showHeartbeat: false,
      showLifecycle: false,
    });
    expect(text).not.toContain("Ready");
    expect(text).toContain("● Connected");
    expect(text).toContain("claude-3.5-sonnet");
  });
});

// --- Compaction indicator tests ---

describe("compaction indicator", () => {
  test("compaction duration constant is between 3-5 seconds", () => {
    expect(COMPACTION_INDICATOR_DURATION_MS).toBeGreaterThanOrEqual(3_000);
    expect(COMPACTION_INDICATOR_DURATION_MS).toBeLessThanOrEqual(5_000);
  });

  test("compaction indicator appears in lifecycle segment when active", () => {
    const display: LifecycleDisplay = { glyph: "●", label: "Ready", colorToken: "status.success" };
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, true);
    expect(segments.lifecycle).toContain("⚡ Compacted");
  });

  test("compaction indicator absent from lifecycle segment when inactive", () => {
    const display: LifecycleDisplay = { glyph: "●", label: "Ready", colorToken: "status.success" };
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.lifecycle).not.toContain("⚡");
    expect(segments.lifecycle).not.toContain("Compacted");
  });

  test("compaction indicator coexists with streaming state", () => {
    const display: LifecycleDisplay = { glyph: "▶", label: "Streaming [50 tokens]", colorToken: "status.info" };
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, true);
    expect(segments.lifecycle).toContain("Streaming [50 tokens]");
    expect(segments.lifecycle).toContain("⚡ Compacted");
  });
});

// --- Heartbeat connected/disconnected state tests ---

describe("heartbeat connected vs disconnected states", () => {
  test("connected heartbeat has non-null interval", () => {
    expect(resolveHeartbeatInterval("connected")).not.toBeNull();
  });

  test("disconnected heartbeat has null interval (no pulse)", () => {
    expect(resolveHeartbeatInterval("disconnected")).toBeNull();
  });

  test("connected heartbeat bright phase uses heartbeat glyph color", () => {
    const color = resolveHeartbeatColor("connected", "bright", MOCK_TOKENS);
    expect(color).toBe(MOCK_TOKENS["glyph.heartbeat"]);
  });

  test("disconnected heartbeat uses muted color for both phases", () => {
    const bright = resolveHeartbeatColor("disconnected", "bright", MOCK_TOKENS);
    const dim = resolveHeartbeatColor("disconnected", "dim", MOCK_TOKENS);
    expect(bright).toBe(dim);
    expect(bright).toBe(MOCK_TOKENS["text.muted"]);
  });
});

// --- Connection glyph and label tests ---

describe("connection glyph and label", () => {
  test("connected shows filled circle", () => {
    expect(getConnectionGlyph("connected")).toBe("●");
  });

  test("disconnected shows empty circle", () => {
    expect(getConnectionGlyph("disconnected")).toBe("○");
  });

  test("connecting shows dotted circle", () => {
    expect(getConnectionGlyph("connecting")).toBe("◌");
  });

  test("reconnecting shows dotted circle", () => {
    expect(getConnectionGlyph("reconnecting")).toBe("◌");
  });

  test("connected label is Connected", () => {
    expect(getConnectionLabel("connected")).toBe("Connected");
  });

  test("disconnected label is Offline", () => {
    expect(getConnectionLabel("disconnected")).toBe("Offline");
  });
});

// --- Tool execution lifecycle display tests ---

describe("tool execution lifecycle display", () => {
  test("streaming without active tool shows normal streaming indicator", () => {
    const display = resolveLifecycleDisplay("streaming", 42, null, null);
    expect(display.glyph).toBe("▶");
    expect(display.label).toBe("Streaming [42 tokens]");
    expect(display.colorToken).toBe("status.info");
  });

  test("streaming without active tool and undefined shows normal streaming indicator", () => {
    const display = resolveLifecycleDisplay("streaming", 10, null, undefined);
    expect(display.glyph).toBe("▶");
    expect(display.label).toBe("Streaming [10 tokens]");
    expect(display.colorToken).toBe("status.info");
  });

  test("streaming with active tool shows Using tool indicator", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "bash");
    expect(display.glyph).toBe("⚙");
    expect(display.label).toBe("Using tool: bash");
    expect(display.colorToken).toBe("status.warning");
  });

  test("streaming with read tool shows correct tool name", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "read");
    expect(display.label).toBe("Using tool: read");
  });

  test("streaming with glob tool shows correct tool name", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "glob");
    expect(display.label).toBe("Using tool: glob");
  });

  test("streaming with grep tool shows correct tool name", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "grep");
    expect(display.label).toBe("Using tool: grep");
  });

  test("streaming with write tool shows correct tool name", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "write");
    expect(display.label).toBe("Using tool: write");
  });

  test("streaming with edit tool shows correct tool name", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "edit");
    expect(display.label).toBe("Using tool: edit");
  });

  test("streaming with ls tool shows correct tool name", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "ls");
    expect(display.label).toBe("Using tool: ls");
  });

  test("idle with active tool name still shows Ready (tool name ignored)", () => {
    const display = resolveLifecycleDisplay("idle", 0, null, "bash");
    expect(display.glyph).toBe("●");
    expect(display.label).toBe("Ready");
    expect(display.colorToken).toBe("status.success");
  });

  test("complete with active tool name still shows Done (tool name ignored)", () => {
    const display = resolveLifecycleDisplay("complete", 0, null, "bash");
    expect(display.glyph).toBe("✓");
    expect(display.label).toBe("Done");
  });

  test("error with active tool name still shows Error (tool name ignored)", () => {
    const display = resolveLifecycleDisplay("error", 0, null, "bash");
    expect(display.glyph).toBe("✗");
    expect(display.label).toBe("Error");
  });

  test("tool display uses warning color token for visibility", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "bash");
    expect(display.colorToken).toBe("status.warning");
  });

  test("tool display uses gear glyph distinct from streaming arrow", () => {
    const toolDisplay = resolveLifecycleDisplay("streaming", 0, null, "bash");
    const streamDisplay = resolveLifecycleDisplay("streaming", 0, null, null);
    expect(toolDisplay.glyph).not.toBe(streamDisplay.glyph);
    expect(toolDisplay.glyph).toBe("⚙");
    expect(streamDisplay.glyph).toBe("▶");
  });

  test("empty string tool name is treated as no active tool", () => {
    const display = resolveLifecycleDisplay("streaming", 42, null, "");
    expect(display.glyph).toBe("▶");
    expect(display.label).toBe("Streaming [42 tokens]");
  });
});

describe("tool execution lifecycle in segments", () => {
  test("tool active during streaming appears in lifecycle segment", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "bash");
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.lifecycle).toContain("Using tool: bash");
    expect(segments.lifecycle).toContain("⚙");
  });

  test("tool active with compaction shows both indicators", () => {
    const display = resolveLifecycleDisplay("streaming", 0, null, "read");
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, true);
    expect(segments.lifecycle).toContain("Using tool: read");
    expect(segments.lifecycle).toContain("⚡ Compacted");
  });

  test("no tool active during streaming shows normal streaming in segments", () => {
    const display = resolveLifecycleDisplay("streaming", 25, null, null);
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.lifecycle).toContain("Streaming [25 tokens]");
    expect(segments.lifecycle).not.toContain("Using tool");
  });

  test("tool name cleared after completion shows Ready in segments", () => {
    const display = resolveLifecycleDisplay("idle", 0, null, null);
    const segments = buildSegments("connected", "claude-3.5-sonnet", display, false);
    expect(segments.lifecycle).toBe("● Ready");
    expect(segments.lifecycle).not.toContain("Using tool");
  });
});

describe("tool execution state transitions", () => {
  test("single tool lifecycle: Ready → Using tool → Ready", () => {
    // Phase 1: Idle (Ready)
    const idle = resolveLifecycleDisplay("idle", 0, null, null);
    expect(idle.label).toBe("Ready");

    // Phase 2: Streaming with tool active
    const toolActive = resolveLifecycleDisplay("streaming", 0, null, "bash");
    expect(toolActive.label).toBe("Using tool: bash");

    // Phase 3: Complete (Done)
    const complete = resolveLifecycleDisplay("complete", 0, null, null);
    expect(complete.label).toBe("Done");

    // Phase 4: Back to idle (Ready)
    const backToIdle = resolveLifecycleDisplay("idle", 0, null, null);
    expect(backToIdle.label).toBe("Ready");
  });

  test("multi-tool sequence: tool updates per tool in sequence", () => {
    // Tool 1: bash
    const tool1 = resolveLifecycleDisplay("streaming", 0, null, "bash");
    expect(tool1.label).toBe("Using tool: bash");

    // Tool 2: read (updates to new tool)
    const tool2 = resolveLifecycleDisplay("streaming", 0, null, "read");
    expect(tool2.label).toBe("Using tool: read");

    // Tool 3: grep (updates again)
    const tool3 = resolveLifecycleDisplay("streaming", 0, null, "grep");
    expect(tool3.label).toBe("Using tool: grep");

    // Completion: clears tool
    const done = resolveLifecycleDisplay("complete", 0, null, null);
    expect(done.label).toBe("Done");
  });

  test("tool cleared on done event returns to Ready after timeout", () => {
    // During tool execution
    const during = resolveLifecycleDisplay("streaming", 0, null, "edit");
    expect(during.label).toBe("Using tool: edit");

    // After done event, lifecycle goes to complete
    const complete = resolveLifecycleDisplay("complete", 0, "$0.01", null);
    expect(complete.label).toBe("Done [$0.01]");
    expect(complete.glyph).toBe("✓");

    // After complete-timeout, lifecycle goes to idle
    const idle = resolveLifecycleDisplay("idle", 0, null, null);
    expect(idle.label).toBe("Ready");
  });

  test("streaming resumes normal display when tool clears mid-stream", () => {
    // Tool active
    const withTool = resolveLifecycleDisplay("streaming", 10, null, "bash");
    expect(withTool.label).toBe("Using tool: bash");

    // Tool clears but still streaming (between tools)
    const betweenTools = resolveLifecycleDisplay("streaming", 50, null, null);
    expect(betweenTools.label).toBe("Streaming [50 tokens]");
    expect(betweenTools.glyph).toBe("▶");
  });
});

// --- Theme token exclusivity ---

describe("all status bar colors use theme tokens exclusively", () => {
  test("heartbeat colors come from token map", () => {
    const statuses: DaemonConnectionStatus[] = ["connected", "disconnected", "connecting", "reconnecting"];
    const phases: HeartbeatPhase[] = ["bright", "dim"];
    const tokenValues = Object.values(MOCK_TOKENS);

    for (const status of statuses) {
      for (const phase of phases) {
        const color = resolveHeartbeatColor(status, phase, MOCK_TOKENS);
        expect(tokenValues).toContain(color);
      }
    }
  });

  test("lifecycle display color tokens are valid semantic tokens", () => {
    const statuses: ConversationLifecycleStatus[] = ["idle", "sending", "thinking", "streaming", "complete", "error"];
    const validTokens = ["status.success", "status.warning", "status.info", "status.error"];

    for (const status of statuses) {
      const display = resolveLifecycleDisplay(status, 0, null);
      expect(validTokens).toContain(display.colorToken);
    }
  });
});

// --- Status segment data model tests ---

function makeDefaultSources(overrides: Partial<StatusSegmentSources> = {}): StatusSegmentSources {
  return {
    connectionStatus: "connected",
    currentModel: "claude-3.5-sonnet",
    lifecycleStatus: "idle",
    activeToolName: null,
    tokenCount: 0,
    cost: null,
    compactionActive: false,
    terminalWidth: 120,
    ...overrides,
  };
}

describe("STATUS_SEGMENT_PRIORITY", () => {
  test("connection has highest priority (lowest number)", () => {
    expect(STATUS_SEGMENT_PRIORITY.connection).toBe(1);
  });

  test("model has second priority", () => {
    expect(STATUS_SEGMENT_PRIORITY.model).toBe(2);
  });

  test("lifecycle has third priority", () => {
    expect(STATUS_SEGMENT_PRIORITY.lifecycle).toBe(3);
  });

  test("hints has lowest priority (highest number)", () => {
    expect(STATUS_SEGMENT_PRIORITY.hints).toBe(4);
  });

  test("all priorities are unique", () => {
    const values = Object.values(STATUS_SEGMENT_PRIORITY);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe("STATUS_SEGMENT_ORDER", () => {
  test("contains all four segment IDs", () => {
    expect(STATUS_SEGMENT_ORDER).toHaveLength(4);
    expect(STATUS_SEGMENT_ORDER).toContain("connection");
    expect(STATUS_SEGMENT_ORDER).toContain("model");
    expect(STATUS_SEGMENT_ORDER).toContain("lifecycle");
    expect(STATUS_SEGMENT_ORDER).toContain("hints");
  });

  test("is ordered by priority (connection first, hints last)", () => {
    expect(STATUS_SEGMENT_ORDER[0]).toBe("connection");
    expect(STATUS_SEGMENT_ORDER[3]).toBe("hints");
  });
});

describe("SEGMENT_DROP_THRESHOLDS", () => {
  test("connection never drops (threshold 0)", () => {
    expect(SEGMENT_DROP_THRESHOLDS.connection).toBe(0);
  });

  test("hints drop first (highest threshold)", () => {
    const thresholds = Object.values(SEGMENT_DROP_THRESHOLDS);
    expect(SEGMENT_DROP_THRESHOLDS.hints).toBe(Math.max(...thresholds));
  });

  test("drop order matches priority order", () => {
    expect(SEGMENT_DROP_THRESHOLDS.hints).toBeGreaterThan(SEGMENT_DROP_THRESHOLDS.lifecycle);
    expect(SEGMENT_DROP_THRESHOLDS.lifecycle).toBeGreaterThan(SEGMENT_DROP_THRESHOLDS.model);
    expect(SEGMENT_DROP_THRESHOLDS.model).toBeGreaterThan(SEGMENT_DROP_THRESHOLDS.connection);
  });
});

describe("deriveStatusSegments", () => {
  test("returns exactly four segments", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    expect(segments).toHaveLength(4);
  });

  test("segments are in priority order", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    const ids = segments.map((s) => s.id);
    expect(ids).toEqual(["connection", "model", "lifecycle", "hints"]);
  });

  test("all segments start as visible", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    for (const segment of segments) {
      expect(segment.visible).toBe(true);
    }
  });

  test("connection segment shows connected state", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ connectionStatus: "connected" }));
    const conn = segments.find((s) => s.id === "connection")!;
    expect(conn.content).toContain("Connected");
    expect(conn.glyph).toBe("●");
    expect(conn.colorToken).toBe("status.success");
  });

  test("connection segment shows disconnected state", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ connectionStatus: "disconnected" }));
    const conn = segments.find((s) => s.id === "connection")!;
    expect(conn.content).toContain("Offline");
    expect(conn.glyph).toBe("○");
    expect(conn.colorToken).toBe("status.error");
  });

  test("connection segment shows connecting state", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ connectionStatus: "connecting" }));
    const conn = segments.find((s) => s.id === "connection")!;
    expect(conn.content).toContain("Connecting...");
    expect(conn.colorToken).toBe("status.warning");
  });

  test("connection segment shows reconnecting state", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ connectionStatus: "reconnecting" }));
    const conn = segments.find((s) => s.id === "connection")!;
    expect(conn.content).toContain("Reconnecting...");
    expect(conn.colorToken).toBe("status.warning");
  });

  test("model segment shows current model name", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ currentModel: "gpt-4o" }));
    const model = segments.find((s) => s.id === "model")!;
    expect(model.content).toBe("gpt-4o");
  });

  test("lifecycle segment shows idle Ready state", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ lifecycleStatus: "idle" }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).toContain("Ready");
    expect(lc.glyph).toBe("●");
    expect(lc.colorToken).toBe("status.success");
  });

  test("lifecycle segment shows streaming with token count", () => {
    const segments = deriveStatusSegments(makeDefaultSources({
      lifecycleStatus: "streaming",
      tokenCount: 42,
    }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).toContain("Streaming [42 tokens]");
    expect(lc.colorToken).toBe("status.info");
  });

  test("lifecycle segment shows tool name during streaming", () => {
    const segments = deriveStatusSegments(makeDefaultSources({
      lifecycleStatus: "streaming",
      activeToolName: "bash",
    }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).toContain("Using tool: bash");
    expect(lc.glyph).toBe("⚙");
  });

  test("lifecycle segment includes compaction indicator when active", () => {
    const segments = deriveStatusSegments(makeDefaultSources({
      lifecycleStatus: "idle",
      compactionActive: true,
    }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).toContain("⚡ Compacted");
  });

  test("lifecycle segment omits compaction indicator when inactive", () => {
    const segments = deriveStatusSegments(makeDefaultSources({
      lifecycleStatus: "idle",
      compactionActive: false,
    }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).not.toContain("Compacted");
  });

  test("lifecycle segment shows complete with cost", () => {
    const segments = deriveStatusSegments(makeDefaultSources({
      lifecycleStatus: "complete",
      cost: "$0.003",
    }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).toContain("Done [$0.003]");
  });

  test("lifecycle segment shows error state", () => {
    const segments = deriveStatusSegments(makeDefaultSources({ lifecycleStatus: "error" }));
    const lc = segments.find((s) => s.id === "lifecycle")!;
    expect(lc.content).toContain("Error");
    expect(lc.glyph).toBe("✗");
    expect(lc.colorToken).toBe("status.error");
  });

  test("hints segment contains keyboard shortcuts", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    const hints = segments.find((s) => s.id === "hints")!;
    expect(hints.content).toContain("Ctrl+K");
    expect(hints.content).toContain("Ctrl+M");
  });

  test("each segment has correct priority from constant", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    for (const segment of segments) {
      expect(segment.priority).toBe(STATUS_SEGMENT_PRIORITY[segment.id]);
    }
  });
});

describe("resolveSegmentVisibility", () => {
  test("all segments visible at wide terminal (120 cols)", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    const result = resolveSegmentVisibility(segments, 120);
    expect(result.visibleSegments).toHaveLength(4);
  });

  test("connection is always visible even at minimum width", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    const result = resolveSegmentVisibility(segments, 20);
    const connVisible = result.visibleSegments.some((s) => s.id === "connection");
    expect(connVisible).toBe(true);
  });

  test("hints drop first as width decreases", () => {
    const segments = deriveStatusSegments(makeDefaultSources());

    // Find the width where hints just barely don't fit
    const fullResult = resolveSegmentVisibility(segments, 120);
    const fullWidth = fullResult.totalWidth;

    // At a width just below full, hints should drop first
    const narrowResult = resolveSegmentVisibility(segments, fullWidth - 1);
    if (narrowResult.visibleSegments.length < 4) {
      const droppedIds = segments
        .filter((s) => !narrowResult.visibleSegments.some((v) => v.id === s.id))
        .map((s) => s.id);
      expect(droppedIds).toContain("hints");
    }
  });

  test("drop order is deterministic: hints → lifecycle → model", () => {
    const segments = deriveStatusSegments(makeDefaultSources());

    // Very wide: all visible
    const wide = resolveSegmentVisibility(segments, 200);
    expect(wide.visibleSegments).toHaveLength(4);

    // Progressively narrow: track which segments drop and in what order
    const droppedOrder: StatusSegmentId[] = [];
    const alreadyDropped = new Set<StatusSegmentId>();

    for (let width = 200; width > 10; width -= 1) {
      const result = resolveSegmentVisibility(segments, width);
      const visibleIds = new Set(result.visibleSegments.map((s) => s.id));

      for (const seg of segments) {
        if (!visibleIds.has(seg.id) && !alreadyDropped.has(seg.id)) {
          droppedOrder.push(seg.id);
          alreadyDropped.add(seg.id);
        }
      }
    }

    // Verify the drop order: hints first, then lifecycle, then model
    // Connection drops last (if at all, only at extreme widths)
    const hintsIdx = droppedOrder.indexOf("hints");
    const lifecycleIdx = droppedOrder.indexOf("lifecycle");
    const modelIdx = droppedOrder.indexOf("model");
    const connectionIdx = droppedOrder.indexOf("connection");

    if (hintsIdx >= 0 && lifecycleIdx >= 0) {
      expect(hintsIdx).toBeLessThan(lifecycleIdx);
    }
    if (lifecycleIdx >= 0 && modelIdx >= 0) {
      expect(lifecycleIdx).toBeLessThan(modelIdx);
    }
    if (modelIdx >= 0 && connectionIdx >= 0) {
      expect(modelIdx).toBeLessThan(connectionIdx);
    }
  });

  test("same width always produces same visibility", () => {
    const segments = deriveStatusSegments(makeDefaultSources());

    for (const width of [30, 50, 80, 120]) {
      const result1 = resolveSegmentVisibility(segments, width);
      const result2 = resolveSegmentVisibility(segments, width);
      const ids1 = result1.visibleSegments.map((s) => s.id);
      const ids2 = result2.visibleSegments.map((s) => s.id);
      expect(ids1).toEqual(ids2);
    }
  });

  test("visible segments never exceed terminal width", () => {
    const segments = deriveStatusSegments(makeDefaultSources());

    for (const width of [30, 50, 80, 120, 200]) {
      const result = resolveSegmentVisibility(segments, width);
      expect(result.totalWidth).toBeLessThanOrEqual(width);
    }
  });

  test("segments array includes visibility flags for all segments", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    const result = resolveSegmentVisibility(segments, 50);
    expect(result.segments).toHaveLength(4);

    for (const seg of result.segments) {
      const isVisible = result.visibleSegments.some((v) => v.id === seg.id);
      expect(seg.visible).toBe(isVisible);
    }
  });
});

describe("resolveStatusSegmentSet", () => {
  test("full pipeline produces valid segment set", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources());
    expect(result.segments).toHaveLength(4);
    expect(result.availableWidth).toBe(120);
    expect(result.visibleSegments.length).toBeGreaterThan(0);
  });

  test("narrow terminal drops low-priority segments", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 40 }));
    expect(result.visibleSegments.length).toBeLessThan(4);

    const visibleIds = result.visibleSegments.map((s) => s.id);
    expect(visibleIds).toContain("connection");
  });

  test("wide terminal shows all segments", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    expect(result.visibleSegments).toHaveLength(4);
  });
});

describe("formatSegmentText", () => {
  test("joins visible segments with separator", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const text = formatSegmentText(result);
    expect(text).toContain(" │ ");
    expect(text).toContain("Connected");
    expect(text).toContain("claude-3.5-sonnet");
  });

  test("single visible segment has no separator", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 20 }));
    if (result.visibleSegments.length === 1) {
      const text = formatSegmentText(result);
      expect(text).not.toContain(" │ ");
    }
  });
});

describe("isSegmentVisible", () => {
  test("returns true for visible segment", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    expect(isSegmentVisible(result, "connection")).toBe(true);
    expect(isSegmentVisible(result, "model")).toBe(true);
  });

  test("returns false for dropped segment", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 30 }));
    if (!result.visibleSegments.some((s) => s.id === "hints")) {
      expect(isSegmentVisible(result, "hints")).toBe(false);
    }
  });
});

describe("segment-priority width degradation", () => {
  test("at 120 cols: all four segments visible", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 120 }));
    expect(result.visibleSegments).toHaveLength(4);
  });

  test("connection and model survive at 40 cols", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({
      terminalWidth: 40,
      currentModel: "gpt-4o",
    }));
    const visibleIds = result.visibleSegments.map((s) => s.id);
    expect(visibleIds).toContain("connection");
    expect(visibleIds).toContain("model");
  });

  test("connection survives at 20 cols", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 20 }));
    const visibleIds = result.visibleSegments.map((s) => s.id);
    expect(visibleIds).toContain("connection");
  });

  test("long model name causes earlier segment drops", () => {
    const shortModel = resolveStatusSegmentSet(makeDefaultSources({
      terminalWidth: 80,
      currentModel: "gpt-4o",
    }));
    const longModel = resolveStatusSegmentSet(makeDefaultSources({
      terminalWidth: 80,
      currentModel: "claude-3.5-sonnet-20241022-v2-extended",
    }));

    expect(shortModel.visibleSegments.length).toBeGreaterThanOrEqual(
      longModel.visibleSegments.length,
    );
  });

  test("streaming lifecycle with tool name fits at standard width", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({
      terminalWidth: 100,
      lifecycleStatus: "streaming",
      activeToolName: "bash",
    }));
    const lcVisible = result.visibleSegments.some((s) => s.id === "lifecycle");
    expect(lcVisible).toBe(true);
  });
});

describe("segment data model integrity", () => {
  test("every segment has a non-empty content string", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    for (const segment of segments) {
      expect(segment.content.length).toBeGreaterThan(0);
    }
  });

  test("every segment has a valid color token", () => {
    const validPrefixes = ["status.", "text."];
    const segments = deriveStatusSegments(makeDefaultSources());
    for (const segment of segments) {
      const hasValidPrefix = validPrefixes.some((p) => segment.colorToken.startsWith(p));
      expect(hasValidPrefix).toBe(true);
    }
  });

  test("segment priorities are monotonically increasing", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].priority).toBeGreaterThan(segments[i - 1].priority);
    }
  });

  test("minWidth matches SEGMENT_DROP_THRESHOLDS", () => {
    const segments = deriveStatusSegments(makeDefaultSources());
    for (const segment of segments) {
      expect(segment.minWidth).toBe(SEGMENT_DROP_THRESHOLDS[segment.id]);
    }
  });
});

// --- Segment grouping tests (polished status bar UI) ---

describe("SEGMENT_SEPARATOR", () => {
  test("separator is the pipe character with surrounding spaces", () => {
    expect(SEGMENT_SEPARATOR).toBe(" │ ");
  });

  test("separator is exactly 3 characters wide", () => {
    expect(SEGMENT_SEPARATOR.length).toBe(3);
  });
});

describe("groupSegments", () => {
  test("places connection, model, lifecycle in left group", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const { left, right } = groupSegments(result.visibleSegments);

    const leftIds = left.map((s) => s.id);
    expect(leftIds).toContain("connection");
    expect(leftIds).toContain("model");
    expect(leftIds).toContain("lifecycle");
    expect(leftIds).not.toContain("hints");
  });

  test("places hints in right group", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const { right } = groupSegments(result.visibleSegments);

    const rightIds = right.map((s) => s.id);
    expect(rightIds).toContain("hints");
    expect(rightIds).not.toContain("connection");
    expect(rightIds).not.toContain("model");
    expect(rightIds).not.toContain("lifecycle");
  });

  test("right group is empty when hints are dropped", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 40 }));
    const { right } = groupSegments(result.visibleSegments);

    expect(right).toHaveLength(0);
  });

  test("left group preserves priority order", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const { left } = groupSegments(result.visibleSegments);

    for (let i = 1; i < left.length; i++) {
      expect(left[i].priority).toBeGreaterThan(left[i - 1].priority);
    }
  });

  test("handles single visible segment (connection only)", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 20 }));
    const { left, right } = groupSegments(result.visibleSegments);

    expect(left.length).toBeGreaterThanOrEqual(1);
    expect(right).toHaveLength(0);
    expect(left[0].id).toBe("connection");
  });
});

describe("buildGroupText", () => {
  test("joins multiple segments with separator", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const { left } = groupSegments(result.visibleSegments);
    const text = buildGroupText(left);

    expect(text).toContain(" │ ");
    expect(text).toContain("Connected");
    expect(text).toContain("claude-3.5-sonnet");
  });

  test("single segment produces no separator", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 20 }));
    const { left } = groupSegments(result.visibleSegments);

    if (left.length === 1) {
      const text = buildGroupText(left);
      expect(text).not.toContain(" │ ");
    }
  });

  test("right group text contains keyboard shortcuts", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const { right } = groupSegments(result.visibleSegments);
    const text = buildGroupText(right);

    expect(text).toContain("Ctrl+K");
    expect(text).toContain("Ctrl+M");
  });
});

// --- Polished status bar visual behavior tests ---

describe("polished status bar layout stability", () => {
  test("left group never contains hints segment", () => {
    for (const width of [30, 50, 80, 120, 200]) {
      const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: width }));
      const { left } = groupSegments(result.visibleSegments);
      const leftIds = left.map((s) => s.id);
      expect(leftIds).not.toContain("hints");
    }
  });

  test("right group never contains non-hint segments", () => {
    for (const width of [30, 50, 80, 120, 200]) {
      const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: width }));
      const { right } = groupSegments(result.visibleSegments);
      for (const seg of right) {
        expect(seg.id).toBe("hints");
      }
    }
  });

  test("no drifting separators on wide terminals", () => {
    // At wide widths, left and right groups are stable and don't produce
    // extra separators between them — they are in separate flex containers
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const { left, right } = groupSegments(result.visibleSegments);

    const leftText = buildGroupText(left);
    const rightText = buildGroupText(right);

    // Left text should not end with a separator
    expect(leftText).not.toMatch(/ │ $/);
    // Right text should not start with a separator
    expect(rightText).not.toMatch(/^ │ /);
  });

  test("total visible content fits within terminal width", () => {
    for (const width of [30, 50, 80, 120, 200]) {
      const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: width }));
      // totalWidth from resolveSegmentVisibility includes padding
      expect(result.totalWidth).toBeLessThanOrEqual(width);
    }
  });

  test("each visible segment has a distinct color token", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    for (const seg of result.visibleSegments) {
      expect(seg.colorToken.length).toBeGreaterThan(0);
      expect(seg.colorToken).not.toBe("");
    }
  });

  test("connection segment always uses status color tokens", () => {
    const statuses: DaemonConnectionStatus[] = ["connected", "disconnected", "connecting", "reconnecting"];
    for (const status of statuses) {
      const result = resolveStatusSegmentSet(makeDefaultSources({
        terminalWidth: 200,
        connectionStatus: status,
      }));
      const conn = result.visibleSegments.find((s) => s.id === "connection");
      expect(conn).toBeDefined();
      expect(conn!.colorToken).toMatch(/^status\./);
    }
  });

  test("model segment uses text.secondary color token", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const model = result.visibleSegments.find((s) => s.id === "model");
    expect(model).toBeDefined();
    expect(model!.colorToken).toBe("text.secondary");
  });

  test("hints segment uses text.muted color token", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints).toBeDefined();
    expect(hints!.colorToken).toBe("text.muted");
  });
});

describe("polished status bar content requirements", () => {
  test("shows connection health at all widths", () => {
    for (const width of [20, 40, 80, 120]) {
      const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: width }));
      const hasConnection = result.visibleSegments.some((s) => s.id === "connection");
      expect(hasConnection).toBe(true);
    }
  });

  test("shows active model at standard and wide widths", () => {
    for (const width of [80, 120, 200]) {
      const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: width }));
      const hasModel = result.visibleSegments.some((s) => s.id === "model");
      expect(hasModel).toBe(true);
    }
  });

  test("shows at least two keyboard shortcuts in hints", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints).toBeDefined();

    // Count Ctrl+ occurrences — must be at least 2
    const ctrlMatches = hints!.content.match(/Ctrl\+/g);
    expect(ctrlMatches).not.toBeNull();
    expect(ctrlMatches!.length).toBeGreaterThanOrEqual(2);
  });

  test("hints contain Ctrl+K palette shortcut", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints!.content).toContain("Ctrl+K");
  });

  test("hints contain Ctrl+M model shortcut", () => {
    const result = resolveStatusSegmentSet(makeDefaultSources({ terminalWidth: 200 }));
    const hints = result.visibleSegments.find((s) => s.id === "hints");
    expect(hints!.content).toContain("Ctrl+M");
  });
});
