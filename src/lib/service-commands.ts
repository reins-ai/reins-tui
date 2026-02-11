import { DaemonRuntime, ServiceInstaller } from "@reins/core";
import type {
  DaemonError,
  DaemonResult,
  DaemonState,
  PlatformServiceAdapter,
  Result,
  ServiceDefinition,
} from "@reins/core";

export interface ServiceCommandResult {
  success: boolean;
  message: string;
  details?: Record<string, string>;
}

export const SERVICE_COMMANDS = [
  { id: "service-install", label: "Install Service", category: "Service", action: "SERVICE_INSTALL" },
  { id: "service-uninstall", label: "Uninstall Service", category: "Service", action: "SERVICE_UNINSTALL" },
  { id: "service-start", label: "Start Service", category: "Service", action: "SERVICE_START" },
  { id: "service-stop", label: "Stop Service", category: "Service", action: "SERVICE_STOP" },
  { id: "service-restart", label: "Restart Service", category: "Service", action: "SERVICE_RESTART" },
  { id: "service-status", label: "Service Status", category: "Service", action: "SERVICE_STATUS" },
] as const;

interface ServiceCommandDependencies {
  installer?: Pick<ServiceInstaller, "install" | "uninstall" | "status">;
  runtime?: Pick<DaemonRuntime, "getState" | "start" | "stop" | "restart">;
  serviceDefinition?: ServiceDefinition;
  platform?: NodeJS.Platform;
}

const DEFAULT_SERVICE_NAME = "reins-daemon";
const DEFAULT_SERVICE_DEFINITION: ServiceDefinition = {
  serviceName: DEFAULT_SERVICE_NAME,
  displayName: "Reins Daemon",
  description: "Reins background assistant daemon",
  command: process.execPath,
  args: ["run", "daemon"],
  workingDirectory: process.cwd(),
  env: {
    REINS_DAEMON_MODE: "service",
  },
  autoRestart: true,
};

const defaultRuntime = new DaemonRuntime();
const defaultInstaller = createMockServiceInstaller();

export async function executeServiceCommand(
  action: string,
  dependencies: ServiceCommandDependencies = {},
): Promise<ServiceCommandResult> {
  const installer = dependencies.installer ?? defaultInstaller;
  const runtime = dependencies.runtime ?? defaultRuntime;
  const serviceDefinition = dependencies.serviceDefinition ?? DEFAULT_SERVICE_DEFINITION;
  const platform = dependencies.platform ?? process.platform;

  switch (action) {
    case "SERVICE_INSTALL":
      return installService(installer, serviceDefinition, platform);
    case "SERVICE_UNINSTALL":
      return uninstallService(installer, runtime, serviceDefinition, platform);
    case "SERVICE_START":
      return startService(installer, runtime, serviceDefinition, platform);
    case "SERVICE_STOP":
      return stopService(installer, runtime, serviceDefinition, platform);
    case "SERVICE_RESTART":
      return restartService(installer, runtime, serviceDefinition, platform);
    case "SERVICE_STATUS":
      return getServiceStatus(installer, runtime, serviceDefinition, platform);
    default:
      return {
        success: false,
        message: `Unknown service action '${action}'`,
        details: {
          hint: "Use one of: install, uninstall, start, stop, restart, status.",
        },
      };
  }
}

