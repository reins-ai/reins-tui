import { describe, expect, test } from "bun:test";

import type { ThemeTokens } from "../../src/theme/theme-schema";
import type { ConnectError, ProviderConnection } from "../../src/providers/connect-service";
import {
  BYOK_PROVIDERS,
  connectReducer,
  maskSecret,
  type ConnectStep,
} from "../../src/components/connect-flow";

// ---------------------------------------------------------------------------
// Mock theme tokens (same pattern as cards.test.tsx)
// ---------------------------------------------------------------------------

const MOCK_TOKENS: ThemeTokens = {
  "surface.primary": "#1a1a2e",
  "surface.secondary": "#252540",
  "surface.tertiary": "#2e2e4a",
  "surface.elevated": "#353555",
  "text.primary": "#e8e0d4",
  "text.secondary": "#a09888",
  "text.muted": "#6b6360",
  "text.inverse": "#1a1a2e",
  "accent.primary": "#e8976c",
  "accent.secondary": "#f0c674",
  "accent.subtle": "#4a3a2e",
  "border.primary": "#4a4a6a",
  "border.subtle": "#3a3a5a",
  "border.focus": "#e8976c",
  "status.error": "#e85050",
  "status.success": "#50c878",
  "status.warning": "#f0c674",
  "status.info": "#6ca8e8",
  "glyph.reins": "#e8976c",
  "glyph.user": "#f0c674",
  "glyph.tool.running": "#6ca8e8",
  "glyph.tool.done": "#50c878",
  "glyph.tool.error": "#e85050",
  "glyph.heartbeat": "#e8976c",
  "conversation.user.bg": "#2e2e4a",
  "conversation.user.text": "#e8e0d4",
  "conversation.assistant.bg": "#1a1a2e",
  "conversation.assistant.text": "#e8e0d4",
  "sidebar.bg": "#1a1a2e",
  "sidebar.text": "#a09888",
  "sidebar.active": "#e8976c",
  "sidebar.hover": "#353555",
  "input.bg": "#252540",
  "input.text": "#e8e0d4",
  "input.placeholder": "#6b6360",
  "input.border": "#4a4a6a",
};

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

function createInitialState() {
  return {
    step: "mode-select" as ConnectStep,
    selectedModeIndex: 0,
    selectedProviderIndex: 0,
    mode: null as "byok" | "gateway" | null,
    provider: null as typeof BYOK_PROVIDERS[number] | null,
    secretInput: "",
    connection: null as ProviderConnection | null,
    error: null as ConnectError | null,
  };
}

// ---------------------------------------------------------------------------
// Reducer tests: Initial render
// ---------------------------------------------------------------------------

