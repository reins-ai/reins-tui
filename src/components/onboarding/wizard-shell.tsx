import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  OnboardingEngine,
  OnboardingCheckpointService,
  FirstRunDetector,
  ServiceInstaller,
  WelcomeStep,
  DaemonInstallStep,
  ProviderSetupStep,
  ModelSelectionStep,
  WorkspaceStep,
  PersonalityStep,
  ONBOARDING_STEPS,
  type EngineState,
  type FirstRunStatus,
  type OnboardingMode,
  type OnboardingStep,
  type OnboardingEvent,
} from "@reins/core";
import { useThemeTokens } from "../../theme";
import { Box, ScrollBox, Text, useKeyboard } from "../../ui";
import { ProgressBar, STEP_LABELS } from "./progress-bar";
import { STEP_VIEW_MAP } from "./steps";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OnboardingWizardResult {
  completed: boolean;
  skipped: boolean;
}

export interface OnboardingWizardProps {
  onComplete: (result: OnboardingWizardResult) => void;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type WizardPhase =
  | "loading"
  | "resume-prompt"
  | "active"
  | "completing"
  | "complete";

interface WizardState {
  phase: WizardPhase;
  firstRunStatus: FirstRunStatus | null;
  resumeStep: OnboardingStep | null;
  engineState: EngineState | null;
  error: string | null;
  resumeSelectedIndex: number;
}

type WizardAction =
  | { type: "DETECTION_COMPLETE"; status: FirstRunStatus; resumeStep?: OnboardingStep }
  | { type: "DETECTION_FAILED"; error: string }
  | { type: "ENGINE_INITIALIZED"; engineState: EngineState }
  | { type: "ENGINE_STATE_UPDATED"; engineState: EngineState }
  | { type: "WIZARD_COMPLETING" }
  | { type: "WIZARD_COMPLETE" }
  | { type: "RESUME_NAVIGATE_UP" }
  | { type: "RESUME_NAVIGATE_DOWN" }
  | { type: "SET_ERROR"; error: string };

const INITIAL_STATE: WizardState = {
  phase: "loading",
  firstRunStatus: null,
  resumeStep: null,
  engineState: null,
  error: null,
  resumeSelectedIndex: 0,
};

const RESUME_OPTIONS = [
  { label: "Continue setup", action: "continue" },
  { label: "Start fresh", action: "restart" },
  { label: "Skip to chat", action: "skip" },
] as const;

function createStepHandlers() {
  return [
    new WelcomeStep(),
    new DaemonInstallStep({ serviceInstaller: new ServiceInstaller() }),
    new ProviderSetupStep(),
    new ModelSelectionStep(),
    new WorkspaceStep(),
    new PersonalityStep(),
  ];
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "DETECTION_COMPLETE": {
      if (action.status === "resume") {
        return {
          ...state,
          phase: "resume-prompt",
          firstRunStatus: action.status,
          resumeStep: action.resumeStep ?? null,
        };
      }
      if (action.status === "complete") {
        return {
          ...state,
          phase: "complete",
          firstRunStatus: action.status,
        };
      }
      // first-run — proceed to engine initialization
      return {
        ...state,
        firstRunStatus: action.status,
      };
    }

    case "DETECTION_FAILED":
      return { ...state, phase: "loading", error: action.error };

    case "ENGINE_INITIALIZED":
      return {
        ...state,
        phase: "active",
        engineState: action.engineState,
        error: null,
      };

    case "ENGINE_STATE_UPDATED":
      return {
        ...state,
        engineState: action.engineState,
      };

    case "WIZARD_COMPLETING":
      return { ...state, phase: "completing" };

    case "WIZARD_COMPLETE":
      return { ...state, phase: "complete" };

    case "RESUME_NAVIGATE_UP":
      return {
        ...state,
        resumeSelectedIndex: state.resumeSelectedIndex <= 0
          ? RESUME_OPTIONS.length - 1
          : state.resumeSelectedIndex - 1,
      };

    case "RESUME_NAVIGATE_DOWN":
      return {
        ...state,
        resumeSelectedIndex: (state.resumeSelectedIndex + 1) % RESUME_OPTIONS.length,
      };

    case "SET_ERROR":
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface WizardFrameProps {
  title: string;
  tokens: Record<string, string>;
  engineState: EngineState | null;
  children: React.ReactNode;
}

function WizardFrame({ title, tokens, engineState, children }: WizardFrameProps) {
  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: tokens["surface.primary"],
      }}
    >
      {/* Header */}
      <Box
        style={{
          flexDirection: "column",
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 1,
          paddingBottom: 1,
          backgroundColor: tokens["surface.secondary"],
        }}
      >
        <Text
          content={title}
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>

