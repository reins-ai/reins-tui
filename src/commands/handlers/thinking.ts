import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleThinkingCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Thinking visibility toggled",
    signals: [{ type: "TOGGLE_THINKING_VISIBILITY" }],
  });
};
