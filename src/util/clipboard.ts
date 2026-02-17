import { platform } from "os";

/**
 * Writes text to clipboard via OSC 52 escape sequence.
 * This allows clipboard operations to work over SSH by having
 * the terminal emulator handle the clipboard locally.
 */
function writeOsc52(text: string): void {
  if (!process.stdout.isTTY) return;
  const base64 = Buffer.from(text).toString("base64");
  const osc52 = `\x1b]52;c;${base64}\x07`;
  const passthrough = process.env["TMUX"] || process.env["STY"];
  const sequence = passthrough ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
  process.stdout.write(sequence);
}

type CopyMethod = (text: string) => Promise<void>;

let cachedCopyMethod: CopyMethod | null = null;

/**
 * Lazily detect and cache the best native clipboard copy method
 * for the current platform.
 */
function getNativeCopyMethod(): CopyMethod {
  if (cachedCopyMethod) return cachedCopyMethod;

  const os = platform();

  if (os === "darwin" && Bun.which("osascript")) {
    cachedCopyMethod = async (text: string) => {
      const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const proc = Bun.spawn(
        ["osascript", "-e", `set the clipboard to "${escaped}"`],
        { stdout: "ignore", stderr: "ignore" },
      );
      await proc.exited.catch(() => {});
    };
    return cachedCopyMethod;
  }

  if (os === "linux") {
    if (process.env["WAYLAND_DISPLAY"] && Bun.which("wl-copy")) {
      cachedCopyMethod = async (text: string) => {
        const proc = Bun.spawn(["wl-copy"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
      return cachedCopyMethod;
    }
    if (Bun.which("xclip")) {
      cachedCopyMethod = async (text: string) => {
        const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
      return cachedCopyMethod;
    }
    if (Bun.which("xsel")) {
      cachedCopyMethod = async (text: string) => {
        const proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
      return cachedCopyMethod;
    }
  }

  if (os === "win32") {
    cachedCopyMethod = async (text: string) => {
      const proc = Bun.spawn(
        [
          "powershell.exe",
          "-NonInteractive",
          "-NoProfile",
          "-Command",
          "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
        ],
        { stdin: "pipe", stdout: "ignore", stderr: "ignore" },
      );
      proc.stdin.write(text);
      proc.stdin.end();
      await proc.exited.catch(() => {});
    };
    return cachedCopyMethod;
  }

  // Fallback: OSC 52 only (already sent before this is called)
  cachedCopyMethod = async () => {};
  return cachedCopyMethod;
}

/**
 * Clipboard utility with dual-strategy copy:
 * 1. OSC 52 escape sequence (works over SSH, tmux, screen)
 * 2. Native OS clipboard tools (wl-copy, xclip, xsel, osascript, powershell)
 */
export namespace Clipboard {
  /**
   * Copy text to the system clipboard.
   * Uses both OSC 52 (terminal-level) and native tools (OS-level)
   * to maximise compatibility across environments.
   */
  export async function copy(text: string): Promise<void> {
    writeOsc52(text);
    await getNativeCopyMethod()(text);
  }
}
