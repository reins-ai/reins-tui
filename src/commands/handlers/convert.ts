import type { DaemonClient } from "../../daemon/client";
import { getActiveDaemonUrl } from "../../daemon/actions";
import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandHandlerContext } from "./types";

// ---------------------------------------------------------------------------
// Daemon URL resolution (mirrors browser.ts pattern)
// ---------------------------------------------------------------------------

function getDaemonClientHttpBaseUrl(client: DaemonClient): string | undefined {
  const candidate = client as { config?: { httpBaseUrl?: string } };
  const url = candidate.config?.httpBaseUrl;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

export async function resolveConvertBaseUrl(
  context: CommandHandlerContext,
): Promise<string> {
  if (context.daemonClient) {
    const url = getDaemonClientHttpBaseUrl(context.daemonClient);
    if (url) {
      return url;
    }
  }
  return getActiveDaemonUrl();
}

// ---------------------------------------------------------------------------
// Subcommand: (no args) — launch conversion flow
// ---------------------------------------------------------------------------

const handleConvertFlow: CommandHandler = (_args, _context) => {
  return ok({
    statusMessage: "Opening OpenClaw conversion wizard",
    signals: [{ type: "OPEN_CONVERT_FLOW" }],
  });
};

// ---------------------------------------------------------------------------
// Subcommand: report — fetch and display last conversion report
// ---------------------------------------------------------------------------

const handleConvertReport: CommandHandler = async (_args, context) => {
  const baseUrl = await resolveConvertBaseUrl(context);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/convert/report`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (fetchError) {
    if (
      fetchError instanceof TypeError &&
      (fetchError.message.includes("fetch") || fetchError.message.includes("connect"))
    ) {
      return ok({
        statusMessage: "Daemon unavailable",
        responseText: "Unable to reach daemon. Is it running?",
      });
    }
    const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
    return ok({
      statusMessage: "Report fetch failed",
      responseText: `Failed to fetch report: ${message}`,
    });
  }

  if (response.status === 404) {
    return ok({
      statusMessage: "No conversion report found",
      responseText: "No conversion report found. Run `/convert` to start a conversion.",
    });
  }

  if (!response.ok) {
    return ok({
      statusMessage: "Report fetch failed",
      responseText: `Daemon returned HTTP ${response.status}.`,
    });
  }

  let body: { report: string | null };
  try {
    body = (await response.json()) as { report: string | null };
  } catch {
    return ok({
      statusMessage: "Invalid response",
      responseText: "Daemon returned an invalid response.",
    });
  }

  if (body.report === null || body.report.trim().length === 0) {
    return ok({
      statusMessage: "No conversion report found",
      responseText: "No conversion report found. Run `/convert` to start a conversion.",
    });
  }

  return ok({
    statusMessage: "Conversion report",
    responseText: body.report,
  });
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export const handleConvertCommand: CommandHandler = (args, context) => {
  const subcommand = args.positional[0]?.trim().toLowerCase();

  if (!subcommand) {
    return handleConvertFlow(args, context);
  }

  if (subcommand === "report") {
    return handleConvertReport(args, context);
  }

  return err({
    code: "INVALID_ARGUMENT",
    message: `Unknown subcommand '${subcommand}'. Usage: /convert, /convert report`,
  });
};
