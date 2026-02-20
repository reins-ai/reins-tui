import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandResult, CommandError } from "./types";
import type { Result } from "../../daemon/contracts";

/**
 * Resolves the canonical user config path at the Reins data root.
 * Matches the resolution logic in greeting-service.ts and @reins/core user-config.
 */
function resolveConfigPath(): string {
  const platform = process.platform;
  const homeDirectory = homedir();

  let dataRoot: string;
  if (platform === "darwin") {
    dataRoot = join(homeDirectory, "Library", "Application Support", "reins");
  } else if (platform === "win32") {
    const appData = process.env.APPDATA ?? join(homeDirectory, "AppData", "Roaming");
    dataRoot = join(appData, "reins");
  } else {
    dataRoot = join(homeDirectory, ".reins");
  }

  return join(dataRoot, "config.json");
}

// --- Nudge config persistence ---

export interface NudgeConfigDeps {
  configPath?: string;
}

async function readNudgesEnabled(configPath: string): Promise<boolean> {
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return true; // default: nudges enabled
  }

  try {
    const raw = await file.json() as Record<string, unknown>;
    return raw.nudgesEnabled !== false;
  } catch {
    return true;
  }
}

async function writeNudgesEnabled(
  configPath: string,
  enabled: boolean,
): Promise<Result<void, CommandError>> {
  let existing: Record<string, unknown> = {};

  const file = Bun.file(configPath);
  if (await file.exists()) {
    try {
      existing = await file.json() as Record<string, unknown>;
    } catch {
      // Corrupt config — start fresh with just this field
      existing = {};
    }
  }

  existing.nudgesEnabled = enabled;

  try {
    await mkdir(dirname(configPath), { recursive: true });
    await Bun.write(configPath, `${JSON.stringify(existing, null, 2)}\n`);
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return err({
      code: "INVALID_ARGUMENT",
      message: `Failed to write nudge config: ${message}`,
    });
  }
}

// --- Briefing command ---

export interface BriefingGeneratorDeps {
  generateBriefing: () => Promise<Result<string, { message: string }>>;
}

/**
 * Handles `/briefing` — triggers immediate briefing generation and delivers
 * the result as a response in the active session.
 */
export function createBriefingHandler(deps: BriefingGeneratorDeps): CommandHandler {
  return async () => {
    const result = await deps.generateBriefing();

    if (!result.ok) {
      return err({
        code: "INVALID_ARGUMENT",
        message: `Briefing generation failed: ${result.error.message}`,
      });
    }

    return ok({
      statusMessage: "Briefing delivered",
      responseText: result.value,
    });
  };
}

/**
 * Default `/briefing` handler used when no briefing generator is injected.
 * Returns an informational message that the daemon must be running.
 */
export const handleBriefingCommand: CommandHandler = () => {
  return ok({
    statusMessage: "Briefing unavailable",
    responseText: "The briefing service is not available. Make sure the daemon is running.",
  });
};

// --- Nudges command ---

/**
 * Handles `/nudges on|off` — toggles nudge injection and persists state
 * to `~/.reins/config.json`.
 */
export const handleNudgesCommand: CommandHandler = async (args) => {
  return handleNudgesWithDeps(args.positional);
};

export async function handleNudgesWithDeps(
  positional: readonly string[],
  deps?: NudgeConfigDeps,
): Promise<Result<CommandResult, CommandError>> {
  const subcommand = positional[0]?.toLowerCase();
  const configPath = deps?.configPath ?? resolveConfigPath();

  if (!subcommand) {
    // Show current state
    const enabled = await readNudgesEnabled(configPath);
    return ok({
      statusMessage: `Nudges are currently ${enabled ? "on" : "off"}`,
    });
  }

  if (subcommand === "on") {
    const writeResult = await writeNudgesEnabled(configPath, true);
    if (!writeResult.ok) {
      return writeResult;
    }

    return ok({
      statusMessage: "Nudges enabled",
      responseText: "Nudge injection is now enabled. Relevant nudges will be included in conversations.",
    });
  }

  if (subcommand === "off") {
    const writeResult = await writeNudgesEnabled(configPath, false);
    if (!writeResult.ok) {
      return writeResult;
    }

    return ok({
      statusMessage: "Nudges disabled",
      responseText: "Nudge injection is now disabled. No nudges will be included in conversations.",
    });
  }

  return err({
    code: "INVALID_ARGUMENT",
    message: `Unknown subcommand '${subcommand}'. Usage: /nudges [on|off]`,
  });
}
