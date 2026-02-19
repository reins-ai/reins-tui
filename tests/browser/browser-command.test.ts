import { describe, expect, it } from "bun:test";
import { getSlashCommandByNameOrAlias, SLASH_COMMANDS } from "../../src/commands/registry";
import { handleBrowserCommand } from "../../src/commands/handlers/browser";

describe("browser slash-command registration", () => {
  it("is present in SLASH_COMMANDS list", () => {
    const found = SLASH_COMMANDS.find((cmd) => cmd.name === "browser");
    expect(found).toBeDefined();
  });

  it("resolves by name via getSlashCommandByNameOrAlias", () => {
    const cmd = getSlashCommandByNameOrAlias("browser");
    expect(cmd).not.toBeNull();
    expect(cmd!.name).toBe("browser");
  });

  it("resolves /br alias to the same command", () => {
    const byName = getSlashCommandByNameOrAlias("browser");
    const byAlias = getSlashCommandByNameOrAlias("br");
    expect(byAlias).not.toBeNull();
    expect(byAlias).toBe(byName);
  });

  it("has handlerKey BROWSER", () => {
    const cmd = getSlashCommandByNameOrAlias("browser");
    expect(cmd!.handlerKey).toBe("BROWSER");
  });

  it("has category system", () => {
    const cmd = getSlashCommandByNameOrAlias("browser");
    expect(cmd!.category).toBe("system");
  });
});

describe("handleBrowserCommand", () => {
  it("returns OPEN_BROWSER_PANEL signal when called with no args", () => {
    const result = handleBrowserCommand(
      { positional: [], flags: {} },
      {} as Parameters<typeof handleBrowserCommand>[1],
    );

    // Handler is synchronous, returns Result directly
    expect(result).toBeDefined();
    const resolved = result as { ok: true; value: { statusMessage: string; signals: readonly { type: string }[] } };
    expect(resolved.ok).toBe(true);
    expect(resolved.value.statusMessage).toBe("Browser panel");
    expect(resolved.value.signals).toHaveLength(1);
    expect(resolved.value.signals![0].type).toBe("OPEN_BROWSER_PANEL");
  });
});
