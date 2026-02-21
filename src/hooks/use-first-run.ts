import { useEffect, useRef, useState } from "react";

import {
  FirstRunDetector,
  OnboardingCheckpointService,
  type OnboardingStep,
} from "@reins/core";

import { checkAnyProviderConfigured } from "../components/onboarding/wizard-shell";
import { logger } from "../lib/debug-logger";

/**
 * Resolved first-run detection state for the app entry point.
 *
 * - `checking`: Detection is in progress.
 * - `first-run`: No prior setup — launch the onboarding wizard.
 * - `resume`: Partial onboarding — offer to continue from `resumeStep`.
 * - `complete`: Setup is finished — proceed to chat.
 * - `needs-provider-setup`: Setup was marked complete but no provider is
 *   configured — re-surface a targeted provider setup flow.
 */
export type FirstRunState =
  | { status: "checking" }
  | { status: "first-run" }
  | { status: "resume"; resumeStep: OnboardingStep | undefined }
  | { status: "complete" }
  | { status: "needs-provider-setup" };

export interface UseFirstRunOptions {
  /** Override detector for testing. */
  detector?: FirstRunDetector;
  /** Override provider check for testing. Returns true if a provider is configured. */
  checkProvider?: () => Promise<boolean>;
}

/**
 * React hook wrapping `FirstRunDetector.detect()`.
 *
 * Runs detection once on mount and returns the resolved state.
 * On error, defaults to "complete" so the app is never blocked.
 *
 * When detection returns "complete", a secondary check verifies that at
 * least one AI provider is configured. If not, returns "needs-provider-setup"
 * so the app can re-surface a targeted setup flow.
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
          case "complete": {
            // Secondary check: verify minimum viable config (provider configured)
            const checkFn = options?.checkProvider ?? checkAnyProviderConfigured;
            const hasProvider = await checkFn();

            if (cancelled) return;

            if (hasProvider) {
              setState({ status: "complete" });
            } else {
              logger.app.info("Setup complete but no provider configured — surfacing provider setup");
              setState({ status: "needs-provider-setup" });
            }
            break;
          }
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
  }, [options?.detector, options?.checkProvider]);

  return state;
}

/**
 * Standalone detection logic for testing without React hooks.
 *
 * Returns the same `FirstRunState` shape as the hook.
 */
export async function detectFirstRunState(
  detector: FirstRunDetector,
  checkProvider?: () => Promise<boolean>,
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
      case "complete": {
        if (checkProvider) {
          const hasProvider = await checkProvider();
          if (!hasProvider) {
            return { status: "needs-provider-setup" };
          }
        }
        return { status: "complete" };
      }
    }
  } catch {
    return { status: "complete" };
  }
}
