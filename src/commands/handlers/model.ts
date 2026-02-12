import { err, ok } from "../../daemon/contracts";
import type { CommandHandler } from "./types";

function resolveModel(models: readonly string[], requestedModel: string): string | null {
  const normalized = requestedModel.trim().toLowerCase();

  for (const model of models) {
    if (model.toLowerCase() === normalized) {
      return model;
    }
  }

  return null;
}

function formatModelList(models: readonly string[], currentModel: string): string {
  const lines = models.map((model) => (model === currentModel ? `* ${model} (active)` : `* ${model}`));
  return ["Available models:", ...lines].join("\n");
}

export const handleModelCommand: CommandHandler = (args, context) => {
  const requestedModel = args.positional[0]?.trim();

  if (!requestedModel) {
    return ok({
      statusMessage: `Model: ${context.model.currentModel}`,
      responseText: formatModelList(context.model.availableModels, context.model.currentModel),
    });
  }

  const resolvedModel = resolveModel(context.model.availableModels, requestedModel);
  if (!resolvedModel) {
    return err({
      code: "NOT_FOUND",
      message: `Unknown model '${requestedModel}'. Use /model to list available models.`,
    });
  }

  context.model.setModel(resolvedModel);
  return ok({
    statusMessage: `Model set to ${resolvedModel}`,
    responseText: `Now using model '${resolvedModel}'.`,
  });
};
