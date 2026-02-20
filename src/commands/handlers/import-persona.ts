import { getActiveDaemonUrl } from "../../daemon/actions";
import type { DaemonClient } from "../../daemon/client";
import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandHandlerContext } from "./types";

interface ImportResult {
  readonly success: boolean;
  readonly personaName?: string;
  readonly importedAt?: string;
  readonly error?: string;
}

/**
 * Extract the httpBaseUrl from a DaemonClient if the concrete class exposes
 * its config. Mirrors the pattern used in export-persona.ts.
 */
function getDaemonClientHttpBaseUrl(client: DaemonClient): string | undefined {
  const candidate = client as { config?: { httpBaseUrl?: string } };
  const url = candidate.config?.httpBaseUrl;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

async function resolveBaseUrl(context: CommandHandlerContext): Promise<string> {
  if (context.daemonClient) {
    const url = getDaemonClientHttpBaseUrl(context.daemonClient);
    if (url) {
      return url;
    }
  }
  return getActiveDaemonUrl();
}

export const handleImportPersonaCommand: CommandHandler = async (args, context) => {
  const zipPath = args.positional.join(" ").trim();

  if (zipPath.length === 0) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing path. Usage: /import-persona <path-to-zip>",
    });
  }

  const baseUrl = await resolveBaseUrl(context);

  try {
    const response = await fetch(`${baseUrl}/api/persona/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zipPath }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return err({
        code: "UNSUPPORTED",
        message: `Import failed: ${errorText || `HTTP ${response.status}`}`,
      });
    }

    const result = (await response.json()) as ImportResult;

    if (!result.success) {
      return err({
        code: "UNSUPPORTED",
        message: `Import failed: ${result.error ?? "Unknown error"}`,
      });
    }

    return ok({
      statusMessage: "Persona imported",
      responseText: `✓ Persona "${result.personaName}" imported successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return err({
      code: "UNSUPPORTED",
      message: `Import failed: ${message}`,
    });
  }
};
