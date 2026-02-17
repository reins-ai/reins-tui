import { useCallback, useEffect, useReducer } from "react";

import type {
  InstallResult,
  InstallStep,
  IntegrationInfo,
  MarketplaceTrustLevel,
} from "@reins/core";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";
import { TrustBadge } from "./TrustBadge";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InstallFlowProps {
  readonly skillName: string;
  readonly skillVersion: string;
  readonly skillAuthor: string;
  readonly trustLevel: MarketplaceTrustLevel;
  readonly requiredTools: string[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onComplete: () => void;
  readonly onRetry: () => void;
  readonly onPromptSetup?: () => void;
  readonly installProgress: InstallStep | null;
  readonly installError: string | null;
  readonly installResult: InstallResult | null;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type FlowStep = "preview" | "confirm" | "progress" | "done" | "error";

export interface FlowState {
  readonly step: FlowStep;
}

export type FlowAction =
  | { type: "ADVANCE_TO_CONFIRM" }
  | { type: "ADVANCE_TO_PROGRESS" }
  | { type: "ADVANCE_TO_DONE" }
  | { type: "SET_ERROR" }
  | { type: "RETRY" };

export const INITIAL_FLOW_STATE: FlowState = {
  step: "preview",
};

export function installFlowReducer(
  state: FlowState,
  action: FlowAction,
): FlowState {
  switch (action.type) {
    case "ADVANCE_TO_CONFIRM":
      if (state.step === "preview") {
        return { step: "confirm" };
      }
      return state;

    case "ADVANCE_TO_PROGRESS":
      if (state.step === "confirm") {
        return { step: "progress" };
      }
      return state;

    case "ADVANCE_TO_DONE":
      if (state.step === "progress") {
        return { step: "done" };
      }
      return state;

    case "SET_ERROR":
      if (state.step === "progress") {
        return { step: "error" };
      }
      return state;

    case "RETRY":
      if (state.step === "error") {
        return { step: "confirm" };
      }
      return state;

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Install step checklist
// ---------------------------------------------------------------------------

/**
 * The ordered install substeps displayed in the progress checklist.
 */
export const INSTALL_SUBSTEPS: readonly InstallStep[] = [
  "downloading",
  "extracting",
  "migrating",
  "validating",
  "installing",
];

/**
 * Human-readable labels for each install substep.
 */
export const INSTALL_STEP_LABELS: Record<string, string> = {
  downloading: "Downloading",
  extracting: "Extracting",
  migrating: "Migrating",
  validating: "Validating",
  installing: "Installing",
};

export type ChecklistItemStatus = "pending" | "active" | "complete";

export interface ChecklistItem {
  readonly step: InstallStep;
  readonly label: string;
  readonly status: ChecklistItemStatus;
}

/**
 * Builds the progress checklist from the current install step.
 * Steps before the current one are "complete", the current one is "active",
 * and steps after are "pending".
 */
export function buildChecklist(currentStep: InstallStep | null): ChecklistItem[] {
  if (currentStep === null) {
    return INSTALL_SUBSTEPS.map((step) => ({
      step,
      label: INSTALL_STEP_LABELS[step] ?? step,
      status: "pending" as ChecklistItemStatus,
    }));
  }

  // "complete" and "failed" are terminal — mark everything as complete
  if (currentStep === "complete") {
    return INSTALL_SUBSTEPS.map((step) => ({
      step,
      label: INSTALL_STEP_LABELS[step] ?? step,
      status: "complete" as ChecklistItemStatus,
    }));
  }

  // "detecting" maps between extracting and migrating — treat as extracting active
  const effectiveStep = currentStep === "detecting" ? "extracting" : currentStep;

  const currentIndex = INSTALL_SUBSTEPS.indexOf(effectiveStep as InstallStep);
  if (currentIndex === -1) {
    // Unknown step — show all as pending
    return INSTALL_SUBSTEPS.map((step) => ({
      step,
      label: INSTALL_STEP_LABELS[step] ?? step,
      status: "pending" as ChecklistItemStatus,
    }));
  }

  return INSTALL_SUBSTEPS.map((step, index) => {
    let status: ChecklistItemStatus;
    if (index < currentIndex) {
      status = "complete";
    } else if (index === currentIndex) {
      status = "active";
    } else {
      status = "pending";
    }

    return {
      step,
      label: INSTALL_STEP_LABELS[step] ?? step,
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// Help actions per step
// ---------------------------------------------------------------------------

export interface HelpAction {
  readonly key: string;
  readonly label: string;
}

export function getInstallFlowHelpActions(
  step: FlowStep,
  options?: { canPromptSetup?: boolean },
): readonly HelpAction[] {
  const canPromptSetup = options?.canPromptSetup === true;

  switch (step) {
    case "preview":
      return [
        { key: "Enter", label: "Continue" },
        { key: "Esc", label: "Cancel" },
      ];

    case "confirm":
      return [
        { key: "Enter", label: "Install" },
        { key: "Esc", label: "Cancel" },
      ];

    case "progress":
      return [];

    case "done":
      return canPromptSetup
        ? [
            { key: "p", label: "Prompt Reins to setup" },
            { key: "Esc", label: "Back" },
          ]
        : [
            { key: "Esc", label: "Back" },
          ];

    case "error":
      return [
        { key: "r", label: "Retry" },
        { key: "Esc", label: "Cancel" },
      ];

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Checklist status symbols
// ---------------------------------------------------------------------------

export function getChecklistSymbol(status: ChecklistItemStatus): string {
  switch (status) {
    case "complete":
      return "✓";
    case "active":
      return "◉";
    case "pending":
      return "☐";
    default:
      return "☐";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PreviewStep({
  skillName,
  skillVersion,
  skillAuthor,
  trustLevel,
  requiredTools,
  tokens,
}: {
  skillName: string;
  skillVersion: string;
  skillAuthor: string;
  trustLevel: MarketplaceTrustLevel;
  requiredTools: string[];
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Install Preview"
        style={{ color: tokens["text.primary"], fontWeight: "bold" }}
      />
      <Box style={{ flexDirection: "column", marginTop: 1, paddingLeft: 2 }}>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Skill: " style={{ color: tokens["text.muted"] }} />
          <Text content={skillName} style={{ color: tokens["text.primary"] }} />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Version: " style={{ color: tokens["text.muted"] }} />
          <Text content={skillVersion} style={{ color: tokens["text.secondary"] }} />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Author: " style={{ color: tokens["text.muted"] }} />
          <Text content={skillAuthor} style={{ color: tokens["text.secondary"] }} />
        </Box>
        <Box style={{ flexDirection: "row" }}>
          <Text content="Trust: " style={{ color: tokens["text.muted"] }} />
          <TrustBadge level={trustLevel} />
        </Box>
        {requiredTools.length > 0 ? (
          <Box style={{ flexDirection: "column", marginTop: 1 }}>
            <Text content="Required Tools:" style={{ color: tokens["text.muted"] }} />
            {requiredTools.map((tool) => (
              <Box key={tool} style={{ flexDirection: "row", paddingLeft: 2 }}>
                <Text content="• " style={{ color: tokens["accent.primary"] }} />
                <Text content={tool} style={{ color: tokens["text.primary"] }} />
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function ConfirmStep({
  skillName,
  skillVersion,
  tokens,
}: {
  skillName: string;
  skillVersion: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content={`Install ${skillName} v${skillVersion}?`}
        style={{ color: tokens["text.primary"], fontWeight: "bold" }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Press Enter to confirm | Esc to cancel"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}

function ProgressStep({
  checklist,
  tokens,
}: {
  checklist: ChecklistItem[];
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Installing..."
        style={{ color: tokens["text.primary"], fontWeight: "bold" }}
      />
      <Box style={{ flexDirection: "column", marginTop: 1, paddingLeft: 2 }}>
        {checklist.map((item) => {
          const symbol = getChecklistSymbol(item.status);
          let symbolColor = tokens["text.muted"];
          if (item.status === "complete") {
            symbolColor = tokens["status.success"];
          } else if (item.status === "active") {
            symbolColor = tokens["accent.primary"];
          }

          return (
            <Box key={item.step} style={{ flexDirection: "row" }}>
              <Text content={symbol} style={{ color: symbolColor }} />
              <Text content={` ${item.label}`} style={{ color: tokens["text.secondary"] }} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/**
 * Extract concise setup commands/steps from integration sections.
 * Pulls the first few numbered-list or code-fence items from setup-related
 * sections to keep the TUI output compact.
 */
export function extractSetupHints(sections: IntegrationInfo["sections"]): string[] {
  const SETUP_TITLES = ["setup", "installation", "getting started", "prerequisites", "configuration"];
  const hints: string[] = [];

  for (const section of sections) {
    if (!SETUP_TITLES.includes(section.title.toLowerCase())) continue;

    const lines = section.content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Numbered list items (e.g. "1. Install ffmpeg")
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
      if (numberedMatch) {
        hints.push(numberedMatch[1]);
        if (hints.length >= 4) return hints;
        continue;
      }
      // Inline code commands (e.g. "  `brew install ffmpeg`")
      const codeMatch = trimmed.match(/^`([^`]+)`$/);
      if (codeMatch) {
        hints.push(codeMatch[1]);
        if (hints.length >= 4) return hints;
        continue;
      }
    }
  }

  return hints;
}

function IntegrationBlock({
  integration,
  tokens,
}: {
  integration: IntegrationInfo;
  tokens: Record<string, string>;
}) {
  if (integration.setupRequired) {
    const hints = extractSetupHints(integration.sections);
    return (
      <Box style={{ flexDirection: "column", marginTop: 1 }}>
        <Text
          content="⚠ Setup required"
          style={{ color: tokens["status.warning"], fontWeight: "bold" }}
        />
        {hints.length > 0 ? (
          <Box style={{ flexDirection: "column", paddingLeft: 2 }}>
            {hints.map((hint, i) => (
              <Box key={`hint-${i}`} style={{ flexDirection: "row" }}>
                <Text content={`${i + 1}. `} style={{ color: tokens["text.muted"] }} />
                <Text content={hint} style={{ color: tokens["text.primary"] }} />
              </Box>
            ))}
          </Box>
        ) : null}
        <Box style={{ flexDirection: "row", marginTop: 1, paddingLeft: 2 }}>
          <Text content="Guide: " style={{ color: tokens["text.muted"] }} />
          <Text content={integration.guidePath} style={{ color: tokens["accent.primary"] }} />
        </Box>
      </Box>
    );
  }

  // setupRequired=false but integration guide exists — light note
  return (
    <Box style={{ flexDirection: "row", marginTop: 1 }}>
      <Text
        content="ℹ Integration guide available: "
        style={{ color: tokens["text.muted"] }}
      />
      <Text
        content={integration.guidePath}
        style={{ color: tokens["accent.primary"] }}
      />
    </Box>
  );
}

function DoneStep({
  skillName,
  skillVersion,
  migrated,
  integration,
  canPromptSetup,
  tokens,
}: {
  skillName: string;
  skillVersion: string;
  migrated: boolean;
  integration?: IntegrationInfo;
  canPromptSetup: boolean;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content={`✓ Successfully installed ${skillName} v${skillVersion}`}
        style={{ color: tokens["status.success"], fontWeight: "bold" }}
      />
      {migrated ? (
        <Box style={{ marginTop: 1 }}>
          <Text
            content="Note: This skill was migrated from OpenClaw format"
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
      {integration ? (
        <IntegrationBlock integration={integration} tokens={tokens} />
      ) : null}
      {canPromptSetup ? (
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text content="[p]" style={{ color: tokens["accent.primary"] }} />
          <Text content=" Prompt Reins to setup" style={{ color: tokens["text.secondary"] }} />
        </Box>
      ) : null}
    </Box>
  );
}

function ErrorStep({
  error,
  tokens,
}: {
  error: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content={`✗ Installation failed: ${error}`}
        style={{ color: tokens["status.error"], fontWeight: "bold" }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="Press r to retry | Esc to cancel"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}

function InstallFlowHelpBar({
  step,
  canPromptSetup,
  tokens,
}: {
  step: FlowStep;
  canPromptSetup: boolean;
  tokens: Record<string, string>;
}) {
  const actions = getInstallFlowHelpActions(step, { canPromptSetup });
  if (actions.length === 0) return null;

  return (
    <Box style={{ flexDirection: "row" }}>
      {actions.map((action, index) => (
        <Box key={action.key} style={{ flexDirection: "row" }}>
          {index > 0 ? (
            <Text content="  " style={{ color: tokens["text.muted"] }} />
          ) : null}
          <Text
            content={`[${action.key}]`}
            style={{ color: tokens["accent.primary"] }}
          />
          <Text
            content={` ${action.label}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InstallFlow({
  skillName,
  skillVersion,
  skillAuthor,
  trustLevel,
  requiredTools,
  onConfirm,
  onCancel,
  onComplete,
  onRetry,
  onPromptSetup,
  installProgress,
  installError,
  installResult,
}: InstallFlowProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(installFlowReducer, INITIAL_FLOW_STATE);
  const canPromptSetup = installResult !== null;

  // --- React to external progress/error/result changes ---
  useEffect(() => {
    if (installProgress === "complete" && state.step === "progress") {
      dispatch({ type: "ADVANCE_TO_DONE" });
    }
  }, [installProgress, state.step]);

  useEffect(() => {
    if (installError && state.step === "progress") {
      dispatch({ type: "SET_ERROR" });
    }
  }, [installError, state.step]);

  // --- Keyboard handling ---
  useKeyboard(useCallback((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // Esc cancels/goes back from any step
    if (keyName === "escape" || keyName === "esc") {
      if (state.step === "done") {
        onComplete();
      } else if (state.step !== "progress") {
        onCancel();
      }
      return;
    }

    // Enter advances through preview → confirm → progress
    if (keyName === "return" || keyName === "enter") {
      if (state.step === "preview") {
        dispatch({ type: "ADVANCE_TO_CONFIRM" });
        return;
      }
      if (state.step === "confirm") {
        dispatch({ type: "ADVANCE_TO_PROGRESS" });
        onConfirm();
        return;
      }
      return;
    }

    // r retries from error
    if ((keyName === "r" || sequence === "r") && state.step === "error") {
      dispatch({ type: "RETRY" });
      onRetry();
      return;
    }

    if ((keyName === "p" || sequence === "p") && state.step === "done" && canPromptSetup) {
      onPromptSetup?.();
      return;
    }
  }, [state.step, onConfirm, onCancel, onComplete, onRetry, onPromptSetup, canPromptSetup]));

  // --- Build checklist for progress step ---
  const checklist = buildChecklist(installProgress);

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Box style={{ flexDirection: "column", flexGrow: 1, paddingLeft: 2, paddingTop: 1 }}>
        {state.step === "preview" ? (
          <PreviewStep
            skillName={skillName}
            skillVersion={skillVersion}
            skillAuthor={skillAuthor}
            trustLevel={trustLevel}
            requiredTools={requiredTools}
            tokens={tokens}
          />
        ) : null}

        {state.step === "confirm" ? (
          <ConfirmStep
            skillName={skillName}
            skillVersion={skillVersion}
            tokens={tokens}
          />
        ) : null}

        {state.step === "progress" ? (
          <ProgressStep checklist={checklist} tokens={tokens} />
        ) : null}

        {state.step === "done" ? (
          <DoneStep
            skillName={skillName}
            skillVersion={skillVersion}
            migrated={installResult?.migrated ?? false}
            integration={installResult?.integration}
            canPromptSetup={canPromptSetup}
            tokens={tokens}
          />
        ) : null}

        {state.step === "error" ? (
          <ErrorStep
            error={installError ?? "Unknown error"}
            tokens={tokens}
          />
        ) : null}
      </Box>

      <Box style={{ marginTop: 1 }}>
        <InstallFlowHelpBar step={state.step} canPromptSetup={canPromptSetup} tokens={tokens} />
      </Box>
    </Box>
  );
}
