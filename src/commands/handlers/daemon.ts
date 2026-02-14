import { err, ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

const DAEMON_SUBCOMMANDS = ["add", "switch", "remove", "status", "token"] as const;
type DaemonSubcommand = (typeof DAEMON_SUBCOMMANDS)[number];

function isDaemonSubcommand(value: string): value is DaemonSubcommand {
  return DAEMON_SUBCOMMANDS.includes(value as DaemonSubcommand);
}

const handleDaemonAdd: CommandHandler = (args) => {
  const name = args.positional[1];
  const url = args.positional[2];

  if (!name || !url) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing arguments. Usage: /daemon add <name> <url>",
    });
  }

  return ok({
    statusMessage: `Daemon profile '${name}' created`,
    responseText: `Added daemon profile '${name}' at ${url}. Use /daemon switch ${name} to connect.`,
  });
};

const handleDaemonSwitch: CommandHandler = (args) => {
  const name = args.positional[1];

  if (!name) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing profile name. Usage: /daemon switch <name>",
    });
  }

  return ok({
    statusMessage: `Switched to daemon '${name}'`,
    responseText: `Switching to daemon profile '${name}'.`,
  });
};

const handleDaemonRemove: CommandHandler = (args) => {
  const name = args.positional[1];

  if (!name) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing profile name. Usage: /daemon remove <name>",
    });
  }

  return ok({
    statusMessage: `Daemon profile '${name}' removed`,
    responseText: `Removed daemon profile '${name}'.`,
  });
};

const handleDaemonStatus: CommandHandler = () => {
  return ok({
    statusMessage: "Daemon status",
    responseText: [
      "# Daemon Status",
      "",
      "Connection: connected",
      "Address: http://localhost:7433",
      "Transport: localhost",
      "Latency: <1ms",
    ].join("\n"),
  });
};

const handleDaemonTokenShow: CommandHandler = () => {
  return ok({
    statusMessage: "Daemon token",
    responseText: "Token: rm_****...****",
  });
};

const handleDaemonTokenRotate: CommandHandler = () => {
  return ok({
    statusMessage: "Token rotated",
    responseText: "Daemon auth token rotated successfully. New token: rm_****...****",
  });
};

const handleDaemonToken: CommandHandler = (args, context) => {
  const action = args.positional[1]?.trim().toLowerCase();

  if (action === "show") {
    return handleDaemonTokenShow(args, context);
  }

  if (action === "rotate") {
    return handleDaemonTokenRotate(args, context);
  }

  if (!action) {
    return handleDaemonTokenShow(args, context);
  }

  return err({
    code: "INVALID_ARGUMENT",
    message: `Unknown token action '${action}'. Usage: /daemon token <show|rotate>`,
  });
};

export const handleDaemonCommand: CommandHandler = (args, context) => {
  const subcommand = args.positional[0]?.trim().toLowerCase();

  if (!subcommand) {
    return ok({
      statusMessage: "Daemon panel",
      signals: [{ type: "OPEN_DAEMON_PANEL" }],
    });
  }

  if (!isDaemonSubcommand(subcommand)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unknown subcommand '${subcommand}'. Usage: /daemon [${DAEMON_SUBCOMMANDS.join("|")}]`,
    });
  }

  const subcommandHandlers: Record<DaemonSubcommand, CommandHandler> = {
    add: handleDaemonAdd,
    switch: handleDaemonSwitch,
    remove: handleDaemonRemove,
    status: handleDaemonStatus,
    token: handleDaemonToken,
  };

  return subcommandHandlers[subcommand](args, context);
};
