import { OnboardingCheckpointService } from "@reins/core";

import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandResult, CommandError } from "./types";
import type { Result } from "../../daemon/contracts";

export interface ResetOnboardingDeps {
  checkpointService?: OnboardingCheckpointService;
}

export const handleSetupCommand: CommandHandler = (args) => {
  const subcommand = args.positional[0]?.toLowerCase();

  if (!subcommand) {
    return ok({
      statusMessage: "Launching setup wizard",
      signals: [{ type: "RELAUNCH_ONBOARDING" }],
    });
  }

  if (subcommand === "reset-onboarding") {
    return resetOnboarding();
  }

  return err({
    code: "INVALID_ARGUMENT",
    message: `Unknown subcommand '${subcommand}'. Usage: /setup or /setup reset-onboarding`,
  });
};

export async function resetOnboarding(
  deps?: ResetOnboardingDeps,
): Promise<Result<CommandResult, CommandError>> {
  const checkpoint = deps?.checkpointService ?? new OnboardingCheckpointService();
  const resetResult = await checkpoint.reset();

  if (!resetResult.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Failed to reset onboarding: ${resetResult.error.message}`,
    });
  }

  return ok({
    statusMessage: "Onboarding reset — launching setup wizard",
    signals: [{ type: "RELAUNCH_ONBOARDING" }],
  });
}
