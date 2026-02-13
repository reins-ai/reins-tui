import { describe, expect, test } from "bun:test";

import {
  resolveLifecycleDisplay,
  buildSegments,
  buildLeftZoneText,
  buildRightZoneText,
  resolveTruncation,
  buildTruncatedLeftText,
  type LifecycleDisplay,
  type StatusBarSegments,
} from "../../src/components/status-bar";
import {
  getLogoLines,
  getLogoWidth,
  LOGO_FULL_STANDARD,
  LOGO_FULL_SAD,
  LOGO_COMPACT_STANDARD,
  LOGO_COMPACT_SAD,
  type LogoVariant,
  type LogoSize,
} from "../../src/components/logo-ascii";
import {
  createThemeRegistry,
  BUILTIN_THEME_NAMES,
} from "../../src/theme/theme-registry";
import {
  THEME_TOKEN_NAMES,
  validateThemeTokens,
  type ThemeTokenName,
} from "../../src/theme/theme-schema";
import { resolveTheme256 } from "../../src/theme/fallback-256";
import {
  resolveBreakpointState,
  type BreakpointBand,
} from "../../src/layout/breakpoints";
import type { ConversationLifecycleStatus } from "../../src/state/status-machine";

import reinsDarkTheme from "../../src/theme/builtins/reins-dark.json";
import reinsLightTheme from "../../src/theme/builtins/reins-light.json";
import tokyonightTheme from "../../src/theme/builtins/tokyonight.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_THEMES = {
  "reins-dark": reinsDarkTheme,
  "reins-light": reinsLightTheme,
  tokyonight: tokyonightTheme,
} as const;

function makeSegments(
  modelName = "claude-3.5-sonnet",
  status: ConversationLifecycleStatus = "idle",
  tokenCount = 0,
  cost: string | null = null,
  compaction = false,
): StatusBarSegments {
  const display = resolveLifecycleDisplay(status, tokenCount, cost);
  return buildSegments("connected", modelName, display, compaction);
}

/** Compute total rendered width of status bar at given terminal width. */
function computeRenderedWidth(segments: StatusBarSegments, terminalWidth: number): number {
  const truncation = resolveTruncation(segments, terminalWidth);
  const leftText = buildTruncatedLeftText(segments, truncation);
  const rightText = truncation.showHint ? buildRightZoneText(segments) : "";
  const separator = rightText.length > 0 ? 3 : 0; // " │ "
  const padding = 2; // 1 left + 1 right
  return leftText.length + separator + rightText.length + padding;
}

// ---------------------------------------------------------------------------
// 1. Width-constraint tests for status bar at >=80 columns (MH5)
// ---------------------------------------------------------------------------

