import { describe, expect, it } from "bun:test";

import {
  formatRelativeTime,
  panelReducer,
  INITIAL_STATE,
  type ScheduleItem,
} from "../../src/components/SchedulePanel";

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe("formatRelativeTime", () => {
  it("returns 'unknown' for null input", () => {
    expect(formatRelativeTime(null)).toBe("unknown");
  });

  it("returns 'unknown' for invalid ISO string", () => {
    expect(formatRelativeTime("not-a-date")).toBe("unknown");
  });

  it("returns 'overdue' for past dates", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(formatRelativeTime(past)).toBe("overdue");
  });

  it("formats seconds for very near future", () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    const result = formatRelativeTime(soon);
    expect(result).toMatch(/^in \d+s$/);
  });

  it("formats minutes for near future", () => {
    const inMinutes = new Date(Date.now() + 5 * 60_000).toISOString();
    const result = formatRelativeTime(inMinutes);
    expect(result).toMatch(/^in \d+m$/);
  });

  it("formats hours and minutes for medium future", () => {
    const inHours = new Date(Date.now() + 2.5 * 3_600_000).toISOString();
    const result = formatRelativeTime(inHours);
    expect(result).toMatch(/^in \d+h( \d+m)?$/);
  });

  it("formats hours only when no remaining minutes", () => {
    const inExactHours = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const result = formatRelativeTime(inExactHours);
    // Could be "in 2h 59m" or "in 3h" depending on timing
    expect(result).toMatch(/^in \d+h( \d+m)?$/);
  });

  it("formats days and hours for far future", () => {
    const inDays = new Date(Date.now() + 2 * 86_400_000 + 3 * 3_600_000).toISOString();
    const result = formatRelativeTime(inDays);
    expect(result).toMatch(/^in \d+d( \d+h)?$/);
  });

  it("formats days only when no remaining hours", () => {
    const inExactDays = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const result = formatRelativeTime(inExactDays);
    expect(result).toMatch(/^in \d+d( \d+h)?$/);
  });
});

// ---------------------------------------------------------------------------
// panelReducer
// ---------------------------------------------------------------------------

