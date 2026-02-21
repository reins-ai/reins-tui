import { useEffect, useRef, useState } from "react";
import { homedir } from "node:os";
import { join } from "node:path";

import { DAEMON_PORT, ServiceInstaller, type ServiceDefinition } from "@reins/core";
import { Box, Input, Text, useKeyboard } from "../../../ui";
import { addDaemonProfile, isDaemonReachable } from "../../../daemon/actions";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DaemonStatus =
  | "detecting"
  | "connected"
  | "starting"
  | "not-available"
  | "error"
  | "configure-remote";

type ServiceState = "running" | "stopped" | "not-installed" | "unknown";

interface DetectionResult {
  healthOk: boolean;
  serviceStatus: ServiceState;
  diagnostic: NetworkDiagnostic | null;
}

/**
 * Parsed daemon health response used for functionality assessment.
 * Mirrors the HealthResponse shape from reins-core/src/daemon/server.ts.
 */
interface DaemonHealthDetail {
  status: string;
  version: string;
  capabilities: string[];
}

/**
 * Result of the extended functionality check performed after the basic
 * health check passes. Provides informational context about the daemon's
 * readiness without blocking the user from proceeding.
 */
interface FunctionalityResult {
  /** Whether the daemon is fully functional (all core capabilities present). */
  fullyFunctional: boolean;
  /** Human-readable informational messages about missing capabilities. */
  notices: string[];
}

/**
 * Diagnostic classification for daemon health check failures.
 * Used to provide actionable error messages instead of generic ones.
 */
export type NetworkDiagnosticKind =
  | "connection-refused"
  | "timeout"
  | "port-in-use"
  | "unknown";

export interface NetworkDiagnostic {
  kind: NetworkDiagnosticKind;
  message: string;
  hint: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Health check URLs to try. The daemon binds to hostname "localhost" which
 * may resolve to IPv4 (127.0.0.1) or IPv6 (::1) depending on the OS.
 * Bun's fetch may resolve "localhost" differently from the server, so we
 * try multiple addresses in parallel to guarantee at least one connects:
 *   - localhost  — works when DNS matches server bind (most cases)
 *   - [::1]      — explicit IPv6 loopback (Linux default for localhost)
 *   - 127.0.0.1  — explicit IPv4 loopback (macOS / Windows default)
 */
const HEALTH_URLS = [
  `http://localhost:${DAEMON_PORT}/health`,
  `http://[::1]:${DAEMON_PORT}/health`,
  `http://127.0.0.1:${DAEMON_PORT}/health`,
];
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
const POST_START_DELAY_MS = 2_500;

/** Working directory for the daemon service process. */
const DAEMON_WORKING_DIR = process.cwd();

const SERVICE_DEFINITION: ServiceDefinition = {
  serviceName: "com.reins.daemon",
  displayName: "Reins Daemon",
  description: "Reins personal assistant background daemon",
  command: "bun",
  args: ["run", "reins-daemon"],
  workingDirectory: DAEMON_WORKING_DIR,
  // Empty env — daemon inherits from process.env at spawn time
  env: {},
  autoRestart: true,
};

// ---------------------------------------------------------------------------
// Network diagnostics
// ---------------------------------------------------------------------------

/**
 * Resolve the platform-specific daemon log directory path.
 * Mirrors the logic in reins-core/src/daemon/paths.ts.
 */
function getDaemonLogPath(): string {
  const home = homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "reins", "logs");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "reins", "logs");
  }
  // Linux and other platforms
  return join(home, ".reins", "logs");
}

/**
 * Classify a fetch error into a specific diagnostic category.
 * Bun's fetch produces different error shapes depending on the failure:
 *   - ECONNREFUSED: daemon not running on that address
 *   - AbortError / TimeoutError: request timed out (AbortSignal.timeout)
 *   - EADDRINUSE: port conflict (rare from fetch, more common from bind)
 */
export function classifyFetchError(error: unknown): NetworkDiagnosticKind {
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();
  const code = (error as NodeJS.ErrnoException).code ?? "";

  // Connection refused — daemon is not listening
  if (code === "ECONNREFUSED" || message.includes("econnrefused") || message.includes("connection refused")) {
    return "connection-refused";
  }

  // Timeout — AbortSignal.timeout fires an AbortError or TimeoutError
  if (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    code === "ETIMEDOUT" ||
    message.includes("timed out") ||
    message.includes("timeout")
  ) {
    return "timeout";
  }

  // Port in use — unlikely from fetch but possible in some error chains
  if (code === "EADDRINUSE" || message.includes("eaddrinuse") || message.includes("address already in use")) {
    return "port-in-use";
  }

  return "unknown";
}