      {/* Progress bar */}
      {engineState !== null ? (
        <Box
          style={{
            paddingTop: 1,
            paddingBottom: 1,
            backgroundColor: tokens["surface.secondary"],
            borderColor: tokens["border.subtle"],
          }}
        >
          <ProgressBar
            steps={ONBOARDING_STEPS}
            currentStepIndex={engineState.currentStepIndex}
            completedSteps={engineState.completedSteps}
            skippedSteps={engineState.skippedSteps}
          />
        </Box>
      ) : null}

      {/* Content area — ScrollBox ensures correct child layout */}
      <ScrollBox
        style={{
          flexGrow: 1,
        }}
        contentOptions={{
          flexDirection: "column",
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
        }}
      >
        {children}
      </ScrollBox>
    </Box>
  );
}

function LoadingView({ tokens }: { tokens: Record<string, string> }) {
  return (
    <WizardFrame title="Reins Setup" tokens={tokens} engineState={null}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Detecting setup state..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </WizardFrame>
  );
}

interface ResumePromptViewProps {
  tokens: Record<string, string>;
  resumeStep: OnboardingStep | null;
  selectedIndex: number;
}

function ResumePromptView({ tokens, resumeStep, selectedIndex }: ResumePromptViewProps) {
  const stepLabel = resumeStep !== null ? STEP_LABELS[resumeStep] ?? resumeStep : "unknown";

  return (
    <WizardFrame title="Reins Setup" tokens={tokens} engineState={null}>
      <Box style={{ flexDirection: "column" }}>
        <Text
          content="Welcome back! You have an incomplete setup."
          style={{ color: tokens["text.primary"] }}
        />
        <Box style={{ marginTop: 1 }}>
          <Text
            content={`Last step: ${stepLabel}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
        <Box style={{ marginTop: 2, flexDirection: "column" }}>
          {RESUME_OPTIONS.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={option.action} style={{ flexDirection: "row", marginBottom: 1 }}>
                <Text
                  content={isSelected ? "> " : "  "}
                  style={{ color: tokens["accent.primary"] }}
                />
                <Text
                  content={option.label}
                  style={{
                    color: isSelected ? tokens["text.primary"] : tokens["text.secondary"],
                  }}
                />
              </Box>
            );
          })}
        </Box>
        <Box style={{ marginTop: 2 }}>
          <Text
            content="Up/Down select . Enter confirm"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </WizardFrame>
  );
}

interface ActiveStepViewProps {
  tokens: Record<string, string>;
  engineState: EngineState;
  onStepData: (data: Record<string, unknown>) => void;
  onRequestNext: () => void;
}

function ActiveStepView({ tokens, engineState, onStepData, onRequestNext }: ActiveStepViewProps) {
  const currentStep = engineState.currentStep;
  const stepLabel = currentStep !== null
    ? STEP_LABELS[currentStep] ?? currentStep
    : "Unknown";

  const stepNumber = engineState.currentStepIndex + 1;
  const totalSteps = engineState.totalSteps;

  // Resolve the step view component from the registry
  const StepComponent = currentStep !== null ? STEP_VIEW_MAP[currentStep] : null;

  return (
    <WizardFrame
      title="Reins Setup"
      tokens={tokens}
      engineState={engineState}
    >
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text
            content={`Step ${stepNumber} of ${totalSteps}: `}
            style={{ color: tokens["text.secondary"] }}
          />
          <Text
            content={stepLabel}
            style={{ color: tokens["accent.primary"] }}
          />
        </Box>
        <Box style={{ marginTop: 2, flexDirection: "column" }}>
          {StepComponent !== null ? (
            <StepComponent
              tokens={tokens}
              engineState={engineState}
              onStepData={onStepData}
              onRequestNext={onRequestNext}
            />
          ) : (
            <Box
              style={{
                flexDirection: "column",
                paddingLeft: 2,
                paddingTop: 1,
                paddingBottom: 1,
                backgroundColor: tokens["surface.secondary"],
              }}
            >
              <Text
                content={`Unknown step: ${currentStep ?? "none"}`}
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </WizardFrame>
  );
}

function CompletingView({ tokens, engineState }: { tokens: Record<string, string>; engineState: EngineState | null }) {
  return (
    <WizardFrame title="Reins Setup" tokens={tokens} engineState={engineState}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
        <Text content="Finishing setup..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </WizardFrame>
  );
}

function ErrorView({ tokens, error }: { tokens: Record<string, string>; error: string }) {
  return (
    <WizardFrame title="Reins Setup" tokens={tokens} engineState={null}>
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="x " style={{ color: tokens["status.error"] }} />
          <Text content={error} style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Press Enter to retry, or Esc to skip to chat."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </WizardFrame>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);

  const engineRef = useRef<OnboardingEngine | null>(null);
  const checkpointRef = useRef<OnboardingCheckpointService | null>(null);
  const initStartedRef = useRef(false);
  const stepDataRef = useRef<Record<string, unknown>>({});

  // Callback for step views to report collected data
  const handleStepData = useCallback((data: Record<string, unknown>) => {
    stepDataRef.current = { ...stepDataRef.current, ...data };
  }, []);

  // Engine event handler
  const handleEngineEvent = useCallback((event: OnboardingEvent) => {
    if (event.type === "wizardComplete") {
      dispatch({ type: "WIZARD_COMPLETING" });
    }
  }, []);

  // Initialize: detect first-run status, then create engine
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    let cancelled = false;

    void (async () => {
      const checkpoint = new OnboardingCheckpointService();
      checkpointRef.current = checkpoint;

      const detector = new FirstRunDetector({ checkpoint });
      const detectResult = await detector.detect();

      if (cancelled) return;

      if (!detectResult.ok) {
        dispatch({ type: "DETECTION_FAILED", error: detectResult.error.message });
        return;
      }

      const detection = detectResult.value;
      dispatch({
        type: "DETECTION_COMPLETE",
        status: detection.status,
        resumeStep: detection.resumeStep,
      });

      // If complete, signal immediately
      if (detection.status === "complete") {
        onComplete({ completed: true, skipped: false });
        return;
      }

      // If first-run, initialize engine immediately
      if (detection.status === "first-run") {
        const engine = new OnboardingEngine({
          checkpoint,
          steps: createStepHandlers(),
          onEvent: handleEngineEvent,
        });
        engineRef.current = engine;

        const initResult = await engine.initialize();
        if (cancelled) return;

        if (!initResult.ok) {
          dispatch({ type: "SET_ERROR", error: initResult.error.message });
          return;
        }

        dispatch({ type: "ENGINE_INITIALIZED", engineState: initResult.value });
      }

      // If resume, wait for user choice (handled in keyboard handler)
    })();

    return () => {
      cancelled = true;
    };
  }, [onComplete, handleEngineEvent]);

  // Initialize engine after resume prompt selection
  const initializeEngine = useCallback(async (resetFirst: boolean) => {
    const checkpoint = checkpointRef.current;
    if (!checkpoint) return;

    if (resetFirst) {
      const resetResult = await checkpoint.reset();
      if (!resetResult.ok) {
        dispatch({ type: "SET_ERROR", error: resetResult.error.message });
        return;
      }
    }

    const engine = new OnboardingEngine({
      checkpoint,
      steps: createStepHandlers(),
      onEvent: handleEngineEvent,
    });
    engineRef.current = engine;

    const initResult = await engine.initialize();
    if (!initResult.ok) {
      dispatch({ type: "SET_ERROR", error: initResult.error.message });
      return;
    }

    dispatch({ type: "ENGINE_INITIALIZED", engineState: initResult.value });
  }, [handleEngineEvent]);

  // Handle engine navigation
  const handleNext = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const currentStep = engine.getState().currentStep;
    const stepData = { ...stepDataRef.current };

    if (currentStep === "welcome") {
      const selectedMode = stepData.selectedMode;
      if (selectedMode === "quickstart" || selectedMode === "advanced") {
        engine.setMode(selectedMode as OnboardingMode);
      }
    }

    const result = await engine.completeCurrentStep(stepData);
    if (!result.ok) {
      dispatch({ type: "SET_ERROR", error: result.error.message });
      return;
    }

    dispatch({ type: "ENGINE_STATE_UPDATED", engineState: result.value });

    if (result.value.isComplete) {
      dispatch({ type: "WIZARD_COMPLETING" });
      onComplete({ completed: true, skipped: false });
    }
  }, [onComplete]);

  const handleBack = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const result = await engine.back();
    if (!result.ok) {
      dispatch({ type: "SET_ERROR", error: result.error.message });
      return;
    }

    dispatch({ type: "ENGINE_STATE_UPDATED", engineState: result.value });
  }, []);

  const handleSkipToChat = useCallback(() => {
    onComplete({ completed: false, skipped: true });
  }, [onComplete]);

  // Keyboard handler
  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (state.phase === "loading" || state.phase === "completing" || state.phase === "complete") {
      return;
    }

    // Error state: Enter retries, Esc skips to chat
    if (state.error !== null) {
      if (keyName === "return" || keyName === "enter") {
        dispatch({ type: "SET_ERROR", error: "" });
        initStartedRef.current = false;
        dispatch({
          type: "DETECTION_COMPLETE",
          status: "first-run",
        });
        return;
      }
      if (keyName === "escape" || keyName === "esc") {
        handleSkipToChat();
        return;
      }
      return;
    }

    // Resume prompt navigation
    if (state.phase === "resume-prompt") {
      if (keyName === "up") {
        dispatch({ type: "RESUME_NAVIGATE_UP" });
        return;
      }
      if (keyName === "down") {
        dispatch({ type: "RESUME_NAVIGATE_DOWN" });
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        const selected = RESUME_OPTIONS[state.resumeSelectedIndex];
        if (selected.action === "continue") {
          void initializeEngine(false);
        } else if (selected.action === "restart") {
          void initializeEngine(true);
        } else if (selected.action === "skip") {
          handleSkipToChat();
        }
        return;
      }
      if (keyName === "escape" || keyName === "esc") {
        handleSkipToChat();
        return;
      }
      return;
    }

    // Active step navigation — steps handle their own Enter via onRequestNext;
    // wizard only handles Esc (back) at this level.
    if (state.phase === "active") {
      if (keyName === "escape" || keyName === "esc") {
        void handleBack();
        return;
      }
    }
  });

  // Render based on phase
  if (state.error !== null && state.error.length > 0) {
    return <ErrorView tokens={tokens} error={state.error} />;
  }

  switch (state.phase) {
    case "loading":
      return <LoadingView tokens={tokens} />;

    case "resume-prompt":
      return (
        <ResumePromptView
          tokens={tokens}
          resumeStep={state.resumeStep}
          selectedIndex={state.resumeSelectedIndex}
        />
      );

    case "active":
      if (state.engineState === null) {
        return <LoadingView tokens={tokens} />;
      }
      return (
        <ActiveStepView
          tokens={tokens}
          engineState={state.engineState}
          onStepData={handleStepData}
          onRequestNext={() => void handleNext()}
        />
      );

    case "completing":
      return <CompletingView tokens={tokens} engineState={state.engineState} />;

    case "complete":
      return null;

    default:
      return null;
  }
}
