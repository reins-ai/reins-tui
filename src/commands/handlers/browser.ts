import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleBrowserCommand: CommandHandler = (_args, _context) => {
  return ok({
    statusMessage: "Browser panel",
    signals: [{ type: "OPEN_BROWSER_PANEL" }],
  });
};