/**
 * Analyze all health check failures and produce a single actionable diagnostic.
 * Prioritizes the most informative error: connection-refused > timeout > port-in-use > unknown.
 */
export function diagnoseHealthFailure(results: PromiseSettledResult<boolean>[]): NetworkDiagnostic {
  const kinds = new Set<NetworkDiagnosticKind>();

  for (const result of results) {
    if (result.status === "rejected") {
      kinds.add(classifyFetchError(result.reason));
    }
  }

  if (kinds.has("connection-refused")) {
    return {
      kind: "connection-refused",
      message: `Connection refused — the daemon is not running on port ${DAEMON_PORT}.`,
      hint: "Run: reins daemon start",
    };
  }

  if (kinds.has("timeout")) {
    return {
      kind: "timeout",
      message: "Connection timed out — the daemon did not respond.",
      hint: `Check if a firewall is blocking port ${DAEMON_PORT}.`,
    };
  }

  if (kinds.has("port-in-use")) {
    return {
      kind: "port-in-use",
      message: `Port ${DAEMON_PORT} is already in use by another service.`,
      hint: "Stop the conflicting service or change the daemon port.",
    };
  }

  return {
    kind: "unknown",
    message: "Could not connect to the daemon.",
    hint: "Check the daemon logs for details.",
  };
}

// ---------------------------------------------------------------------------
// Cross-platform detection helpers
// ---------------------------------------------------------------------------

interface HealthCheckResult {
  ok: boolean;
  diagnostic: NetworkDiagnostic | null;
}

/**
 * Try all loopback addresses in parallel. Returns whether any responds OK
 * and, on failure, a diagnostic describing the most likely cause.
 * This handles IPv4-only (macOS/Windows), IPv6-only (Linux), and dual-stack.
 */
async function checkDaemonHealth(): Promise<HealthCheckResult> {
  const results = await Promise.allSettled(
    HEALTH_URLS.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) })
        .then((r) => r.ok),
    ),
  );

  const anyOk = results.some(
    (r) => r.status === "fulfilled" && r.value === true,
  );

  return {
    ok: anyOk,
    diagnostic: anyOk ? null : diagnoseHealthFailure(results),
  };
}

/**
 * Fetch and parse the daemon /health response body to assess functionality.
 * Tries all loopback addresses in parallel (same as checkDaemonHealth) and
 * returns the first successful parsed response.
 *
 * Returns null if no address responds or the body cannot be parsed.
 */
async function fetchDaemonHealthDetail(): Promise<DaemonHealthDetail | null> {
  const results = await Promise.allSettled(
    HEALTH_URLS.map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
      if (!response.ok) return null;
      const body = await response.json() as Record<string, unknown>;
      return body;
    }),
  );

  for (const result of results) {
    if (result.status !== "fulfilled" || result.value === null) continue;
    const body = result.value;

    const status = typeof body.status === "string" ? body.status : "unknown";
    const version = typeof body.version === "string" ? body.version : "unknown";

    // Capabilities live at discovery.capabilities in the health response
    let capabilities: string[] = [];
    const discovery = body.discovery;
    if (discovery && typeof discovery === "object" && !Array.isArray(discovery)) {
      const disc = discovery as Record<string, unknown>;
      if (Array.isArray(disc.capabilities)) {
        capabilities = disc.capabilities.filter((c): c is string => typeof c === "string");
      }
    }

    return { status, version, capabilities };
  }

  return null;
}

/**
 * Assess daemon functionality from the parsed health detail.
 * Returns informational notices about missing capabilities — these are
 * NON-BLOCKING and do not prevent the user from proceeding.
 */
function assessFunctionality(detail: DaemonHealthDetail): FunctionalityResult {
  const notices: string[] = [];
  const caps = new Set(detail.capabilities);

  if (!caps.has("conversations.crud") || !caps.has("messages.send")) {
    notices.push("Conversation services are not active — chat may not work until the daemon is restarted.");
  }

  if (!caps.has("memory.crud")) {
    notices.push("Memory services are not active — memory features will be unavailable.");
  }

  // providers.auth and providers.models are always present when the daemon
  // starts, so their absence would indicate a serious issue
  if (!caps.has("providers.auth") || !caps.has("providers.models")) {
    notices.push("Provider services are not fully initialized.");
  }

  return {
    fullyFunctional: notices.length === 0,
    notices,
  };
}

