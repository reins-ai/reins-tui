import { ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

/**
 * Handler for `/memory setup` subcommand.
 *
 * Emits an OPEN_EMBEDDING_SETUP signal so the app layer can present
 * the embedding provider configuration wizard. This command is
 * re-runnable — users can invoke it at any time to reconfigure.
 */
export const handleMemorySetupCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Opening embedding setup wizard",
    responseText: undefined,
    signals: [{ type: "OPEN_EMBEDDING_SETUP" }],
  });
};
