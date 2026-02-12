import type { ReactNode } from "react";
import {
  createRoot,
  useKeyboard as openTuiUseKeyboard,
  useOnResize,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";

import type { KeyEvent } from "./types";

export interface UiRoot {
  render(node: ReactNode): void;
  unmount(): void;
}

export function createUiRoot(renderer: unknown): UiRoot {
  const root = createRoot(renderer as Parameters<typeof createRoot>[0]);

  return {
    render(node: ReactNode) {
      root.render(node);
    },
    unmount() {
      const maybeUnmount = root as unknown as { unmount?: () => void };
      maybeUnmount.unmount?.();
    },
  };
}

export function useKeyboard(handler: (event: KeyEvent) => void): void {
  openTuiUseKeyboard((event: unknown) => {
    handler(event as KeyEvent);
  });
}

export { useOnResize, useRenderer, useTerminalDimensions };
