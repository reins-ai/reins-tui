import { describe, expect, test } from "bun:test";

import { resolveRendererConfig } from "../../src/ui/renderer";
import type { RendererConfig } from "../../src/ui/types";

describe("RendererConfig", () => {
  test("applies defaults when config is empty", () => {
    const config = resolveRendererConfig();

    expect(config.exitOnCtrlC).toBe(true);
    expect(config.useMouse).toBe(true);
    expect(config.autoFocus).toBe(true);
    expect(config.title).toBe("Reins TUI");
  });

  test("preserves explicit values", () => {
    const custom: RendererConfig = {
      exitOnCtrlC: false,
      useMouse: false,
      autoFocus: false,
      title: "Custom",
    };
    const config = resolveRendererConfig(custom);

    expect(config.exitOnCtrlC).toBe(false);
    expect(config.useMouse).toBe(false);
    expect(config.autoFocus).toBe(false);
    expect(config.title).toBe("Custom");
  });
});
