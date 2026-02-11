import { useEffect, useRef, useState } from "react";

import type { ConversationLifecycleStatus } from "../state/status-machine";
import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export const BREATHING_CURSOR_WIDE = "\u258D"; // ▍
export const BREATHING_CURSOR_NARROW = "\u258F"; // ▏
export const STREAMING_CURSOR = "\u258D"; // ▍
export const BREATHING_INTERVAL_MS = 500;

export interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  lifecycleStatus?: ConversationLifecycleStatus;
}

export function useBreathingCursor(status: ConversationLifecycleStatus): string | null {
  const [wide, setWide] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status === "thinking") {
      setWide(true);
      intervalRef.current = setInterval(() => {
        setWide((prev) => !prev);
      }, BREATHING_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status]);

  switch (status) {
    case "thinking":
      return wide ? BREATHING_CURSOR_WIDE : BREATHING_CURSOR_NARROW;
    case "streaming":
      return STREAMING_CURSOR;
    case "idle":
    case "sending":
    case "complete":
    case "error":
      return null;
  }
}

export function resolveCursorForStatus(status: ConversationLifecycleStatus, breathingWide: boolean): string | null {
  switch (status) {
    case "thinking":
      return breathingWide ? BREATHING_CURSOR_WIDE : BREATHING_CURSOR_NARROW;
    case "streaming":
      return STREAMING_CURSOR;
    case "idle":
    case "sending":
    case "complete":
    case "error":
      return null;
  }
}

export function buildStreamingText(content: string, isStreaming: boolean): string {
  return isStreaming ? `${content}\u258A` : content;
}

export function StreamingText({ content, isStreaming = false, lifecycleStatus }: StreamingTextProps) {
  const { tokens } = useThemeTokens();
  const effectiveStatus = lifecycleStatus ?? (isStreaming ? "streaming" : "idle");
  const cursor = useBreathingCursor(effectiveStatus);

  if (!lifecycleStatus) {
    return (
      <Box>
        <Text>{buildStreamingText(content, isStreaming)}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text style={{ color: tokens["text.primary"] }}>{content}</Text>
      {cursor ? <Text style={{ color: tokens["accent.primary"] }}>{cursor}</Text> : null}
    </Box>
  );
}