describe("Status bar width constraints at >=80 columns", () => {
  const WIDTHS = [80, 100, 120, 160, 200];
  const MODEL_NAMES = [
    "gpt-4o",
    "claude-3.5-sonnet",
    "claude-3.5-sonnet-20241022",
    "gemini-1.5-pro-latest",
    "meta-llama/llama-3.1-70b-instruct",
  ];

  for (const width of WIDTHS) {
    test(`no overlap at ${width} columns with standard model name`, () => {
      const segments = makeSegments("claude-3.5-sonnet");
      const rendered = computeRenderedWidth(segments, width);
      expect(rendered).toBeLessThanOrEqual(width);
    });
  }

  for (const modelName of MODEL_NAMES) {
    test(`no overlap at 80 columns with model "${modelName}"`, () => {
      const segments = makeSegments(modelName);
      const rendered = computeRenderedWidth(segments, 80);
      expect(rendered).toBeLessThanOrEqual(80);
    });
  }

  test("no overlap at 80 columns during streaming with token count", () => {
    const segments = makeSegments("claude-3.5-sonnet", "streaming", 1500);
    const rendered = computeRenderedWidth(segments, 80);
    expect(rendered).toBeLessThanOrEqual(80);
  });

  test("no overlap at 80 columns during complete with cost", () => {
    const segments = makeSegments("claude-3.5-sonnet", "complete", 0, "$0.0123");
    const rendered = computeRenderedWidth(segments, 80);
    expect(rendered).toBeLessThanOrEqual(80);
  });

  test("no overlap at 80 columns with compaction indicator active", () => {
    const segments = makeSegments("claude-3.5-sonnet", "idle", 0, null, true);
    const rendered = computeRenderedWidth(segments, 80);
    expect(rendered).toBeLessThanOrEqual(80);
  });

  test("no overlap at 80 columns with streaming + compaction combined", () => {
    const segments = makeSegments("claude-3.5-sonnet", "streaming", 500, null, true);
    const rendered = computeRenderedWidth(segments, 80);
    expect(rendered).toBeLessThanOrEqual(80);
  });

  test("all lifecycle statuses fit at 80 columns", () => {
    const statuses: ConversationLifecycleStatus[] = [
      "idle", "sending", "thinking", "streaming", "complete", "error",
    ];

    for (const status of statuses) {
      const segments = makeSegments("claude-3.5-sonnet", status, 999, status === "complete" ? "$0.05" : null);
      const rendered = computeRenderedWidth(segments, 80);
      expect(rendered).toBeLessThanOrEqual(80);
    }
  });

  test("truncation drops hint before heartbeat before lifecycle", () => {
    const segments = makeSegments("claude-3.5-sonnet-20241022", "streaming", 2000, null, true);

    // At very wide terminal, everything shows
    const wide = resolveTruncation(segments, 200);
    expect(wide.showHint).toBe(true);
    expect(wide.showHeartbeat).toBe(true);
    expect(wide.showLifecycle).toBe(true);

    // At 80 columns with long content, truncation kicks in
    const at80 = resolveTruncation(segments, 80);
    // Hint should be dropped before heartbeat
    if (!at80.showHint && at80.showHeartbeat) {
      expect(at80.showLifecycle).toBe(true);
    }
    // If heartbeat is also dropped, lifecycle may still be present
    if (!at80.showHeartbeat && at80.showLifecycle) {
      expect(at80.showHint).toBe(false);
    }

    // Regardless of truncation, rendered width fits
    const rendered = computeRenderedWidth(segments, 80);
    expect(rendered).toBeLessThanOrEqual(80);
  });

  test("zone separator only appears when right zone has content", () => {
    const segments = makeSegments("claude-3.5-sonnet");

    // Wide terminal: both zones present
    const wideTruncation = resolveTruncation(segments, 200);
    expect(wideTruncation.showHint).toBe(true);

    // Very narrow: hint dropped
    const narrowTruncation = resolveTruncation(segments, 50);
    expect(narrowTruncation.showHint).toBe(false);
  });

  test("model name is always visible regardless of width", () => {
    const modelName = "claude-3.5-sonnet";
    const segments = makeSegments(modelName);

    for (const width of [30, 50, 80, 120]) {
      const truncation = resolveTruncation(segments, width);
      const leftText = buildTruncatedLeftText(segments, truncation);
      expect(leftText).toContain(modelName);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Theme coverage tests for logo/status readability (MH1, MH2)
// ---------------------------------------------------------------------------

describe("Theme coverage: all built-in themes produce valid tokens", () => {
  test("all three built-in themes pass schema validation", () => {
    for (const [name, source] of Object.entries(ALL_THEMES)) {
      const result = validateThemeTokens(source);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Theme '${name}' failed validation: ${result.error.length} errors`);
      }
    }
  });

  test("all themes define every required token", () => {
    for (const [name, source] of Object.entries(ALL_THEMES)) {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${name}' invalid`);

      for (const tokenName of THEME_TOKEN_NAMES) {
        expect(result.value[tokenName]).toBeDefined();
        expect(result.value[tokenName]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("all themes have valid 256-color fallbacks for every token", () => {
    for (const [name, source] of Object.entries(ALL_THEMES)) {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${name}' invalid`);

      const fallback = resolveTheme256(result.value);
      for (const tokenName of THEME_TOKEN_NAMES) {
        const index = fallback[tokenName];
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(16);
        expect(index).toBeLessThanOrEqual(255);
      }
    }
  });

  test("theme registry loads all three themes successfully", () => {
    const registryResult = createThemeRegistry();
    expect(registryResult.ok).toBe(true);
    if (!registryResult.ok) throw new Error("Registry creation failed");

    const registry = registryResult.value;
    const themes = registry.listThemes().sort();
    expect(themes).toEqual(["reins-dark", "reins-light", "tokyonight"]);
  });

  test("theme registry can switch to each theme and back", () => {
    const registryResult = createThemeRegistry();
    if (!registryResult.ok) throw new Error("Registry creation failed");

    const registry = registryResult.value;

    for (const themeName of BUILTIN_THEME_NAMES) {
      const switchResult = registry.setTheme(themeName);
      expect(switchResult.ok).toBe(true);
      expect(registry.getActiveThemeName()).toBe(themeName);
      expect(registry.getTheme().name).toBe(themeName);
    }
  });
});

describe("Theme coverage: logo readability across themes", () => {
  const LOGO_TOKEN: ThemeTokenName = "glyph.reins";
  const FALLBACK_TOKEN: ThemeTokenName = "accent.primary";
  const TAGLINE_TOKEN: ThemeTokenName = "text.muted";
  const BG_TOKEN: ThemeTokenName = "surface.primary";

  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: logo color token (glyph.reins) is defined and valid hex`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const logoColor = result.value[LOGO_TOKEN];
      expect(logoColor).toBeDefined();
      expect(logoColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    test(`${themeName}: logo color differs from background (readable)`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const logoColor = result.value[LOGO_TOKEN];
      const bgColor = result.value[BG_TOKEN];
      expect(logoColor).not.toBe(bgColor);
    });

    test(`${themeName}: fallback accent.primary differs from background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const accentColor = result.value[FALLBACK_TOKEN];
      const bgColor = result.value[BG_TOKEN];
      expect(accentColor).not.toBe(bgColor);
    });

    test(`${themeName}: tagline color (text.muted) differs from background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const taglineColor = result.value[TAGLINE_TOKEN];
      const bgColor = result.value[BG_TOKEN];
      expect(taglineColor).not.toBe(bgColor);
    });
  }

  test("logo renders in all variants and sizes with non-empty content", () => {
    const variants: LogoVariant[] = ["standard", "sad"];
    const sizes: LogoSize[] = ["full", "compact"];

    for (const variant of variants) {
      for (const size of sizes) {
        const lines = getLogoLines(variant, size);
        expect(lines.length).toBeGreaterThan(0);

        // Every line has content
        for (const line of lines) {
          expect(line.length).toBeGreaterThan(0);
        }

        // Contains REINS branding
        const hasReins = lines.some((l) => l.includes("REINS"));
        expect(hasReins).toBe(true);
      }
    }
  });

  test("full logo fits within reasonable terminal width for all themes", () => {
    const fullWidth = getLogoWidth("standard", "full");
    // Logo should fit in terminals as narrow as 40 columns
    expect(fullWidth).toBeLessThan(40);
  });

  test("compact logo fits within narrow terminals", () => {
    const compactWidth = getLogoWidth("standard", "compact");
    expect(compactWidth).toBeLessThan(20);
  });
});

describe("Theme coverage: status bar readability across themes", () => {
  // Tokens used by the status bar that must be readable
  const STATUS_TOKENS: ThemeTokenName[] = [
    "status.success",
    "status.warning",
    "status.info",
    "status.error",
    "text.primary",
    "text.muted",
    "glyph.heartbeat",
    "surface.primary",
  ];

  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: all status bar tokens are defined`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      for (const tokenName of STATUS_TOKENS) {
        expect(result.value[tokenName]).toBeDefined();
        expect(result.value[tokenName]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    test(`${themeName}: status colors differ from background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const bg = result.value["surface.primary"];
      const statusTokens: ThemeTokenName[] = [
        "status.success",
        "status.warning",
        "status.info",
        "status.error",
      ];

      for (const token of statusTokens) {
        expect(result.value[token]).not.toBe(bg);
      }
    });

    test(`${themeName}: text.primary differs from surface.primary`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      expect(result.value["text.primary"]).not.toBe(result.value["surface.primary"]);
    });

    test(`${themeName}: heartbeat glyph color differs from background`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      expect(result.value["glyph.heartbeat"]).not.toBe(result.value["surface.primary"]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Framed layout zone resilience across themes and breakpoints (MH3, MH6)
// ---------------------------------------------------------------------------

describe("Framed layout zone resilience across themes", () => {
  const DEPTH_TOKENS: ThemeTokenName[] = [
    "depth.panel1",
    "depth.panel2",
    "depth.panel3",
    "depth.interactive",
  ];

  const ROLE_BORDER_TOKENS: ThemeTokenName[] = [
    "role.user.border",
    "role.assistant.border",
    "role.system.border",
  ];

  const ZONE_SURFACE_TOKENS: ThemeTokenName[] = [
    "surface.primary",
    "surface.secondary",
    "surface.elevated",
    "sidebar.bg",
    "input.bg",
    "conversation.user.bg",
    "conversation.assistant.bg",
  ];

  for (const [themeName, source] of Object.entries(ALL_THEMES)) {
    test(`${themeName}: all depth tokens are defined and valid hex`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      for (const token of DEPTH_TOKENS) {
        expect(result.value[token]).toBeDefined();
        expect(result.value[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    test(`${themeName}: all role border tokens are defined and valid hex`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      for (const token of ROLE_BORDER_TOKENS) {
        expect(result.value[token]).toBeDefined();
        expect(result.value[token]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    test(`${themeName}: depth tokens differ from surface.primary (visible layering)`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const bg = result.value["surface.primary"];
      // At least panel2 and panel3 should differ from primary background
      // to create visible depth layering
      const distinctDepthTokens = DEPTH_TOKENS.filter(
        (token) => result.value[token] !== bg,
      );
      expect(distinctDepthTokens.length).toBeGreaterThanOrEqual(2);
    });

    test(`${themeName}: role border tokens differ from surface.primary (visible framing)`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const bg = result.value["surface.primary"];
      for (const token of ROLE_BORDER_TOKENS) {
        expect(result.value[token]).not.toBe(bg);
      }
    });

    test(`${themeName}: role border tokens are mutually distinguishable`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const userBorder = result.value["role.user.border"];
      const assistantBorder = result.value["role.assistant.border"];
      // User and assistant borders should differ for role distinction
      expect(userBorder).not.toBe(assistantBorder);
    });

    test(`${themeName}: zone surfaces create at least 3 distinct background layers`, () => {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error(`Theme '${themeName}' invalid`);

      const uniqueSurfaces = new Set(
        ZONE_SURFACE_TOKENS.map((token) => result.value[token]),
      );
      // Need at least 3 distinct backgrounds for clear zone separation
      expect(uniqueSurfaces.size).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("Framed layout zone structure across breakpoints", () => {
  const BANDS_WITH_WIDTHS: { band: BreakpointBand; width: number }[] = [
    { band: "compact", width: 40 },
    { band: "narrow", width: 80 },
    { band: "standard", width: 140 },
    { band: "wide", width: 200 },
  ];

  for (const { band, width } of BANDS_WITH_WIDTHS) {
    test(`${band} (${width} cols): zone structure is valid for framed layout`, () => {
      const state = resolveBreakpointState(width, "normal");
      const { panelWidths } = state;

      // Conversation zone always has room for framed content (border + padding + text)
      // Minimum: 2 border chars + 2 padding chars + 10 text chars = 14
      expect(panelWidths.conversation).toBeGreaterThanOrEqual(14);

      // If sidebar is visible, it must have room for framed sections
      if (panelWidths.sidebar > 0) {
        // Minimum: 2 border + 2 padding + 8 text = 12
        expect(panelWidths.sidebar).toBeGreaterThanOrEqual(12);
      }

      // If activity panel is visible, it must have room for content
      if (panelWidths.activity > 0) {
        expect(panelWidths.activity).toBeGreaterThanOrEqual(12);
      }
    });

    test(`${band} (${width} cols): total panel allocation leaves no negative remainder`, () => {
      const state = resolveBreakpointState(width, "normal");
      const { panelWidths } = state;
      const total =
        panelWidths.sidebar +
        panelWidths.conversation +
        panelWidths.activity +
        panelWidths.expanded;
      expect(total).toBeLessThanOrEqual(width);
      expect(total).toBeGreaterThan(0);
    });
  }

  test("framed content fits at minimum compact width (20 cols)", () => {
    const state = resolveBreakpointState(20, "zen");
    expect(state.band).toBe("compact");
    expect(state.panelWidths.conversation).toBe(20);
    // Even at 20 cols, conversation gets full width for framed blocks
    expect(state.panelWidths.conversation).toBeGreaterThanOrEqual(14);
  });

  test("all four bands produce distinct zone configurations", () => {
    const configs = BANDS_WITH_WIDTHS.map(({ band, width }) => {
      const state = resolveBreakpointState(width, "normal");
      return {
        band: state.band,
        hasSidebar: state.panelWidths.sidebar > 0,
        hasActivity: state.panelWidths.activity > 0,
        hasExpanded: state.panelWidths.expanded > 0,
      };
    });

    // compact: no sidebar, no activity, no expanded
    expect(configs[0]).toEqual({
      band: "compact",
      hasSidebar: false,
      hasActivity: false,
      hasExpanded: false,
    });

    // narrow: sidebar, no activity, no expanded
    expect(configs[1]).toEqual({
      band: "narrow",
      hasSidebar: true,
      hasActivity: false,
      hasExpanded: false,
    });

    // standard: sidebar + activity, no expanded
    expect(configs[2]).toEqual({
      band: "standard",
      hasSidebar: true,
      hasActivity: true,
      hasExpanded: false,
    });

    // wide: sidebar + activity + expanded
    expect(configs[3]).toEqual({
      band: "wide",
      hasSidebar: true,
      hasActivity: true,
      hasExpanded: true,
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Cross-theme token consistency tests (MH1, MH6)
// ---------------------------------------------------------------------------

describe("Cross-theme token consistency", () => {
  test("all themes have identical token key sets", () => {
    const tokenSets: string[][] = [];

    for (const source of Object.values(ALL_THEMES)) {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error("Theme invalid");
      tokenSets.push(Object.keys(result.value).sort());
    }

    // All themes should have the same keys
    for (let i = 1; i < tokenSets.length; i++) {
      expect(tokenSets[i]).toEqual(tokenSets[0]);
    }
  });

  test("dark and light themes differ substantially", () => {
    const darkResult = validateThemeTokens(reinsDarkTheme);
    const lightResult = validateThemeTokens(reinsLightTheme);
    if (!darkResult.ok || !lightResult.ok) throw new Error("Theme invalid");

    let differences = 0;
    for (const token of THEME_TOKEN_NAMES) {
      if (darkResult.value[token] !== lightResult.value[token]) {
        differences++;
      }
    }

    // At least half the tokens should differ between dark and light
    expect(differences).toBeGreaterThan(THEME_TOKEN_NAMES.length / 2);
  });

  test("tokyonight differs from reins-dark", () => {
    const darkResult = validateThemeTokens(reinsDarkTheme);
    const tokyoResult = validateThemeTokens(tokyonightTheme);
    if (!darkResult.ok || !tokyoResult.ok) throw new Error("Theme invalid");

    let differences = 0;
    for (const token of THEME_TOKEN_NAMES) {
      if (darkResult.value[token] !== tokyoResult.value[token]) {
        differences++;
      }
    }

    // Themes should be visually distinct
    expect(differences).toBeGreaterThan(THEME_TOKEN_NAMES.length / 3);
  });

  test("each theme has unique surface.primary (distinct background)", () => {
    const backgrounds = new Set<string>();
    for (const source of Object.values(ALL_THEMES)) {
      const result = validateThemeTokens(source);
      if (!result.ok) throw new Error("Theme invalid");
      backgrounds.add(result.value["surface.primary"]);
    }

    // All three themes should have different backgrounds
    expect(backgrounds.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 5. Status bar indicator display at various widths (MH5)
// ---------------------------------------------------------------------------

describe("Status bar indicator display at various widths", () => {
  test("disconnected status shows Offline label", () => {
    const display = resolveLifecycleDisplay("idle", 0, null);
    const segments = buildSegments("disconnected", "claude-3.5-sonnet", display, false);
    expect(segments.connection).toContain("Offline");
  });

  test("connecting status shows Connecting label", () => {
    const display = resolveLifecycleDisplay("idle", 0, null);
    const segments = buildSegments("connecting", "claude-3.5-sonnet", display, false);
    expect(segments.connection).toContain("Connecting");
  });

  test("compaction indicator coexists with all lifecycle states at 120 columns", () => {
    const statuses: ConversationLifecycleStatus[] = [
      "idle", "sending", "thinking", "streaming", "complete", "error",
    ];

    for (const status of statuses) {
      const segments = makeSegments("claude-3.5-sonnet", status, 100, null, true);
      const rendered = computeRenderedWidth(segments, 120);
      expect(rendered).toBeLessThanOrEqual(120);
      expect(segments.lifecycle).toContain("⚡ Compacted");
    }
  });

  test("very long model names trigger graceful truncation", () => {
    const longModel = "organization/team/very-long-model-name-with-version-v2.1.0-beta";
    const segments = makeSegments(longModel);

    // At 80 columns, truncation should kick in
    const truncation = resolveTruncation(segments, 80);
    const leftText = buildTruncatedLeftText(segments, truncation);

    // Model name is always present
    expect(leftText).toContain(longModel);

    // Total rendered width respects terminal width
    const rendered = computeRenderedWidth(segments, 80);
    expect(rendered).toBeLessThanOrEqual(80);
  });

  test("minimum viable display at 40 columns shows connection and model", () => {
    const segments = makeSegments("gpt-4o");
    const truncation = resolveTruncation(segments, 40);
    const leftText = buildTruncatedLeftText(segments, truncation);

    expect(leftText).toContain("gpt-4o");
    expect(leftText).toContain("Connected");
  });
});
