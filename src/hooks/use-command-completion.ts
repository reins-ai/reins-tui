import { useCallback, useMemo, useRef, useState } from "react";

import {
  resolveCompletion,
  applySuggestion,
  type CompletionResult,
  type CompletionProviderContext,
} from "../commands/completion";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CommandCompletionState {
  /** Whether the completion popup should be shown */
  readonly isOpen: boolean;
  /** Current completion result (suggestions + ghost text) */
  readonly result: CompletionResult;
  /** Index of the highlighted suggestion */
  readonly selectedIndex: number;
  /** Ghost text hint to display (e.g. "<model-name>") */
  readonly ghostText: string | undefined;
}

export interface CommandCompletionActions {
  /** Recompute completions for the given input value */
  update(value: string): void;
  /** Accept the currently selected suggestion; returns new input value */
  acceptSelected(): { value: string; cursor: number } | null;
  /** Move the selection by delta (+1 for down, -1 for up) */
  moveSelection(delta: number): void;
  /** Dismiss the popup */
  dismiss(): void;
}

export interface UseCommandCompletionOptions {
  readonly isFocused: boolean;
  readonly providerContext: CompletionProviderContext;
}

const EMPTY_RESULT: CompletionResult = {
  suggestions: [],
  contextKind: "none",
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCommandCompletion(
  options: UseCommandCompletionOptions,
): [CommandCompletionState, CommandCompletionActions] {
  const { isFocused, providerContext } = options;

  const [result, setResult] = useState<CompletionResult>(EMPTY_RESULT);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Track the current input for applySuggestion
  const inputRef = useRef("");

  const isOpen = useMemo(() => {
    if (!isFocused || dismissed) return false;
    return result.suggestions.length > 0;
  }, [isFocused, dismissed, result.suggestions.length]);

  const ghostText = useMemo(() => {
    if (!isFocused) return undefined;
    // Show ghost text when we have it and the input is a command
    return result.ghostText;
  }, [isFocused, result.ghostText]);

  const update = useCallback(
    (value: string) => {
      inputRef.current = value;

      const trimmed = value.trimStart();
      if (!trimmed.startsWith("/")) {
        setResult(EMPTY_RESULT);
        setSelectedIndex(0);
        setDismissed(false);
        return;
      }

      // Assume cursor at end of input (most common case)
      const cursor = value.length;
      const newResult = resolveCompletion(value, cursor, providerContext);

      setResult(newResult);
      setSelectedIndex(0);
      setDismissed(false);
    },
    [providerContext],
  );

  const acceptSelected = useCallback((): { value: string; cursor: number } | null => {
    if (result.suggestions.length === 0) return null;

    const clamped = Math.max(0, Math.min(selectedIndex, result.suggestions.length - 1));
    const suggestion = result.suggestions[clamped];
    if (!suggestion) return null;

    const applied = applySuggestion(inputRef.current, suggestion);
    inputRef.current = applied.value;

    // Recompute completions for the new input to enable chained completion
    const newResult = resolveCompletion(applied.value, applied.cursor, providerContext);
    setResult(newResult);
    setSelectedIndex(0);
    setDismissed(false);

    return applied;
  }, [result.suggestions, selectedIndex, providerContext]);

  const moveSelection = useCallback(
    (delta: number) => {
      const total = result.suggestions.length;
      if (total === 0) return;

      setSelectedIndex((current) => {
        const next = current + delta;
        if (next < 0) return total - 1;
        if (next >= total) return 0;
        return next;
      });
    },
    [result.suggestions.length],
  );

  const dismiss = useCallback(() => {
    setDismissed(true);
    setSelectedIndex(0);
  }, []);

  const state: CommandCompletionState = {
    isOpen,
    result,
    selectedIndex,
    ghostText,
  };

  const actions: CommandCompletionActions = {
    update,
    acceptSelected,
    moveSelection,
    dismiss,
  };

  return [state, actions];
}
