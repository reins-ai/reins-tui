import type { ReactNode } from "react";
import { createCliRenderer } from "@opentui/core";

import type { RendererConfig } from "./types";
import { createUiRoot } from "./hooks";

interface SignalBinding {
  signal: NodeJS.Signals;
  listener: () => void;
}

export interface RendererSession {
  render(node: ReactNode): void;
  destroy(): void;
}

const DEFAULT_TITLE = "Reins TUI";

export function resolveRendererConfig(config: RendererConfig = {}): Required<RendererConfig> {
  return {
    exitOnCtrlC: config.exitOnCtrlC ?? true,
    useMouse: config.useMouse ?? true,
    title: config.title ?? DEFAULT_TITLE,
    autoFocus: config.autoFocus ?? true,
  };
}

export async function initRenderer(config: RendererConfig = {}): Promise<RendererSession> {
  const resolved = resolveRendererConfig(config);
  const renderer = await createCliRenderer({
    exitOnCtrlC: resolved.exitOnCtrlC,
    useMouse: resolved.useMouse,
    autoFocus: resolved.autoFocus,
  });
  renderer.setTerminalTitle(resolved.title);

  const root = createUiRoot(renderer);
  const signalBindings: SignalBinding[] = [];
  let isDestroyed = false;

  const destroy = (): void => {
    if (isDestroyed) {
      return;
    }

    isDestroyed = true;

    for (const binding of signalBindings) {
      process.off(binding.signal, binding.listener);
    }

    root.unmount();
    renderer.destroy();
  };

  const bindSignal = (signal: NodeJS.Signals): void => {
    const listener = (): void => {
      destroy();
      process.exit(0);
    };

    signalBindings.push({ signal, listener });
    process.on(signal, listener);
  };

  bindSignal("SIGINT");
  bindSignal("SIGTERM");

  return {
    render(node: ReactNode): void {
      root.render(node);
    },
    destroy,
  };
}
