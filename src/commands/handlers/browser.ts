import type { DaemonClient } from "../../daemon/client";
import { getActiveDaemonUrl } from "../../daemon/actions";
import { err, ok } from "../../daemon/contracts";
import type { CommandHandler, CommandHandlerContext } from "./types";

// ---------------------------------------------------------------------------
// Subcommand definitions
// ---------------------------------------------------------------------------

const BROWSER_SUBCOMMANDS = ["headed", "screenshot", "close"] as const;
type BrowserSubcommand = (typeof BROWSER_SUBCOMMANDS)[number];

/** Aliases that map to canonical subcommand names. */
const SUBCOMMAND_ALIASES: Readonly<Record<string, BrowserSubcommand>> = {
  h: "headed",
  ss: "screenshot",
  stop: "close",
};

function resolveBrowserSubcommand(value: string): BrowserSubcommand | null {
  const lower = value.trim().toLowerCase();
  if ((BROWSER_SUBCOMMANDS as readonly string[]).includes(lower)) {
    return lower as BrowserSubcommand;
  }
  return SUBCOMMAND_ALIASES[lower] ?? null;
}

// ---------------------------------------------------------------------------
// Daemon URL resolution (mirrors channels.ts pattern)
// ---------------------------------------------------------------------------

/**
 * Extract the httpBaseUrl from a DaemonClient if the concrete class exposes
 * its config. The DaemonClient interface does not include `config`, but the
 * concrete LiveDaemonClient class exposes `public readonly config`.
 */
function getDaemonClientHttpBaseUrl(client: DaemonClient): string | undefined {
  const candidate = client as { config?: { httpBaseUrl?: string } };
  const url = candidate.config?.httpBaseUrl;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

/**
 * Resolve the daemon HTTP base URL for browser commands.
 *
 * Priority:
 *   1. The active daemon client's configured httpBaseUrl.
 *   2. Fallback to getActiveDaemonUrl() (profile store / default).
 */
export async function resolveBrowserBaseUrl(
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
// Generic daemon HTTP helper
// ---------------------------------------------------------------------------

interface BrowserApiResponse {
  status?: string;
  message?: string;
  error?: string;
}

/**
 * Call a daemon browser API endpoint via POST.
 *
 * Returns the parsed JSON on success, or an error message on failure.
 * Never throws — all errors are captured as result values.
 */
export async function callBrowserApi(
  endpoint: string,
  body: Record<string, unknown> = {},
  timeoutMs: number = 10_000,
  fetchFn: typeof fetch = fetch,
  baseUrlOverride?: string,
): Promise<{ ok: true; data: BrowserApiResponse } | { ok: false; error: string }> {
  const baseUrl = baseUrlOverride ?? await getActiveDaemonUrl();

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.message.includes("timed out"))
    ) {
      return { ok: false, error: "Daemon request timed out. Try /browser to check status." };
    }
    if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("connect"))) {
      return { ok: false, error: "Unable to reach daemon. Is it running?" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Daemon request failed: ${message}` };
  }

  let data: BrowserApiResponse;
  try {
    data = (await response.json()) as BrowserApiResponse;
  } catch {
    return { ok: false, error: `Daemon returned invalid response (HTTP ${response.status})` };
  }

  if (!response.ok) {
    return { ok: false, error: data.error ?? `Daemon returned HTTP ${response.status}` };
  }

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

const handleBrowserHeaded: CommandHandler = async (_args, context) => {
  const baseUrl = await resolveBrowserBaseUrl(context);
  const result = await callBrowserApi("/api/browser/launch-headed", {}, 15_000, fetch, baseUrl);

  if (result.ok) {
    return ok({
      statusMessage: "Launching browser in headed mode",
      responseText: result.data.message ?? "Browser is relaunching in headed mode.",
      signals: [{ type: "OPEN_BROWSER_PANEL" }],
    });
  }

  // Graceful fallback — daemon may not support this endpoint yet
  return ok({
    statusMessage: "Headed mode requested",
    responseText: [
      "**Headed mode requested.**",
      "",
      "If the browser is currently running in headless mode, close it first",
      "with `/browser close`, then relaunch. The daemon will start Chrome",
      "with a visible window on the next browser tool invocation if configured.",
      "",
      "Check `/browser` for current status.",
    ].join("\n"),
    signals: [{ type: "OPEN_BROWSER_PANEL" }],
  });
};

const handleBrowserScreenshot: CommandHandler = async (_args, context) => {
  const baseUrl = await resolveBrowserBaseUrl(context);
  const result = await callBrowserApi(
    "/api/browser/screenshot",
    { quality: 80 },
    15_000,
    fetch,
    baseUrl,
  );

  if (result.ok) {
    const message = result.data.message ?? "Screenshot captured.";
    return ok({
      statusMessage: "Screenshot taken",
      responseText: message,
      signals: [{ type: "OPEN_BROWSER_PANEL" }],
    });
  }

  // Graceful fallback — screenshot endpoint may not exist yet
  return ok({
    statusMessage: "Screenshot",
    responseText: [
      "**Screenshot requested.**",
      "",
      "To capture a screenshot, ask the assistant:",
      '  "Take a screenshot of the current page"',
      "",
      "The assistant will use the `browser_act` tool with `action: screenshot`",
      "to capture and display the result.",
    ].join("\n"),
    signals: [{ type: "OPEN_BROWSER_PANEL" }],
  });
};

const handleBrowserClose: CommandHandler = async (_args, context) => {
  const baseUrl = await resolveBrowserBaseUrl(context);
  const result = await callBrowserApi("/api/browser/stop", {}, 10_000, fetch, baseUrl);

  if (result.ok) {
    return ok({
      statusMessage: "Browser closed",
      responseText: result.data.message ?? "Browser has been stopped.",
      signals: [{ type: "OPEN_BROWSER_PANEL" }],
    });
  }

  // Graceful fallback — stop endpoint may not exist yet
  return ok({
    statusMessage: "Browser close requested",
    responseText: [
      "**Browser stop requested.**",
      "",
      "If the daemon does not support the stop endpoint yet, the browser",
      "will be terminated when the daemon shuts down.",
      "",
      "Check `/browser` for current status.",
    ].join("\n"),
    signals: [{ type: "OPEN_BROWSER_PANEL" }],
  });
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export const handleBrowserCommand: CommandHandler = (args, context) => {
  const rawSubcommand = args.positional[0]?.trim().toLowerCase();

  if (!rawSubcommand) {
    return ok({
      statusMessage: "Browser panel",
      signals: [{ type: "OPEN_BROWSER_PANEL" }],
    });
  }

  const subcommand = resolveBrowserSubcommand(rawSubcommand);

  if (subcommand === null) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unknown subcommand '${rawSubcommand}'. Usage: /browser [${BROWSER_SUBCOMMANDS.join("|")}]`,
    });
  }

  const subcommandHandlers: Record<BrowserSubcommand, CommandHandler> = {
    headed: handleBrowserHeaded,
    screenshot: handleBrowserScreenshot,
    close: handleBrowserClose,
  };

  return subcommandHandlers[subcommand](args, context);
};