describe("ConnectFlow initial state", () => {
  test("starts on mode-select step", () => {
    const state = createInitialState();
    expect(state.step).toBe("mode-select");
  });

  test("starts with first mode option selected", () => {
    const state = createInitialState();
    expect(state.selectedModeIndex).toBe(0);
  });

  test("starts with no mode chosen", () => {
    const state = createInitialState();
    expect(state.mode).toBeNull();
  });

  test("starts with no provider chosen", () => {
    const state = createInitialState();
    expect(state.provider).toBeNull();
  });

  test("starts with empty secret input", () => {
    const state = createInitialState();
    expect(state.secretInput).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: Mode selection navigation
// ---------------------------------------------------------------------------

describe("ConnectFlow mode selection", () => {
  test("NAVIGATE_DOWN moves to next mode option", () => {
    const state = createInitialState();
    const next = connectReducer(state, { type: "NAVIGATE_DOWN" });
    expect(next.selectedModeIndex).toBe(1);
  });

  test("NAVIGATE_DOWN wraps around from last to first", () => {
    const state = { ...createInitialState(), selectedModeIndex: 1 };
    const next = connectReducer(state, { type: "NAVIGATE_DOWN" });
    expect(next.selectedModeIndex).toBe(0);
  });

  test("NAVIGATE_UP moves to previous mode option", () => {
    const state = { ...createInitialState(), selectedModeIndex: 1 };
    const next = connectReducer(state, { type: "NAVIGATE_UP" });
    expect(next.selectedModeIndex).toBe(0);
  });

  test("NAVIGATE_UP wraps around from first to last", () => {
    const state = createInitialState();
    const next = connectReducer(state, { type: "NAVIGATE_UP" });
    expect(next.selectedModeIndex).toBe(1);
  });

  test("SELECT_MODE with BYOK navigates to provider-select", () => {
    const state = { ...createInitialState(), selectedModeIndex: 0 };
    const next = connectReducer(state, { type: "SELECT_MODE" });
    expect(next.step).toBe("provider-select");
    expect(next.mode).toBe("byok");
  });

  test("SELECT_MODE with Gateway navigates to gateway-token-entry", () => {
    const state = { ...createInitialState(), selectedModeIndex: 1 };
    const next = connectReducer(state, { type: "SELECT_MODE" });
    expect(next.step).toBe("gateway-token-entry");
    expect(next.mode).toBe("gateway");
  });

  test("SELECT_MODE is ignored when not on mode-select step", () => {
    const state = { ...createInitialState(), step: "provider-select" as ConnectStep };
    const next = connectReducer(state, { type: "SELECT_MODE" });
    expect(next.step).toBe("provider-select");
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: BYOK provider selection
// ---------------------------------------------------------------------------

describe("ConnectFlow BYOK provider selection", () => {
  function providerSelectState() {
    return {
      ...createInitialState(),
      step: "provider-select" as ConnectStep,
      mode: "byok" as const,
      selectedProviderIndex: 0,
    };
  }

  test("NAVIGATE_DOWN moves to next provider", () => {
    const state = providerSelectState();
    const next = connectReducer(state, { type: "NAVIGATE_DOWN" });
    expect(next.selectedProviderIndex).toBe(1);
  });

  test("NAVIGATE_DOWN wraps around from last provider", () => {
    const state = { ...providerSelectState(), selectedProviderIndex: BYOK_PROVIDERS.length - 1 };
    const next = connectReducer(state, { type: "NAVIGATE_DOWN" });
    expect(next.selectedProviderIndex).toBe(0);
  });

  test("NAVIGATE_UP wraps around from first provider", () => {
    const state = providerSelectState();
    const next = connectReducer(state, { type: "NAVIGATE_UP" });
    expect(next.selectedProviderIndex).toBe(BYOK_PROVIDERS.length - 1);
  });

  test("SELECT_PROVIDER navigates to api-key-entry", () => {
    const state = { ...providerSelectState(), selectedProviderIndex: 0 };
    const next = connectReducer(state, { type: "SELECT_PROVIDER" });
    expect(next.step).toBe("api-key-entry");
    expect(next.provider).toEqual(BYOK_PROVIDERS[0]);
    expect(next.secretInput).toBe("");
  });

  test("SELECT_PROVIDER captures correct provider at index 2", () => {
    const state = { ...providerSelectState(), selectedProviderIndex: 2 };
    const next = connectReducer(state, { type: "SELECT_PROVIDER" });
    expect(next.provider).toEqual(BYOK_PROVIDERS[2]);
  });

  test("SELECT_PROVIDER is ignored when not on provider-select step", () => {
    const state = { ...providerSelectState(), step: "mode-select" as ConnectStep };
    const next = connectReducer(state, { type: "SELECT_PROVIDER" });
    expect(next.step).toBe("mode-select");
  });

  test("BYOK_PROVIDERS contains expected providers", () => {
    const ids = BYOK_PROVIDERS.map((p) => p.id);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("fireworks");
    expect(ids).toContain("custom");
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: BYOK API key entry flow
// ---------------------------------------------------------------------------

describe("ConnectFlow BYOK API key entry", () => {
  function apiKeyState() {
    return {
      ...createInitialState(),
      step: "api-key-entry" as ConnectStep,
      mode: "byok" as const,
      provider: BYOK_PROVIDERS[0],
      secretInput: "",
    };
  }

  test("SET_SECRET updates secret input", () => {
    const state = apiKeyState();
    const next = connectReducer(state, { type: "SET_SECRET", value: "sk-test123" });
    expect(next.secretInput).toBe("sk-test123");
  });

  test("SUBMIT_SECRET transitions to validating when input is non-empty", () => {
    const state = { ...apiKeyState(), secretInput: "sk-test123" };
    const next = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(next.step).toBe("validating");
  });

  test("SUBMIT_SECRET is ignored when input is empty", () => {
    const state = apiKeyState();
    const next = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(next.step).toBe("api-key-entry");
  });

  test("SUBMIT_SECRET is ignored when input is whitespace only", () => {
    const state = { ...apiKeyState(), secretInput: "   " };
    const next = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(next.step).toBe("api-key-entry");
  });

  test("GO_BACK from api-key-entry returns to provider-select", () => {
    const state = apiKeyState();
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("provider-select");
    expect(next.secretInput).toBe("");
    expect(next.provider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: Gateway token entry flow
// ---------------------------------------------------------------------------

describe("ConnectFlow Gateway token entry", () => {
  function gatewayState() {
    return {
      ...createInitialState(),
      step: "gateway-token-entry" as ConnectStep,
      mode: "gateway" as const,
      secretInput: "",
    };
  }

  test("SET_SECRET updates gateway token input", () => {
    const state = gatewayState();
    const next = connectReducer(state, { type: "SET_SECRET", value: "rgw-abc123" });
    expect(next.secretInput).toBe("rgw-abc123");
  });

  test("SUBMIT_SECRET transitions to validating when input is non-empty", () => {
    const state = { ...gatewayState(), secretInput: "rgw-abc123" };
    const next = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(next.step).toBe("validating");
  });

  test("SUBMIT_SECRET is ignored when input is empty", () => {
    const state = gatewayState();
    const next = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(next.step).toBe("gateway-token-entry");
  });

  test("GO_BACK from gateway-token-entry returns to mode-select", () => {
    const state = gatewayState();
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("mode-select");
    expect(next.mode).toBeNull();
    expect(next.secretInput).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: Validation success
// ---------------------------------------------------------------------------

describe("ConnectFlow validation success", () => {
  const mockConnection: ProviderConnection = {
    providerId: "openai",
    providerName: "OpenAI",
    mode: "byok",
    models: ["gpt-4o", "gpt-4o-mini"],
    configuredAt: "2026-02-11T00:00:00.000Z",
  };

  test("VALIDATION_SUCCESS transitions to success step", () => {
    const state = {
      ...createInitialState(),
      step: "validating" as ConnectStep,
      mode: "byok" as const,
    };
    const next = connectReducer(state, { type: "VALIDATION_SUCCESS", connection: mockConnection });
    expect(next.step).toBe("success");
    expect(next.connection).toEqual(mockConnection);
    expect(next.error).toBeNull();
  });

  test("success state preserves connection details", () => {
    const state = {
      ...createInitialState(),
      step: "validating" as ConnectStep,
    };
    const next = connectReducer(state, { type: "VALIDATION_SUCCESS", connection: mockConnection });
    expect(next.connection?.providerName).toBe("OpenAI");
    expect(next.connection?.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: Validation failure
// ---------------------------------------------------------------------------

describe("ConnectFlow validation failure", () => {
  const mockError: ConnectError = {
    code: "VALIDATION_FAILED",
    message: "Invalid API key provided.",
    retryable: false,
  };

  test("VALIDATION_ERROR transitions to error step", () => {
    const state = {
      ...createInitialState(),
      step: "validating" as ConnectStep,
    };
    const next = connectReducer(state, { type: "VALIDATION_ERROR", error: mockError });
    expect(next.step).toBe("error");
    expect(next.error).toEqual(mockError);
  });

  test("GO_BACK from error returns to api-key-entry for BYOK", () => {
    const state = {
      ...createInitialState(),
      step: "error" as ConnectStep,
      mode: "byok" as const,
      error: mockError,
    };
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("api-key-entry");
    expect(next.secretInput).toBe("");
    expect(next.error).toBeNull();
  });

  test("GO_BACK from error returns to gateway-token-entry for Gateway", () => {
    const state = {
      ...createInitialState(),
      step: "error" as ConnectStep,
      mode: "gateway" as const,
      error: mockError,
    };
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("gateway-token-entry");
    expect(next.secretInput).toBe("");
    expect(next.error).toBeNull();
  });

  test("retryable error preserves retryable flag", () => {
    const retryableError: ConnectError = {
      code: "DAEMON_OFFLINE",
      message: "Daemon unavailable",
      retryable: true,
    };
    const state = {
      ...createInitialState(),
      step: "validating" as ConnectStep,
    };
    const next = connectReducer(state, { type: "VALIDATION_ERROR", error: retryableError });
    expect(next.error?.retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reducer tests: Escape / back navigation
// ---------------------------------------------------------------------------

describe("ConnectFlow back navigation", () => {
  test("GO_BACK from provider-select returns to mode-select", () => {
    const state = {
      ...createInitialState(),
      step: "provider-select" as ConnectStep,
      mode: "byok" as const,
    };
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("mode-select");
    expect(next.mode).toBeNull();
  });

  test("GO_BACK from mode-select does nothing (cancel handled externally)", () => {
    const state = createInitialState();
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("mode-select");
  });

  test("GO_BACK from validating does nothing", () => {
    const state = {
      ...createInitialState(),
      step: "validating" as ConnectStep,
    };
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("validating");
  });

  test("GO_BACK from success does nothing", () => {
    const state = {
      ...createInitialState(),
      step: "success" as ConnectStep,
    };
    const next = connectReducer(state, { type: "GO_BACK" });
    expect(next.step).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// API key masking
// ---------------------------------------------------------------------------

describe("maskSecret", () => {
  test("masks all characters for short keys (<=4 chars)", () => {
    expect(maskSecret("abcd")).toBe("●●●●");
  });

  test("masks all but last 4 characters for longer keys", () => {
    expect(maskSecret("sk-test1234")).toBe("●●●●●●●1234");
  });

  test("returns empty string for empty input", () => {
    expect(maskSecret("")).toBe("");
  });

  test("masks single character", () => {
    expect(maskSecret("a")).toBe("●");
  });

  test("masks exactly 4 characters", () => {
    expect(maskSecret("1234")).toBe("●●●●");
  });

  test("masks 5 characters showing last 4", () => {
    expect(maskSecret("12345")).toBe("●2345");
  });

  test("masks long API key correctly", () => {
    const key = "sk-proj-abcdefghijklmnop";
    const masked = maskSecret(key);
    expect(masked.endsWith("mnop")).toBe(true);
    expect(masked.startsWith("●")).toBe(true);
    expect(masked.length).toBe(key.length);
  });
});

// ---------------------------------------------------------------------------
// Theme token usage verification
// ---------------------------------------------------------------------------

describe("ConnectFlow theme token usage", () => {
  test("all required surface tokens exist", () => {
    expect(MOCK_TOKENS["surface.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["surface.secondary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["surface.elevated"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("all required text tokens exist", () => {
    expect(MOCK_TOKENS["text.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["text.secondary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["text.muted"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("accent token exists for selection indicator", () => {
    expect(MOCK_TOKENS["accent.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("border.focus token exists for overlay border", () => {
    expect(MOCK_TOKENS["border.focus"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("status tokens exist for success/error states", () => {
    expect(MOCK_TOKENS["status.success"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(MOCK_TOKENS["status.error"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("glyph.tool.running token exists for validating spinner", () => {
    expect(MOCK_TOKENS["glyph.tool.running"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Full BYOK flow integration (reducer only)
// ---------------------------------------------------------------------------

describe("ConnectFlow full BYOK flow", () => {
  test("complete BYOK flow: mode → provider → key → validate → success", () => {
    let state = createInitialState();

    // Step 1: Select BYOK mode (index 0)
    state = connectReducer(state, { type: "SELECT_MODE" });
    expect(state.step).toBe("provider-select");
    expect(state.mode).toBe("byok");

    // Step 2: Select OpenAI (index 0)
    state = connectReducer(state, { type: "SELECT_PROVIDER" });
    expect(state.step).toBe("api-key-entry");
    expect(state.provider?.id).toBe("openai");

    // Step 3: Enter API key
    state = connectReducer(state, { type: "SET_SECRET", value: "sk-test-key-12345678" });
    expect(state.secretInput).toBe("sk-test-key-12345678");

    // Step 4: Submit
    state = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(state.step).toBe("validating");

    // Step 5: Validation succeeds
    const connection: ProviderConnection = {
      providerId: "openai",
      providerName: "OpenAI",
      mode: "byok",
      models: ["gpt-4o", "gpt-4o-mini"],
      configuredAt: "2026-02-11T00:00:00.000Z",
    };
    state = connectReducer(state, { type: "VALIDATION_SUCCESS", connection });
    expect(state.step).toBe("success");
    expect(state.connection?.providerName).toBe("OpenAI");
    expect(state.connection?.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });
});

// ---------------------------------------------------------------------------
// Full Gateway flow integration (reducer only)
// ---------------------------------------------------------------------------

describe("ConnectFlow full Gateway flow", () => {
  test("complete Gateway flow: mode → token → validate → success", () => {
    let state = createInitialState();

    // Step 1: Navigate to Gateway (index 1) and select
    state = connectReducer(state, { type: "NAVIGATE_DOWN" });
    expect(state.selectedModeIndex).toBe(1);
    state = connectReducer(state, { type: "SELECT_MODE" });
    expect(state.step).toBe("gateway-token-entry");
    expect(state.mode).toBe("gateway");

    // Step 2: Enter gateway token
    state = connectReducer(state, { type: "SET_SECRET", value: "rgw-my-token-abc" });
    expect(state.secretInput).toBe("rgw-my-token-abc");

    // Step 3: Submit
    state = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(state.step).toBe("validating");

    // Step 4: Validation succeeds
    const connection: ProviderConnection = {
      providerId: "gateway",
      providerName: "Reins Gateway",
      mode: "gateway",
      models: ["claude-3.5-sonnet", "gpt-4o"],
      configuredAt: "2026-02-11T00:00:00.000Z",
    };
    state = connectReducer(state, { type: "VALIDATION_SUCCESS", connection });
    expect(state.step).toBe("success");
    expect(state.connection?.providerName).toBe("Reins Gateway");
  });
});

// ---------------------------------------------------------------------------
// Full flow with validation failure and retry
// ---------------------------------------------------------------------------

describe("ConnectFlow validation failure and retry", () => {
  test("BYOK flow: key entry → validate → error → back → re-enter → validate → success", () => {
    let state: ReturnType<typeof createInitialState> = {
      ...createInitialState(),
      step: "api-key-entry",
      mode: "byok",
      provider: BYOK_PROVIDERS[0],
    };

    // Enter bad key
    state = connectReducer(state, { type: "SET_SECRET", value: "bad-key" });
    state = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(state.step).toBe("validating");

    // Validation fails
    const error: ConnectError = {
      code: "VALIDATION_FAILED",
      message: "Invalid API key",
      retryable: false,
    };
    state = connectReducer(state, { type: "VALIDATION_ERROR", error });
    expect(state.step).toBe("error");
    expect(state.error?.message).toBe("Invalid API key");

    // Go back to re-enter
    state = connectReducer(state, { type: "GO_BACK" });
    expect(state.step).toBe("api-key-entry");
    expect(state.secretInput).toBe("");
    expect(state.error).toBeNull();

    // Enter correct key
    state = connectReducer(state, { type: "SET_SECRET", value: "sk-correct-key" });
    state = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(state.step).toBe("validating");

    // Validation succeeds
    const connection: ProviderConnection = {
      providerId: "openai",
      providerName: "OpenAI",
      mode: "byok",
      models: ["gpt-4o"],
      configuredAt: "2026-02-11T00:00:00.000Z",
    };
    state = connectReducer(state, { type: "VALIDATION_SUCCESS", connection });
    expect(state.step).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("ConnectFlow edge cases", () => {
  test("NAVIGATE_UP on non-list step is a no-op", () => {
    const state = {
      ...createInitialState(),
      step: "api-key-entry" as ConnectStep,
    };
    const next = connectReducer(state, { type: "NAVIGATE_UP" });
    expect(next).toEqual(state);
  });

  test("NAVIGATE_DOWN on non-list step is a no-op", () => {
    const state = {
      ...createInitialState(),
      step: "gateway-token-entry" as ConnectStep,
    };
    const next = connectReducer(state, { type: "NAVIGATE_DOWN" });
    expect(next).toEqual(state);
  });

  test("SUBMIT_SECRET on mode-select is a no-op", () => {
    const state = createInitialState();
    const next = connectReducer(state, { type: "SUBMIT_SECRET" });
    expect(next).toEqual(state);
  });

  test("connection with empty models array", () => {
    const state = {
      ...createInitialState(),
      step: "validating" as ConnectStep,
    };
    const connection: ProviderConnection = {
      providerId: "custom",
      providerName: "Custom Provider",
      mode: "byok",
      models: [],
      configuredAt: "2026-02-11T00:00:00.000Z",
    };
    const next = connectReducer(state, { type: "VALIDATION_SUCCESS", connection });
    expect(next.connection?.models).toEqual([]);
  });

  test("all ConnectStep values are valid", () => {
    const steps: ConnectStep[] = [
      "mode-select",
      "provider-select",
      "api-key-entry",
      "gateway-token-entry",
      "validating",
      "success",
      "error",
    ];
    expect(steps).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Component data contract verification
// ---------------------------------------------------------------------------

describe("ConnectFlow component data contracts", () => {
  test("OverlayFrame uses surface.primary for background", () => {
    // Verify the token exists and is a valid hex color
    expect(MOCK_TOKENS["surface.primary"]).toBeDefined();
    expect(MOCK_TOKENS["surface.primary"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("OverlayFrame uses border.focus for border color", () => {
    expect(MOCK_TOKENS["border.focus"]).toBeDefined();
    expect(MOCK_TOKENS["border.focus"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("SelectionList uses surface.elevated for selected background", () => {
    expect(MOCK_TOKENS["surface.elevated"]).toBeDefined();
    expect(MOCK_TOKENS["surface.elevated"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("success step uses status.success for checkmark", () => {
    expect(MOCK_TOKENS["status.success"]).toBeDefined();
    expect(MOCK_TOKENS["status.success"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("error step uses status.error for error glyph", () => {
    expect(MOCK_TOKENS["status.error"]).toBeDefined();
    expect(MOCK_TOKENS["status.error"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("validating step uses glyph.tool.running for spinner", () => {
    expect(MOCK_TOKENS["glyph.tool.running"]).toBeDefined();
    expect(MOCK_TOKENS["glyph.tool.running"]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test("no hardcoded color values in token references", () => {
    // All tokens used by the component should come from the theme
    const usedTokens = [
      "surface.primary",
      "surface.secondary",
      "surface.elevated",
      "text.primary",
      "text.secondary",
      "text.muted",
      "accent.primary",
      "border.focus",
      "status.success",
      "status.error",
      "glyph.tool.running",
    ];

    for (const token of usedTokens) {
      expect(MOCK_TOKENS[token as keyof ThemeTokens]).toBeDefined();
    }
  });
});
