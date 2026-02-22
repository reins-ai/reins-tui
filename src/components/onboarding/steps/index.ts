import type { EngineState, OnboardingStep } from "@reins/core";

import { WelcomeStepView } from "./welcome-step";
import { DaemonInstallStepView } from "./daemon-install-step";
import { ProviderSetupStepView } from "./provider-setup-step";
import { OpenClawMigrationStepView } from "./OpenClawMigrationStep";
import { ModelSelectionStepView } from "./model-selection-step";
import { WorkspaceStepView } from "./workspace-step";
import { PersonalityStepView } from "./personality-step";
import { FeatureDiscoveryStepView } from "./feature-discovery-step";

// ---------------------------------------------------------------------------
// Shared step view props
// ---------------------------------------------------------------------------

export interface StepViewProps {
  tokens: Record<string, string>;
  engineState: EngineState;
  onStepData: (data: Record<string, unknown>) => void;
  /** Call this when the step wants the wizard to advance to the next page. */
  onRequestNext: () => void;
}

// ---------------------------------------------------------------------------
// Step view component type
// ---------------------------------------------------------------------------

export type StepViewComponent = (props: StepViewProps) => React.ReactElement | null;

// ---------------------------------------------------------------------------
// Step view registry
// ---------------------------------------------------------------------------

export const STEP_VIEW_MAP: Record<OnboardingStep, StepViewComponent> = {
  "welcome": WelcomeStepView,
  "daemon-install": DaemonInstallStepView,
  "provider-keys": ProviderSetupStepView,
  "openclaw-migration": OpenClawMigrationStepView,
  "model-select": ModelSelectionStepView,
  "workspace": WorkspaceStepView,
  "personality": PersonalityStepView,
  "feature-discovery": FeatureDiscoveryStepView,
};

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { WelcomeStepView } from "./welcome-step";
export { DaemonInstallStepView } from "./daemon-install-step";
export { ProviderSetupStepView } from "./provider-setup-step";
export { OpenClawMigrationStepView } from "./OpenClawMigrationStep";
export { ModelSelectionStepView } from "./model-selection-step";
export { WorkspaceStepView } from "./workspace-step";
export { PersonalityStepView } from "./personality-step";
export { FeatureDiscoveryStepView } from "./feature-discovery-step";
