import { TransportProbe } from "@reins/core";

import { err, ok } from "../../daemon/contracts";
import {
  addDaemonProfile,
  switchDaemonProfile,
  removeDaemonProfile,
  showDaemonToken,
  rotateDaemonToken,
  getProfileStore,
  maskToken,
} from "../../daemon/actions";
import type { CommandHandler } from "./types";

const DAEMON_SUBCOMMANDS = ["add", "switch", "remove", "status", "token"] as const;
type DaemonSubcommand = (typeof DAEMON_SUBCOMMANDS)[number];

function isDaemonSubcommand(value: string): value is DaemonSubcommand {
  return DAEMON_SUBCOMMANDS.includes(value as DaemonSubcommand);
}

const handleDaemonAdd: CommandHandler = async (args) => {
  const name = args.positional[1];
  const url = args.positional[2];

  if (!name || !url) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing arguments. Usage: /daemon add <name> <url>",
    });
  }

  const result = await addDaemonProfile(name, url);
  if (!result.ok) {
    return err({ code: "INVALID_ARGUMENT", message: result.error });
  }

  return ok({
    statusMessage: `Daemon profile '${name}' created`,
    responseText: `Added daemon profile '${name}' at ${url}. Use /daemon switch ${name} to connect.`,
  });
};

const handleDaemonSwitch: CommandHandler = async (args) => {
  const name = args.positional[1];

  if (!name) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing profile name. Usage: /daemon switch <name>",
    });
  }

  const result = await switchDaemonProfile(name);
  if (!result.ok) {
    // Detect specific error types from the message
    if (result.error.includes("not found")) {
      return err({ code: "NOT_FOUND", message: result.error });
    }
    if (result.error.includes("Unable to reach")) {
      return err({ code: "INVALID_ARGUMENT", message: result.error });
    }
    return err({ code: "UNKNOWN_HANDLER", message: result.error });
  }

  return ok({
    statusMessage: `Switched to daemon '${name}'`,
    responseText: `Switched default daemon profile to '${name}'.`,
  });
};

const handleDaemonRemove: CommandHandler = async (args) => {
  const name = args.positional[1];

  if (!name) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing profile name. Usage: /daemon remove <name>",
    });
  }

  const result = await removeDaemonProfile(name);
  if (!result.ok) {
    if (result.error.includes("not found")) {
      return err({ code: "NOT_FOUND", message: result.error });
    }
    if (result.error.includes("Cannot remove")) {
      return err({ code: "INVALID_ARGUMENT", message: result.error });
    }
    return err({ code: "UNKNOWN_HANDLER", message: result.error });
  }

  return ok({
    statusMessage: `Daemon profile '${name}' removed`,
    responseText: `Removed daemon profile '${name}'.`,
  });
};

const handleDaemonStatus: CommandHandler = async (_args, context) => {
  const profileStore = getProfileStore();
  const probe = new TransportProbe();
  const listResult = await profileStore.list();
  if (!listResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: listResult.error.message,
    });
  }

  const defaultProfile = listResult.value.find((profile) => profile.isDefault) ?? null;
  let transportType: "localhost" | "tailscale" | "cloudflare" | "direct" | undefined;
  if (defaultProfile) {
    const detectionResult = await probe.detect(defaultProfile.httpUrl);
    if (detectionResult.ok) {
      transportType = detectionResult.value.type;
    }
  }
  const connection = context.daemonClient?.getConnectionState().status ?? "unknown";
  const profileSummary = listResult.value.length === 0
    ? "None"
    : listResult.value.map((profile) => `${profile.name}${profile.isDefault ? "*" : ""}`).join(", ");

  return ok({
    statusMessage: "Daemon status",
    responseText: [
      "# Daemon Status",
      "",
      `Connection: ${connection}`,
      `Address: ${defaultProfile?.httpUrl ?? "(no default profile)"}`,
      `Transport: ${transportType ?? defaultProfile?.transportType ?? "unknown"}`,
      `Profiles: ${profileSummary}`,
    ].join("\n"),
  });
};

const handleDaemonTokenShow: CommandHandler = async () => {
  const result = await showDaemonToken();
  if (!result.ok) {
    if (result.error.includes("No default")) {
      return err({ code: "NOT_FOUND", message: result.error });
    }
    return err({ code: "UNKNOWN_HANDLER", message: result.error });
  }

  return ok({
    statusMessage: "Daemon token",
    responseText: `${result.message}\nToken: ${result.token ?? "(not configured)"}`,
  });
};

const handleDaemonTokenRotate: CommandHandler = async () => {
  const result = await rotateDaemonToken();
  if (!result.ok) {
    if (result.error.includes("No default")) {
      return err({ code: "NOT_FOUND", message: result.error });
    }
    return err({ code: "UNKNOWN_HANDLER", message: result.error });
  }

  return ok({
    statusMessage: "Token rotated",
    responseText: `Daemon auth token rotated for '${result.message.replace("Token rotated for '", "").replace("'", "")}'. New token: ${result.token ?? ""}`,
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

// Re-export maskToken for any consumers that were importing from here
export { maskToken };
