import { describe, expect, test } from "bun:test";

import { InputHistory } from "../../src/lib";

describe("InputHistory", () => {
  test("pushes messages and navigates up/down", () => {
    const history = new InputHistory();

    history.push("first");
    history.push("second");

    expect(history.navigateUp()).toBe("second");
    expect(history.navigateUp()).toBe("first");
    expect(history.navigateDown()).toBe("second");
  });

  test("preserves draft while navigating", () => {
    const history = new InputHistory();

    history.push("sent message");
    history.setDraft("draft message");

    expect(history.navigateUp()).toBe("sent message");
    expect(history.navigateDown()).toBe("draft message");
  });

  test("returns null when navigating up past start", () => {
    const history = new InputHistory();

    history.push("only message");

    expect(history.navigateUp()).toBe("only message");
    expect(history.navigateUp()).toBeNull();
  });

  test("returns draft when navigating down past end", () => {
    const history = new InputHistory();

    history.push("message");
    history.setDraft("draft");

    expect(history.navigateUp()).toBe("message");
    expect(history.navigateDown()).toBe("draft");
    expect(history.navigateDown()).toBeNull();
  });

  test("enforces max size", () => {
    const history = new InputHistory(3);

    history.push("one");
    history.push("two");
    history.push("three");
    history.push("four");

    expect(history.getAll()).toEqual(["two", "three", "four"]);
  });

  test("clear resets history, cursor, and draft", () => {
    const history = new InputHistory();

    history.push("message");
    history.setDraft("draft");
    history.clear();

    expect(history.getAll()).toEqual([]);
    expect(history.getCurrent()).toBe("");
    expect(history.navigateUp()).toBeNull();
    expect(history.navigateDown()).toBeNull();
  });
});
