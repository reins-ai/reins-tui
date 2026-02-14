import { err, ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

function resolveEnvironment(environments: readonly string[], requested: string): string | null {
  const normalized = requested.trim().toLowerCase();

  for (const env of environments) {
    if (env.toLowerCase() === normalized) {
      return env;
    }
  }

  return null;
}

function formatEnvironmentList(environments: readonly string[], activeEnvironment: string): string {
  const lines = environments.map((env) =>
    env === activeEnvironment ? `* ${env} (active)` : `* ${env}`,
  );
  return ["Available environments:", ...lines].join("\n");
}

export const handleEnvironmentCommand: CommandHandler = async (args, context) => {
  if (!context.environment) {
    return err({
      code: "UNSUPPORTED",
      message: "Environment switching is not available. Daemon connection required.",
    });
  }

  const requestedEnv = args.positional[0]?.trim();

  if (!requestedEnv) {
    return ok({
      statusMessage: `Environment: ${context.environment.activeEnvironment}`,
      responseText: formatEnvironmentList(
        context.environment.availableEnvironments,
        context.environment.activeEnvironment,
      ),
    });
  }

  const resolvedEnv = resolveEnvironment(context.environment.availableEnvironments, requestedEnv);
  if (!resolvedEnv) {
    return err({
      code: "NOT_FOUND",
      message: `Environment '${requestedEnv}' not found. Use /env to list available environments.`,
    });
  }

  if (resolvedEnv === context.environment.activeEnvironment) {
    return ok({
      statusMessage: `Already using environment '${resolvedEnv}'`,
      responseText: `Environment '${resolvedEnv}' is already active.`,
    });
  }

  const switchResult = await context.environment.switchEnvironment(resolvedEnv);
  if (!switchResult.ok) {
    return switchResult;
  }

  return ok({
    statusMessage: `Switched to environment: ${switchResult.value.activeEnvironment}`,
    responseText: `Switched from '${switchResult.value.previousEnvironment}' to '${switchResult.value.activeEnvironment}'. Next response will use the new environment context.`,
    signals: [{ type: "ENVIRONMENT_SWITCHED", payload: switchResult.value.activeEnvironment }],
  });
};
