import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

export const handleSkillsCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Skills panel",
    signals: [{ type: "OPEN_SKILL_PANEL" }],
  });
};
