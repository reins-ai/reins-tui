import { useEffect, useRef, useState } from "react";

import { ServiceInstaller, type ServiceDefinition } from "@reins/core";
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
  "http://localhost:7433/health",
  "http://[::1]:7433/health",
  "http://127.0.0.1:7433/health",
];
const HEALTH_TIMEOUT_MS = 3000;
const POST_START_DELAY_MS = 2500;

const SERVICE_DEFINITION: ServiceDefinition = {
  serviceName: "com.reins.daemon",
  displayName: "Reins Daemon",
  description: "Reins personal assistant background daemon",
  command: "bun",
  args: ["run", "reins-daemon"],
  workingDirectory: process.cwd(),
  env: {},
  autoRestart: true,
};

// ---------------------------------------------------------------------------
// Cross-platform detection helpers
// ---------------------------------------------------------------------------

/**
 * Try all loopback addresses in parallel. Returns true if any responds OK.
 * This handles IPv4-only (macOS/Windows), IPv6-only (Linux), and dual-stack.
 */
async function checkDaemonHealth(): Promise<boolean> {
  const results = await Promise.allSettled(
    HEALTH_URLS.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
        .then((r) => r.ok),
    ),
  );

  return results.some(
    (r) => r.status === "fulfilled" && r.value === true,
  );
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
  const [healthOk, serviceStatus] = await Promise.all([
    checkDaemonHealth(),
    detectServiceStatus(installer),
  ]);
  return { healthOk, serviceStatus };
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

    void (async () => {
      setStatus("detecting");
      setDetail(null);
      setServiceInfo(null);

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

        if (retry) {
          setServiceInfo("Service installed and running");
          setStatus("connected");
          onStepData({ daemonStatus: "connected", installed: true, serviceStatus: "running" });
          return;
        }

        setStatus("not-available");
        setDetail("Service is running but not responding to health checks.");
        setServiceInfo("Service status: running (unresponsive)");
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

          if (retry) {
            setServiceInfo("Service installed and running");
            setStatus("connected");
            onStepData({ daemonStatus: "connected", installed: true, serviceStatus: "running" });
            return;
          }
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
            {detail !== null ? (
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
                placeholder="http://192.168.1.100:7433"
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
