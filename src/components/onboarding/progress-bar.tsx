import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";
import type { OnboardingStep } from "@reins/core";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProgressBarProps {
  steps: readonly OnboardingStep[];
  currentStepIndex: number;
  completedSteps: readonly OnboardingStep[];
  skippedSteps: readonly OnboardingStep[];
}

// ---------------------------------------------------------------------------
// Step label mapping
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<OnboardingStep, string> = {
  "welcome": "Welcome",
  "daemon-install": "Daemon",
  "provider-keys": "Providers",
  "model-select": "Models",
  "workspace": "Workspace",
  "personality": "Personality",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressBar({
  steps,
  currentStepIndex,
  completedSteps,
  skippedSteps,
}: ProgressBarProps) {
  const { tokens } = useThemeTokens();

  const completedSet = new Set(completedSteps);
  const skippedSet = new Set(skippedSteps);

  return (
    <Box style={{ flexDirection: "row", width: "100%", paddingLeft: 2, paddingRight: 2 }}>
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isCompleted = completedSet.has(step);
        const isSkipped = skippedSet.has(step);
        const isPast = index < currentStepIndex;

        const label = STEP_LABELS[step] ?? step;

        let indicator: string;
        let indicatorColor: string;
        let labelColor: string;

        if (isCompleted) {
          indicator = "*";
          indicatorColor = tokens["status.success"];
          labelColor = tokens["text.muted"];
        } else if (isSkipped) {
          indicator = "-";
          indicatorColor = tokens["text.muted"];
          labelColor = tokens["text.muted"];
        } else if (isActive) {
          indicator = ">";
          indicatorColor = tokens["accent.primary"];
          labelColor = tokens["text.primary"];
        } else if (isPast) {
          indicator = "*";
          indicatorColor = tokens["status.success"];
          labelColor = tokens["text.muted"];
        } else {
          indicator = "o";
          indicatorColor = tokens["text.muted"];
          labelColor = tokens["text.muted"];
        }

        const showConnector = index < steps.length - 1;

        return (
          <Box key={step} style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              content={indicator}
              style={{ color: indicatorColor }}
            />
            <Text
              content={` ${label}`}
              style={{ color: labelColor }}
            />
            {showConnector ? (
              <Text
                content=" — "
                style={{ color: tokens["border.subtle"] }}
              />
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

export { STEP_LABELS };
