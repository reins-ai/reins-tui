import { describe, expect, test } from "bun:test";

import { getCommandAutocomplete } from "../../src/commands/autocomplete";
import { parseSlashCommand } from "../../src/commands/parser";
import { SLASH_COMMANDS } from "../../src/commands/registry";

describe("slash command registry", () => {
  test("contains required command set", () => {
    const names = SLASH_COMMANDS.map((command) => command.name);

    expect(names).toEqual([
      "help",
      "model",
      "theme",
      "connect",
      "status",
      "env",
      "new",
      "clear",
      "export",
      "compact",
      "settings",
      "search-settings",
      "quit",
      "remember",
      "memory",
      "daemon",
      "channels",
      "setup",
      "thinking",
      "integrations",
    ]);
  });

  test("uses expected categories", () => {
    const categories = Object.fromEntries(SLASH_COMMANDS.map((command) => [command.name, command.category]));

    expect(categories).toEqual({
      help: "system",
      model: "model",
      theme: "appearance",
      connect: "system",
      status: "system",
      env: "environment",
      new: "conversation",
      clear: "conversation",
      export: "conversation",
      compact: "appearance",
      settings: "system",
      "search-settings": "system",
      quit: "system",
      remember: "memory",
      memory: "memory",
      daemon: "system",
      channels: "system",
      setup: "system",
      thinking: "appearance",
      integrations: "system",
    });
  });

  test("is immutable after initialization", () => {
    expect(Object.isFrozen(SLASH_COMMANDS)).toBe(true);
    expect(Object.isFrozen(SLASH_COMMANDS[0])).toBe(true);
    expect(Object.isFrozen(SLASH_COMMANDS[0]?.aliases)).toBe(true);
  });
});

describe("parseSlashCommand", () => {
  test("parses command, positional args, and flags", () => {
    const result = parseSlashCommand("/MODEL gpt-4 --temperature=0.2 -vx --stream");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.command.name).toBe("model");
    expect(result.value.rawCommand).toBe("MODEL");
    expect(result.value.args.positional).toEqual(["gpt-4"]);
    expect(result.value.args.flags).toEqual({
      temperature: "0.2",
      v: true,
      x: true,
      stream: true,
    });
  });

  test("parses quoted args", () => {
    const result = parseSlashCommand('/theme "solarized warm" --preview');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.command.name).toBe("theme");
    expect(result.value.args.positional).toEqual(["solarized warm"]);
    expect(result.value.args.flags).toEqual({ preview: true });
  });

  test("resolves alias", () => {
    const result = parseSlashCommand("/q");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.command.name).toBe("quit");
  });

  test("returns error for empty input", () => {
    const result = parseSlashCommand("   ");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "EMPTY_INPUT",
        message: "Input is empty.",
      },
    });
  });

  test("returns error for non-command input", () => {
    const result = parseSlashCommand("hello world");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "NOT_A_COMMAND",
        message: "Input does not start with '/'.",
      },
    });
  });

  test("returns error for slash without command", () => {
    const result = parseSlashCommand("/");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "MISSING_COMMAND",
        message: "Missing command name after '/'.",
      },
    });
  });

  test("returns error for unknown command", () => {
    const result = parseSlashCommand("/unknown");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNKNOWN_COMMAND",
        message: "Unknown command '/unknown'.",
      },
    });
  });

  test("returns error for unterminated quote", () => {
    const result = parseSlashCommand('/model "gpt-4');

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNTERMINATED_QUOTE",
        message: "Command input contains an unterminated quote.",
      },
    });
  });

  test("returns error for invalid flag", () => {
    const result = parseSlashCommand("/model --=bad");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_FLAG",
        message: "Invalid flag token '--=bad'.",
      },
    });
  });
});

describe("getCommandAutocomplete", () => {
  test("returns all commands for '/'", () => {
    const result = getCommandAutocomplete("/");

    expect(result.length).toBe(SLASH_COMMANDS.length);
    expect(result.map((item) => item.name)).toEqual([
      "channels",
      "clear",
      "compact",
      "connect",
      "daemon",
      "env",
      "export",
      "help",
      "integrations",
      "memory",
      "model",
      "new",
      "quit",
      "remember",
      "search-settings",
      "settings",
      "setup",
      "status",
      "theme",
      "thinking",
    ]);
  });

  test("returns prefix matches with metadata", () => {
    const result = getCommandAutocomplete("/th");

    expect(result[0]).toEqual({
      name: "theme",
      aliases: ["t"],
      description: "Switch the active theme.",
      usage: "/theme <theme-name>",
      category: "appearance",
      score: expect.any(Number),
    });
  });

  test("ranks exact prefix before partial match", () => {
    const result = getCommandAutocomplete("/he");

    expect(result[0]?.name).toBe("help");
    expect(result.some((item) => item.name === "theme")).toBe(true);
  });

  test("supports fuzzy matching", () => {
    const result = getCommandAutocomplete("/stn");

    expect(result[0]?.name).toBe("settings");
  });

  test("returns empty for non-command prefixes", () => {
    expect(getCommandAutocomplete("theme")).toEqual([]);
  });
});
