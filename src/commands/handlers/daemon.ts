import {
  DaemonProfileStore,
  DaemonTokenManager,
  TransportProbe,
  createKeychainProvider,
} from "@reins/core";
import { join } from "node:path";

import { err, ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

const DAEMON_SUBCOMMANDS = ["add", "switch", "remove", "status", "token"] as const;
type DaemonSubcommand = (typeof DAEMON_SUBCOMMANDS)[number];

function isDaemonSubcommand(value: string): value is DaemonSubcommand {
  return DAEMON_SUBCOMMANDS.includes(value as DaemonSubcommand);
}

function getProfileStore(): DaemonProfileStore {
  const dataRoot = process.env.REINS_DATA_ROOT;
  return new DaemonProfileStore(
    typeof dataRoot === "string" && dataRoot.length > 0 ? { dataRoot } : undefined,
  );
}

function getTokenManager(): DaemonTokenManager {
  const dataRoot = process.env.REINS_DATA_ROOT;
  const keychain = createKeychainProvider(
    typeof dataRoot === "string" && dataRoot.length > 0
      ? { fallbackOptions: { filePath: join(dataRoot, "machine-secret.enc") } }
      : undefined,
  );
  return new DaemonTokenManager({ keychain });
}

async function detectTransportType(httpUrl: string): Promise<"localhost" | "tailscale" | "cloudflare" | "direct"> {
  const probe = new TransportProbe();
  const detection = await probe.detect(httpUrl);
  if (!detection.ok) {
    return "direct";
  }

  return detection.value.type;
}

function toHealthUrl(httpUrl: string): string {
  const parsed = new URL(httpUrl);
  const base = parsed.toString().endsWith("/") ? parsed.toString() : `${parsed.toString()}/`;
  return new URL("health", base).toString();
}

async function isDaemonReachable(httpUrl: string): Promise<boolean> {
  try {
    const response = await fetch(toHealthUrl(httpUrl), {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

function toWsUrl(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return httpUrl.replace(/^http/i, "ws");
  }
}

function maskToken(token: string): string {
  if (token.length <= 10) {
    return "rm_****";
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
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

  const profileStore = getProfileStore();
  const transportType = await detectTransportType(url);
  const addResult = await profileStore.add({
    name,
    httpUrl: url,
    wsUrl: toWsUrl(url),
    transportType,
    isDefault: false,
  });
  if (!addResult.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: addResult.error.message,
    });
  }

  return ok({
    statusMessage: `Daemon profile '${addResult.value.name}' created`,
    responseText: `Added daemon profile '${addResult.value.name}' at ${addResult.value.httpUrl}. Use /daemon switch ${addResult.value.name} to connect.`,
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

  const profileStore = getProfileStore();
  const profileResult = await profileStore.get(name);
  if (!profileResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: profileResult.error.message,
    });
  }

  if (profileResult.value === null) {
    return err({
      code: "NOT_FOUND",
      message: `Profile '${name}' not found.`,
    });
  }

  const reachable = await isDaemonReachable(profileResult.value.httpUrl);
  if (!reachable) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Unable to reach daemon '${name}' at ${profileResult.value.httpUrl}. Default profile unchanged.`,
    });
  }

  const setDefaultResult = await profileStore.setDefault(name);
  if (!setDefaultResult.ok) {
    return err({
      code: "NOT_FOUND",
      message: setDefaultResult.error.message,
    });
  }

  const touchResult = await profileStore.touchLastConnected(name);
  if (!touchResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: touchResult.error.message,
    });
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

  const profileStore = getProfileStore();
  const existingResult = await profileStore.get(name);
  if (!existingResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: existingResult.error.message,
    });
  }

  if (existingResult.value === null) {
    return err({
      code: "NOT_FOUND",
      message: `Profile '${name}' not found.`,
    });
  }

  if (existingResult.value.isDefault) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Cannot remove the default profile. Switch to another profile first.",
    });
  }

  const removeResult = await profileStore.remove(name);
  if (!removeResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: removeResult.error.message,
    });
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
  const profileStore = getProfileStore();
  const defaultProfileResult = await profileStore.getDefault();
  if (!defaultProfileResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: defaultProfileResult.error.message,
    });
  }

  if (defaultProfileResult.value === null) {
    return err({
      code: "NOT_FOUND",
      message: "No default daemon profile configured.",
    });
  }

  const tokenManager = getTokenManager();
  const tokenResult = await tokenManager.getToken(defaultProfileResult.value.name);
  if (!tokenResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: tokenResult.error.message,
    });
  }

  const tokenText = tokenResult.value === null
    ? "(not configured)"
    : maskToken(tokenResult.value);

  return ok({
    statusMessage: "Daemon token",
    responseText: `Profile: ${defaultProfileResult.value.name}\nToken: ${tokenText}`,
  });
};

const handleDaemonTokenRotate: CommandHandler = async () => {
  const profileStore = getProfileStore();
  const defaultProfileResult = await profileStore.getDefault();
  if (!defaultProfileResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: defaultProfileResult.error.message,
    });
  }

  if (defaultProfileResult.value === null) {
    return err({
      code: "NOT_FOUND",
      message: "No default daemon profile configured.",
    });
  }

  const tokenManager = getTokenManager();
  const rotateResult = await tokenManager.rotateToken(defaultProfileResult.value.name);
  if (!rotateResult.ok) {
    return err({
      code: "UNKNOWN_HANDLER",
      message: rotateResult.error.message,
    });
  }

  return ok({
    statusMessage: "Token rotated",
    responseText: `Daemon auth token rotated for '${defaultProfileResult.value.name}'. New token: ${maskToken(rotateResult.value)}`,
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
