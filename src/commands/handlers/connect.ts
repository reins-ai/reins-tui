import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleConnectCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Starting provider connection flow",
    responseText: "Provider connection UI entrypoint signaled. Full interactive flow lands in Wave 7.",
    signals: [{ type: "OPEN_CONNECT_FLOW" }],
  });
};
