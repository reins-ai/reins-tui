import { useCallback, useEffect, useReducer, useRef } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { DaemonAuthClient, type DeviceCodeResponse } from "../daemon/auth-client";
import { loadSessionToken, saveSessionToken } from "../lib/session-store";
import { getActiveDaemonUrl } from "../daemon/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthGateProps {
  onAuthComplete: (sessionToken: string) => void;
  /** Skip auth entirely (e.g., when a stored token is already valid). */
  onSkipAuth?: () => void;
}

type AuthPhase =
  | "loading"
  | "requesting"
  | "awaiting"
  | "verified"
  | "error";

interface AuthState {
  phase: AuthPhase;
  deviceCode: DeviceCodeResponse | null;
  error: string | null;
  pollCount: number;
}

type AuthAction =
  | { type: "SET_REQUESTING" }
  | { type: "SET_AWAITING"; deviceCode: DeviceCodeResponse }
  | { type: "SET_VERIFIED" }
  | { type: "SET_ERROR"; error: string }
  | { type: "INCREMENT_POLL" }
  | { type: "RESET" };

const INITIAL_STATE: AuthState = {
  phase: "loading",
  deviceCode: null,
  error: null,
  pollCount: 0,
};

const POLL_INTERVAL_MS = 3_000;

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_REQUESTING":
      return { ...state, phase: "requesting", error: null };
    case "SET_AWAITING":
      return { ...state, phase: "awaiting", deviceCode: action.deviceCode, error: null, pollCount: 0 };
    case "SET_VERIFIED":
      return { ...state, phase: "verified" };
    case "SET_ERROR":
      return { ...state, phase: "error", error: action.error };
    case "INCREMENT_POLL":
      return { ...state, pollCount: state.pollCount + 1 };
    case "RESET":
      return { ...INITIAL_STATE, phase: "requesting" };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Spinner frames
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function useSpinner(): string {
  const frameRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forceUpdateRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, forceRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % SPINNER_FRAMES.length;
      forceUpdateRef.current += 1;
      forceRender();
    }, 80);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return SPINNER_FRAMES[frameRef.current];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingView({ tokens }: { tokens: Record<string, string> }) {
  const spinner = useSpinner();

  return (
    <Box style={{ flexDirection: "column", alignItems: "center" }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content={`${spinner} `} style={{ color: tokens["accent.primary"] }} />
        <Text content="Checking session..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </Box>
  );
}

function RequestingView({ tokens }: { tokens: Record<string, string> }) {
  const spinner = useSpinner();

  return (
    <Box style={{ flexDirection: "column", alignItems: "center" }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content={`${spinner} `} style={{ color: tokens["accent.primary"] }} />
        <Text content="Requesting device code..." style={{ color: tokens["text.secondary"] }} />
      </Box>
    </Box>
  );
}

interface AwaitingViewProps {
  tokens: Record<string, string>;
  deviceCode: DeviceCodeResponse;
  pollCount: number;
}

function AwaitingView({ tokens, deviceCode, pollCount }: AwaitingViewProps) {
  const spinner = useSpinner();
  const dots = ".".repeat((pollCount % 3) + 1);

  return (
    <Box style={{ flexDirection: "column", alignItems: "center" }}>
      <Text
        content="Sign in to Reins"
        style={{ color: tokens["text.primary"] }}
      />

      <Box style={{ marginTop: 2, flexDirection: "column", alignItems: "center" }}>
        <Text
          content="Your code:"
          style={{ color: tokens["text.secondary"] }}
        />
        <Box style={{ marginTop: 1 }}>
          <Text
            content={`  ${deviceCode.code}  `}
            style={{
              color: tokens["accent.primary"],
            }}
          />
        </Box>
      </Box>

      <Box style={{ marginTop: 2, flexDirection: "column", alignItems: "center" }}>
        <Text
          content="Visit this URL to verify:"
          style={{ color: tokens["text.secondary"] }}
        />
        <Box style={{ marginTop: 1 }}>
          <Text
            content={deviceCode.verificationUrl}
            style={{ color: tokens["accent.secondary"] }}
          />
        </Box>
      </Box>

      <Box style={{ marginTop: 2, flexDirection: "row" }}>
        <Text content={`${spinner} `} style={{ color: tokens["accent.primary"] }} />
        <Text
          content={`Waiting for verification${dots}`}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>

      <Box style={{ marginTop: 2 }}>
        <Text
          content="Press Esc to cancel"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}

function VerifiedView({ tokens }: { tokens: Record<string, string> }) {
  return (
    <Box style={{ flexDirection: "column", alignItems: "center" }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="✓ " style={{ color: tokens["status.success"] }} />
        <Text content="Signed in successfully!" style={{ color: tokens["text.primary"] }} />
      </Box>
    </Box>
  );
}

interface ErrorViewProps {
  tokens: Record<string, string>;
  error: string;
}

function ErrorView({ tokens, error }: ErrorViewProps) {
  return (
    <Box style={{ flexDirection: "column", alignItems: "center" }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content="✗ " style={{ color: tokens["status.error"] }} />
        <Text content={error} style={{ color: tokens["text.primary"] }} />
      </Box>
      <Box style={{ marginTop: 2 }}>
        <Text
          content="Press Enter to retry, or Esc to exit"
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AuthGate({ onAuthComplete, onSkipAuth }: AuthGateProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(authReducer, INITIAL_STATE);

  const authClientRef = useRef<DaemonAuthClient | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const initStartedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback((client: DaemonAuthClient, code: string) => {
    const poll = async () => {
      if (!mountedRef.current) return;

      const result = await client.pollDeviceCodeStatus(code);
      if (!mountedRef.current) return;

      if (!result.ok) {
        dispatch({ type: "SET_ERROR", error: result.error.message });
        return;
      }

      dispatch({ type: "INCREMENT_POLL" });

      if (result.value.status === "verified" && result.value.sessionToken) {
        stopPolling();
        dispatch({ type: "SET_VERIFIED" });
        await saveSessionToken(result.value.sessionToken);
        // Brief delay so the user sees the success state
        setTimeout(() => {
          if (mountedRef.current) {
            onAuthComplete(result.value.sessionToken!);
          }
        }, 800);
        return;
      }

      if (result.value.status === "expired") {
        stopPolling();
        dispatch({ type: "SET_ERROR", error: "Device code expired. Press Enter to get a new code." });
        return;
      }

      // Still pending — schedule next poll
      pollTimerRef.current = setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    };

    void poll();
  }, [onAuthComplete, stopPolling]);

  const requestDeviceCode = useCallback(async () => {
    if (!mountedRef.current) return;

    const baseUrl = await getActiveDaemonUrl();
    const client = new DaemonAuthClient({ baseUrl });
    authClientRef.current = client;

    dispatch({ type: "SET_REQUESTING" });

    const result = await client.requestDeviceCode();
    if (!mountedRef.current) return;

    if (!result.ok) {
      dispatch({ type: "SET_ERROR", error: result.error.message });
      return;
    }

    dispatch({ type: "SET_AWAITING", deviceCode: result.value });
    startPolling(client, result.value.code);
  }, [startPolling]);

  // Initialize: check for existing session token
  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    void (async () => {
      const existingToken = await loadSessionToken();
      if (!mountedRef.current) return;

      if (existingToken) {
        if (onSkipAuth) {
          onSkipAuth();
        } else {
          onAuthComplete(existingToken);
        }
        return;
      }

      await requestDeviceCode();
    })();
  }, [onAuthComplete, onSkipAuth, requestDeviceCode]);

  // Keyboard handler
  useKeyboard((event) => {
    const keyName = event.name ?? "";

    if (state.phase === "error") {
      if (keyName === "return" || keyName === "enter") {
        stopPolling();
        initStartedRef.current = false;
        dispatch({ type: "RESET" });
        void requestDeviceCode();
        return;
      }
    }

    if (state.phase === "awaiting" || state.phase === "error") {
      if (keyName === "escape" || keyName === "esc") {
        stopPolling();
        // Exit the app when user cancels auth
        process.exit(0);
      }
    }
  });

  // Render based on phase
  return (
    <Box
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: tokens["surface.primary"],
      }}
    >
      {state.phase === "loading" && <LoadingView tokens={tokens} />}
      {state.phase === "requesting" && <RequestingView tokens={tokens} />}
      {state.phase === "awaiting" && state.deviceCode !== null && (
        <AwaitingView
          tokens={tokens}
          deviceCode={state.deviceCode}
          pollCount={state.pollCount}
        />
      )}
      {state.phase === "verified" && <VerifiedView tokens={tokens} />}
      {state.phase === "error" && state.error !== null && (
        <ErrorView tokens={tokens} error={state.error} />
      )}
    </Box>
  );
}
