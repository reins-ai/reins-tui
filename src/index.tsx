import { App } from "./app";
import { initRenderer } from "./ui";

export const VERSION = "0.1.0";

export async function main(): Promise<void> {
  try {
    const session = await initRenderer({
      exitOnCtrlC: true,
      useMouse: true,
      title: "Reins TUI",
      autoFocus: true,
    });

    session.render(<App version={VERSION} />);
  } catch (error) {
    console.error("Failed to start Reins TUI", error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