/**
 * Detect daemon state via ServiceInstaller.status() which dispatches to
 * the correct platform adapter:
 *   - macOS:   launchctl print
 *   - Linux:   systemctl --user show
 *   - Windows: sc.exe query
 */
async function detectServiceStatus(installer: ServiceInstaller): Promise<ServiceState> {
  try {
    const result = await installer.status(SERVICE_DEFINITION);
    return result.ok ? result.value : "unknown";
  } catch {
    return "unknown";
  }
}

async function detectDaemon(installer: ServiceInstaller): Promise<DetectionResult> {
  const [healthResult, serviceStatus] = await Promise.all([
    checkDaemonHealth(),
    detectServiceStatus(installer),
  ]);
  return { healthOk: healthResult.ok, serviceStatus, diagnostic: healthResult.diagnostic };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("plainText" in value && typeof value.plainText === "string") return value.plainText;
    if ("value" in value && typeof value.value === "string") return value.value;
  }
  return "";
}

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  // Prepend http:// if no scheme present
  if (url.length > 0 && !url.startsWith("http://") && !url.startsWith("https://")) {
    url = `http://${url}`;
  }
  // Remove trailing slash
  return url.replace(/\/+$/, "");
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DaemonInstallStepView({ tokens, engineState: _engineState, onStepData, onRequestNext }: StepViewProps) {
  const [status, setStatus] = useState<DaemonStatus>("detecting");
  const [detail, setDetail] = useState<string | null>(null);
  const [serviceInfo, setServiceInfo] = useState<string | null>(null);
  const [functionalityInfo, setFunctionalityInfo] = useState<FunctionalityResult | null>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState<NetworkDiagnostic | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Remote endpoint state
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteChecking, setRemoteChecking] = useState(false);

  // Track the status before entering configure-remote so we can go back
  const previousStatusRef = useRef<DaemonStatus>("not-available");

  useEffect(() => {
    let cancelled = false;
    const installer = new ServiceInstaller();

    /**
     * Run the extended functionality check after health passes.
     * This is non-blocking — it only sets informational state.
     */
    const runFunctionalityCheck = async (): Promise<void> => {
      const healthDetail = await fetchDaemonHealthDetail();
      if (cancelled) return;

      if (healthDetail) {
        const result = assessFunctionality(healthDetail);
        setFunctionalityInfo(result);
      }
    };

    void (async () => {
      setStatus("detecting");
      setDetail(null);
      setServiceInfo(null);
      setFunctionalityInfo(null);
      setDiagnosticInfo(null);

      // --- Phase 1: detect current state ---
      const detection = await detectDaemon(installer);
      if (cancelled) return;

      // Fast path: daemon is healthy
      if (detection.healthOk) {
        const info = detection.serviceStatus === "running"
          ? "Service installed and running"
          : detection.serviceStatus === "not-installed"
            ? "Daemon running (not registered as service)"
            : "Daemon running";
        setServiceInfo(info);
        setStatus("connected");
        onStepData({ daemonStatus: "connected", installed: true, serviceStatus: detection.serviceStatus });
        // Run extended functionality check (non-blocking)
        void runFunctionalityCheck();
        return;
      }

      // --- Phase 2: health failed — act on service status ---

      if (detection.serviceStatus === "running") {
        // Service registered and running but health check failed — may
        // still be booting. Wait and retry health once.
        setStatus("starting");
        setServiceInfo("Service is running — waiting for health check...");

        await new Promise((resolve) => setTimeout(resolve, POST_START_DELAY_MS));
        if (cancelled) return;

        const retry = await checkDaemonHealth();
        if (cancelled) return;

        if (retry.ok) {
          setServiceInfo("Service installed and running");
          setStatus("connected");
          onStepData({ daemonStatus: "connected", installed: true, serviceStatus: "running" });
          void runFunctionalityCheck();
          return;
        }

        setStatus("not-available");
        setDetail("Service is running but not responding to health checks.");
        setServiceInfo("Service status: running (unresponsive)");
        setDiagnosticInfo(retry.diagnostic);
        onStepData({ daemonStatus: "not-available", installed: true, serviceStatus: "running" });
        return;
      }

      if (detection.serviceStatus === "stopped") {
        // Service exists but stopped (could be "inactive" or "failed").
        // Try a safe start — this never overwrites the existing config.
        setStatus("starting");
        setServiceInfo("Service found — starting...");

        const startResult = await installer.start(SERVICE_DEFINITION);
        if (cancelled) return;

        if (startResult.ok) {
          await new Promise((resolve) => setTimeout(resolve, POST_START_DELAY_MS));
          if (cancelled) return;

          const retry = await checkDaemonHealth();
          if (cancelled) return;

          if (retry.ok) {
            setServiceInfo("Service installed and running");
            setStatus("connected");
            onStepData({ daemonStatus: "connected", installed: true, serviceStatus: "running" });
            void runFunctionalityCheck();
            return;
          }

          setDiagnosticInfo(retry.diagnostic);
        }

        setStatus("not-available");
        setDetail("Service is installed but could not be started.");
        setServiceInfo("Service status: stopped");
        onStepData({ daemonStatus: "not-available", installed: true, serviceStatus: "stopped" });
        return;
      }

      // Service not installed or status unknown — do NOT auto-install
      // as writing a service file with incorrect paths can break an
      // existing installation. Show guidance instead.
      setStatus("not-available");
      setDiagnosticInfo(detection.diagnostic);
      if (detection.serviceStatus === "not-installed") {
        setDetail("No daemon service detected. See docs to install.");
        setServiceInfo("Service status: not installed");
      } else {
        setDetail("Could not determine daemon status.");
        setServiceInfo("Service status: unknown");
      }
      onStepData({ daemonStatus: "not-available", installed: false, serviceStatus: detection.serviceStatus });
    })();

    return () => {
      cancelled = true;
    };
  }, [retryCount, onStepData]);

  // --- Remote endpoint submission ---
  const handleRemoteSubmit = async () => {
    const normalized = normalizeUrl(remoteUrl);
    if (!normalized || !isValidUrl(normalized)) {
      setRemoteError("Invalid URL. Use format: http://host:port or https://host:port");
      return;
    }

    setRemoteChecking(true);
    setRemoteError(null);

    const reachable = await isDaemonReachable(normalized);
    setRemoteChecking(false);

    if (!reachable) {
      setRemoteError(`Could not reach daemon at ${normalized}`);
      return;
    }

    // Save as a daemon profile and mark as default
    const addResult = await addDaemonProfile("remote", normalized);
    if (!addResult.ok) {
      // Profile may already exist — that's fine, proceed anyway
    }

    onStepData({ daemonStatus: "remote", endpointUrl: normalized, installed: false });
    onRequestNext();
  };

  useKeyboard((event) => {
    const keyName = event.name ?? "";

    // --- Configure remote step ---
    if (status === "configure-remote") {
      if (keyName === "escape" || keyName === "esc") {
        setStatus(previousStatusRef.current);
        setRemoteUrl("");
        setRemoteError(null);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        if (!remoteChecking) {
          void handleRemoteSubmit();
        }
        return;
      }
      // Let Input component handle other keys
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      if (status === "connected") {
        onRequestNext();
        return;
      }
      if (status === "not-available" || status === "error") {
        // Continue without daemon — user can start it later
        onStepData({ daemonStatus: "skipped", installed: false });
        onRequestNext();
        return;
      }
      return;
    }

    if (keyName === "tab") {
      if (status === "not-available" || status === "error") {
        setRetryCount((c) => c + 1);
        return;
      }
    }

    if (keyName === "c") {
      if (status === "not-available" || status === "error") {
        previousStatusRef.current = status;
        setStatus("configure-remote");
        setRemoteUrl("");
        setRemoteError(null);
        return;
      }
    }
  });

  // Hint text
  let hintText: string;
  if (status === "detecting" || status === "starting") {
    hintText = "Please wait...  Esc back";
  } else if (status === "connected") {
    hintText = "Enter continue  ·  Esc back";
  } else if (status === "configure-remote") {
    hintText = remoteChecking ? "Checking..."  : "Enter connect  ·  Esc back";
  } else {
    hintText = "Enter skip  ·  c remote endpoint  ·  Tab retry  ·  Esc back";
  }

  return (
    <Box style={{ flexDirection: "column" }}>
      <Box>
        <Text
          content="The Reins daemon runs in the background to manage AI connections."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Status display */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {status === "detecting" ? (
          <Box>
            <Text
              content="* Detecting daemon status..."
              style={{ color: tokens["text.secondary"] }}
            />
          </Box>
        ) : null}

        {status === "starting" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box>
              <Text
                content="* Daemon service found — starting..."
                style={{ color: tokens["text.secondary"] }}
              />
            </Box>
            {serviceInfo !== null ? (
              <Box style={{ marginTop: 1, paddingLeft: 2 }}>
                <Text content={serviceInfo} style={{ color: tokens["text.muted"] }} />
              </Box>
            ) : null}
          </Box>
        ) : null}

        {status === "connected" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box>
              <Text
                content="* Daemon connected"
                style={{ color: tokens["status.success"] }}
              />
            </Box>
            {serviceInfo !== null ? (
              <Box style={{ marginTop: 1, paddingLeft: 2 }}>
                <Text content={serviceInfo} style={{ color: tokens["text.muted"] }} />
              </Box>
            ) : null}
            {functionalityInfo !== null && functionalityInfo.fullyFunctional ? (
              <Box style={{ marginTop: 1, paddingLeft: 2 }}>
                <Text
                  content="All services active"
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            ) : null}
            {functionalityInfo !== null && !functionalityInfo.fullyFunctional ? (
              <Box style={{ flexDirection: "column", marginTop: 1, paddingLeft: 2 }}>
                {functionalityInfo.notices.map((notice, i) => (
                  <Box key={i}>
                    <Text
                      content={`! ${notice}`}
                      style={{ color: tokens["status.warning"] }}
                    />
                  </Box>
                ))}
                <Box style={{ marginTop: 1 }}>
                  <Text
                    content="These will be resolved as you continue setup."
                    style={{ color: tokens["text.muted"] }}
                  />
                </Box>
              </Box>
            ) : null}
          </Box>
        ) : null}

        {status === "not-available" || status === "error" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box>
              <Text
                content={`x ${status === "error" ? "Daemon error" : "Daemon not available"}`}
                style={{ color: tokens["status.error"] }}
              />
            </Box>
            {diagnosticInfo !== null ? (
              <Box style={{ flexDirection: "column", marginTop: 1, paddingLeft: 2 }}>
                <Box>
                  <Text content={diagnosticInfo.message} style={{ color: tokens["status.warning"] }} />
                </Box>
                <Box style={{ marginTop: 1 }}>
                  <Text content={diagnosticInfo.hint} style={{ color: tokens["text.secondary"] }} />
                </Box>
              </Box>
            ) : null}
            {detail !== null && diagnosticInfo === null ? (
              <Box style={{ marginTop: 1, paddingLeft: 2 }}>
                <Text content={detail} style={{ color: tokens["text.muted"] }} />
              </Box>
            ) : null}
            {serviceInfo !== null ? (
              <Box style={{ marginTop: 1, paddingLeft: 2 }}>
                <Text content={serviceInfo} style={{ color: tokens["text.muted"] }} />
              </Box>
            ) : null}
            <Box style={{ marginTop: 1, paddingLeft: 2 }}>
              <Text
                content={`Logs: ${getDaemonLogPath()}`}
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
            <Box style={{ marginTop: 1, paddingLeft: 2 }}>
              <Text
                content="You can continue setup, start the daemon later, or configure a remote endpoint."
                style={{ color: tokens["text.secondary"] }}
              />
            </Box>
          </Box>
        ) : null}

        {/* Configure remote endpoint form */}
        {status === "configure-remote" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box>
              <Text
                content="Configure Remote Daemon"
                style={{ color: tokens["accent.primary"] }}
              />
            </Box>
            <Box style={{ marginTop: 1, paddingLeft: 2, flexDirection: "column" }}>
              <Box>
                <Text
                  content="Enter the URL of a running Reins daemon:"
                  style={{ color: tokens["text.secondary"] }}
                />
              </Box>
              <Box style={{ marginTop: 1, flexDirection: "row" }}>
                <Text content="URL: " style={{ color: tokens["text.muted"] }} />
                <Text
                  content={remoteUrl || " "}
                  style={{ color: tokens["text.primary"] }}
                />
              </Box>
              <Input
                focused
                placeholder={`http://192.168.1.100:${DAEMON_PORT}`}
                value={remoteUrl}
                onInput={(value) => setRemoteUrl(extractInputValue(value))}
              />
              {remoteError !== null ? (
                <Box style={{ marginTop: 1 }}>
                  <Text
                    content={`x ${remoteError}`}
                    style={{ color: tokens["status.error"] }}
                  />
                </Box>
              ) : null}
              {remoteChecking ? (
                <Box style={{ marginTop: 1 }}>
                  <Text
                    content="* Checking endpoint..."
                    style={{ color: tokens["text.secondary"] }}
                  />
                </Box>
              ) : null}
            </Box>
          </Box>
        ) : null}
      </Box>

      {/* Hint */}
      <Box style={{ marginTop: 2 }}>
        <Text content={hintText} style={{ color: tokens["text.muted"] }} />
      </Box>
    </Box>
  );
}
