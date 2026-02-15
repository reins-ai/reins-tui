import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleSetupCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Launching setup wizard",
    signals: [{ type: "RELAUNCH_ONBOARDING" }],
  });
};
