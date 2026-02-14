import { useEffect, useState } from "react";

import { Box, Text } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DaemonStatus = "checking" | "connected" | "installing" | "not-found" | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DaemonInstallStepView({ tokens, engineState: _engineState, onStepData }: StepViewProps) {
  const [status, setStatus] = useState<DaemonStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // On mount, simulate a daemon health check
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setStatus("checking");

      // Attempt to reach the daemon health endpoint
      try {
        const response = await fetch("http://127.0.0.1:7433/health", {
          signal: AbortSignal.timeout(3000),
        });

        if (cancelled) return;

        if (response.ok) {
          setStatus("connected");
          onStepData({ daemonStatus: "connected", installed: true });
          return;
        }
      } catch {
        // Daemon not reachable — try install
      }

      if (cancelled) return;

      // Daemon not found — attempt install
      setStatus("installing");
      onStepData({ daemonStatus: "installing", installed: false });

      // Give the install process a moment (the actual install is handled
      // by the core engine step handler; here we just show progress)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (cancelled) return;

      // Re-check after install attempt
      try {
        const retryResponse = await fetch("http://127.0.0.1:7433/health", {
          signal: AbortSignal.timeout(3000),
        });

        if (cancelled) return;

        if (retryResponse.ok) {
          setStatus("connected");
          onStepData({ daemonStatus: "connected", installed: true });
          return;
        }
      } catch {
        // Still not reachable
      }

      if (cancelled) return;

      setStatus("not-found");
      setErrorMessage("Could not connect to daemon. You may need to install it manually.");
      onStepData({ daemonStatus: "not-found", installed: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [onStepData]);

  return (
    <Box style={{ flexDirection: "column" }}>
      <Text
        content="Daemon Setup"
        style={{ color: tokens["accent.primary"] }}
      />
      <Box style={{ marginTop: 1 }}>
        <Text
          content="The Reins daemon runs in the background to manage AI connections."
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Status display */}
      <Box style={{ marginTop: 2, flexDirection: "column" }}>
        {status === "checking" ? (
          <Box style={{ flexDirection: "row" }}>
            <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
            <Text
              content="Checking daemon status..."
              style={{ color: tokens["text.secondary"] }}
            />
          </Box>
        ) : null}

        {status === "installing" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box style={{ flexDirection: "row" }}>
              <Text content="* " style={{ color: tokens["glyph.tool.running"] }} />
              <Text
                content="Installing daemon service..."
                style={{ color: tokens["text.secondary"] }}
              />
            </Box>
            <Box style={{ marginTop: 1, paddingLeft: 2 }}>
              <Text
                content="This may take a moment."
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          </Box>
        ) : null}

        {status === "connected" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box style={{ flexDirection: "row" }}>
              <Text content="* " style={{ color: tokens["status.success"] }} />
              <Text
                content="Daemon connected"
                style={{ color: tokens["text.primary"] }}
              />
            </Box>
            <Box style={{ marginTop: 1, paddingLeft: 2 }}>
              <Text
                content="Running at http://127.0.0.1:7433"
                style={{ color: tokens["text.muted"] }}
              />
            </Box>
          </Box>
        ) : null}

        {status === "not-found" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box style={{ flexDirection: "row" }}>
              <Text content="x " style={{ color: tokens["status.error"] }} />
              <Text
                content="Daemon not found"
                style={{ color: tokens["text.primary"] }}
              />
            </Box>
            {errorMessage !== null ? (
              <Box style={{ marginTop: 1, paddingLeft: 2 }}>
                <Text
                  content={errorMessage}
                  style={{ color: tokens["text.muted"] }}
                />
              </Box>
            ) : null}
          </Box>
        ) : null}

        {status === "error" ? (
          <Box style={{ flexDirection: "column" }}>
            <Box style={{ flexDirection: "row" }}>
              <Text content="x " style={{ color: tokens["status.error"] }} />
              <Text
                content={errorMessage ?? "An error occurred"}
                style={{ color: tokens["text.primary"] }}
              />
            </Box>
          </Box>
        ) : null}
      </Box>

      {/* Hint */}
      <Box style={{ marginTop: 2 }}>
        <Text
          content={
            status === "connected"
              ? "Enter continue"
              : status === "not-found"
                ? "Enter retry . Esc back"
                : "Please wait..."
          }
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
