import { describe, expect, test } from "bun:test";

import { DEFAULT_COMMANDS, filterCommands } from "../../src/lib";

describe("filterCommands", () => {
  test("returns all commands for empty query", () => {
    expect(filterCommands(DEFAULT_COMMANDS, "")).toEqual(DEFAULT_COMMANDS);
  });

  test("matches label substring", () => {
    const results = filterCommands(DEFAULT_COMMANDS, "focus");

    expect(results.map((command) => command.id)).toEqual([
      "focus-sidebar",
      "focus-conversation",
      "focus-input",
    ]);
  });

  test("matches category substring", () => {
    const results = filterCommands(DEFAULT_COMMANDS, "application");

    expect(results.map((command) => command.id)).toEqual(["quit"]);
  });

  test("matches case-insensitively", () => {
    const lower = filterCommands(DEFAULT_COMMANDS, "model");
    const upper = filterCommands(DEFAULT_COMMANDS, "MoDeL");

    expect(lower).toEqual(upper);
  });

  test("returns empty array when no matches", () => {
    expect(filterCommands(DEFAULT_COMMANDS, "not-a-command")).toEqual([]);
  });
});