async function installService(
  installer: Pick<ServiceInstaller, "install" | "status">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult> {
  const existingStatus = await installer.status(serviceDefinition);
  if (!existingStatus.ok) {
    return fromDaemonError("Install failed", existingStatus.error, "install", platform);
  }

  if (existingStatus.value !== "not-installed") {
    return {
      success: true,
      message: "Service is already installed",
      details: {
        status: existingStatus.value,
        platform,
      },
    };
  }

  const result = await installer.install(serviceDefinition);
  if (!result.ok) {
    return fromDaemonError("Install failed", result.error, "install", platform);
  }

  return {
    success: true,
    message: "Service installed",
    details: {
      platform,
      configPath: result.value.filePath,
    },
  };
}

async function uninstallService(
  installer: Pick<ServiceInstaller, "uninstall" | "status">,
  runtime: Pick<DaemonRuntime, "getState" | "stop">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult> {
  if (runtime.getState() === "running") {
    const stopResult = await runtime.stop();
    if (!stopResult.ok) {
      return fromDaemonError("Stop before uninstall failed", stopResult.error, "stop", platform);
    }
  }

  const existingStatus = await installer.status(serviceDefinition);
  if (!existingStatus.ok) {
    return fromDaemonError("Uninstall failed", existingStatus.error, "uninstall", platform);
  }

  if (existingStatus.value === "not-installed") {
    return {
      success: true,
      message: "Service is not installed",
      details: {
        platform,
      },
    };
  }

  const result = await installer.uninstall(serviceDefinition);
  if (!result.ok) {
    return fromDaemonError("Uninstall failed", result.error, "uninstall", platform);
  }

  return {
    success: true,
    message: "Service uninstalled",
    details: {
      platform,
    },
  };
}

async function startService(
  installer: Pick<ServiceInstaller, "status">,
  runtime: Pick<DaemonRuntime, "getState" | "start">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult> {
  const installCheck = await ensureInstalled(installer, serviceDefinition, platform);
  if (installCheck) {
    return installCheck;
  }

  const state = runtime.getState();
  if (state === "running") {
    return {
      success: true,
      message: "Service is already running",
      details: {
        platform,
        state,
      },
    };
  }

  const result = await runtime.start();
  if (!result.ok) {
    return fromDaemonError("Start failed", result.error, "start", platform);
  }

  return {
    success: true,
    message: "Service started",
    details: {
      platform,
      state: runtime.getState(),
    },
  };
}

async function stopService(
  installer: Pick<ServiceInstaller, "status">,
  runtime: Pick<DaemonRuntime, "getState" | "stop">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult> {
  const installCheck = await ensureInstalled(installer, serviceDefinition, platform);
  if (installCheck) {
    return installCheck;
  }

  if (runtime.getState() !== "running") {
    return {
      success: true,
      message: "Service is not running",
      details: {
        platform,
        state: runtime.getState(),
      },
    };
  }

  const result = await runtime.stop();
  if (!result.ok) {
    return fromDaemonError("Stop failed", result.error, "stop", platform);
  }

  return {
    success: true,
    message: "Service stopped",
    details: {
      platform,
      state: runtime.getState(),
    },
  };
}

async function restartService(
  installer: Pick<ServiceInstaller, "status">,
  runtime: Pick<DaemonRuntime, "getState" | "restart">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult> {
  const installCheck = await ensureInstalled(installer, serviceDefinition, platform);
  if (installCheck) {
    return installCheck;
  }

  const result = await runtime.restart();
  if (!result.ok) {
    return fromDaemonError("Restart failed", result.error, "restart", platform);
  }

  return {
    success: true,
    message: "Service restarted",
    details: {
      platform,
      state: runtime.getState(),
    },
  };
}

async function getServiceStatus(
  installer: Pick<ServiceInstaller, "status">,
  runtime: Pick<DaemonRuntime, "getState">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult> {
  const statusResult = await installer.status(serviceDefinition);
  if (!statusResult.ok) {
    return fromDaemonError("Status check failed", statusResult.error, "status", platform);
  }

  const runtimeState = runtime.getState();
  const installed = statusResult.value !== "not-installed";
  const running = statusResult.value === "running" || runtimeState === "running";

  return {
    success: true,
    message: installed
      ? running
        ? "Service is running"
        : "Service is installed but stopped"
      : "Service is not installed",
    details: {
      platform,
      installed: String(installed),
      running: String(running),
      serviceState: statusResult.value,
      runtimeState,
    },
  };
}

async function ensureInstalled(
  installer: Pick<ServiceInstaller, "status">,
  serviceDefinition: ServiceDefinition,
  platform: NodeJS.Platform,
): Promise<ServiceCommandResult | null> {
  const statusResult = await installer.status(serviceDefinition);
  if (!statusResult.ok) {
    return fromDaemonError("Service status check failed", statusResult.error, "status", platform);
  }

  if (statusResult.value !== "not-installed") {
    return null;
  }

  return {
    success: false,
    message: "Service is not installed",
    details: {
      platform,
      hint: "Run service install before managing lifecycle state.",
      remediation: platformRemediationHint(platform),
    },
  };
}

function fromDaemonError(prefix: string, error: DaemonError, action: string, platform: NodeJS.Platform): ServiceCommandResult {
  return {
    success: false,
    message: `${prefix}: ${error.message}`,
    details: {
      platform,
      action,
      code: error.code,
      hint: platformRemediationHint(platform),
    },
  };
}

function platformRemediationHint(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "Check launchd status with `launchctl print gui/$(id -u)/reins-daemon`.";
    case "linux":
      return "Check systemd user service with `systemctl --user status reins-daemon.service`.";
    case "win32":
      return "Check Windows Services for 'Reins Daemon' and verify it is set to Automatic.";
    default:
      return "Verify platform service manager health before retrying.";
  }
}

function createMockServiceInstaller(): ServiceInstaller {
  const serviceState = {
    installed: false,
    running: false,
  };

  const adapter: PlatformServiceAdapter = {
    platform: resolvePlatform(),
    generateConfig(definition) {
      return {
        ok: true,
        value: {
          platform: resolvePlatform(),
          filePath: `${process.cwd()}/${definition.serviceName}.mock-service`,
          content: JSON.stringify(definition),
        },
      };
    },
    async install() {
      serviceState.installed = true;
      serviceState.running = true;
      return { ok: true, value: undefined };
    },
    async uninstall() {
      serviceState.installed = false;
      serviceState.running = false;
      return { ok: true, value: undefined };
    },
    async status() {
      if (!serviceState.installed) {
        return { ok: true, value: "not-installed" };
      }

      return { ok: true, value: serviceState.running ? "running" : "stopped" };
    },
    async start() {
      serviceState.installed = true;
      serviceState.running = true;
      return { ok: true, value: undefined };
    },
    async stop() {
      serviceState.running = false;
      return { ok: true, value: undefined };
    },
  };

  return new ServiceInstaller({
    adapters: [adapter],
    platformDetector: resolvePlatform,
    fileSystem: {
      async mkdir() {},
      async writeFile() {},
      async unlink() {},
      async exists() {
        return false;
      },
    },
    runner: {
      async run() {
        return {
          ok: true,
          value: {
            stdout: "",
            stderr: "",
          },
        };
      },
    },
  });
}

function resolvePlatform(): "darwin" | "linux" | "win32" {
  if (process.platform === "darwin" || process.platform === "linux" || process.platform === "win32") {
    return process.platform;
  }

  return "linux";
}

type RuntimeLike = Pick<DaemonRuntime, "getState" | "start" | "stop" | "restart">;

export function createServiceCommandRuntime(initialState: DaemonState = "stopped"): RuntimeLike {
  let state = initialState;

  return {
    getState() {
      return state;
    },
    async start() {
      if (state === "running") {
        return { ok: true, value: undefined } satisfies Result<void, DaemonError>;
      }

      state = "running";
      return { ok: true, value: undefined } satisfies Result<void, DaemonError>;
    },
    async stop() {
      if (state !== "running") {
        return { ok: true, value: undefined } satisfies Result<void, DaemonError>;
      }

      state = "stopped";
      return { ok: true, value: undefined } satisfies Result<void, DaemonError>;
    },
    async restart() {
      state = "running";
      return { ok: true, value: undefined } satisfies Result<void, DaemonError>;
    },
  };
}

export type ServiceAction = (typeof SERVICE_COMMANDS)[number]["action"];
export type ServiceInstallStatus = "running" | "stopped" | "not-installed";

export interface ServiceInstallerLike {
  install(definition: ServiceDefinition): Promise<DaemonResult<{ filePath: string }>>;
  uninstall(definition: ServiceDefinition): Promise<Result<void, DaemonError>>;
  status(definition: ServiceDefinition): Promise<Result<ServiceInstallStatus, DaemonError>>;
}
