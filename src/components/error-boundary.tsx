import React from "react";

import type { DaemonConnectionStatus } from "../daemon/contracts";
import type { ThemeTokens } from "../theme/theme-schema";
import { Box, Text } from "../ui";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  retryNonce?: number;
  onErrorChange?: (hasError: boolean) => void;
  themeTokens?: Readonly<ThemeTokens>;
}

interface ErrorBoundaryState {
  error: Error | null;
  stack: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    stack: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      error,
      stack: error.stack ?? "",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const nextStack = error.stack ?? info.componentStack ?? "";
    if (nextStack !== this.state.stack) {
      this.setState({ stack: nextStack });
    }
    this.props.onErrorChange?.(true);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
    if (prevProps.retryNonce !== this.props.retryNonce && this.state.error) {
      this.setState({ error: null, stack: "" });
      this.props.onErrorChange?.(false);
      return;
    }

    if (prevState.error !== null && this.state.error === null) {
      this.props.onErrorChange?.(false);
    }
  }

  render() {
    if (this.state.error) {
      const t = this.props.themeTokens;
      const errorColor = t?.["status.error"] ?? "#f7768e";
      const bgColor = t?.["surface.primary"] ?? "#1a1b26";
      const hintColor = t?.["text.muted"] ?? "#9aa5ce";
      const stackColor = t?.["text.secondary"] ?? "#a9b1d6";

      return (
        <Box
          style={{
            border: true,
            borderColor: errorColor,
            backgroundColor: bgColor,
            padding: 2,
            flexDirection: "column",
          }}
        >
          <Text style={{ color: errorColor }} content={`Error: ${this.state.error.message}`} />
          <Text style={{ color: hintColor }} content="Press r to retry" />
          <Text style={{ color: hintColor }} content="Press q to quit" />
          {this.state.stack.length > 0 ? <Text style={{ color: stackColor }} content={this.state.stack} /> : null}
        </Box>
      );
    }

    return this.props.children;
  }
}

export interface DaemonOfflineBannerProps {
  connectionStatus: DaemonConnectionStatus;
  lastErrorMessage?: string;
  onRetry?: () => void;
  themeTokens?: Readonly<ThemeTokens>;
}

export function getDaemonOfflineBannerText(
  connectionStatus: DaemonConnectionStatus,
  lastErrorMessage?: string,
): { visible: boolean; title: string; hint: string } {
  switch (connectionStatus) {
    case "connected":
    case "connecting":
      return { visible: false, title: "", hint: "" };
    case "disconnected":
      return {
        visible: true,
        title: lastErrorMessage ?? "Daemon is unavailable",
        hint: "Press Ctrl+R to retry connection. Conversation history is still available.",
      };
    case "reconnecting":
      return {
        visible: true,
        title: "Reconnecting to daemon...",
        hint: "Attempting to restore connection. Conversation history is still available.",
      };
  }
}

export function DaemonOfflineBanner({
  connectionStatus,
  lastErrorMessage,
  onRetry,
  themeTokens: t,
}: DaemonOfflineBannerProps) {
  const banner = getDaemonOfflineBannerText(connectionStatus, lastErrorMessage);

  if (!banner.visible) {
    return null;
  }

  const isDisconnected = connectionStatus === "disconnected";
  const borderColor = isDisconnected
    ? (t?.["status.error"] ?? "#f7768e")
    : (t?.["status.warning"] ?? "#e0af68");
  const titleColor = borderColor;
  const hintColor = t?.["text.muted"] ?? "#9aa5ce";
  const bgColor = t?.["surface.secondary"] ?? "#1f2335";

  return (
    <Box
      style={{
        border: true,
        borderColor,
        backgroundColor: bgColor,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: "column",
        height: isDisconnected ? 3 : 2,
      }}
    >
      <Text style={{ color: titleColor }}>
        {isDisconnected ? `○ ${banner.title}` : `◌ ${banner.title}`}
      </Text>
      <Text style={{ color: hintColor }}>{banner.hint}</Text>
      {isDisconnected && onRetry ? (
        <Text style={{ color: hintColor }}>{"Ctrl+R retry"}</Text>
      ) : null}
    </Box>
  );
}
