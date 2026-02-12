import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".reins", "logs");
const LOG_FILE = join(LOG_DIR, "tui.log");

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
}

let initialized = false;

async function ensureLogDir(): Promise<void> {
  if (initialized) return;
  try {
    await mkdir(LOG_DIR, { recursive: true });
    initialized = true;
  } catch {
    // Silently fail — logging should never crash the app
  }
}

async function writeLog(entry: LogEntry): Promise<void> {
  await ensureLogDir();
  const line = JSON.stringify(entry) + "\n";
  try {
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // Silently fail
  }
}

function createScopedLogger(scope: string) {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      void writeLog({ timestamp: new Date().toISOString(), level: "debug", scope, message, data });
    },
    info(message: string, data?: Record<string, unknown>) {
      void writeLog({ timestamp: new Date().toISOString(), level: "info", scope, message, data });
    },
    warn(message: string, data?: Record<string, unknown>) {
      void writeLog({ timestamp: new Date().toISOString(), level: "warn", scope, message, data });
    },
    error(message: string, data?: Record<string, unknown>) {
      void writeLog({ timestamp: new Date().toISOString(), level: "error", scope, message, data });
    },
  };
}

export type DebugLogger = ReturnType<typeof createScopedLogger>;

export const logger = {
  connect: createScopedLogger("connect-flow"),
  daemon: createScopedLogger("daemon-client"),
  providers: createScopedLogger("providers"),
  app: createScopedLogger("app"),
};

export { LOG_FILE, createScopedLogger };
