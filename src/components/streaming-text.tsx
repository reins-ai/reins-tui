import { useEffect, useRef, useState } from "react";

import type { ConversationLifecycleStatus } from "../state/status-machine";
import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export const BREATHING_CURSOR_WIDE = "\u258D"; // ▍
export const BREATHING_CURSOR_NARROW = "\u258F"; // ▏
export const STREAMING_CURSOR = "\u258D"; // ▍ (legacy constant for backward compatibility)
export const BLINKING_CURSOR = "\u258B"; // ▋ (blinking cursor for active streaming)
export const BREATHING_INTERVAL_MS = 500;
export const BLINK_INTERVAL_MS = 500;
export const THINKING_INDICATOR_PREFIX = "\u27F3 Thinking\u2026"; // ⟳ Thinking…

export interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  lifecycleStatus?: ConversationLifecycleStatus;
}

/**
 * Hook that produces a blinking cursor character for active streaming states.
 *
 * - During "thinking": alternates between wide and narrow breathing cursors
 *   at 500ms intervals.
 * - During "streaming": blinks the `▋` cursor on/off at 500ms intervals.
 * - All other statuses: returns null (no cursor).
 *
 * Cleans up the interval on unmount and when status changes to prevent
 * memory leaks.
 */
export function useBreathingCursor(status: ConversationLifecycleStatus): string | null {
  const [wide, setWide] = useState(true);
  const [visible, setVisible] = useState(true);
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
    } else if (status === "streaming") {
      setVisible(true);
      intervalRef.current = setInterval(() => {
        setVisible((prev) => !prev);
      }, BLINK_INTERVAL_MS);
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
      return visible ? BLINKING_CURSOR : null;
    case "idle":
    case "sending":
    case "complete":
    case "error":
      return null;
  }
}

/**
 * Pure resolver for cursor character given a lifecycle status.
 * Used by tests and non-hook contexts. The `breathingWide` flag
 * controls the thinking cursor phase; for streaming, returns the
 * legacy STREAMING_CURSOR constant for backward compatibility.
 * Use `blinkVisible` to control the blink phase with BLINKING_CURSOR.
 */
export function resolveCursorForStatus(
  status: ConversationLifecycleStatus,
  breathingWide: boolean,
  blinkVisible?: boolean,
): string | null {
  switch (status) {
    case "thinking":
      return breathingWide ? BREATHING_CURSOR_WIDE : BREATHING_CURSOR_NARROW;
    case "streaming":
      // When blinkVisible is explicitly false, cursor is hidden (blink off-phase).
      // Default (undefined or true) returns STREAMING_CURSOR for backward compatibility
      // with existing callers. The useBreathingCursor hook uses BLINKING_CURSOR directly.
      return blinkVisible === false ? null : STREAMING_CURSOR;
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

/**
 * Hook that tracks elapsed seconds while the conversation is in "thinking"
 * status. Resets to 0 when status leaves "thinking". Updates every second.
 * Cleans up the timer on unmount.
 */
export function useThinkingTimer(status: ConversationLifecycleStatus): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status === "thinking") {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status]);

  return elapsed;
}

/**
 * Formats the thinking indicator string with elapsed seconds.
 * Example output: "⟳ Thinking… (3s)"
 */
export function formatThinkingIndicator(elapsedSeconds: number): string {
  return `${THINKING_INDICATOR_PREFIX} (${elapsedSeconds}s)`;
}

/**
 * Inline thinking indicator shown during the "thinking" lifecycle phase.
 * Displays `⟳ Thinking… (Xs)` with a live elapsed-seconds timer.
 */
export function ThinkingIndicator({ status }: { status: ConversationLifecycleStatus }) {
  const { tokens } = useThemeTokens();
  const elapsed = useThinkingTimer(status);

  if (status !== "thinking") {
    return null;
  }

  return (
    <Box style={{ flexDirection: "row" }}>
      <Text style={{ color: tokens["text.muted"] }}>
        {formatThinkingIndicator(elapsed)}
      </Text>
    </Box>
  );
}

export function StreamingText({ content, isStreaming = false, lifecycleStatus }: StreamingTextProps) {
  const { tokens } = useThemeTokens();
  const effectiveStatus = lifecycleStatus ?? (isStreaming ? "streaming" : "idle");
  const cursor = useBreathingCursor(effectiveStatus);

  if (!lifecycleStatus) {
    return (
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: tokens["conversation.assistant.text"] }}>
          {buildStreamingText(content, isStreaming)}
        </Text>
      </Box>
    );
  }

  // During thinking with no content yet, show the thinking indicator
  if (effectiveStatus === "thinking" && content.length === 0) {
    return (
      <Box style={{ flexDirection: "column" }}>
        <ThinkingIndicator status={effectiveStatus} />
      </Box>
    );
  }

  // During thinking with content, show content + cursor + thinking indicator below
  if (effectiveStatus === "thinking") {
    return (
      <Box style={{ flexDirection: "column" }}>
        <Box style={{ flexDirection: "row" }}>
          <Text style={{ color: tokens["conversation.assistant.text"] }}>{content}</Text>
          {cursor ? <Text style={{ color: tokens["accent.primary"] }}>{cursor}</Text> : null}
        </Box>
        <ThinkingIndicator status={effectiveStatus} />
      </Box>
    );
  }

  return (
    <Box style={{ flexDirection: "row" }}>
      <Text style={{ color: tokens["conversation.assistant.text"] }}>{content}</Text>
      {cursor ? <Text style={{ color: tokens["accent.primary"] }}>{cursor}</Text> : null}
    </Box>
  );
}
