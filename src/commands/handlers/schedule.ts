import { ok } from "../../daemon/contracts";
import type { CommandArgs, CommandHandlerResult } from "./types";

export function handleScheduleCommand(
  _args: CommandArgs,
  _context: unknown,
): CommandHandlerResult {
  return ok({
    statusMessage: "Schedule panel",
    signals: [{ type: "OPEN_SCHEDULE_PANEL" }],
  });
}
