import { useEffect, useRef, useState } from "react";

import type { TerminalDimensions } from "../ui";
import { useTerminalDimensions } from "../ui";

/**
 * Debounced terminal dimensions hook.
 *
 * Wraps the raw `useTerminalDimensions()` from OpenTUI with a timer-based
 * debounce so that rapid resize events (e.g. dragging a terminal edge)
 * coalesce into a single state update. This prevents layout flicker and
 * unnecessary re-renders during resize.
 *
 * The debounce fires after `delayMs` of inactivity (default 100 ms).
 * On the very first render the raw dimensions are used immediately so
 * the UI is never blank.
 */
export function useDebouncedWindowSize(delayMs: number = 100): TerminalDimensions {
  const raw = useTerminalDimensions() as TerminalDimensions;

  const [debounced, setDebounced] = useState<TerminalDimensions>(raw);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip debounce when dimensions haven't actually changed.
    if (raw.width === debounced.width && raw.height === debounced.height) {
      return;
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebounced(raw);
    }, delayMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [raw.width, raw.height, delayMs]);

  return debounced;
}
