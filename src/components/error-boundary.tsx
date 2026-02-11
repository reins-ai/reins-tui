import React from "react";

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
