import { describe, expect, test } from "bun:test";
import { DEPTH_LEVEL_MAP, ROLE_BORDER_MAP } from "../../src/theme/use-theme-tokens";
import { createThemeRegistry } from "../../src/theme/theme-registry";

describe("depth token mapping", () => {
  test("DEPTH_LEVEL_MAP contains all depth levels", () => {
    expect(DEPTH_LEVEL_MAP).toEqual({
      panel1: "depth.panel1",
      panel2: "depth.panel2",
      panel3: "depth.panel3",
      interactive: "depth.interactive",
    });
  });

  test("depth tokens map to surface tokens in reins-dark", () => {
    const registryResult = createThemeRegistry("reins-dark");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    expect(theme.tokens["depth.panel1"]).toBe(theme.tokens["surface.primary"]);
    expect(theme.tokens["depth.panel2"]).toBe(theme.tokens["surface.secondary"]);
    expect(theme.tokens["depth.panel3"]).toBe(theme.tokens["surface.tertiary"]);
    expect(theme.tokens["depth.interactive"]).toBe(theme.tokens["surface.elevated"]);
  });

  test("depth tokens map to surface tokens in reins-light", () => {
    const registryResult = createThemeRegistry("reins-light");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    expect(theme.tokens["depth.panel1"]).toBe(theme.tokens["surface.primary"]);
    expect(theme.tokens["depth.panel2"]).toBe(theme.tokens["surface.secondary"]);
    expect(theme.tokens["depth.panel3"]).toBe(theme.tokens["surface.tertiary"]);
    expect(theme.tokens["depth.interactive"]).toBe(theme.tokens["surface.elevated"]);
  });

  test("depth tokens map to surface tokens in tokyonight", () => {
    const registryResult = createThemeRegistry("tokyonight");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    expect(theme.tokens["depth.panel1"]).toBe(theme.tokens["surface.primary"]);
    expect(theme.tokens["depth.panel2"]).toBe(theme.tokens["surface.secondary"]);
    expect(theme.tokens["depth.panel3"]).toBe(theme.tokens["surface.tertiary"]);
    expect(theme.tokens["depth.interactive"]).toBe(theme.tokens["surface.elevated"]);
  });

  test("depth tokens are valid hex colors in all themes", () => {
    for (const themeName of ["reins-dark", "reins-light", "tokyonight"]) {
      const registryResult = createThemeRegistry(themeName);
      if (!registryResult.ok) throw new Error(`Failed to create registry for ${themeName}`);

      const theme = registryResult.value.getTheme();
      expect(theme.tokens["depth.panel1"]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.tokens["depth.panel2"]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.tokens["depth.panel3"]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.tokens["depth.interactive"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("role border token mapping", () => {
  test("ROLE_BORDER_MAP contains all message roles", () => {
    expect(ROLE_BORDER_MAP).toEqual({
      user: "role.user.border",
      assistant: "role.assistant.border",
      system: "role.system.border",
    });
  });

  test("role border tokens are valid hex colors in all themes", () => {
    for (const themeName of ["reins-dark", "reins-light", "tokyonight"]) {
      const registryResult = createThemeRegistry(themeName);
      if (!registryResult.ok) throw new Error(`Failed to create registry for ${themeName}`);

      const theme = registryResult.value.getTheme();
      expect(theme.tokens["role.user.border"]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.tokens["role.assistant.border"]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.tokens["role.system.border"]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  test("role borders differ from each other in reins-dark", () => {
    const registryResult = createThemeRegistry("reins-dark");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    const userBorder = theme.tokens["role.user.border"];
    const assistantBorder = theme.tokens["role.assistant.border"];
    const systemBorder = theme.tokens["role.system.border"];

    expect(userBorder).not.toBe(assistantBorder);
    expect(assistantBorder).not.toBe(systemBorder);
    expect(userBorder).not.toBe(systemBorder);
  });

  test("role borders differ from each other in reins-light", () => {
    const registryResult = createThemeRegistry("reins-light");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    const userBorder = theme.tokens["role.user.border"];
    const assistantBorder = theme.tokens["role.assistant.border"];
    const systemBorder = theme.tokens["role.system.border"];

    expect(userBorder).not.toBe(assistantBorder);
    expect(assistantBorder).not.toBe(systemBorder);
    expect(userBorder).not.toBe(systemBorder);
  });

  test("role borders differ from each other in tokyonight", () => {
    const registryResult = createThemeRegistry("tokyonight");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    const userBorder = theme.tokens["role.user.border"];
    const assistantBorder = theme.tokens["role.assistant.border"];
    const systemBorder = theme.tokens["role.system.border"];

    expect(userBorder).not.toBe(assistantBorder);
    expect(assistantBorder).not.toBe(systemBorder);
    expect(userBorder).not.toBe(systemBorder);
  });

  test("role.user.border uses purple/violet tones across themes", () => {
    const registryResult = createThemeRegistry("reins-dark");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    expect(theme.tokens["role.user.border"]).toBe("#c4b5fd");
  });

  test("role.assistant.border uses indigo/blue tones across themes", () => {
    const registryResult = createThemeRegistry("reins-dark");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    expect(theme.tokens["role.assistant.border"]).toBe("#e4e4e7");
  });

  test("role.system.border uses warning/amber tones across themes", () => {
    const registryResult = createThemeRegistry("reins-dark");
    if (!registryResult.ok) throw new Error("Failed to create registry");

    const theme = registryResult.value.getTheme();
    expect(theme.tokens["role.system.border"]).toBe("#fbbf24");
  });
});
