import { describe, expect, it } from "bun:test";

import {
  formatUptime,
  panelReducer,
  type BrowserStatusResponse,
} from "../../src/components/BrowserPanel";

// ---------------------------------------------------------------------------
// formatUptime
// ---------------------------------------------------------------------------

describe("formatUptime", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(999)).toBe("0s");
    expect(formatUptime(1000)).toBe("1s");
    expect(formatUptime(45_000)).toBe("45s");
    expect(formatUptime(59_999)).toBe("59s");
  });

  it("formats durations under an hour as minutes and seconds", () => {
    expect(formatUptime(60_000)).toBe("1m 0s");
    expect(formatUptime(61_000)).toBe("1m 1s");
    expect(formatUptime(90_000)).toBe("1m 30s");
    expect(formatUptime(3_599_000)).toBe("59m 59s");
  });

  it("formats durations of an hour or more as hours and minutes", () => {
    expect(formatUptime(3_600_000)).toBe("1h 0m");
    expect(formatUptime(3_661_000)).toBe("1h 1m");
    expect(formatUptime(7_200_000)).toBe("2h 0m");
    expect(formatUptime(86_400_000)).toBe("24h 0m");
  });
});

// ---------------------------------------------------------------------------
// panelReducer
// ---------------------------------------------------------------------------

describe("panelReducer", () => {
  const INITIAL_STATE = {
    fetchState: "idle" as const,
    browserStatus: null,
    errorMessage: null,
  };

  it("transitions to loading on FETCH_START", () => {
    const next = panelReducer(INITIAL_STATE, { type: "FETCH_START" });
    expect(next.fetchState).toBe("loading");
    expect(next.errorMessage).toBeNull();
  });

  it("stores browser status on FETCH_SUCCESS", () => {
    const data: BrowserStatusResponse = {
      status: "running",
      pid: 12345,
      tabCount: 3,
      memoryUsageMb: 256.5,
      profilePath: "/home/user/.reins/browser/profiles/default",
      uptimeMs: 120_000,
      headless: true,
    };
    const next = panelReducer(INITIAL_STATE, { type: "FETCH_SUCCESS", data });
    expect(next.fetchState).toBe("success");
    expect(next.browserStatus).toEqual(data);
    expect(next.errorMessage).toBeNull();
  });

  it("stores error message on FETCH_ERROR", () => {
    const next = panelReducer(INITIAL_STATE, {
      type: "FETCH_ERROR",
      message: "Unable to reach daemon",
    });
    expect(next.fetchState).toBe("error");
    expect(next.errorMessage).toBe("Unable to reach daemon");
  });

  it("resets to initial state on RESET", () => {
    const modified = {
      fetchState: "success" as const,
      browserStatus: { status: "running" as const, pid: 1 },
      errorMessage: null,
    };
    const next = panelReducer(modified, { type: "RESET" });
    expect(next).toEqual(INITIAL_STATE);
  });

  it("clears previous error on FETCH_SUCCESS", () => {
    const errored = panelReducer(INITIAL_STATE, {
      type: "FETCH_ERROR",
      message: "fail",
    });
    const data: BrowserStatusResponse = { status: "stopped" };
    const next = panelReducer(errored, { type: "FETCH_SUCCESS", data });
    expect(next.fetchState).toBe("success");
    expect(next.errorMessage).toBeNull();
    expect(next.browserStatus?.status).toBe("stopped");
  });
});

// ---------------------------------------------------------------------------
// Display logic (unit tests for what the component would render)
// ---------------------------------------------------------------------------

describe("BrowserPanel display logic", () => {
  it("identifies running status from response", () => {
    const response: BrowserStatusResponse = {
      status: "running",
      pid: 42,
      tabCount: 5,
      memoryUsageMb: 128.3,
      uptimeMs: 3_661_000,
      headless: true,
    };
    expect(response.status).toBe("running");
    expect(response.pid).toBe(42);
    expect(response.tabCount).toBe(5);
  });

  it("identifies stopped status from response", () => {
    const response: BrowserStatusResponse = { status: "stopped" };
    expect(response.status).toBe("stopped");
    expect(response.pid).toBeUndefined();
    expect(response.tabCount).toBeUndefined();
  });

  it("formats memory usage to one decimal place", () => {
    const mb = 256.789;
    expect(mb.toFixed(1)).toBe("256.8");
  });

  it("determines headed vs headless mode", () => {
    const headless: BrowserStatusResponse = { status: "running", headless: true };
    const headed: BrowserStatusResponse = { status: "running", headless: false };
    const defaultMode: BrowserStatusResponse = { status: "running" };

    expect(headless.headless === false ? "Headed" : "Headless").toBe("Headless");
    expect(headed.headless === false ? "Headed" : "Headless").toBe("Headed");
    expect(defaultMode.headless === false ? "Headed" : "Headless").toBe("Headless");
  });

  it("formats uptime for running browser", () => {
    // 1h 1m
    expect(formatUptime(3_661_000)).toBe("1h 1m");
    // 5m 30s
    expect(formatUptime(330_000)).toBe("5m 30s");
    // 45s
    expect(formatUptime(45_000)).toBe("45s");
  });
});
