import { getActiveDaemonUrl } from "../../daemon/actions";
import type { DaemonClient } from "../../daemon/client";
import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandHandlerContext } from "./types";

interface ExportResult {
  readonly success: boolean;
  readonly path?: string;
  readonly exportedAt?: string;
  readonly error?: string;
}

/**
 * Extract the httpBaseUrl from a DaemonClient if the concrete class exposes
 * its config. Mirrors the pattern used in import-memories.ts.
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

export const handleExportPersonaCommand: CommandHandler = async (args, context) => {
  const outputDir = args.positional.join(" ").trim() || undefined;

  const baseUrl = await resolveBaseUrl(context);
  const body: { outputDir?: string } = {};
  if (outputDir) {
    body.outputDir = outputDir;
  }

  try {
    const response = await fetch(`${baseUrl}/api/persona/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return err({
        code: "UNSUPPORTED",
        message: `Export failed: ${errorText || `HTTP ${response.status}`}`,
      });
    }

    const result = (await response.json()) as ExportResult;

    if (!result.success) {
      return err({
        code: "UNSUPPORTED",
        message: `Export failed: ${result.error ?? "Unknown error"}`,
      });
    }

    return ok({
      statusMessage: "Persona exported",
      responseText: `✓ Persona exported to: ${result.path}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return err({
      code: "UNSUPPORTED",
      message: `Export failed: ${message}`,
    });
  }
};
