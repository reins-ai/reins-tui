import { describe, expect, it } from "bun:test";

import {
  SLASH_COMMANDS,
  getSlashCommandByNameOrAlias,
} from "../../src/commands/registry";

describe("SlashCommandRegistry", () => {
  it("registers the /thinking command", () => {
    const command = getSlashCommandByNameOrAlias("thinking");
    expect(command).not.toBeNull();
    expect(command!.name).toBe("thinking");
    expect(command!.handlerKey).toBe("TOGGLE_THINKING");
    expect(command!.category).toBe("appearance");
    expect(command!.description).toContain("thinking");
  });

  it("/thinking command is included in SLASH_COMMANDS list", () => {
    const thinkingCommand = SLASH_COMMANDS.find((cmd) => cmd.name === "thinking");
    expect(thinkingCommand).toBeDefined();
    expect(thinkingCommand!.usage).toBe("/thinking");
  });

  it("all commands have unique names", () => {
    const names = SLASH_COMMANDS.map((cmd) => cmd.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("all commands have unique handler keys", () => {
    const keys = SLASH_COMMANDS.map((cmd) => cmd.handlerKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("all aliases resolve to their parent command", () => {
    for (const command of SLASH_COMMANDS) {
      for (const alias of command.aliases) {
        const resolved = getSlashCommandByNameOrAlias(alias);
        expect(resolved).not.toBeNull();
        expect(resolved!.name).toBe(command.name);
      }
    }
  });

  it("returns null for unknown command names", () => {
    expect(getSlashCommandByNameOrAlias("nonexistent")).toBeNull();
    expect(getSlashCommandByNameOrAlias("")).toBeNull();
  });
});
