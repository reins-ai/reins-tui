import { getActiveDaemonUrl } from "../../daemon/actions";
import type { DaemonClient } from "../../daemon/client";
import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandHandlerContext } from "./types";

interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly errors: string[];
}

/**
 * Extract the httpBaseUrl from a DaemonClient if the concrete class exposes
 * its config. Mirrors the pattern used in browser.ts.
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

export const handleImportMemoriesCommand: CommandHandler = async (args, context) => {
  const path = args.positional.join(" ").trim();

  if (path.length === 0) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing path. Usage: /import-memories <path-to-json-or-directory>",
    });
  }

  const baseUrl = await resolveBaseUrl(context);
  const isJsonFile = path.endsWith(".json");
  const endpoint = isJsonFile
    ? "/api/memories/import/json"
    : "/api/memories/import/directory";
  const body = isJsonFile
    ? { inputPath: path }
    : { dirPath: path };

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return err({
        code: "UNSUPPORTED",
        message: `Import failed: ${errorText || `HTTP ${response.status}`}`,
      });
    }

    const result = (await response.json()) as ImportResult;
    const errorSuffix = result.errors.length > 0
      ? `, ${result.errors.length} errors`
      : "";

    return ok({
      statusMessage: `Imported ${result.imported} memories`,
      responseText: `✓ Imported ${result.imported} memories (${result.skipped} skipped${errorSuffix})`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return err({
      code: "UNSUPPORTED",
      message: `Import failed: ${message}`,
    });
  }
};
