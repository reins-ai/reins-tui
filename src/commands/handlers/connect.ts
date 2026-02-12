import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleConnectCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Starting provider connection flow",
    responseText: undefined,
    signals: [{ type: "OPEN_CONNECT_FLOW" }],
  });
};
