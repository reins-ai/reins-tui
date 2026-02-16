import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleIntegrationsCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Integrations panel",
    signals: [{ type: "OPEN_INTEGRATION_PANEL" }],
  });
};
