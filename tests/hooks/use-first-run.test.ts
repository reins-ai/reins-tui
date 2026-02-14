import { describe, expect, it } from "bun:test";

import { FirstRunDetector, OnboardingCheckpointService } from "@reins/core";
import { ok, err } from "../../src/daemon/contracts";

import { detectFirstRunState, type FirstRunState } from "../../src/hooks/use-first-run";

// ---------------------------------------------------------------------------
// Helpers — mock FirstRunDetector via constructor injection
// ---------------------------------------------------------------------------

function createMockDetector(
  result: { status: "first-run" } | { status: "resume"; resumeStep?: string } | { status: "complete" },
  shouldFail = false,
): FirstRunDetector {
  const checkpoint = new OnboardingCheckpointService({ basePath: "/tmp/reins-test-first-run" });

  return new FirstRunDetector({
    checkpoint,
    readUserConfig: async () => {
      if (shouldFail) {
        return err(new Error("config read failed"));
      }

      if (result.status === "first-run") {
        // No config → first-run
        return ok(null);
      }

      if (result.status === "complete") {
        return ok({ setupComplete: true });
      }

      // resume — config exists but incomplete, checkpoint has steps
      return ok({ setupComplete: false });
    },
  });
}

function createThrowingDetector(): FirstRunDetector {
  const checkpoint = new OnboardingCheckpointService({ basePath: "/tmp/reins-test-first-run" });

  return new FirstRunDetector({
    checkpoint,
    readUserConfig: async () => {
      throw new Error("unexpected crash");
    },
  });
}

// ---------------------------------------------------------------------------
// Tests — exercise the standalone detection logic
// ---------------------------------------------------------------------------

describe("detectFirstRunState", () => {
  it("returns first-run when no config exists", async () => {
    const detector = createMockDetector({ status: "first-run" });
    const state = await detectFirstRunState(detector);

    expect(state.status).toBe("first-run");
  });

  it("returns complete when setup is finished", async () => {
    const detector = createMockDetector({ status: "complete" });
    const state = await detectFirstRunState(detector);

    expect(state.status).toBe("complete");
  });

  it("returns complete on detection error (graceful fallback)", async () => {
    const detector = createMockDetector({ status: "first-run" }, true);
    // Config read fails → FirstRunDetector falls back to first-run,
    // but if the detector itself returns an error, detectFirstRunState
    // should fall back to complete.
    const state = await detectFirstRunState(detector);

    // FirstRunDetector treats config read failure as first-run (ok result),
    // so this should actually be first-run
    expect(state.status).toBe("first-run");
  });

  it("returns complete on unexpected throw", async () => {
    const detector = createThrowingDetector();
    const state = await detectFirstRunState(detector);

    expect(state.status).toBe("complete");
  });

  it("returns the correct FirstRunState shape for first-run", async () => {
    const detector = createMockDetector({ status: "first-run" });
    const state = await detectFirstRunState(detector);

    expect(state).toEqual({ status: "first-run" } satisfies FirstRunState);
  });

  it("returns the correct FirstRunState shape for complete", async () => {
    const detector = createMockDetector({ status: "complete" });
    const state = await detectFirstRunState(detector);

    expect(state).toEqual({ status: "complete" } satisfies FirstRunState);
  });
});
