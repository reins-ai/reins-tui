import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleSearchSettingsCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Opening search settings",
    responseText: undefined,
    signals: [{ type: "OPEN_SEARCH_SETTINGS" }],
  });
};