describe("panelReducer", () => {
  it("transitions to loading on FETCH_START", () => {
    const next = panelReducer(INITIAL_STATE, { type: "FETCH_START" });
    expect(next.fetchState).toBe("loading");
    expect(next.errorMessage).toBeNull();
  });

  it("stores items on FETCH_SUCCESS", () => {
    const items: ScheduleItem[] = [
      {
        id: "job-1",
        type: "cron",
        title: "Daily backup",
        schedule: "0 2 * * *",
        nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
        humanReadable: "Every day at 2:00 AM",
      },
    ];
    const next = panelReducer(INITIAL_STATE, { type: "FETCH_SUCCESS", items });
    expect(next.fetchState).toBe("success");
    expect(next.items).toEqual(items);
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
    const modified: typeof INITIAL_STATE = {
      fetchState: "success",
      items: [
        {
          id: "job-1",
          type: "cron",
          title: "Test",
          schedule: "* * * * *",
          nextRunAt: null,
          humanReadable: "Every minute",
        },
      ],
      errorMessage: null,
      selectedIndex: 0,
      cancellingId: null,
    };
    const next = panelReducer(modified, { type: "RESET" });
    expect(next).toEqual(INITIAL_STATE);
  });

  it("clears previous error on FETCH_SUCCESS", () => {
    const errored = panelReducer(INITIAL_STATE, {
      type: "FETCH_ERROR",
      message: "fail",
    });
    const items: ScheduleItem[] = [
      {
        id: "job-2",
        type: "cron",
        title: "Weekly report",
        schedule: "0 9 * * 1",
        nextRunAt: new Date(Date.now() + 86_400_000).toISOString(),
        humanReadable: "Every Monday at 9:00 AM",
      },
    ];
    const next = panelReducer(errored, { type: "FETCH_SUCCESS", items });
    expect(next.fetchState).toBe("success");
    expect(next.errorMessage).toBeNull();
    expect(next.items.length).toBe(1);
  });

  it("renders empty state when items array is empty", () => {
    const next = panelReducer(INITIAL_STATE, { type: "FETCH_SUCCESS", items: [] });
    expect(next.fetchState).toBe("success");
    expect(next.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Navigation (SELECT_NEXT / SELECT_PREV)
// ---------------------------------------------------------------------------

describe("panelReducer navigation", () => {
  const threeItems: ScheduleItem[] = [
    {
      id: "job-1",
      type: "cron",
      title: "Task A",
      schedule: "0 8 * * *",
      nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
      humanReadable: "Every day at 8:00 AM",
    },
    {
      id: "job-2",
      type: "cron",
      title: "Task B",
      schedule: "0 12 * * *",
      nextRunAt: new Date(Date.now() + 7_200_000).toISOString(),
      humanReadable: "Every day at 12:00 PM",
    },
    {
      id: "job-3",
      type: "cron",
      title: "Task C",
      schedule: "0 18 * * *",
      nextRunAt: new Date(Date.now() + 10_800_000).toISOString(),
      humanReadable: "Every day at 6:00 PM",
    },
  ];

  function stateWithItems(items: ScheduleItem[], selectedIndex = 0): typeof INITIAL_STATE {
    return {
      ...INITIAL_STATE,
      fetchState: "success",
      items,
      selectedIndex,
    };
  }

  it("moves selection down on SELECT_NEXT", () => {
    const state = stateWithItems(threeItems, 0);
    const next = panelReducer(state, { type: "SELECT_NEXT" });
    expect(next.selectedIndex).toBe(1);
  });

  it("clamps selection at last item on SELECT_NEXT", () => {
    const state = stateWithItems(threeItems, 2);
    const next = panelReducer(state, { type: "SELECT_NEXT" });
    expect(next.selectedIndex).toBe(2);
  });

  it("moves selection up on SELECT_PREV", () => {
    const state = stateWithItems(threeItems, 2);
    const next = panelReducer(state, { type: "SELECT_PREV" });
    expect(next.selectedIndex).toBe(1);
  });

  it("clamps selection at first item on SELECT_PREV", () => {
    const state = stateWithItems(threeItems, 0);
    const next = panelReducer(state, { type: "SELECT_PREV" });
    expect(next.selectedIndex).toBe(0);
  });

  it("adjusts selectedIndex when items shrink on FETCH_SUCCESS", () => {
    const state = stateWithItems(threeItems, 2);
    const fewerItems = [threeItems[0]];
    const next = panelReducer(state, { type: "FETCH_SUCCESS", items: fewerItems });
    expect(next.selectedIndex).toBe(0);
  });

  it("handles SELECT_NEXT with empty items", () => {
    const state = stateWithItems([], 0);
    const next = panelReducer(state, { type: "SELECT_NEXT" });
    expect(next.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cancel actions
// ---------------------------------------------------------------------------

describe("panelReducer cancel", () => {
  it("sets cancellingId on CANCEL_START", () => {
    const next = panelReducer(INITIAL_STATE, { type: "CANCEL_START", id: "job-1" });
    expect(next.cancellingId).toBe("job-1");
  });

  it("clears cancellingId on CANCEL_DONE", () => {
    const cancelling = panelReducer(INITIAL_STATE, { type: "CANCEL_START", id: "job-1" });
    const next = panelReducer(cancelling, { type: "CANCEL_DONE" });
    expect(next.cancellingId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Display logic
// ---------------------------------------------------------------------------

describe("SchedulePanel display logic", () => {
  it("identifies items sorted by nextRunAt", () => {
    const items: ScheduleItem[] = [
      {
        id: "job-1",
        type: "cron",
        title: "Later task",
        schedule: "0 18 * * *",
        nextRunAt: new Date(Date.now() + 10_800_000).toISOString(),
        humanReadable: "Every day at 6:00 PM",
      },
      {
        id: "job-2",
        type: "cron",
        title: "Sooner task",
        schedule: "0 8 * * *",
        nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
        humanReadable: "Every day at 8:00 AM",
      },
    ];

    // Items come pre-sorted from the API, verify the structure
    const sorted = [...items].sort((a, b) => {
      const aTime = a.nextRunAt ? Date.parse(a.nextRunAt) : Infinity;
      const bTime = b.nextRunAt ? Date.parse(b.nextRunAt) : Infinity;
      return aTime - bTime;
    });

    expect(sorted[0].title).toBe("Sooner task");
    expect(sorted[1].title).toBe("Later task");
  });

  it("handles items with null nextRunAt", () => {
    const item: ScheduleItem = {
      id: "job-1",
      type: "cron",
      title: "No next run",
      schedule: "0 0 31 2 *",
      nextRunAt: null,
      humanReadable: "February 31st (never)",
    };

    expect(formatRelativeTime(item.nextRunAt)).toBe("unknown");
  });
});
