import { describe, expect, test } from "bun:test";

import { DaemonError } from "@reins/core";

import { SERVICE_COMMANDS, executeServiceCommand } from "../../src/lib";

describe("service commands", () => {
  test("registers all service command actions", () => {
    expect(SERVICE_COMMANDS.map((command) => command.action)).toEqual([
      "SERVICE_INSTALL",
      "SERVICE_UNINSTALL",
      "SERVICE_START",
      "SERVICE_STOP",
      "SERVICE_RESTART",
      "SERVICE_STATUS",
    ]);
  });

  test("returns failure for unknown command action", async () => {
    const result = await executeServiceCommand("SERVICE_UNKNOWN");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown service action");
  });

  test("installs service when not installed", async () => {
    const installer = {
      async install() {
        return {
          ok: true as const,
          value: {
            filePath: "/tmp/reins-daemon.mock",
          },
        };
      },
      async uninstall() {
        return { ok: true as const, value: undefined };
      },
      async status() {
        return { ok: true as const, value: "not-installed" as const };
      },
    };

    const runtime = {
      getState() {
        return "stopped" as const;
      },
      async start() {
        return { ok: true as const, value: undefined };
      },
      async stop() {
        return { ok: true as const, value: undefined };
      },
      async restart() {
        return { ok: true as const, value: undefined };
      },
    };

    const result = await executeServiceCommand("SERVICE_INSTALL", {
      installer,
      runtime,
      platform: "linux",
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("Service installed");
    expect(result.details?.configPath).toBe("/tmp/reins-daemon.mock");
  });

  test("returns remediation hint when starting before install", async () => {
    const installer = {
      async install() {
        return {
          ok: true as const,
          value: {
            filePath: "unused",
          },
        };
      },
      async uninstall() {
        return { ok: true as const, value: undefined };
      },
      async status() {
        return { ok: true as const, value: "not-installed" as const };
      },
    };

    const runtime = {
      getState() {
        return "stopped" as const;
      },
      async start() {
        return { ok: true as const, value: undefined };
      },
      async stop() {
        return { ok: true as const, value: undefined };
      },
      async restart() {
        return { ok: true as const, value: undefined };
      },
    };

    const result = await executeServiceCommand("SERVICE_START", {
      installer,
      runtime,
      platform: "darwin",
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Service is not installed");
    expect(result.details?.remediation).toContain("launchctl");
  });

  test("returns platform-aware daemon error details", async () => {
    const installer = {
      async install() {
        return {
          ok: false as const,
          error: new DaemonError("permission denied", "DAEMON_ACCESS_DENIED"),
        };
      },
      async uninstall() {
        return { ok: true as const, value: undefined };
      },
      async status() {
        return { ok: true as const, value: "not-installed" as const };
      },
    };

    const runtime = {
      getState() {
        return "stopped" as const;
      },
      async start() {
        return { ok: true as const, value: undefined };
      },
      async stop() {
        return { ok: true as const, value: undefined };
      },
      async restart() {
        return { ok: true as const, value: undefined };
      },
    };

    const result = await executeServiceCommand("SERVICE_INSTALL", {
      installer,
      runtime,
      platform: "win32",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Install failed");
    expect(result.details?.code).toBe("DAEMON_ACCESS_DENIED");
    expect(result.details?.hint).toContain("Windows Services");
  });
});
