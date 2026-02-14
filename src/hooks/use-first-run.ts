import { useEffect, useRef, useState } from "react";

import {
  FirstRunDetector,
  OnboardingCheckpointService,
  type OnboardingStep,
} from "@reins/core";

/**
 * Resolved first-run detection state for the app entry point.
 *
 * - `checking`: Detection is in progress.
 * - `first-run`: No prior setup — launch the onboarding wizard.
 * - `resume`: Partial onboarding — offer to continue from `resumeStep`.
 * - `complete`: Setup is finished — proceed to chat.
 */
export type FirstRunState =
  | { status: "checking" }
  | { status: "first-run" }
  | { status: "resume"; resumeStep: OnboardingStep | undefined }
  | { status: "complete" };

export interface UseFirstRunOptions {
  /** Override detector for testing. */
  detector?: FirstRunDetector;
}

/**
 * React hook wrapping `FirstRunDetector.detect()`.
 *
 * Runs detection once on mount and returns the resolved state.
 * On error, defaults to "complete" so the app is never blocked.
 */
export function useFirstRun(options?: UseFirstRunOptions): FirstRunState {
  const [state, setState] = useState<FirstRunState>({ status: "checking" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const detector = options?.detector ?? new FirstRunDetector({
          checkpoint: new OnboardingCheckpointService(),
        });

        const result = await detector.detect();

        if (cancelled) return;

        if (!result.ok) {
          // Detection failed — default to complete so the app isn't blocked
          setState({ status: "complete" });
          return;
        }

        const detection = result.value;

        switch (detection.status) {
          case "first-run":
            setState({ status: "first-run" });
            break;
          case "resume":
            setState({ status: "resume", resumeStep: detection.resumeStep });
            break;
          case "complete":
            setState({ status: "complete" });
            break;
        }
      } catch {
        // Unexpected error — default to complete so the app isn't blocked
        if (!cancelled) {
          setState({ status: "complete" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [options?.detector]);

  return state;
}

/**
 * Standalone detection logic for testing without React hooks.
 *
 * Returns the same `FirstRunState` shape as the hook.
 */
export async function detectFirstRunState(
  detector: FirstRunDetector,
): Promise<FirstRunState> {
  try {
    const result = await detector.detect();

    if (!result.ok) {
      return { status: "complete" };
    }

    const detection = result.value;

    switch (detection.status) {
      case "first-run":
        return { status: "first-run" };
      case "resume":
        return { status: "resume", resumeStep: detection.resumeStep };
      case "complete":
        return { status: "complete" };
    }
  } catch {
    return { status: "complete" };
  }
}
